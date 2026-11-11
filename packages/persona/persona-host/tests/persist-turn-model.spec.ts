/**
 * D-100 / REVISÃO-01 §A4: `persistTurn` copies the turn to the Rivet usage port. The usage book folds by provider + MODEL, so the
 * port must carry the model the call really ran on (`haiku`, `sonnet`, `opus`), never the engine's name (`claude`) in its place.
 * The model is the ledger row's own `model` (EFF-1); a row without one (an older turn, "Padrão do motor" with no drop) falls back
 * to the engine, as before.
 */
import { EMPTY_LAYERS, type TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host: open } = bindHostFile()
const FROM = '2026-11-01T00:00:00.000Z'
const TO = '2026-11-30T00:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(): PersonaHost {
  const h = open()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'nina', name: 'Nina', title: 'Design', description: 'UI.', personality: 'Calma.', instructions: 'Desenhe.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
  })
  return h
}

function turn(id: string, extra: Partial<TurnLedgerEntry> = {}): TurnLedgerEntry {
  return {
    id, personaId: 'nina', engine: 'claude', kind: 'execution', inputTokens: 100, outputTokens: 20,
    cacheReadTokens: 0, cacheWriteTokens: 0, layers: EMPTY_LAYERS, at: '2026-11-10T12:00:00.000Z', origin: 'measured', ...extra,
  }
}

const portRows = (h: PersonaHost) => h.usage.list({ projectId: 'pp', from: FROM, to: TO })

it('the usage port gets the model the call ran on (haiku), with the engine as the provider', () => {
  const h = seed()
  h.persistTurn('pp', turn('t-haiku', { model: 'haiku', modelRequested: 'haiku' }))
  const [row] = portRows(h)
  expect(row).toMatchObject({ id: 't-haiku', provider: 'claude', model: 'haiku' })
})

it('a row without a model keeps the engine in its place (nothing invented)', () => {
  const h = seed()
  h.persistTurn('pp', turn('t-old'))
  const [row] = portRows(h)
  expect(row).toMatchObject({ id: 't-old', provider: 'claude', model: 'claude' })
})

it('turns on different models fold apart in the usage book instead of all landing on "claude"', () => {
  const h = seed()
  h.persistTurn('pp', turn('t-1', { model: 'haiku', modelRequested: 'haiku' }))
  h.persistTurn('pp', turn('t-2', { model: 'opus', modelRequested: 'opus', inputTokens: 300, outputTokens: 50 }))
  h.persistTurn('pp', turn('t-3', { model: 'opus', modelRequested: 'opus', inputTokens: 200, outputTokens: 10 }))
  const usage = h.getUsage({ ...SCOPE, period: { from: FROM, to: TO } })
  const byModel = Object.fromEntries(usage.folds.map(fold => [fold.model, fold.records]))
  expect(byModel).toEqual({ haiku: 1, opus: 2 })
  expect(usage.folds.some(fold => fold.model === 'claude')).toBe(false)
  expect(usage.tokens).toBe(120 + 350 + 210) // the totals do not change, only the grouping
})

it('the ledger row itself is untouched: engine stays the engine, the model rides along', () => {
  const h = seed()
  const stored = h.persistTurn('pp', turn('t-led', { model: 'sonnet', modelRequested: 'sonnet' }))
  expect(stored).toMatchObject({ engine: 'claude', model: 'sonnet' })
  expect(h.ledger.list({ projectId: 'pp' })[0]).toMatchObject({ id: 't-led', engine: 'claude', model: 'sonnet' })
})
