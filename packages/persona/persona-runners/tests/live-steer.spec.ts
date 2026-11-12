import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import {
  createClaudeRunner,
  createOarSessionRunner,
  type RunEvent,
  type RunHandle,
  type Runner,
  type StartTurnInput,
  type TurnRunner,
} from '../src/index.ts'

const handleOf = (input: StartTurnInput, index: number): RunHandle => ({
  runId: `run-${String(index)}`,
  sessionId: 'worker-t1',
  ticketId: input.ticketId,
  assignmentId: input.assignmentId,
  personaId: input.personaId,
  cwd: input.cwd,
  model: input.model,
})

/** A turn runner whose first turn waits for the test and whose stream reports the steer as dropped, read or silent. */
function gatedTurn(mode: 'drop' | 'read' | 'none'): {
  turn: TurnRunner
  starts: StartTurnInput[]
  steered: string[]
  release: () => void
} {
  const starts: StartTurnInput[] = []
  const steered: string[] = []
  const { promise: gate, resolve: release } = Promise.withResolvers<boolean>()
  const turn: TurnRunner = {
    capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: false, mcpTools: 'unavailable', permission: 'explicit' }),
    health: () => Promise.resolve({ ok: true, detail: '' }),
    authenticate: () => Promise.resolve({ ok: true, detail: '' }),
    start: async (input) => {
      starts.push(input)
      return handleOf(input, starts.length)
    },
    startTurn: async input => turn.start(input),
    stream: async function* (input: RunHandle): AsyncGenerator<RunEvent> {
      yield { type: 'started', at: 'x', handle: input }
      // The runtime echoes the prompt it read: from here on, "no echo" means "not read".
      yield { type: 'inputRead', at: 'x', inputId: input.assignmentId }
      if (input.runId === 'run-1') {
        await gate
        if (mode === 'drop') yield { type: 'inputDropped', at: 'x', inputId: 'steer-1', reason: 'turn_interrupted' }
        if (mode === 'read') yield { type: 'inputRead', at: 'x', inputId: 'steer-1' }
      } else {
        yield { type: 'delta', at: 'x', text: 'li o recado' }
      }
      yield { type: 'ended', at: 'x', report: { state: 'ready', summary: 'ok' } }
    },
    events: input => turn.stream(input),
    cancel: () => Promise.resolve(),
    steer: async (_handle, _requestId, text) => { steered.push(text); return true },
    resume: () => Promise.reject(new Error('not used')),
    usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
  }
  return { turn, starts, steered, release: () => { release(true) } }
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>()
  setTimeout(() => { resolve(undefined) }, ms)
  return promise
}

