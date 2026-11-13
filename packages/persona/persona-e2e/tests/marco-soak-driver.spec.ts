/**
 * Marco DOGFOOD (M7): the soak's own tools are tested first. Each invariant is shown FAILING on a crafted night,
 * and the clock, the seed and the report are deterministic: a soak that cannot fail, or cannot repeat, proves nothing.
 */
import { describe, expect, it } from 'vitest'
import { boardHash, InvariantTracker, legalMove, type BoardSnap, type Category, type StepFacts } from '../src/marco/invariants.ts'
import { growthAfter, renderSoakReport, SOAK_REPORT_SCHEMA, traceHash, type SoakReport } from '../src/marco/soak-report.ts'
import { nightScript, seeded, soakClock } from '../src/marco/soak-clock.ts'

const CLEAN: StepFacts = { riskEffects: 0, approvalsGiven: 0, turnsToday: {}, runnerCallsInPause: 0, summariesByDay: {}, actions: [], stalled: [], stallLimitMin: 30, errors: 0 }
const board = (projectId: string, cards: readonly [string, Category][]): BoardSnap => ({ projectId, cards: cards.map(([id, category]) => ({ id, category, title: `t-${id}` })) })
const tracker = (): InvariantTracker => { const t = new InvariantTracker(); t.expect('a', 'a1', 'a2'); t.expect('b', 'b1'); return t }
const names = (violations: readonly { invariant: string }[]): string[] => violations.map(item => item.invariant)

describe('soak invariants: a clean night passes, every invariant fails on its own crafted night', () => {
  it('a clean step, and a card walking the whole way, is not a violation', () => {
    const t = tracker()
    expect(t.check(1, 'x', [board('a', [['a1', 'todo'], ['a2', 'todo']]), board('b', [['b1', 'todo']])], CLEAN)).toEqual([])
    expect(t.check(2, 'x', [board('a', [['a1', 'doing'], ['a2', 'todo']]), board('b', [['b1', 'doing']])], CLEAN)).toEqual([])
    expect(t.check(3, 'x', [board('a', [['a1', 'review'], ['a2', 'doing']]), board('b', [['b1', 'needs_you']])], CLEAN)).toEqual([])
    expect(t.check(4, 'x', [board('a', [['a1', 'done'], ['a2', 'doing']]), board('b', [['b1', 'doing']])], CLEAN)).toEqual([])
  })

  it('I1: a lost card, a repeated id and a card nobody expected', () => {
    expect(names(tracker().check(1, 'x', [board('a', [['a1', 'todo']]), board('b', [['b1', 'todo']])], CLEAN))).toEqual(['I1'])
    expect(names(tracker().check(1, 'x', [board('a', [['a1', 'todo'], ['a1', 'todo'], ['a2', 'todo']]), board('b', [['b1', 'todo']])], CLEAN))).toContain('I1')
    const leaked = tracker().check(1, 'x', [board('a', [['a1', 'todo'], ['a2', 'todo'], ['b1', 'todo']]), board('b', [['b1', 'todo']])], CLEAN)
    expect(leaked.map(item => item.detail).join(' ')).toMatch(/nobody expected/u)
  })

  it('I2: going back, leaving done and skipping the side trip rules', () => {
    const t = tracker()
    t.check(1, 'x', [board('a', [['a1', 'review'], ['a2', 'done']]), board('b', [['b1', 'doing']])], CLEAN)
    const back = t.check(2, 'x', [board('a', [['a1', 'doing'], ['a2', 'doing']]), board('b', [['b1', 'todo']])], CLEAN)
    expect(back.map(item => `${item.projectId}:${item.detail}`)).toEqual(['a:card a1 went review -> doing', 'a:card a2 went done -> doing', 'b:card b1 went doing -> todo'])
    expect(legalMove('todo', 'needs_you')).toBe(false) // the side trip starts only from doing or review
    expect(legalMove('needs_you', 'todo')).toBe(false)
    expect(legalMove('review', 'done')).toBe(true)
    expect(legalMove('doing', 'done')).toBe(true) // a card may skip the review column
  })

  it('I3: a stalled card nobody nudged', () => {
    const stalled = { ...CLEAN, stalled: [{ projectId: 'a', cardId: 'a1', minutes: 45, nudged: false }] }
    expect(names(tracker().check(1, 'x', [board('a', [['a1', 'doing'], ['a2', 'todo']]), board('b', [['b1', 'todo']])], stalled))).toEqual(['I3'])
    expect(tracker().check(1, 'x', [board('a', [['a1', 'doing'], ['a2', 'todo']]), board('b', [['b1', 'todo']])], { ...CLEAN, stalled: [{ projectId: 'a', cardId: 'a1', minutes: 45, nudged: true }] })).toEqual([])
  })

  it('I4: more risky effects than approvals (and the counter going backwards)', () => {
    const t = tracker()
    const ok = [board('a', [['a1', 'todo'], ['a2', 'todo']]), board('b', [['b1', 'todo']])]
    expect(t.check(1, 'x', ok, { ...CLEAN, riskEffects: 1, approvalsGiven: 1 })).toEqual([])
    expect(names(t.check(2, 'x', ok, { ...CLEAN, riskEffects: 2, approvalsGiven: 1 }))).toEqual(['I4'])
    expect(t.check(3, 'x', ok, { ...CLEAN, riskEffects: 0, approvalsGiven: 1 }).map(item => item.detail).join(' ')).toMatch(/went backwards/u)
  })

  it('I5: over the turn cap, and any runner call while paused by quota', () => {
    const ok = [board('a', [['a1', 'todo'], ['a2', 'todo']]), board('b', [['b1', 'todo']])]
    expect(names(tracker().check(1, 'x', ok, { ...CLEAN, turnCap: 5, turnsToday: { a: 6, b: 2 } }))).toEqual(['I5'])
    expect(tracker().check(1, 'x', ok, { ...CLEAN, turnCap: 5, turnsToday: { a: 5, b: 2 } })).toEqual([])
    expect(names(tracker().check(1, 'x', ok, { ...CLEAN, runnerCallsInPause: 1 }))).toEqual(['I5'])
  })

  it('I6: the loop of one project touching a card of another', () => {
    const ok = [board('a', [['a1', 'todo'], ['a2', 'todo']]), board('b', [['b1', 'todo']])]
    const crossed = tracker().check(1, 'x', ok, { ...CLEAN, actions: [{ actorProject: 'a', cardProject: 'a', cardId: 'a1' }, { actorProject: 'a', cardProject: 'b', cardId: 'b1' }] })
    expect(crossed.map(item => `${item.invariant}:${item.projectId}`)).toEqual(['I6:b'])
  })

  it('I7: two summaries in one day, and I8: any unhandled error', () => {
    const ok = [board('a', [['a1', 'todo'], ['a2', 'todo']]), board('b', [['b1', 'todo']])]
    expect(names(tracker().check(1, 'x', ok, { ...CLEAN, summariesByDay: { a: { '2026-11-12': 1 }, b: { '2026-11-12': 2 } } }))).toEqual(['I7'])
    expect(names(tracker().check(1, 'x', ok, { ...CLEAN, errors: 1 }))).toEqual(['I8'])
  })

  it('a card that arrives during the night is expected from then on (not a leak)', () => {
    const t = tracker()
    t.expect('a', 'a3')
    expect(t.check(1, 'x', [board('a', [['a1', 'todo'], ['a2', 'todo'], ['a3', 'todo']]), board('b', [['b1', 'todo']])], CLEAN)).toEqual([])
  })
})

