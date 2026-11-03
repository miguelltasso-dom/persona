import { describe, expect, it } from 'vitest'
import {
  createDshRunner,
  createScriptedRunner,
  RECOVERY_NOTE,
  scriptedHistory,
  toWorkerReport,
  type DshAgentEvent,
  type DshAgentPort,
  type HistoryTurn,
  type RunEvent,
  type StartTurnInput,
} from '../src/index.ts'

const baseInput: StartTurnInput = {
  ticketId: 'ticket-1',
  assignmentId: 'assignment-1',
  personaId: 'bento',
  cwd: 'C:/tmp/ticket-1',
  prompt: 'Ship the report',
  model: 'mock-a',
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

describe('Runner contract', () => {
  it('plays scripted events in order and maps them onto engine reports', async () => {
    const runner = createScriptedRunner({
      turns: [{
        events: [
          { type: 'delta', at: 't1', text: 'working' },
          { type: 'report', at: 't2', report: { state: 'progress', summary: 'working' } },
          { type: 'ended', at: 't3', report: { state: 'ready', summary: 'done' } },
        ],
        usage: { inputTokens: 3, outputTokens: 5 },
      }],
    })
    expect(runner.capabilities()).toMatchObject({ kind: 'dsh', stream: true, cancel: true, resume: true })
    const handle = await runner.start(baseInput)
    const events = await collect(runner.stream(handle))
    expect(events.map(event => event.type)).toEqual(['started', 'delta', 'report', 'ended'])
    const ended = events.at(-1)
    if (ended?.type !== 'ended') throw new Error('expected ended')
    expect(toWorkerReport(ended)).toEqual({ state: 'ready', summary: 'done' })
    expect(await runner.usage(handle)).toEqual({ inputTokens: 3, outputTokens: 5 })
  })

  it('cancel drops the remaining stream', async () => {
    const runner = createScriptedRunner({
      turns: [{
        events: [
          { type: 'delta', at: 't1', text: 'one' },
          { type: 'delta', at: 't2', text: 'two' },
          { type: 'ended', at: 't3', report: { state: 'ready', summary: 'late' } },
        ],
      }],
    })
    const handle = await runner.startTurn(baseInput)
    const iter = runner.events(handle)[Symbol.asyncIterator]()
    const first = await iter.next()
    expect(first.value?.type).toBe('started')
    await runner.cancel(handle)
    const rest: RunEvent[] = []
    for (;;) {
      const step = await iter.next()
      if (step.done === true) break
      rest.push(step.value)
    }
    expect(rest.at(-1)).toMatchObject({ type: 'ended', report: { state: 'dropped', summary: 'cancelled' } })
  })

  it('resume after restart prepends the engine recovery note and keeps history', async () => {
    const runner = createScriptedRunner({
      turns: [
        { events: [{ type: 'ended', at: 't1', report: { state: 'progress', summary: 'mid' } }] },
        { events: [{ type: 'ended', at: 't2', report: { state: 'ready', summary: 'recovered' } }] },
      ],
    })
    const first = await runner.start(baseInput)
    await collect(runner.stream(first))
    const second = await runner.resume({
      ...baseInput,
      assignmentId: 'assignment-2',
      prompt: 'continue',
      resumeSessionId: first.sessionId,
    })
    const history = scriptedHistory(runner, second)
    expect(history.map(turn => turn.text)).toEqual([
      'Ship the report',
      RECOVERY_NOTE,
      'continue',
    ])
    const events = await collect(runner.stream(second))
    expect(events.at(-1)).toMatchObject({ report: { state: 'ready', summary: 'recovered' } })
  })

  it('keeps history when the model changes', async () => {
    const runner = createScriptedRunner({
      turns: [
        { events: [{ type: 'ended', at: 't1', report: { state: 'waiting', summary: 'pause' } }] },
        { events: [{ type: 'ended', at: 't2', report: { state: 'ready', summary: 'swapped' } }] },
      ],
    })
    const first = await runner.start(baseInput)
    await collect(runner.stream(first))
    const prior = scriptedHistory(runner, first)
    const second = await runner.start({
      ...baseInput,
      model: 'mock-b',
      prompt: 'retry on the other model',
      history: prior,
      resumeSessionId: first.sessionId,
    })
    expect(second.model).toBe('mock-b')
    expect(scriptedHistory(runner, second).map(turn => turn.role)).toEqual(['user', 'user'])
    expect(scriptedHistory(runner, second)[0]?.text).toBe('Ship the report')
  })
})

describe('DSH runner', () => {
  function port(
    script: DshAgentEvent[],
    usage: { inputTokens: number; outputTokens: number } = { inputTokens: 1, outputTokens: 2 },
  ): DshAgentPort {
    const historyBySession = new Map<string, HistoryTurn[]>()
    return {
      start: async ({ history }) => {
        historyBySession.set('sess-1', [...history])
        return { sessionId: 'sess-1', events: (async function *() { yield* script })() }
      },
      resume: async ({ sessionId, history }) => {
        historyBySession.set(sessionId, [...history])
        return { sessionId, events: (async function *() { yield* script })() }
      },
      cancel: async () => {},
      usage: async () => usage,
    }
  }

  it('streams agent text as progress reports and records usage', async () => {
    const runner = createDshRunner({
      agent: port([
        { type: 'text', text: 'hello' },
        { type: 'ended', text: 'hello' },
      ]),
    })
    const handle = await runner.start(baseInput)
    const events = await collect(runner.stream(handle))
    expect(events.map(event => event.type)).toEqual(['started', 'delta', 'report', 'ended'])
    expect(events[2]).toMatchObject({ report: { state: 'progress', summary: 'hello' } })
    expect(await runner.usage(handle)).toEqual({ inputTokens: 1, outputTokens: 2 })
  })

  it('promotes a slow shell tool to a background-job report', async () => {
    const runner = createDshRunner({
      backgroundShellAfterMs: 5_000,
      agent: port([
        { type: 'tool', name: 'bash', elapsedMs: 6_000 },
        { type: 'ended', text: 'ok' },
      ]),
    })
    const events = await collect(runner.stream(await runner.start(baseInput)))
    expect(events.some(event => event.type === 'report' && event.report.summary.includes('background job'))).toBe(true)
  })

  it('cancels the agent session', async () => {
    let cancelled = ''
    const agent: DshAgentPort = {
      start: async () => ({
        sessionId: 'sess-cancel',
        events: (async function *() {
          yield { type: 'text' as const, text: 'hi' }
          await new Promise(resolve => setTimeout(resolve, 50))
          yield { type: 'ended' as const, text: 'late' }
        })(),
      }),
      resume: async ({ sessionId }) => ({ sessionId, events: (async function *() {})() }),
      cancel: async (sessionId) => { cancelled = sessionId },
      usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
    }
    const runner = createDshRunner({ agent })
    const handle = await runner.start(baseInput)
    const iter = runner.stream(handle)[Symbol.asyncIterator]()
    await iter.next()
    await runner.cancel(handle)
    const rest: RunEvent[] = []
    for (;;) {
      const step = await iter.next()
      if (step.done === true) break
      rest.push(step.value)
    }
    expect(cancelled).toBe('sess-cancel')
    expect(rest.some(event => event.type === 'ended' && event.report.state === 'dropped')).toBe(true)
  })

  it('resume injects the recovery note through the agent port', async () => {
    let seen: HistoryTurn[] = []
    const agent: DshAgentPort = {
      start: async ({ history }) => {
        seen = [...history]
        return { sessionId: 'sess-r', events: (async function *() { yield { type: 'ended' as const, text: 'first' } })() }
      },
      resume: async ({ history }) => {
        seen = [...history]
        return { sessionId: 'sess-r', events: (async function *() { yield { type: 'ended' as const, text: 'again' } })() }
      },
      cancel: async () => {},
      usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
    }
    const runner = createDshRunner({ agent })
    const first = await runner.start(baseInput)
    await collect(runner.stream(first))
    const second = await runner.resume({
      ...baseInput,
      prompt: 'continue',
      resumeSessionId: first.sessionId,
      history: [{ role: 'user', text: 'Ship the report' }, { role: 'assistant', text: 'first' }],
    })
    expect(second.sessionId).toBe('sess-r')
    expect(seen.map(turn => turn.text)).toEqual([
      'Ship the report',
      'first',
      RECOVERY_NOTE,
      'continue',
    ])
  })

  it('refuses a third concurrent turn so one slot stays reserved', async () => {
    const hang: DshAgentPort = {
      start: async () => ({
        sessionId: `sess-${String(Math.random())}`,
        events: (async function *() { await new Promise(() => {}) })(),
      }),
      resume: async ({ sessionId }) => ({ sessionId, events: (async function *() {})() }),
      cancel: async () => {},
      usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
    }
    const runner = createDshRunner({ agent: hang, maxConcurrent: 2, reservedPersonSlots: 1 })
    await runner.start(baseInput)
    await expect(runner.start({ ...baseInput, assignmentId: 'assignment-2' })).rejects.toThrow(/concurrency/u)
  })
})
