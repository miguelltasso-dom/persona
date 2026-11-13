import { createFakeRunner, resolveRunner, type ComputerActingContext, type RunEvent, type RunHandle, type StartTurnInput, type TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect, it } from 'vitest'
import type { ProductToolsTurn } from '../src/harness-turn.ts'
import { lastRunnerText, resolveHostRunner } from '../src/runner.ts'

function fakeRemoteRunner(onStart?: (input: StartTurnInput) => void): TurnRunner {
  const handles = new Map<string, StartTurnInput>()
  const start = (input: StartTurnInput): Promise<RunHandle> => {
    onStart?.(input)
    const handle: RunHandle = {
      runId: `remote-run-${input.assignmentId}`,
      sessionId: input.ticketId,
      ticketId: input.ticketId,
      assignmentId: input.assignmentId,
      personaId: input.personaId,
      cwd: input.cwd,
      model: input.model,
    }
    handles.set(handle.runId, input)
    return Promise.resolve(handle)
  }
  const stream = (handle: RunHandle): AsyncIterable<RunEvent> => ({
    async *[Symbol.asyncIterator](): AsyncIterator<RunEvent> {
      yield { type: 'started', at: new Date(0).toISOString(), handle }
      yield { type: 'delta', at: new Date(0).toISOString(), text: `remote:${handles.get(handle.runId)?.ticketId ?? ''}` }
      yield { type: 'ended', at: new Date(0).toISOString(), report: { state: 'ready', summary: 'remote done' } }
    },
  })
  return {
    capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: true, mcpTools: 'available', permission: 'explicit' }),
    health: async () => ({ ok: true, detail: 'ok' }),
    authenticate: async () => ({ ok: true, detail: 'ok' }),
    start,
    startTurn: start,
    resume: start,
    stream,
    events: stream,
    cancel: async () => {},
    usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
  }
}

it('uses remoteRunner before scripted replies, captures remote deltas, and forwards authority + computer context into productTools', async () => {
  const startedInputs: StartTurnInput[] = []
  const openedTurns: ProductToolsTurn[] = []
  let fakeCalls = 0
  let resolveCalls = 0
  const remote = fakeRemoteRunner((input) => { startedInputs.push(input) })
  const computer: ComputerActingContext = {
    runId: 'cr-9',
    target: { windowHandle: 'hwnd-77', processId: 42, title: 'App' },
  }

  const session = await resolveHostRunner(
    {
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'allow-once',
      autonomy: 'act',
      personId: 'nina',
      purpose: 'task',
      remoteRunner: () => remote,
      authorityOf: () => 'person',
      computerOf: ticketId => (ticketId === 't1' ? computer : undefined),
      productTools: (turn) => {
        openedTurns.push(turn)
        return undefined
      },
    },
    {
      createFakeRunner: () => {
        fakeCalls += 1
        return createFakeRunner()
      },
      resolveRunner: async (options) => {
        resolveCalls += 1
        return resolveRunner(options)
      },
    },
  )

  await session.ensureSession('t1', '.', 't1', 'worker')
  await session.deliver('t1', 'a1', 'verifique a janela', 'queue')
  await session.whenIdle('t1')

  expect(fakeCalls).toBe(0)
  expect(resolveCalls).toBe(0)
  expect(startedInputs).toHaveLength(1)
  expect(lastRunnerText(session, 't1')).toBe('remote:t1')
  expect(openedTurns).toHaveLength(1)
  expect(openedTurns[0]?.authority).toBe('person')
  expect(openedTurns[0]?.computer).toEqual(computer)
})

it('falls back to scripted fake runner in test mode when remoteRunner returns undefined', async () => {
  let fakeCalls = 0
  const session = await resolveHostRunner(
    {
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'allow-once',
      autonomy: 'act',
      personId: 'nina',
      purpose: 'task',
      remoteRunner: () => undefined,
    },
    {
      createFakeRunner: () => {
        fakeCalls += 1
        return createFakeRunner()
      },
      resolveRunner,
    },
  )
  await session.ensureSession('t2', '.', 't2', 'worker')
  await session.deliver('t2', 'a2', 'oi', 'queue')
  await session.whenIdle('t2')
  expect(fakeCalls).toBe(1)
})
