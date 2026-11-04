/**
 * OPT-9: the calibration of the estimate comes from THIS person's own measured turns (persona-spec/contracts/estimate-calibration.md).
 * The pure rules first (minimum, engine, account, window, no invented zero), then the Remote end to end with no model call.
 */
import { EMPTY_LAYERS, type TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { expect, it as plain } from 'vitest'
import PersonaHost from '../src/index.ts'
import {
  CALIBRATION_WINDOW_DAYS, MAX_CALIBRATION_ROWS, MIN_CALIBRATION_SAMPLES, calibrationFromLedger, quantile,
} from '../src/estimate-calibration.ts'
import { bindHostFile, it } from './host-harness.ts'

const NOW = '2026-11-04T15:00:00.000Z'
const DAY = 86_400_000
const ago = (ms: number): string => new Date(Date.parse(NOW) - ms).toISOString()

function turn(index: number, extra: Partial<TurnLedgerEntry> = {}): TurnLedgerEntry {
  return {
    id: `t${String(index)}`, personaId: 'atlas', engine: 'claude', kind: 'reply',
    inputTokens: 100 + index, outputTokens: 10 + index, cacheReadTokens: 0, cacheWriteTokens: 0,
    layers: EMPTY_LAYERS, at: ago((index + 1) * 60_000), origin: 'measured', durationMs: 1_000 * (index + 1),
    ...extra,
  }
}
const rows = (count: number, extra: Partial<TurnLedgerEntry> = {}): TurnLedgerEntry[] =>
  Array.from({ length: count }, (_, index) => turn(index, { ...extra, id: `${extra.id ?? 't'}${String(index)}` }))
const scope = { engine: 'claude', now: NOW }

plain('quantile interpolates linearly and refuses an empty list', () => {
  expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
  expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2)
  expect(quantile([1, 2, 3, 4, 5], 0.75)).toBe(4)
  expect(quantile([10, 20], 0.5)).toBe(15)
  expect(quantile([7], 0.9)).toBe(7)
  expect(() => quantile([], 0.5)).toThrow()
})

plain('no history, or fewer measured turns than the minimum, says nothing (never a guess)', () => {
  expect(calibrationFromLedger([], scope)).toBeUndefined()
  expect(calibrationFromLedger(rows(MIN_CALIBRATION_SAMPLES - 1), scope)).toBeUndefined()
})

plain('the median and the P25..P75 range come from the person own measured turns, in seconds and per-call tokens', () => {
  // durations 1..5 s; input 100..104, output 10..14
  const got = calibrationFromLedger(rows(5), scope)
  expect(got?.source).toBe('history')
  expect(got?.secondsPerCall?.conversa).toEqual({ min: 2, max: 4 })
  expect(got?.mediana?.conversa).toBe(3)
  expect(got?.tokensPerCall?.conversa).toEqual({ input: { min: 101, max: 103 }, output: { min: 11, max: 13 } })
  expect(got?.samples?.conversa).toEqual({ tokens: 5, tempo: 5 })
  // The measured input already carries the vendor base, and the cache reads/writes are input too.
  const cached = calibrationFromLedger(rows(5, { cacheReadTokens: 50, cacheWriteTokens: 20 }), scope)
  expect(cached?.tokensPerCall?.conversa?.input).toEqual({ min: 171, max: 173 })
  // Each kind is its own statement: executions never borrow the time of conversations.
  const mixed = calibrationFromLedger([...rows(5), ...rows(5, { id: 'x', kind: 'execution', durationMs: 60_000 })], scope)
  expect(mixed?.secondsPerCall?.conversa).toEqual({ min: 2, max: 4 })
  expect(mixed?.secondsPerCall?.execucao).toEqual({ min: 60, max: 60 })
})

plain('rows without a measured duration give tokens but never a time, and never a made-up 0', () => {
  const untimed = rows(6).map((row) => {
    const { durationMs, ...rest } = row
    void durationMs
    return rest
  })
  const got = calibrationFromLedger(untimed, scope)
  expect(got?.tokensPerCall?.conversa).toBeDefined()
  expect(got?.secondsPerCall).toBeUndefined()
  expect(got?.mediana).toBeUndefined()
  expect(got?.samples?.conversa).toEqual({ tokens: 6, tempo: 0 })
  // 4 timed rows among many untimed: still below the minimum for time.
  const few = untimed.map((row, index) => (index < MIN_CALIBRATION_SAMPLES - 1 ? { ...row, durationMs: 2_000 } : row))
  expect(calibrationFromLedger(few, scope)?.secondsPerCall).toBeUndefined()
  // A measured zero is a measurement, not "unknown".
  expect(calibrationFromLedger(rows(5, { durationMs: 0 }), scope)?.mediana?.conversa).toBe(0)
})

