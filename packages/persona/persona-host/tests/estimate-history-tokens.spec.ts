/**
 * OPT-9 (Tally side): the measured TOKENS of this person's own turns replace "our estimate + a base" in `estimateAsk`, per kind,
 * through the real Remote; and the development machine's numbers are never read by the host (contracts/estimate-calibration.md).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMPTY_LAYERS, type TurnKind, type TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { expect, it as plain } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const NOW = '2026-11-04T15:00:00.000Z'
const ago = (ms: number): string => new Date(Date.parse(NOW) - ms).toISOString()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const CHANNEL = { ...SCOPE, streamKind: 'channel' as const, ownerId: 'geral' }
const { host } = bindHostFile(NOW)

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'atlas', name: 'Atlas', title: 'Coordenação', description: 'Coordena.', personality: 'Calmo.',
    instructions: 'Despache.', avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
}

/** `count` measured turns of one kind: `input` is the TOTAL input of the call (the ledger's `inputTokens`); the cache read and written are PARTS of it (4 tokens uncached), as the OAR adapter books them. */
function record(h: PersonaHost, kind: TurnKind, count: number, input: number, output: number, withTime = true): void {
  for (let index = 0; index < count; index += 1) {
    const row: TurnLedgerEntry = {
      id: `${kind}${String(index)}`, personaId: 'atlas', engine: 'claude', kind,
      inputTokens: input + index, outputTokens: output + index, cacheReadTokens: input - 4_000 - 4, cacheWriteTokens: 4_000,
      layers: EMPTY_LAYERS, at: ago((index + 1) * 60_000), origin: 'measured',
      ...(withTime ? { durationMs: (kind === 'execution' ? 60_000 : 8_000) + index * 1_000 } : {}),
    }
    h.persistTurn('pp', row)
  }
}

it('a conversation is estimated from the measured conversation turns: their input already carries the vendor base', () => {
  const h = host()
  seed(h)
  const ask = { ...CHANNEL, texto: 'Qual o horário do standup?' }
  const before = h.estimateAsk(ask)
  expect(before).toMatchObject({ origin: 'estimate', baseDoVendorIncluida: false })
  expect(before.tokens!.max).toBeLessThan(5_000)
  record(h, 'reply', 6, 40_000, 80)
  const after = h.estimateAsk(ask)
  expect(after).toMatchObject({ origin: 'calibrated', baseDoVendorIncluida: true, tipo: 'conversa' })
  // 6 rows: P25..P75 of (input 40 000 each + output 80..85) — never below what was measured, never an invented base on top
  expect(after.tokens!.min).toBeGreaterThanOrEqual(40_000 + 80)
  expect(after.tokens!.max).toBeLessThanOrEqual(40_000 + 5 + 80 + 5) // the largest row measured: input 40 005, output 85
  expect(after).toMatchObject({ fonte: 'historico', amostras: 6 })
  expect(after.motivo).toContain('pelas suas últimas 6 conversas')
})

it('work is estimated from the EXECUTION rows, not the conversation rows', () => {
  const h = host()
  seed(h)
  record(h, 'reply', 6, 40_000, 80)
  record(h, 'execution', 7, 90_000, 600)
  const work = h.estimateAsk({ ...CHANNEL, texto: 'Monte o cardápio da semana com preços' })
  expect(work).toMatchObject({ tipo: 'trabalho', origin: 'calibrated', baseDoVendorIncluida: true, fonte: 'historico', amostras: 7 })
  expect(work.detalhe.map(row => row.papel)).toEqual(['execucao'])
  expect(work.tokens!.min).toBeGreaterThanOrEqual(90_000 + 600)
  expect(work.tokens!.min).toBeGreaterThan(40_000 + 85)
  expect(work.motivo).toContain('pelas suas últimas 7 tarefas')
  expect(work.tempo).not.toBeNull()
})

it('turns without a measured duration still calibrate the tokens, and the time stays "não sei"', () => {
  const h = host()
  seed(h)
  record(h, 'reply', 6, 40_000, 80, false)
  const result = h.estimateAsk({ ...CHANNEL, texto: 'Qual o horário do standup?' })
  expect(result).toMatchObject({ origin: 'calibrated', tempo: null, rotulo: '1 chamada da sua IA', fonte: 'historico', amostras: 6 })
  expect(result.motivo).toContain('tokens')
})

it('five measured rows is the floor: four is still a plain estimate', () => {
  const h = host()
  seed(h)
  record(h, 'reply', 4, 40_000, 80)
  expect(h.estimateAsk({ ...CHANNEL, texto: 'Qual o horário do standup?' })).toMatchObject({ origin: 'estimate', baseDoVendorIncluida: false })
  record(h, 'reply', 5, 40_000, 80)
  expect(h.estimateAsk({ ...CHANNEL, texto: 'Qual o horário do standup?' })).toMatchObject({ origin: 'calibrated', fonte: 'historico' })
})

plain('the host and the engine never read the development machine calibration (it is a reference, not a default)', () => {
  const roots = [fileURLToPath(new URL('../src', import.meta.url)), fileURLToPath(new URL('../../persona-engine/src', import.meta.url))]
  const offenders: string[] = []
  for (const root of roots) {
    for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
      if (!file.endsWith('.ts')) continue
      const text = readFileSync(join(root, file), 'utf8')
      // the engine's bench writes it for the dev report; nothing that the host runs may read it
      if (/pair-real-calibration/.test(text) && !file.replaceAll('\\', '/').startsWith('bench/')) offenders.push(join(root, file))
    }
  }
  expect(offenders).toEqual([])
})
