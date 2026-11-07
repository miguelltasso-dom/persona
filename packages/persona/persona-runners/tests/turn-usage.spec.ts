/**
 * The usage of a TURN is the turn's own, not the warm session's running total (found 07/11 in the TEAM-10 attempt 3: the ledger booked 329 293 input tokens, the four CLI sessions had spent 176 494).
 * OAR's `session.usage()` is cumulative since the session opened and the persona's session is warm (reused across Tasks), so `usage(handle)` returned the running total and the meter booked it as
 * the turn: a session of 4 turns showed 16 320, 38 672, 52 658, 69 989 where the turns were 16 320, 22 352, 13 986, 17 331. Everything that sums the ledger (the person's "Uso e limites", the budget
 * guard, the history estimates, the quota calibration) counted a warm session twice, three times… A turn reads: the session's total NOW minus the total when the turn began. Fake OAR sessions
 * (no CLI, no model): the real session reports exactly this kind of cumulative counter.
 */
import type { SessionUsage } from '@botiverse/oar'
import { describe, expect, it } from 'vitest'
import { createClaudeRunner, withUsageMeter, type MeasuredUsage, type RunEvent, type StartTurnInput } from '../src/index.ts'
import { usageSince } from '../src/oar/usage-detail.ts'

interface Spent { input: number; output: number; cacheRead: number; cacheWrite: number }

