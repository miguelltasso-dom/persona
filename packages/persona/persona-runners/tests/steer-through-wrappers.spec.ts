import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Runtime } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import {
  createOarSessionRunner,
  resetProbeCache,
  type RunEvent,
  type RunHandle,
  type Runner,
  type StartTurnInput,
  type TurnRunner,
} from '../src/index.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'

/**
 * Colheita S1 P0-06: "Direcionar agora" and a message typed while a Task runs must reach the CLI. Both go through `Runner.steer`, and the real runner
 * is `resolveRunner`'s chain of ~15 wrappers: one that forgets `steer` makes it `undefined` in production, so the text vanished (and a queued message
 * opened a SECOND turn on the busy session, closing the first turn's MCP tools). The older live-steer spec drove the bare turn runner, which is why
 * it never saw this. Here the steer goes through the whole chain, and a busy session never gets a concurrent turn.
 */
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

async function steerWhenOpen(runner: Runner, id: string, text: string): Promise<boolean> {
  const deadline = Date.now() + 10_000
  for (;;) {
    if (await runner.steer?.('worker-t1', id, text) === true) return true
    if (Date.now() > deadline) return false
    await delay(10)
  }
}

function fakeRuntime(onTurn: (turn: { steered: readonly string[]; say: (text: string) => void }) => Promise<void>): Runtime {
  const base = scriptedRuntime({ id: 'scripted-steer', turn: onTurn })
  const extended: unknown = Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'bundled' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'opus' }, { id: 'default' }] }),
  })
  return extended as Runtime
}

describe('a steer reaches the CLI through the real chain of wrappers', () => {
  for (const purpose of ['task', 'talk'] as const) {
    it(`resolveRunner (${purpose}): the resolved runner has steer and the open turn reads the person's text`, async () => {
      resetProbeCache()
      const { promise: gate, resolve: release } = Promise.withResolvers<boolean>()
      let turns = 0
      let steered: readonly string[] = []
      const runtime = fakeRuntime(async (turn) => {
        turns += 1
        steered = turn.steered
        await gate
        turn.say(`li: ${turn.steered.join(',')}`)
      })
      const resolved = await resolveRunner({
        spec: { kind: 'cli', cli: 'claude', model: 'opus', ...(purpose === 'task' ? { effort: 'high' } : {}) },
        permissionMode: 'allow-once', runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/steer', purpose,
        pool: createSessionPool<TurnRunner>(), infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' },
      })
      expect(typeof resolved.steer).toBe('function')
      const runner = createOarSessionRunner({ turn: resolved, personaId: 'nina', model: 'opus', permissionMode: 'allow-once' })
      await runner.ensureSession('worker-t1', 'C:/tmp/steer', 'T', 'worker')
      const running = runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')
      expect(await steerWhenOpen(runner, 'steer-1', 'use a cor azul')).toBe(true)
      await until(() => steered.includes('use a cor azul'), 'the CLI read the steer')
      release(true)
      await running
      expect(turns).toBe(1) // it entered the open turn: no second one
      await resolved.dispose?.()
    })
  }

  it('no wrapper of the runners package builds a Runner without passing steer on (the ones that list their methods)', () => {
    const root = join(__dirname, '..', 'src')
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (entry.name.endsWith('.ts')) files.push(path)
      }
    }
    walk(root)
    // A wrapper that lists the Runner methods one by one passes `dispose` on (`inner.dispose!()` / `inner.dispose?.()`); `steer` has to travel with it.
    const disposeOf = /inner\.dispose(?:!\(\)|\?\.\(\))/gu
    const steerOf = /inner\.steer!\(/gu
    const forwardsDispose = files.filter(file => disposeOf.test(readFileSync(file, 'utf8')))
    expect(forwardsDispose.length).toBeGreaterThan(8)
    const missing = forwardsDispose.filter((file) => {
      const text = readFileSync(file, 'utf8')
      return (text.match(steerOf) ?? []).length < (text.match(disposeOf) ?? []).length
    }).map(file => file.slice(root.length + 1))
    expect(missing).toEqual([])
  })
})

const handleOf = (input: StartTurnInput, index: number): RunHandle => ({
  runId: `run-${String(index)}`, sessionId: 'worker-t1', ticketId: input.ticketId, assignmentId: input.assignmentId, personaId: input.personaId, cwd: input.cwd, model: input.model,
})