plain('only measured turns of the same engine and the same account count', () => {
  expect(calibrationFromLedger(rows(8, { origin: 'estimate' }), scope)).toBeUndefined()
  expect(calibrationFromLedger(rows(8), { ...scope, engine: 'codex' })).toBeUndefined()
  expect(calibrationFromLedger(rows(8, { accountId: 'work' }), scope)).toBeUndefined() // the persona has no account recorded
  expect(calibrationFromLedger(rows(8, { accountId: 'work' }), { ...scope, accountId: 'work' })?.samples?.conversa?.tempo).toBe(8)
  expect(calibrationFromLedger(rows(8, { accountId: 'work' }), { ...scope, accountId: 'home' })).toBeUndefined()
  expect(calibrationFromLedger(rows(8), { ...scope, accountId: 'work' })).toBeUndefined() // rows without an account are not hers
  // Only kinds the ask knows calibrate it.
  expect(calibrationFromLedger(rows(8, { kind: 'watchdog' }), scope)).toBeUndefined()
  expect(calibrationFromLedger(rows(8, { kind: 'initiative' }), scope)).toBeUndefined()
})

plain('the window ends at "now" and starts 30 days back; the newest 50 rows of a kind are used', () => {
  const stale = rows(8, { id: 'old', at: ago((CALIBRATION_WINDOW_DAYS + 1) * DAY) })
  expect(calibrationFromLedger(stale, scope)).toBeUndefined()
  const future = rows(8, { id: 'later', at: new Date(Date.parse(NOW) + DAY).toISOString() })
  expect(calibrationFromLedger(future, scope)).toBeUndefined()
  // 50 slow old turns (60 s) + 50 recent fast ones (1 s): only the newest 50 speak.
  const history = [
    ...Array.from({ length: MAX_CALIBRATION_ROWS }, (_, index) => turn(index, {
      id: `slow${String(index)}`, at: ago(2 * DAY + index * 60_000), durationMs: 60_000,
    })),
    ...Array.from({ length: MAX_CALIBRATION_ROWS }, (_, index) => turn(index, {
      id: `fast${String(index)}`, at: ago((index + 1) * 60_000), durationMs: 1_000,
    })),
  ]
  const got = calibrationFromLedger(history, scope)
  expect(got?.samples?.conversa).toEqual({ tokens: MAX_CALIBRATION_ROWS, tempo: MAX_CALIBRATION_ROWS })
  expect(got?.mediana?.conversa).toBe(1)
})

// ---- the Remote, end to end ----------------------------------------------------------------------------------------

const { host } = bindHostFile(NOW)
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const CHANNEL = { ...SCOPE, streamKind: 'channel' as const, ownerId: 'geral' }

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

/** Turns measured shortly before the host's own clock (the host reads the last 30 days of its book). */
function record(h: PersonaHost, count: number, extra: Partial<TurnLedgerEntry> = {}): void {
  for (const row of rows(count, extra)) h.persistTurn('pp', row)
}

it('the Remote starts as an estimate, and calibrates from this person own measured turns without calling any model', () => {
  const h = host()
  seed(h)
  let runnersResolved = 0
  h.orchestration.runnerFactory = async () => {
    runnersResolved += 1
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    return createFakeRunner()
  }
  const ask = { ...CHANNEL, texto: 'Qual o horário do standup?' }
  expect(h.estimateAsk(ask)).toMatchObject({ origin: 'estimate', tempo: null, rotulo: '1 chamada da sua IA' })
  record(h, MIN_CALIBRATION_SAMPLES - 1)
  expect(h.estimateAsk(ask)).toMatchObject({ origin: 'estimate', tempo: null }) // one short of the minimum: still "não sei"
  record(h, MIN_CALIBRATION_SAMPLES + 3, { id: 'more' })
  const calibrated = h.estimateAsk(ask)
  expect(calibrated.origin).toBe('calibrated')
  expect(calibrated.tempo).not.toBeNull()
  expect(calibrated.rotulo).toMatch(/ · 1 chamada da sua IA$/)
  expect(runnersResolved).toBe(0)
})

it('history of another engine or another account does not calibrate the persona estimate', () => {
  const h = host()
  seed(h)
  const ask = { ...CHANNEL, texto: 'Qual o horário do standup?' }
  record(h, 8, { id: 'other-engine', engine: 'codex' })
  expect(h.estimateAsk(ask).origin).toBe('estimate')
  record(h, 8, { id: 'work', accountId: 'work' })
  expect(h.estimateAsk(ask).origin).toBe('estimate') // the persona has no account recorded: the rows of "work" are not hers
  h.screens.screens.put('pp', 'active_account', 'atlas', { accountId: 'work' })
  expect(h.estimateAsk(ask).origin).toBe('calibrated') // now she runs on "work": her own measured turns there speak
  h.screens.screens.put('pp', 'active_account', 'atlas', { accountId: 'home' })
  expect(h.estimateAsk(ask).origin).toBe('estimate') // another account starts over
})
