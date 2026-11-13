import type { ResolveRunnerOptions, RunEvent, RunHandle, StartTurnInput, TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, it } from 'vitest'
import { ExecutorEngineError, ExecutorRunnerFacade, EXECUTOR_PROJECT, type ExecutorCli } from '../src/computers/executor-runner.ts'

/** D-116 decision B, B's side: the façade the executor calls. Fake resolver and fake runners; nothing here opens a CLI. */
const MIN = 60_000
const input = (over: Partial<StartTurnInput> = {}): StartTurnInput => ({ ticketId: 't1', assignmentId: 'a1', personaId: 'bia', cwd: '/scratch/bia', prompt: 'faça', model: 'haiku', ...over })

interface FakeRun {
  readonly runner: TurnRunner
  readonly calls: string[]
  readonly finish: (handle: RunHandle) => void
  disposed: boolean
}

function makeFakeTurnRunner(
  calls: string[],
  waiting: Map<string, () => void>,
  resolvedIndex: number,
  onDispose: () => void,
): TurnRunner {
  let seq = 0
  const start = (turn: StartTurnInput): Promise<RunHandle> => {
    seq += 1
    calls.push(`start:${turn.prompt}`)
    return Promise.resolve({
      runId: `run-${String(resolvedIndex)}-${String(seq)}`,
      sessionId: 's',
      ticketId: turn.ticketId,
      assignmentId: turn.assignmentId,
      personaId: turn.personaId,
      cwd: turn.cwd,
      model: turn.model,
    })
  }
  const stream = (handle: RunHandle): AsyncIterable<RunEvent> => ({
    async *[Symbol.asyncIterator](): AsyncIterator<RunEvent> {
      await new Promise<void>((resolve) => { waiting.set(handle.runId, resolve) })
      const ended: RunEvent = { type: 'ended', at: 'x', report: { state: 'ready', summary: 'ok' } }
      yield ended
    },
  })
  return {
    capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: false, mcpTools: 'unavailable', permission: 'explicit' }),
    health: () => Promise.resolve({ ok: true, detail: 'ok' }),
    authenticate: () => Promise.resolve({ ok: true, detail: 'ok' }),
    start,
    startTurn: start,
    stream,
    events: stream,
    cancel: (handle: RunHandle) => { calls.push(`cancel:${handle.runId}`); return Promise.resolve() },
    steer: (handle: RunHandle, requestId: string, text: string) => { calls.push(`steer:${handle.runId}:${requestId}:${text}`); return Promise.resolve(true) },
    resume: start,
    usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    dispose: () => { onDispose(); return Promise.resolve() },
  }
}

function rig(engines: readonly ExecutorCli[] = ['claude', 'codex']): {
  readonly facade: ExecutorRunnerFacade
  readonly clock: { ms: number }
  readonly resolved: ResolveRunnerOptions[]
  readonly fakes: FakeRun[]
} {
  const clock = { ms: 0 }
  const resolved: ResolveRunnerOptions[] = []
  const fakes: FakeRun[] = []
  const facade = new ExecutorRunnerFacade({
    now: () => clock.ms,
    engines: () => engines,
    resolve: (options) => {
      resolved.push(options)
      const calls: string[] = []
      const waiting = new Map<string, () => void>()
      const fake: FakeRun = {
        calls,
        finish: (handle) => { waiting.get(handle.runId)?.() },
        disposed: false,
        runner: makeFakeTurnRunner(calls, waiting, resolved.length, () => { fake.disposed = true }),
      }
      fakes.push(fake)
      return Promise.resolve(fake.runner)
    },
  })
  return { facade, clock, resolved, fakes }
}

