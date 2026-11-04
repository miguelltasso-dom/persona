// WIRE-4 (auditoria dos Remotes, Keel): seed ≤ 200, sem "Desfazer" que não faz nada, listTeam sem campos extras,
// maxPersonas sempre um inteiro que o host aceita.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Decision } from '../src/client/decisions/decision-types.ts'
import { withoutUnavailableUndo } from '../src/client/decisions/undo-availability.ts'
import { DEFAULT_GESTOR_LIMITS_UI, gestorLimitsToSetRequest, sanitizeMaxPersonas } from '../src/client/persona-editor/gestor-editor-map.ts'

const decision = (id: string, reversible?: boolean): Decision => ({
  id,
  kind: 'vault',
  title: id,
  question: id,
  state: 'pending',
  blocking: true,
  ...(reversible === undefined ? {} : { reversible }),
} as unknown as Decision)

describe('Desfazer só quando o host sabe desfazer', () => {
  it('sem undoApproval nenhuma decisão é oferecida como reversível', () => {
    const out = withoutUnavailableUndo([decision('a', true), decision('b'), decision('c', false)], false)
    expect(out.map(d => d.reversible)).toEqual([undefined, undefined, false])
    expect('reversible' in out[0]!).toBe(false)
  })

  it('com undoApproval segue como o host marcou (mesma lista, sem copiar)', () => {
    const list = [decision('a', true)]
    expect(withoutUnavailableUndo(list, true)).toBe(list)
  })
})

describe('maxPersonas aceito pelo host', () => {
  it('NaN, Infinity, negativo, fracionário e lixo viram inteiro dentro de 1..30 (ou o padrão)', () => {
    expect(sanitizeMaxPersonas(Number.NaN)).toBe(DEFAULT_GESTOR_LIMITS_UI.maxPersonas)
    expect(sanitizeMaxPersonas(undefined)).toBe(DEFAULT_GESTOR_LIMITS_UI.maxPersonas)
    expect(sanitizeMaxPersonas('8')).toBe(DEFAULT_GESTOR_LIMITS_UI.maxPersonas)
    expect(sanitizeMaxPersonas(Number.POSITIVE_INFINITY)).toBe(DEFAULT_GESTOR_LIMITS_UI.maxPersonas)
    expect(sanitizeMaxPersonas(-4)).toBe(1)
    expect(sanitizeMaxPersonas(0)).toBe(1)
    expect(sanitizeMaxPersonas(7.9)).toBe(7)
    expect(sanitizeMaxPersonas(500)).toBe(30)
    expect(sanitizeMaxPersonas(12)).toBe(12)
  })

  it('o pedido ao host sai sempre com um inteiro válido', () => {
    const request = gestorLimitsToSetRequest('p1', 'ws', { ...DEFAULT_GESTOR_LIMITS_UI, maxPersonas: Number.NaN }, [], [])
    expect(Number.isInteger(request.maxPersonas)).toBe(true)
    expect(request.maxPersonas).toBeGreaterThanOrEqual(1)
    expect(gestorLimitsToSetRequest('p1', 'ws', { ...DEFAULT_GESTOR_LIMITS_UI, maxPersonas: 3.5 }, [], []).maxPersonas).toBe(3)
  })
})

describe('chamadas ao host', () => {
  const read = (file: string): string => readFileSync(resolve(__dirname, '../src/client/remote', file), 'utf8')

  it('o seed de dev nunca pede mais de 200 mensagens (faixa 1–200 do store)', () => {
    const limits = [...read('seed-default-team.ts').matchAll(/limit:\s*(\d+)/gu)].map(match => Number(match[1]))
    expect(limits.length).toBeGreaterThan(0)
    for (const limit of limits) expect(limit).toBeLessThanOrEqual(200)
  })

  it('listTeam manda só workspaceId e projectId (o schema do host recusa o resto)', () => {
    for (const file of ['seed-default-team.ts', 'persona-live-store.ts']) {
      const source = read(file)
      const calls = [...source.matchAll(/\.listTeam\(([^)]*\))/gu)].map(match => match[1]!)
      expect(calls.length, file).toBeGreaterThan(0)
      for (const call of calls) expect(call, `${file}: ${call}`).toMatch(/\{\s*workspaceId:[^}]*projectId:[^}]*\}/u)
    }
  })
})