async function until(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timeout: ${label}`)
    await delay(10)
  }
}

async function steerWhenOpen(runner: Runner, text: string): Promise<boolean> {
  const deadline = Date.now() + 10_000
  for (;;) {
    if (await runner.steer?.('worker-t1', 'steer-1', text) === true) return true
    if (Date.now() > deadline) return false
    await delay(10)
  }
}

describe('live steer (item 2b)', () => {
  it('a steer enters the open turn through the runtime and does not open a second one', async () => {
    let turns = 0
    let steered: readonly string[] = []
    const { promise: gate, resolve: release } = Promise.withResolvers<boolean>()
    const runtime = scriptedRuntime({
      id: 'scripted-steer',
      turn: async (turn) => {
        turns += 1
        steered = turn.steered
        await gate
        turn.say(`li: ${turn.steered.join(',')}`)
      },
    })
    const runner = createOarSessionRunner({
      turn: createClaudeRunner({ runtime }),
      personaId: 'nina',
      model: 'scripted-1',
      permissionMode: 'deny',
    })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    const running = runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')
    expect(await steerWhenOpen(runner, 'use a cor azul')).toBe(true)
    await until(() => steered.includes('use a cor azul'), 'steer reached the turn')
    release(true)
    await running
    expect(turns).toBe(1)
    expect(steered).toEqual(['use a cor azul'])
    expect(runner.status('worker-t1')).toBe('idle')
  })

  it('a queued message that arrives mid-turn enters the open turn instead of opening a second one', async () => {
    const { turn, starts, steered, release } = gatedTurn('none')
    const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny' })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    const running = runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')
    expect(await steerWhenOpen(runner, 'primeiro recado')).toBe(true)
    await runner.deliver('worker-t1', 'msg-2', 'use a cor azul', 'queue')
    expect(starts).toHaveLength(1)
    expect(steered).toEqual(['primeiro recado', 'use a cor azul'])
    release()
    await running
  })

  it('steer answers false when no turn is open', async () => {
    const runner = createOarSessionRunner({
      turn: createClaudeRunner({ runtime: scriptedRuntime({ turn: () => undefined }) }),
      personaId: 'nina',
      model: 'scripted-1',
      permissionMode: 'deny',
    })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    expect(await runner.steer?.('worker-t1', 'steer-1', 'oi')).toBe(false)
  })

  it('an explicitly dropped steer goes back to the queue and is read by the next turn', async () => {
    const { turn, starts, release } = gatedTurn('drop')
    const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny' })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    const running = runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')
    expect(await steerWhenOpen(runner, 'use a cor azul')).toBe(true)
    release()
    await running
    expect(starts).toHaveLength(2)
    expect(starts[0]?.prompt.endsWith('faça o relatório')).toBe(true)
    expect(starts[1]?.prompt).toBe('use a cor azul')
    expect(starts[1]?.assignmentId).toBe('launch-1:requeue:1')
    expect(runner.status('worker-t1')).toBe('idle')
  })

  it('a steer the runtime read is not requeued', async () => {
    const { turn, starts, release } = gatedTurn('read')
    const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny' })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    const running = runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')
    expect(await steerWhenOpen(runner, 'use a cor azul')).toBe(true)
    release()
    await running
    expect(starts).toHaveLength(1)
  })

  it('a steer dropped after Parar does not start a turn of its own', async () => {
    const { turn, starts, release } = gatedTurn('drop')
    const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny' })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    const running = runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')
    expect(await steerWhenOpen(runner, 'use a cor azul')).toBe(true)
    await runner.cancel('worker-t1', { keepInbox: true })
    release()
    await running
    expect(starts).toHaveLength(1)
  })

  it('every dropped steer goes back to the queue, in order, however many there are', async () => {
    const starts: StartTurnInput[] = []
    const { promise: gate, resolve: release } = Promise.withResolvers<boolean>()
    const turn: TurnRunner = {
      capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: false, mcpTools: 'unavailable', permission: 'explicit' }),
      health: () => Promise.resolve({ ok: true, detail: '' }),
      authenticate: () => Promise.resolve({ ok: true, detail: '' }),
      start: async (input) => {
        starts.push(input)
        return handleOf(input, starts.length)
      },
      startTurn: async input => turn.start(input),
      stream: async function* (input: RunHandle): AsyncGenerator<RunEvent> {
        yield { type: 'started', at: 'x', handle: input }
        yield { type: 'inputRead', at: 'x', inputId: input.assignmentId }
        if (input.runId === 'run-1') {
          await gate
          for (const inputId of ['steer-1', 'steer-2', 'steer-3', 'steer-4']) {
            yield { type: 'inputDropped', at: 'x', inputId, reason: 'turn_interrupted' }
          }
        } else {
          yield { type: 'delta', at: 'x', text: 'li o recado' }
        }
        yield { type: 'ended', at: 'x', report: { state: 'ready', summary: 'ok' } }
      },
      events: input => turn.stream(input),
      cancel: () => Promise.resolve(),
      steer: () => Promise.resolve(true),
      resume: () => Promise.reject(new Error('not used')),
      usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    }
    const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny' })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    const running = runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')
    const texts = ['um', 'dois', 'três', 'quatro']
    for (const [index, text] of texts.entries()) {
      const id = `steer-${String(index + 1)}`
      const deadline = Date.now() + 10_000
      while (await runner.steer?.('worker-t1', id, text) !== true) {
        if (Date.now() > deadline) throw new Error(`timeout: ${id}`)
        await delay(10)
      }
    }
    release(true)
    await running
    expect(starts).toHaveLength(5)
    expect(starts.slice(1).map(start => start.prompt)).toEqual(texts)
    expect(starts.slice(1).map(start => start.assignmentId))
      .toEqual(['launch-1:requeue:1', 'launch-1:requeue:2', 'launch-1:requeue:3', 'launch-1:requeue:4'])
  })
})