describe('ExecutorRunnerFacade: the engine and the safety of what B lends', () => {
  it('the engine A asked for is honored when B has it; otherwise B\'s own first engine runs; an API-only hint runs only when B has no CLI; nothing to run = refused', async () => {
    const { facade } = rig(['claude', 'codex'])
    expect(facade.specFor({ kind: 'cli', cli: 'codex' }, input())).toEqual({ kind: 'cli', cli: 'codex', model: 'haiku' })
    expect(facade.specFor({ kind: 'cli', cli: 'cursor' }, input({ effort: 'high' }))).toEqual({ kind: 'cli', cli: 'claude', model: 'haiku', effort: 'high' })
    expect(facade.specFor(undefined, input())).toEqual({ kind: 'cli', cli: 'claude', model: 'haiku' })
    const noCli = rig([])
    expect(noCli.facade.specFor({ kind: 'dsh' }, input({ model: '' }))).toEqual({ kind: 'dsh', model: 'default' })
    expect(noCli.facade.specFor({ kind: 'cli', cli: 'claude' }, input())).toBeUndefined()
    await expect(noCli.facade.startTurn(input(), { kind: 'cli', cli: 'claude' })).rejects.toBeInstanceOf(ExecutorEngineError)
  })

  it('the runner is resolved the way B resolves any persona (its own account), in the scratch folder, WITHOUT native tools, closed by default', async () => {
    const { facade, resolved } = rig()
    await facade.startTurn(input({ permissionMode: 'allow-once' }))
    await facade.startTurn(input({ personaId: 'cai', cwd: '/scratch/cai' }))
    expect(resolved[0]).toMatchObject({ purpose: 'task', toolLevel: 'none', permissionMode: 'allow-once', personId: 'bia', projectId: EXECUTOR_PROJECT, cwd: '/scratch/bia' })
    expect(resolved[1]).toMatchObject({ permissionMode: 'deny', personId: 'cai', cwd: '/scratch/cai' })
  })

  it('health and capabilities say what this computer has', async () => {
    expect(await rig(['claude']).facade.health()).toEqual({ ok: true, detail: 'motores: claude' })
    expect(await rig([]).facade.health()).toMatchObject({ ok: false })
    expect(rig(['codex']).facade.capabilities()).toEqual({ engines: ['codex'], nativeTools: 'none', images: false })
  })
})