/** A turn runner WITHOUT steer (an engine that cannot take text into an open turn) whose first turn waits for the test. */
function turnWithoutSteer(): { turn: TurnRunner; starts: StartTurnInput[]; open: () => number; release: () => void } {
  const starts: StartTurnInput[] = []
  let inFlight = 0
  let peak = 0
  const { promise: gate, resolve: release } = Promise.withResolvers<boolean>()
  const turn: TurnRunner = {
    capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: false, mcpTools: 'unavailable', permission: 'explicit' }),
    health: () => Promise.resolve({ ok: true, detail: '' }),
    authenticate: () => Promise.resolve({ ok: true, detail: '' }),
    start: async (input) => { starts.push(input); return handleOf(input, starts.length) },
    startTurn: async input => turn.start(input),
    stream: async function* (input: RunHandle): AsyncGenerator<RunEvent> {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      try {
        yield { type: 'started', at: 'x', handle: input }
        if (input.runId === 'run-1') await gate
        yield { type: 'ended', at: 'x', report: { state: 'ready', summary: 'ok' } }
      } finally {
        inFlight -= 1
      }
    },
    events: input => turn.stream(input),
    cancel: () => Promise.resolve(),
    resume: () => Promise.reject(new Error('not used')),
    usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
  }
  return { turn, starts, open: () => peak, release: () => { release(true) } }
}

describe('a busy session never gets a second, concurrent turn', () => {
  it('a message that cannot be steered waits for the open turn and runs right after it, in order; the open turn is never touched', async () => {
    const { turn, starts, open, release } = turnWithoutSteer()
    const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny' })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    const running = runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')
    await until(() => starts.length === 1, 'the first turn started')
    await runner.deliver('worker-t1', 'msg-2', 'use a cor azul', 'queue') // typed while the Task runs (the host does not await it)
    await runner.deliver('worker-t1', 'msg-3', 'e o título em negrito', 'queue')
    await delay(30)
    expect(starts).toHaveLength(1) // no second turn opened over the first
    expect(open()).toBe(1)
    release()
    await running
    expect(starts.map(start => start.prompt.endsWith('faça o relatório') || start.prompt)).toEqual([true, 'use a cor azul', 'e o título em negrito'])
    expect(open()).toBe(1) // one at a time, always
    expect(runner.status('worker-t1')).toBe('idle')
  })

  it('whenIdle waits for the turn that is really in flight', async () => {
    const { turn, starts, release } = turnWithoutSteer()
    const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny' })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    const running = runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')
    await until(() => starts.length === 1, 'the first turn started')
    let idle = false
    const waiting = runner.whenIdle('worker-t1').then(() => { idle = true })
    await delay(40)
    expect(idle).toBe(false)
    release()
    await waiting
    expect(runner.status('worker-t1')).toBe('idle')
    await running
  })

  it('a turn that fails leaves the session idle and keeps what was queued for the next turn', async () => {
    const starts: StartTurnInput[] = []
    let failFirst = true
    const turn: TurnRunner = {
      capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: false, mcpTools: 'unavailable', permission: 'explicit' }),
      health: () => Promise.resolve({ ok: true, detail: '' }),
      authenticate: () => Promise.resolve({ ok: true, detail: '' }),
      start: async (input) => { starts.push(input); return handleOf(input, starts.length) },
      startTurn: async input => turn.start(input),
      stream: async function* (input: RunHandle): AsyncGenerator<RunEvent> {
        yield { type: 'started', at: 'x', handle: input }
        if (failFirst) { failFirst = false; throw new Error('connection lost') }
        yield { type: 'ended', at: 'x', report: { state: 'ready', summary: 'ok' } }
      },
      events: input => turn.stream(input),
      cancel: () => Promise.resolve(),
      resume: () => Promise.reject(new Error('not used')),
      usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    }
    const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny' })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'T', 'worker')
    await expect(runner.deliver('worker-t1', 'launch-1', 'faça o relatório', 'queue')).rejects.toThrow('connection lost')
    expect(runner.status('worker-t1')).toBe('idle') // not stuck "running": the next message would otherwise wait forever
    await runner.deliver('worker-t1', 'launch-2', 'tente de novo', 'queue')
    expect(starts).toHaveLength(2)
  })
})
