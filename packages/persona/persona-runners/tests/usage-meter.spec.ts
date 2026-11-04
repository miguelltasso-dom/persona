import { describe, expect, it } from 'vitest'
import type { RunEvent, Runner } from '../src/contract.ts'
import {
  createScriptedRunner,
  meterTurnKind,
  usageStoreSink,
  withUsageMeter,
  type MeasuredUsage,
} from '../src/index.ts'
import { turnDurationMs } from '../src/resolve/usage-meter.ts'

const input = {
  ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp', prompt: 'hi', model: 'haiku',
}

describe('OPT-1 usage meter', () => {
  it('commits usage before a consumer stops on the terminal report', async () => {
    const records: MeasuredUsage[] = []
    const runner = withUsageMeter(createScriptedRunner({ turns: [{
      events: [{ type: 'ended', at: '2026-11-04T04:10:00.000Z', report: { state: 'ready', summary: 'done' } }],
      usage: { inputTokens: 30, outputTokens: 7 },
    }] }), { record: (row) => { records.push(row) } }, 'claude')
    const handle = await runner.start(input)
    let usageSeen = false
    for await (const event of runner.stream(handle)) {
      if (event.type === 'usage') usageSeen = true
      if (event.type === 'ended') {
        expect(usageSeen).toBe(true)
        expect(records).toHaveLength(1)
        break
      }
    }
    expect(records[0]).toMatchObject({ inputTokens: 30, outputTokens: 7, kind: 'execution' })
  })

  it('speaks core kinds via usagePortKind and records vendor cache', async () => {
    expect(meterTurnKind('exec')).toBe('execution')
    expect(meterTurnKind('eval')).toBe('evaluation')
    expect(meterTurnKind('talk')).toBe('triage')
    expect(meterTurnKind('task')).toBe('execution')
    expect(meterTurnKind('librarian')).toBe('librarian')
    const records: MeasuredUsage[] = []
    const store: Array<{ kind?: string; cacheReadTokens?: number; cacheWriteTokens?: number }> = []
    const inner = createScriptedRunner({
      turns: [{
        events: [{ type: 'ended', at: '2026-11-04T04:10:00.000Z', report: { state: 'ready', summary: 'ok' } }],
        usage: { inputTokens: 40, outputTokens: 8, cacheReadTokens: 16, cacheWriteTokens: 4 },
      }],
    })
    const runner = withUsageMeter(inner, { record: (row) => { records.push(row) } }, 'claude', {
      kind: meterTurnKind('exec'),
      accountId: 'work',
    })
    const handle = await runner.start(input)
    for await (const _event of runner.stream(handle)) { /* drain */ }
    expect(records[0]).toMatchObject({
      provider: 'claude',
      kind: 'execution',
      window: 'exec',
      accountId: 'work',
      inputTokens: 40,
      cacheReadTokens: 16,
      cacheWriteTokens: 4,
      origin: 'measured',
    })
    const sink = usageStoreSink({ record: (row) => { store.push(row) } }, { personaId: 'nina', projectId: 'p1' })
    sink.record(records[0]!)
    expect(store[0]).toMatchObject({ kind: 'execution', cacheReadTokens: 16, cacheWriteTokens: 4 })
    expect(JSON.stringify(store[0])).not.toMatch(/"kind":"exec"/u)
  })
})

describe('OPT-9 turn duration', () => {
  const handleOf = () => ({ runId: 'r', sessionId: 's', ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp', model: 'haiku' })
  const started = (at: string): RunEvent => ({ type: 'started', at, handle: handleOf() })
  const ended = (at: string): RunEvent => ({ type: 'ended', at, report: { state: 'ready', summary: 'done' } })

  /** A runner whose stream is exactly the given events, so the instants are the test's, not the clock's. */
  function runnerWith(events: RunEvent[]): Runner {
    return {
      capabilities: () => ({}) as never,
      health: async () => ({ ok: true, detail: 'ok' }),
      authenticate: async () => ({ ok: true, detail: 'ok' }),
      start: async () => handleOf(),
      startTurn: async () => handleOf(),
      stream: async function *() { for (const event of events) yield event },
      events: async function *() { for (const event of events) yield event },
      cancel: async () => undefined,
      resume: async () => handleOf(),
      usage: async () => ({ inputTokens: 10, outputTokens: 2 }),
    }
  }

  async function measure(events: RunEvent[]): Promise<MeasuredUsage> {
    const records: MeasuredUsage[] = []
    const runner = withUsageMeter(runnerWith(events), { record: (row) => { records.push(row) } }, 'claude')
    for await (const _event of runner.stream(await runner.start(input))) { /* drain */ }
    expect(records).toHaveLength(1)
    return records[0]!
  }

  it('records ended.at − started.at of the same turn, in whole milliseconds', async () => {
    const row = await measure([started('2026-11-04T20:00:00.000Z'), ended('2026-11-04T20:00:02.500Z')])
    expect(row.durationMs).toBe(2500)
    expect(Number.isInteger(row.durationMs)).toBe(true)
    expect(row.at).toBe('2026-11-04T20:00:02.500Z')
  })

  it('uses the FIRST started when the stream announces it twice', async () => {
    const row = await measure([started('2026-11-04T20:00:00.000Z'), started('2026-11-04T20:00:09.000Z'), ended('2026-11-04T20:00:10.000Z')])
    expect(row.durationMs).toBe(10_000)
  })

  it('allows a real 0 ms turn (same instant) but never invents one', async () => {
    expect((await measure([started('2026-11-04T20:00:00.000Z'), ended('2026-11-04T20:00:00.000Z')])).durationMs).toBe(0)
    expect(await measure([ended('2026-11-04T20:00:00.000Z')])).not.toHaveProperty('durationMs')
  })

  it('leaves the field out when the instants are unusable (end before start, not a date)', async () => {
    expect(await measure([started('2026-11-04T20:00:05.000Z'), ended('2026-11-04T20:00:01.000Z')])).not.toHaveProperty('durationMs')
    expect(await measure([started('not a date'), ended('2026-11-04T20:00:01.000Z')])).not.toHaveProperty('durationMs')
    expect(await measure([started('2026-11-04T20:00:01.000Z'), ended('')])).not.toHaveProperty('durationMs')
  })

  it('turnDurationMs: absent start or end gives undefined, a fractional span rounds', () => {
    expect(turnDurationMs(undefined, '2026-11-04T20:00:00.000Z')).toBeUndefined()
    expect(turnDurationMs('2026-11-04T20:00:00.000Z', 'x')).toBeUndefined()
    expect(turnDurationMs('2026-11-04T20:00:00.000Z', '2026-11-04T20:00:01.250Z')).toBe(1250)
  })

  it('reaches the ledger port only when it exists', async () => {
    const stored: Array<{ durationMs?: number }> = []
    const sink = usageStoreSink({ record: (row) => { stored.push(row) } }, { personaId: 'nina', projectId: 'p1' })
    const withDuration = await measure([started('2026-11-04T20:00:00.000Z'), ended('2026-11-04T20:00:03.000Z')])
    const without = await measure([ended('2026-11-04T20:00:03.000Z')])
    sink.record(withDuration)
    sink.record(without)
    expect(stored[0]?.durationMs).toBe(3000)
    expect(stored[1]).not.toHaveProperty('durationMs')
  })
})