describe('the fence fingerprint, the clock, the seed and the report', () => {
  it('boardHash ignores order and notices any change in column, title or card', () => {
    const base = board('b', [['b1', 'todo'], ['b2', 'doing']])
    expect(boardHash(base)).toBe(boardHash(board('b', [['b2', 'doing'], ['b1', 'todo']])))
    expect(boardHash(base)).not.toBe(boardHash(board('b', [['b1', 'doing'], ['b2', 'doing']])))
    expect(boardHash(base)).not.toBe(boardHash(board('b', [['b1', 'todo']])))
    expect(boardHash(base)).not.toBe(boardHash({ projectId: 'b', cards: [{ id: 'b1', category: 'todo', title: 'outro' }, { id: 'b2', category: 'doing', title: 't-b2' }] }))
    expect(boardHash(base)).not.toBe(boardHash(board('c', [['b1', 'todo'], ['b2', 'doing']])))
  })

  it('the clock moves in exact steps, reads local day and hour, and refuses nonsense', () => {
    const clock = soakClock('2026-11-12T21:00:00.000Z', 5 * 60_000) // 18:00 in Sao Paulo
    expect(clock.now()).toBe('2026-11-12T21:00:00.000Z')
    expect(clock.localDay(-180)).toBe('2026-11-12')
    for (let index = 0; index < 72; index += 1) clock.advance() // 6 h
    expect(clock.step()).toBe(72)
    expect(clock.elapsedMs()).toBe(6 * 3_600_000)
    expect(clock.now()).toBe('2026-11-13T03:00:00.000Z')
    expect(clock.localDay(-180)).toBe('2026-11-13') // 00:00 local is already the next day
    expect(clock.localHour(-180)).toBe(0)
    expect(() => soakClock('nao-e-data', 1)).toThrow(/invalid start/u)
    expect(() => soakClock('2026-11-12T00:00:00.000Z', 0)).toThrow(/positive/u)
  })

  it('the seed repeats the night and a different seed does not', () => {
    const run = (seed: number): number[] => { const next = seeded(seed); return Array.from({ length: 5 }, () => next()) }
    expect(run(42)).toEqual(run(42))
    expect(run(42)).not.toEqual(run(43))
    expect(run(7).every(value => value >= 0 && value < 1)).toBe(true)
  })

  it('the night script fires each event once, at its hour, in order', () => {
    const fired: string[] = []
    const script = nightScript([{ atHour: 2, name: 'cota 95%', run: () => { fired.push('cota') } }, { atHour: 3.5, name: 'queda', run: () => { fired.push('queda') } }])
    expect(script.due(1 * 3_600_000)).toEqual([])
    expect(script.due(2 * 3_600_000).map(event => event.name)).toEqual(['cota 95%'])
    expect(script.due(2 * 3_600_000)).toEqual([]) // never twice
    expect(script.pending()).toEqual(['queda'])
    expect(script.due(5 * 3_600_000).map(event => event.name)).toEqual(['queda'])
    expect(script.pending()).toEqual([])
  })

  it('growthAfter tells a steady night from a leak, and the report says PASSOU or FALHOU with the repro data', () => {
    const photo = (hour: number, resources: number, dbBytes: number) => ({ hour, resources, listeners: 10, dbBytes, rows: hour * 3, heapBytes: 1000 })
    const steady = [photo(0, 4, 100), photo(4, 9, 500), photo(12, 9, 520), photo(24, 9, 540)]
    const leaky = [photo(0, 4, 100), photo(4, 9, 500), photo(12, 30, 5000), photo(24, 80, 90_000)]
    expect(growthAfter(steady, 4)).toMatchObject({ resources: 0, dbBytes: 40 })
    expect(growthAfter(leaky, 4)).toMatchObject({ resources: 71, dbBytes: 89_500 })
    expect(growthAfter([photo(0, 1, 1)], 4)).toBeUndefined()
    const report: SoakReport = {
      schema: SOAK_REPORT_SCHEMA, mode: 'accelerated',
      seed: 42, simulatedHours: 24, steps: 288, stepMinutes: 5,
      boards: [{ projectId: 'loja', todo: 0, doing: 0, review: 0, needsYou: 1, done: 19 }],
      turnsByProject: { loja: 40 }, nudges: 3, summaries: 2, approvalsPending: 2,
      injected: [{ atHour: 3, name: 'queda do host', outcome: 'retomou, 0 cartão perdido' }],
      photos: steady, violations: [], trace: ['a', 'b'],
    }
    const good = renderSoakReport(report, '12/11 15:30')
    expect(good).toMatch(/Semente 42; 24 h simuladas em 288 passos de 5 min/u)
    expect(good).toMatch(/Veredito: PASSOU \(0 invariantes quebradas\)/u)
    expect(good).toMatch(/\| loja \| 0 \| 0 \| 0 \| 1 \| 19 \| 40 \|/u)
    expect(good).toMatch(/03 h: queda do host -> retomou/u)
    const bad = renderSoakReport({ ...report, violations: [{ invariant: 'I4', projectId: '*', step: 120, simulated: '2026-11-13T07:00:00.000Z', detail: '2 efeitos' }] }, 'x')
    expect(bad).toMatch(/FALHOU \(1 invariantes quebradas\)/u)
    expect(bad).toMatch(/I4 \* passo 120/u)
    // the real-time soak (Probe) writes the same schema, adds RSS and children to the photos, and says "em tempo real"
    const realtime = renderSoakReport({ ...report, mode: 'realtime', photos: [{ ...photo(0, 4, 100), rssBytes: 123456, children: 3 }] }, 'x')
    expect(realtime).toMatch(/h em tempo real em 288 passos/u)
    expect(realtime).toMatch(/\| RSS \(bytes\) \| filhos \|/u)
    expect(realtime).toMatch(/\| 123456 \| 3 \|/u)
    expect(good).not.toMatch(/RSS/u)
    // Probe's notes (15:49): the title names the author of the mode, hours are rounded, a total-only turn count ('*') is said as a total, and the warm-up is the caller's
    expect(good).toMatch(/^# Soak da noite, relógio acelerado \(Gauge, /u)
    expect(realtime).toMatch(/^# Soak em tempo real, host como processo \(Probe, /u)
    const half = renderSoakReport({ ...report, mode: 'realtime', simulatedHours: 0.06666666666666667, turnsByProject: { '*': 12 }, photos: [{ ...photo(0.1, 4, 100) }, { ...photo(0.3, 6, 130) }, { ...photo(0.5, 9, 190) }] }, 'x', { warmHour: 0.1 })
    expect(half).toMatch(/0\.07 h em tempo real/u)
    expect(half).not.toMatch(/0\.0666/u)
    expect(half).toMatch(/Turnos no total \(sem divisão por projeto\): 12\./u)
    expect(half).toMatch(/\| loja \| 0 \| 0 \| 0 \| 1 \| 19 \| - \|/u) // no per-project number: a dash, never a lying 0
    expect(half).toMatch(/Crescimento depois de 0\.1 h: recursos 5,/u)
    expect(renderSoakReport(report, 'x')).toMatch(/Crescimento depois de 4 h/u)
    expect(report.schema).toBe('marco-soak/1')
    expect(traceHash(['a', 'b'])).toBe(traceHash(['a', 'b']))
    expect(traceHash(['a', 'b'])).not.toBe(traceHash(['b', 'a']))
  })
})