const input: StartTurnInput = {
  ticketId: 'ticket-delta', assignmentId: 'assignment-delta', personaId: 'teo', cwd: 'C:/tmp/delta', prompt: 'oi', model: 'scripted-1', permissionMode: 'deny',
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

/**
 * A fake OAR runtime with ONE session that keeps a cumulative counter (every prompt adds its own tokens), as the real session does. `script` is what each prompt spends;
 * a `reset` entry replaces the session's counter instead (a reconnection: the new session starts again from its own count).
 */
function warmRuntime(script: ReadonlyArray<Spent | { reset: Spent }>) {
  let opened = 0
  let turn = -1
  let total: Spent = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  const runtime = {
    id: 'fake-claude',
    session: async () => {
      opened += 1
      const listeners: Array<(event: { kind: string; text?: string }) => void> = []
      return {
        id: `sess-${String(opened)}`,
        events: (listener: (event: { kind: string; text?: string }) => void) => { listeners.push(listener); return () => undefined },
        prompt: async () => {
          turn += 1
          const step = script[turn]
          if (step === undefined) throw new Error('the script has no more turns')
          if ('reset' in step) total = { ...step.reset }
          else total = { input: total.input + step.input, output: total.output + step.output, cacheRead: total.cacheRead + step.cacheRead, cacheWrite: total.cacheWrite + step.cacheWrite }
          for (const listener of listeners) listener({ kind: 'text_delta', text: 'ok' })
          return { kind: 'ok' }
        },
        abort: async () => undefined,
        dispose: async () => undefined,
        usage: (): { value: SessionUsage } => ({ value: { total: { ...total } } }),
        status: () => ({ value: { kind: 'idle' as const } }),
      }
    },
  }
  return { runtime, sessionsOpened: () => opened }
}

const T1: Spent = { input: 16_320, output: 2_114, cacheRead: 11_215, cacheWrite: 5_101 }
const T2: Spent = { input: 22_352, output: 3_642, cacheRead: 19_738, cacheWrite: 2_610 }
const T3: Spent = { input: 13_986, output: 5_795, cacheRead: 11_619, cacheWrite: 2_365 }
const T4: Spent = { input: 17_331, output: 7_149, cacheRead: 13_984, cacheWrite: 3_345 }

describe('usageSince: a turn is the session\'s total now minus its total when the turn began', () => {
  const reading = { inputTokens: 52_658, outputTokens: 11_551, cacheReadTokens: 42_572, cacheWriteTokens: 10_076 }
  const base = { inputTokens: 38_672, outputTokens: 5_756, cacheReadTokens: 30_953, cacheWriteTokens: 7_711 }

  it('subtracts every counter the reading carries (cache and main loop included)', () => {
    expect(usageSince({ ...reading, mainLoopInputTokens: 40_000, mainLoopOutputTokens: 9_000 }, { ...base, mainLoopInputTokens: 30_000, mainLoopOutputTokens: 4_000 }))
      .toEqual({ inputTokens: 13_986, outputTokens: 5_795, cacheReadTokens: 11_619, cacheWriteTokens: 2_365, mainLoopInputTokens: 10_000, mainLoopOutputTokens: 5_000 })
  })

  it('without a base (a session that had nothing before) it is the reading itself', () => {
    expect(usageSince(reading, undefined)).toEqual(reading)
  })

  it('a counter that went DOWN means another session (reconnection): the reading is the turn\'s own, never a negative number', () => {
    expect(usageSince({ inputTokens: 3_000, outputTokens: 400 }, { inputTokens: 10_000, outputTokens: 900 })).toEqual({ inputTokens: 3_000, outputTokens: 400 })
    expect(usageSince({ inputTokens: 12_000, outputTokens: 300, cacheReadTokens: 100 }, { inputTokens: 10_000, outputTokens: 900, cacheReadTokens: 50 })).toEqual({ inputTokens: 12_000, outputTokens: 300, cacheReadTokens: 100 })
  })

  it('a field the reading does not report stays absent (never a made-up 0) and what is not a counter is untouched', () => {
    const turn = usageSince({ inputTokens: 100, outputTokens: 10, envMode: 'needed', effortDropped: 'max' }, { inputTokens: 40, outputTokens: 4, cacheReadTokens: 30 })
    expect(turn).toEqual({ inputTokens: 60, outputTokens: 6, envMode: 'needed', effortDropped: 'max' })
    expect('cacheReadTokens' in turn).toBe(false)
  })

  it('a turn that spent nothing reads zero, not the total', () => {
    expect(usageSince({ inputTokens: 500, outputTokens: 50 }, { inputTokens: 500, outputTokens: 50 })).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})

describe('the adapter reports the TURN\'s usage on a warm session (the ledger is the sum of its turns)', () => {
  it('four turns on one warm session: each usage() is that turn\'s own and they add up to the session total', async () => {
    const { runtime, sessionsOpened } = warmRuntime([T1, T2, T3, T4])
    const runner = createClaudeRunner({ runtime: runtime as never })
    const seen: Array<{ inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }> = []
    for (let n = 0; n < 4; n += 1) {
      const handle = await runner.start({ ...input, assignmentId: `a${String(n)}` })
      await collect(runner.stream(handle))
      seen.push(await runner.usage(handle))
    }
    expect(sessionsOpened()).toBe(1) // the same warm session served all four turns
    expect(seen.map(row => row.inputTokens)).toEqual([16_320, 22_352, 13_986, 17_331])
    expect(seen.map(row => row.outputTokens)).toEqual([2_114, 3_642, 5_795, 7_149])
    expect(seen.map(row => row.cacheReadTokens)).toEqual([11_215, 19_738, 11_619, 13_984])
    expect(seen.map(row => row.cacheWriteTokens)).toEqual([5_101, 2_610, 2_365, 3_345])
    expect(seen.reduce((total, row) => total + row.inputTokens, 0)).toBe(69_989) // = the session's running total at the end
  })

  it('a cold session (one turn) is unchanged: the turn IS the session total', async () => {
    const { runtime } = warmRuntime([T1])
    const runner = createClaudeRunner({ runtime: runtime as never })
    const handle = await runner.start(input)
    await collect(runner.stream(handle))
    expect(await runner.usage(handle)).toMatchObject({ inputTokens: 16_320, outputTokens: 2_114, cacheReadTokens: 11_215, cacheWriteTokens: 5_101 })
  })

  it('a reconnection (the session\'s counter starts again lower) never gives a negative or a doubled turn: the reading itself', async () => {
    const { runtime } = warmRuntime([T1, { reset: { input: 3_000, output: 400, cacheRead: 2_000, cacheWrite: 1_000 } }])
    const runner = createClaudeRunner({ runtime: runtime as never })
    const rows: number[] = []
    for (let n = 0; n < 2; n += 1) {
      const handle = await runner.start({ ...input, assignmentId: `r${String(n)}` })
      await collect(runner.stream(handle))
      rows.push((await runner.usage(handle)).inputTokens)
    }
    expect(rows).toEqual([16_320, 3_000])
  })

  it('a turn that already ended keeps its numbers when the next turn of the session spends more', async () => {
    const { runtime } = warmRuntime([T1, T2])
    const runner = createClaudeRunner({ runtime: runtime as never })
    const first = await runner.start({ ...input, assignmentId: 'first' })
    await collect(runner.stream(first))
    const before = await runner.usage(first)
    const second = await runner.start({ ...input, assignmentId: 'second' })
    await collect(runner.stream(second))
    expect(await runner.usage(first)).toEqual(before)
    expect((await runner.usage(second)).inputTokens).toBe(22_352)
  })

  it('the meter books the turn\'s own usage: the ledger rows of a warm session add up to what the session spent', async () => {
    const { runtime } = warmRuntime([T1, T2, T3, T4])
    const records: MeasuredUsage[] = []
    const runner = withUsageMeter(createClaudeRunner({ runtime: runtime as never }), { record: (row) => { records.push(row) } }, 'claude')
    for (let n = 0; n < 4; n += 1) await collect(runner.stream(await runner.start({ ...input, assignmentId: `m${String(n)}` })))
    expect(records.map(row => row.inputTokens)).toEqual([16_320, 22_352, 13_986, 17_331])
    expect(records.reduce((total, row) => total + row.inputTokens, 0)).toBe(69_989)
    expect(records.reduce((total, row) => total + (row.cacheReadTokens ?? 0), 0)).toBe(56_556)
  })
})