describe('ExecutorRunnerFacade: routing of one turn and residency', () => {
  it('stream, cancel and steer go to the runner that started THAT turn; the stream ends at `ended` and the runner is idle again', async () => {
    const { facade, fakes } = rig()
    const handle = await facade.startTurn(input())
    await facade.steer(handle, 'r1', 'mais curto')
    await facade.cancel(handle)
    expect(fakes[0]?.calls).toEqual(['start:faça', `steer:${handle.runId}:r1:mais curto`, `cancel:${handle.runId}`])
    expect(facade.entries()[0]?.busy).toBe(true)
    const seen: string[] = []
    const reading = (async () => { for await (const event of facade.stream(handle)) seen.push(event.type) })()
    fakes[0]?.finish(handle)
    await reading
    expect(seen).toEqual(['ended'])
    expect(facade.entries()[0]?.busy).toBe(false)
    expect(await facade.steer({ ...handle, runId: 'unknown' }, 'r2', 'x')).toBe(false)
  })

  it('one runner per (persona, engine, model, effort) stays warm between turns', async () => {
    const { facade, resolved } = rig()
    await facade.startTurn(input())
    await facade.startTurn(input({ ticketId: 't2' }))
    expect(resolved).toHaveLength(1)
    await facade.startTurn(input({ model: 'opus' }))
    await facade.startTurn(input({ personaId: 'cai' }))
    expect(resolved).toHaveLength(3)
    expect(facade.resident()).toBe(3)
  })

  it('the SAME policy as the host\'s own runners: idle past the TTL is released (and disposed), a runner with a turn open never is, the share per persona holds', async () => {
    const { facade, clock, fakes } = rig()
    const open = await facade.startTurn(input())
    const idle = await facade.startTurn(input({ personaId: 'cai' }))
    const reading = (async () => { for await (const event of facade.stream(idle)) void event })()
    fakes[1]?.finish(idle)
    await reading
    clock.ms += 20 * MIN
    const evicted = facade.sweep()
    expect(evicted.map(item => `${item.key.split(':')[1] ?? ''}:${item.reason}`)).toEqual(['cai:idle'])
    expect(fakes[1]?.disposed).toBe(true)
    expect(fakes[0]?.disposed, 'the turn of bia is still open').toBe(false)
    expect(facade.resident()).toBe(1)
    const reading2 = (async () => { for await (const event of facade.stream(open)) void event })()
    fakes[0]?.finish(open)
    await reading2
    clock.ms += 1000
    await facade.startTurn(input({ model: 'opus' }))
    expect(facade.sweep().map(item => item.reason)).toEqual(['persona-cap'])
  })

  it('the host closing disposes every runner, a turn open or not', async () => {
    const { facade, fakes } = rig()
    await facade.startTurn(input())
    await facade.startTurn(input({ personaId: 'cai' }))
    await facade.disposeAll()
    expect(fakes.map(fake => fake.disposed)).toEqual([true, true])
    expect(facade.resident()).toBe(0)
  })

  it('coalesces concurrent starts on the same key (no leaked runner) and disposes late resolves after disposeAll', async () => {
    let releases: Array<() => void> = []
    let resolveCount = 0
    const disposed: number[] = []
    const facade = new ExecutorRunnerFacade({
      now: () => 500,
      engines: () => ['claude'],
      resolve: () => new Promise((resolve) => {
        const idx = ++resolveCount
        let seq = 0
        const runner: TurnRunner = {
          capabilities: () => ({ kind: 'cli', stream: true, cancel: false, resume: false, usage: false, mcpTools: 'unavailable', permission: 'explicit' }),
          health: () => Promise.resolve({ ok: true, detail: 'ok' }),
          authenticate: () => Promise.resolve({ ok: true, detail: 'ok' }),
          start: (turn: StartTurnInput) => Promise.resolve({ runId: `r-${String(idx)}-${String(++seq)}`, sessionId: 's', ticketId: turn.ticketId, assignmentId: turn.assignmentId, personaId: turn.personaId, cwd: turn.cwd, model: turn.model }),
          startTurn: (turn: StartTurnInput) => Promise.resolve({ runId: `r-${String(idx)}-${String(++seq)}`, sessionId: 's', ticketId: turn.ticketId, assignmentId: turn.assignmentId, personaId: turn.personaId, cwd: turn.cwd, model: turn.model }),
          stream: (): AsyncIterable<RunEvent> => ({ async *[Symbol.asyncIterator](): AsyncIterator<RunEvent> { yield { type: 'ended', at: 'x', report: { state: 'ready', summary: 'ok' } } } }),
          events: (): AsyncIterable<RunEvent> => ({ async *[Symbol.asyncIterator](): AsyncIterator<RunEvent> { yield { type: 'ended', at: 'x', report: { state: 'ready', summary: 'ok' } } } }),
          cancel: () => Promise.resolve(),
          resume: (turn: StartTurnInput) => Promise.resolve({ runId: `r-${String(idx)}`, sessionId: 's', ticketId: turn.ticketId, assignmentId: turn.assignmentId, personaId: turn.personaId, cwd: turn.cwd, model: turn.model }),
          usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
          dispose: () => { disposed.push(idx); return Promise.resolve() },
        }
        releases.push(() => { resolve(runner) })
      }),
    })

    const p1 = facade.startTurn(input())
    const p2 = facade.startTurn(input({ ticketId: 't2' }))
    expect(releases).toHaveLength(1)
    releases[0]?.()
    await Promise.all([p1, p2])
    expect(resolveCount).toBe(1)
    expect(facade.resident()).toBe(1)
    expect(facade.busy()).toBe(1)
    expect(facade.warmClis()).toEqual([{ id: 'remote:bia:task:claude:haiku:', idleSince: 500 }])

    releases = []
    const p3 = facade.startTurn(input({ personaId: 'cai' }))
    const closing = facade.disposeAll()
    releases[0]?.()
    await closing
    await expect(p3).rejects.toThrow(/disposed/u)
    expect(disposed).toEqual([1, 2])
    expect(facade.resident()).toBe(0)
  })
})
