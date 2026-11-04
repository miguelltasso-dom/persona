import { describe, expect, it } from 'vitest'
import {
  createScriptedRunner,
  meterTurnKind,
  usageStoreSink,
  withUsageMeter,
  type MeasuredUsage,
} from '../src/index.ts'

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
