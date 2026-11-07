/**
 * D-085: the environment mode each call ran with travels from the runner's usage to the ledger sink, so every measurement says
 * what it measured (native / answer-only / needed). Additive: a runner that does not say leaves the field out.
 */
import { describe, expect, it } from 'vitest'
import type { RunEvent, RunHandle, Runner, RunnerUsage } from '../src/contract.ts'
import { usageStoreSink, withUsageMeter, type MeasuredUsage } from '../src/resolve/usage-meter.ts'

const handle: RunHandle = { runId: 'r1', sessionId: 's1', ticketId: 't1', assignmentId: 'a1', model: 'haiku' } as unknown as RunHandle

function runnerReporting(usage: RunnerUsage): Runner {
  const stream = async function *(): AsyncIterable<RunEvent> {
    yield { type: 'started', at: '2026-11-04T20:00:00.000Z', handle }
    yield { type: 'ended', at: '2026-11-04T20:00:01.000Z', report: { state: 'ready', summary: 'ok' } }
  }
  return {
    capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: true, usage: true, mcpTools: 'available', permission: 'explicit' }),
    health: async () => ({ ok: true, detail: 'ok' }),
    authenticate: async () => ({ ok: true }),
    start: async () => handle,
    startTurn: async () => handle,
    stream,
    events: stream,
    cancel: async () => undefined,
    resume: async () => handle,
    usage: async () => usage,
  } as unknown as Runner
}

async function drain(runner: Runner): Promise<void> {
  for await (const event of runner.stream(handle)) void event
}

describe('the mode of each call reaches the ledger sink', () => {
  it('withUsageMeter records the effective mode of the call next to its tokens', async () => {
    const rows: MeasuredUsage[] = []
    const runner = withUsageMeter(runnerReporting({ inputTokens: 1608, outputTokens: 40, envMode: 'answer-only' }), { record: (row) => { rows.push(row) } }, 'claude', { kind: 'triage' })
    await drain(runner)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ inputTokens: 1608, outputTokens: 40, envMode: 'answer-only' })
  })

  it('a call that fell back to native is recorded as native (the requested mode is not what ran)', async () => {
    const rows: MeasuredUsage[] = []
    const runner = withUsageMeter(runnerReporting({ inputTokens: 377_321, outputTokens: 40, envMode: 'native', envModeRequested: 'answer-only' }), { record: (row) => { rows.push(row) } }, 'claude')
    await drain(runner)
    expect(rows[0]?.envMode).toBe('native')
  })

  it('a runner that does not say leaves the field out (never an invented mode)', async () => {
    const rows: MeasuredUsage[] = []
    const runner = withUsageMeter(runnerReporting({ inputTokens: 10, outputTokens: 2 }), { record: (row) => { rows.push(row) } }, 'claude')
    await drain(runner)
    expect('envMode' in (rows[0] ?? {})).toBe(false)
  })

  it('D-096: the reason and the typed signal of the fallback travel with the tokens (the host writes them into the ledger and the Task detail)', async () => {
    const rows: MeasuredUsage[] = []
    const runner = withUsageMeter(runnerReporting({
      inputTokens: 300_000, outputTokens: 40, envMode: 'native', envModeRequested: 'needed', envModeReason: 'connector-unreached',
      connectorsUnreached: [{ ordinal: 1, reason: 'failed' }], connectorsFallback: 'native-once',
    }), { record: (row) => { rows.push(row) } }, 'claude')
    await drain(runner)
    expect(rows[0]).toMatchObject({ envMode: 'native', envModeReason: 'connector-unreached', connectorsUnreached: [{ ordinal: 1, reason: 'failed' }], connectorsFallback: 'native-once' })
    // the floor keeps the isolated mode and still says what was missed
    const floor: MeasuredUsage[] = []
    await drain(withUsageMeter(runnerReporting({ inputTokens: 31_000, outputTokens: 40, envMode: 'needed', envModeReason: 'verified', connectorsUnreached: [{ ordinal: 0, reason: 'needs-auth' }], connectorsFallback: 'floor' }), { record: (row) => { floor.push(row) } }, 'claude'))
    expect(floor[0]).toMatchObject({ envMode: 'needed', envModeReason: 'verified', connectorsUnreached: [{ ordinal: 0, reason: 'needs-auth' }], connectorsFallback: 'floor' })
  })

  it('D-096: a call that missed nothing leaves the three fields out, and the store sink does not invent columns for them', () => {
    const stored: Record<string, unknown>[] = []
    const sink = usageStoreSink({ record: (event) => { stored.push(event) } }, { personaId: 'nina', projectId: 'p1' })
    sink.record({ provider: 'claude', model: 'haiku', window: '5h', inputTokens: 5, outputTokens: 1, origin: 'measured', at: '2026-11-04T20:00:00.000Z', kind: 'execution', envMode: 'needed', envModeReason: 'verified' })
    expect(stored[0]).not.toHaveProperty('connectorsUnreached')
    expect(stored[0]).not.toHaveProperty('connectorsFallback')
    expect(stored[0]).not.toHaveProperty('envModeReason') // the host's own sink writes the reason into its ledger; the usage store has no column for it
  })

  it('usageStoreSink hands the mode to the store, and omits it when absent', () => {
    const stored: Record<string, unknown>[] = []
    const sink = usageStoreSink({ record: (event) => { stored.push(event) } }, { personaId: 'nina', projectId: 'p1' })
    const base: MeasuredUsage = { provider: 'claude', model: 'haiku', window: '5h', inputTokens: 5, outputTokens: 1, origin: 'measured', at: '2026-11-04T20:00:00.000Z', kind: 'triage' }
    sink.record({ ...base, envMode: 'needed' })
    sink.record(base)
    expect(stored[0]).toMatchObject({ envMode: 'needed', personaId: 'nina', projectId: 'p1' })
    expect('envMode' in (stored[1] ?? {})).toBe(false)
  })
})
