/**
 * Carbon P0-12 (sprint de correção): `createOarSessionRunner` had NO `dispose()`, so evicting a warm runner ("Assumir controle", a model change, a pause, the host closing) left the
 * `claude` process and its MCP servers alive, still clicking in the person's Chrome. A disposed session stops its open turn, releases the turn runner and takes no more work.
 */
import { expect, it } from 'vitest'
import type { RunEvent, RunHandle, Runner as TurnRunner, StartTurnInput } from '../src/contract.ts'
import { createOarSessionRunner } from '../src/index.ts'

const AT = '2026-11-12T10:00:00.000Z'

/** A turn runner whose turn stays open until it is cancelled, and that counts what it was told. */
function openTurnRunner(startGate?: Promise<unknown>) {
  const cancelled: RunHandle[] = []
  let disposed = 0
  const gate = Promise.withResolvers<null>()
  const handleOf = (input: StartTurnInput): RunHandle => ({
    runId: 'run-1', sessionId: input.resumeSessionId ?? 'session-1', ticketId: input.ticketId, assignmentId: input.assignmentId, personaId: input.personaId, cwd: input.cwd, model: input.model,
  })
  async function* play(handle: RunHandle): AsyncIterable<RunEvent> {
    yield { type: 'started', at: AT, handle }
    await gate.promise // the turn is open until somebody cancels it
    yield { type: 'ended', at: AT, report: { state: 'dropped', summary: 'cancelled' } }
  }
  const turn: TurnRunner = {
    capabilities: () => ({ kind: 'dsh', stream: true, cancel: true, resume: true, usage: true, mcpTools: 'unavailable', permission: 'none' }),
    health: () => Promise.resolve({ ok: true, detail: 'fake' }),
    authenticate: () => Promise.resolve({ ok: true, detail: 'fake' }),
    start: async (input) => { await startGate; return handleOf(input) }, // a slow start: the turn is still "opening" (no handle yet)
    startTurn: input => Promise.resolve(handleOf(input)),
    resume: input => Promise.resolve(handleOf(input)),
    stream: play,
    events: play,
    cancel: (handle) => { cancelled.push(handle); gate.resolve(null); return Promise.resolve() },
    usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    dispose: () => { disposed += 1; return Promise.resolve() },
  }
  return { turn, cancelled, disposed: () => disposed }
}

async function until(condition: () => boolean): Promise<void> {
  for (let round = 0; round < 200 && !condition(); round += 1) await new Promise(resolve => setTimeout(resolve, 5))
  expect(condition()).toBe(true)
}

it('disposing the session runner stops the open turn and releases the turn runner (the process and its MCP servers)', async () => {
  const fake = openTurnRunner()
  const runner = createOarSessionRunner({ turn: fake.turn, personaId: 'nina', model: 'default', permissionMode: 'deny' })
  await runner.ensureSession('worker-t1', '.', 'Tarefa', 'worker')
  const delivering = runner.deliver('worker-t1', 'r1', 'faça o relatório', 'queue')
  await until(() => runner.status('worker-t1') === 'running')
  expect(typeof (runner as { dispose?: unknown }).dispose).toBe('function')
  await (runner as { dispose(): Promise<void> }).dispose()
  expect(fake.cancelled).toHaveLength(1) // the turn that was open was cancelled
  expect(fake.disposed()).toBe(1) // and the turn runner (the CLI process) released
  await delivering.catch(() => undefined)
  expect(runner.status('worker-t1')).not.toBe('running')
})

it('a session disposed while its turn is still OPENING cancels that turn the moment it opens (nothing runs behind the back of whoever dropped it)', async () => {
  const startGate = Promise.withResolvers<null>()
  const fake = openTurnRunner(startGate.promise)
  const runner = createOarSessionRunner({ turn: fake.turn, personaId: 'nina', model: 'default', permissionMode: 'deny' }) as ReturnType<typeof createOarSessionRunner> & { dispose(): Promise<void> }
  await runner.ensureSession('worker-t3', '.', 'Tarefa', 'worker')
  const delivering = runner.deliver('worker-t3', 'r3', 'faça o relatório', 'queue')
  await until(() => runner.status('worker-t3') === 'running') // running, but the runtime has not answered `start` yet: there is no handle to cancel
  const disposing = runner.dispose()
  startGate.resolve(null) // now the turn opens
  await disposing
  expect(fake.cancelled).toHaveLength(1) // before: the turn opened AFTER the dispose and ran on, with its CLI, until something else stopped it
  expect(fake.disposed()).toBe(1)
  await delivering.catch(() => undefined)
  expect(runner.status('worker-t3')).not.toBe('running')
})

it('a disposed session takes no more work (nothing is started behind the back of whoever evicted it), and disposing twice is harmless', async () => {
  const fake = openTurnRunner()
  const runner = createOarSessionRunner({ turn: fake.turn, personaId: 'nina', model: 'default', permissionMode: 'deny' }) as ReturnType<typeof createOarSessionRunner> & { dispose(): Promise<void> }
  await runner.ensureSession('worker-t2', '.', 'Tarefa', 'worker')
  await runner.dispose()
  await runner.dispose()
  expect(fake.disposed()).toBe(1)
  await expect(runner.deliver('worker-t2', 'r2', 'mais uma', 'queue')).rejects.toThrow(/dispose|missing|encerrad/iu)
})
