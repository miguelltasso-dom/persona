/**
 * D-103b: at most 2 simultaneous calls per subscription account, and a 400-800 ms jitter on the calls of a fan-out (a call that finds the account busy or waits
 * for a slot): the team's burst must not look like a robot to the vendor and must not burn the account's rate window in one second.
 * Pure policy (a counter, a FIFO queue, an injected clock/random) + a wrapper that holds the slot from the start of a turn to its end. No session, no OAR.
 */
import { scriptedRuntime } from '@botiverse/oar/testing'
import type { Runtime } from '@botiverse/oar'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventTime, type RunEvent, type RunHandle, type Runner, type StartTurnInput } from '../src/contract.ts'
import { disposeRunnerSessions, resolveRunner, type DshAgentPort } from '../src/index.ts'
import {
  ACCOUNT_MAX_CONCURRENT,
  AccountLimiter,
  FANOUT_JITTER_MAX_MS,
  FANOUT_JITTER_MIN_MS,
  accountKeyOf,
  withAccountLimit,
} from '../src/resolve/account-limit.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'

afterEach(async () => {
  await disposeRunnerSessions()
})

const flush = async (): Promise<void> => { await new Promise<void>((resolve) => { setImmediate(resolve) }) }

/** A sleep the test drives by hand: every call is recorded and stays pending until `release`. */
function manualSleep(): { sleep: (ms: number, signal?: AbortSignal) => Promise<void>; asked: number[]; release: () => void; releaseAll: () => void } {
  const pending: (() => void)[] = []
  const asked: number[] = []
  return {
    asked,
    sleep: async (ms, signal) => {
      asked.push(ms)
      await new Promise<void>((resolve, reject) => {
        pending.push(resolve)
        signal?.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      })
    },
    release: () => { pending.shift()?.() },
    releaseAll: () => { while (pending.length > 0) pending.shift()?.() },
  }
}

describe('the numbers of the decision', () => {
  it('2 simultaneous calls per account, jitter 400-800 ms', () => {
    expect(ACCOUNT_MAX_CONCURRENT).toBe(2)
    expect(FANOUT_JITTER_MIN_MS).toBe(400)
    expect(FANOUT_JITTER_MAX_MS).toBe(800)
  })

  it('the account key is provider + account (the one account of a person without an id is "default")', () => {
    expect(accountKeyOf('claude', 'acc-1')).toBe('claude:acc-1')
    expect(accountKeyOf('claude')).toBe('claude:default')
    expect(accountKeyOf('codex', undefined)).toBe('codex:default')
    expect(accountKeyOf('claude', 'acc-1')).not.toBe(accountKeyOf('codex', 'acc-1'))
  })
})

describe('AccountLimiter: the semaphore', () => {
  it('a call on an idle account starts at once, with NO jitter (a lone call is not a fan-out)', async () => {
    const clock = manualSleep()
    const limiter = new AccountLimiter({ sleep: clock.sleep })
    const lease = await limiter.acquire('claude:a')
    expect(clock.asked).toEqual([])
    expect(limiter.snapshot('claude:a')).toEqual({ active: 1, waiting: 0 })
    lease.release()
    expect(limiter.snapshot('claude:a')).toEqual({ active: 0, waiting: 0 })
  })

  it('the second call of a burst waits a jitter inside 400-800 ms before it starts; the slot is already its own', async () => {
    const clock = manualSleep()
    const limiter = new AccountLimiter({ sleep: clock.sleep, random: () => 0 })
    await limiter.acquire('claude:a')
    let started = false
    const second = limiter.acquire('claude:a').then((lease) => { started = true; return lease })
    await flush()
    expect(clock.asked).toEqual([400])
    expect(started).toBe(false)
    expect(limiter.snapshot('claude:a')).toEqual({ active: 2, waiting: 0 })
    clock.release()
    await second
    expect(started).toBe(true)
  })

  it('the jitter spans the whole range: random 0 -> 400, random just under 1 -> 800, and always an integer in between', async () => {
    const seen = new Set<number>()
    for (const random of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const clock = manualSleep()
      const limiter = new AccountLimiter({ sleep: clock.sleep, random: () => random })
      await limiter.acquire('k')
      void limiter.acquire('k')
      await flush()
      clock.releaseAll()
      for (const ms of clock.asked) { seen.add(ms); expect(Number.isInteger(ms)).toBe(true); expect(ms).toBeGreaterThanOrEqual(400); expect(ms).toBeLessThanOrEqual(800) }
    }
    expect([...seen].sort((a, b) => a - b)[0]).toBe(400)
    expect([...seen].sort((a, b) => a - b).at(-1)).toBe(800)
  })

  it('a third call WAITS for a slot (never more than 2 at once), then starts after its own jitter, in arrival order', async () => {
    const clock = manualSleep()
    const limiter = new AccountLimiter({ sleep: clock.sleep, random: () => 0.5 })
    const first = await limiter.acquire('k')
    const secondPromise = limiter.acquire('k')
    await flush(); clock.release()
    await secondPromise
    const order: string[] = []
    const thirdPromise = limiter.acquire('k').then((lease) => { order.push('third'); return lease })
    const fourthPromise = limiter.acquire('k').then((lease) => { order.push('fourth'); return lease })
    await flush()
    expect(limiter.snapshot('k')).toEqual({ active: 2, waiting: 2 })
    expect(order).toEqual([])
    first.release()
    await flush()
    // the freed slot went to the THIRD call; it still serves its jitter before it starts
    expect(limiter.snapshot('k')).toEqual({ active: 2, waiting: 1 })
    expect(clock.asked.length).toBe(2)
    clock.release()
    const third = await thirdPromise
    expect(order).toEqual(['third'])
    third.release()
    await flush(); clock.release()
    await fourthPromise
    expect(order).toEqual(['third', 'fourth'])
  })

  it('accounts do not block each other: another account of the same provider and another provider run in parallel', async () => {
    const clock = manualSleep()
    const limiter = new AccountLimiter({ sleep: clock.sleep })
    await limiter.acquire('claude:a'); void limiter.acquire('claude:a'); void limiter.acquire('claude:a')
    await flush()
    await limiter.acquire('claude:b')
    await limiter.acquire('codex:a')
    expect(clock.asked.length).toBe(1) // only the 2nd call of claude:a is jittered (the 3rd is queued behind it)
    expect(limiter.snapshot('claude:b')).toEqual({ active: 1, waiting: 0 })
    expect(limiter.snapshot('codex:a')).toEqual({ active: 1, waiting: 0 })
  })

  it('release is idempotent: a second release does not free a second slot', async () => {
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    const a = await limiter.acquire('k')
    await limiter.acquire('k')
    a.release(); a.release(); a.release()
    expect(limiter.snapshot('k')).toEqual({ active: 1, waiting: 0 })
  })

  it('a call abandoned while it waits for a slot leaves the queue and rejects; it never takes a slot', async () => {
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    const a = await limiter.acquire('k')
    await limiter.acquire('k')
    const controller = new AbortController()
    const waiting = limiter.acquire('k', { signal: controller.signal })
    await flush()
    expect(limiter.snapshot('k').waiting).toBe(1)
    controller.abort()
    await expect(waiting).rejects.toThrow()
    expect(limiter.snapshot('k')).toEqual({ active: 2, waiting: 0 })
    a.release()
    expect(limiter.snapshot('k')).toEqual({ active: 1, waiting: 0 })
  })

  it('a call abandoned during its jitter gives its slot back', async () => {
    const clock = manualSleep()
    const limiter = new AccountLimiter({ sleep: clock.sleep })
    await limiter.acquire('k')
    const controller = new AbortController()
    const second = limiter.acquire('k', { signal: controller.signal })
    await flush()
    expect(limiter.snapshot('k').active).toBe(2)
    controller.abort()
    await expect(second).rejects.toThrow()
    expect(limiter.snapshot('k')).toEqual({ active: 1, waiting: 0 })
  })

  it('an already-aborted signal never takes a slot', async () => {
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    const controller = new AbortController()
    controller.abort()
    await expect(limiter.acquire('k', { signal: controller.signal })).rejects.toThrow()
    expect(limiter.snapshot('k')).toEqual({ active: 0, waiting: 0 })
  })

  it('stress: 12 calls at once on one account never run more than 2 at a time, and all of them finish', async () => {
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    let running = 0
    let peak = 0
    let done = 0
    await Promise.all(Array.from({ length: 12 }, async () => {
      const lease = await limiter.acquire('k')
      running += 1
      peak = Math.max(peak, running)
      await flush()
      running -= 1
      done += 1
      lease.release()
    }))
    expect(peak).toBe(2)
    expect(done).toBe(12)
    expect(limiter.snapshot('k')).toEqual({ active: 0, waiting: 0 })
  })

  it('a custom ceiling is honoured (and never below 1)', async () => {
    const limiter = new AccountLimiter({ max: 1, sleep: async () => undefined })
    await limiter.acquire('k')
    void limiter.acquire('k')
    await flush()
    expect(limiter.snapshot('k')).toEqual({ active: 1, waiting: 1 })
    const floor = new AccountLimiter({ max: 0, sleep: async () => undefined })
    await floor.acquire('k')
    expect(floor.snapshot('k').active).toBe(1)
  })

  describe('a lease nobody gives back cannot starve the account for ever', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('the lease frees itself after the hold limit', async () => {
      const limiter = new AccountLimiter({ sleep: async () => undefined, holdLimitMs: 60_000 })
      await limiter.acquire('k')
      await limiter.acquire('k')
      expect(limiter.snapshot('k').active).toBe(2)
      await vi.advanceTimersByTimeAsync(60_001)
      expect(limiter.snapshot('k')).toEqual({ active: 0, waiting: 0 })
    })

    it('a lease given back in time cancels its timer (nothing left to free later)', async () => {
      const limiter = new AccountLimiter({ sleep: async () => undefined, holdLimitMs: 60_000 })
      const a = await limiter.acquire('k')
      a.release()
      const b = await limiter.acquire('k')
      await vi.advanceTimersByTimeAsync(60_001)
      expect(limiter.snapshot('k').active).toBe(0)
      b.release()
      expect(limiter.snapshot('k').active).toBe(0)
    })
  })
})

const handleFor = (id: string): RunHandle => ({ runId: id, sessionId: `s-${id}`, ticketId: 't', assignmentId: id, personaId: 'nina', cwd: 'C:/tmp/l', model: 'haiku' })
const turnInput = (id: string): StartTurnInput => ({ ticketId: 't', assignmentId: id, personaId: 'nina', cwd: 'C:/tmp/l', prompt: 'oi', model: 'haiku', permissionMode: 'deny' })
const ended = (): RunEvent => ({ type: 'ended', at: eventTime(), report: { state: 'ready', summary: 'turn ended' } })

/** A runner whose turns stay open until the test finishes them. */
function controllable(): { runner: Runner; started: string[]; finish: (id: string) => void; cancelled: string[]; disposed: () => boolean; failStart: (on: boolean) => void } {
  const started: string[] = []
  const cancelled: string[] = []
  const gates = new Map<string, () => void>()
  let disposed = false
  let failing = false
  const open = async (input: StartTurnInput): Promise<RunHandle> => {
    if (failing) throw new Error('boom')
    started.push(input.assignmentId)
    return handleFor(input.assignmentId)
  }
  const play = async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    await new Promise<void>((resolve) => { gates.set(handle.runId, resolve) })
    yield ended()
  }
  const runner: Runner = {
    capabilities: () => ({ resume: true, usage: true, permission: 'explicit', mcpTools: 'available' }) as never,
    health: async () => ({ ok: true, detail: 'ok' }),
    authenticate: async () => ({ ok: true, detail: 'ok' }),
    start: open,
    startTurn: open,
    stream: play,
    events: play,
    cancel: async (handle) => { cancelled.push(handle.runId); gates.get(handle.runId)?.() },
    resume: open,
    usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
    prime: async input => handleFor(`prime-${input.assignmentId}`),
    dispose: async () => { disposed = true },
  }
  return { runner, started, cancelled, finish: (id) => { gates.get(id)?.() }, disposed: () => disposed, failStart: (on) => { failing = on } }
}

async function drain(runner: Runner, handle: RunHandle): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of runner.stream(handle)) out.push(event)
  return out
}

describe('withAccountLimit: the slot is held from the start of a turn to its end', () => {
  it('a burst of 4 turns on one account runs 2 at a time; the next one starts when a turn ENDS', async () => {
    const fake = controllable()
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    const runner = withAccountLimit(fake.runner, limiter, 'claude:a')
    const handles = new Map<string, RunHandle>()
    const opening = ['a', 'b', 'c', 'd'].map(async (id) => { handles.set(id, await runner.startTurn(turnInput(id))) })
    await flush()
    expect(fake.started).toEqual(['a', 'b'])
    const streams = ['a', 'b'].map(async id => drain(runner, handles.get(id)!))
    fake.finish('a')
    await flush()
    expect(fake.started).toEqual(['a', 'b', 'c'])
    fake.finish('b')
    await flush()
    expect(fake.started).toEqual(['a', 'b', 'c', 'd'])
    for (const id of ['c', 'd']) { const handle = handles.get(id); if (handle !== undefined) { const stream = drain(runner, handle); fake.finish(id); await stream } }
    await Promise.all([...opening, ...streams])
    expect(limiter.snapshot('claude:a')).toEqual({ active: 0, waiting: 0 })
  })

  it('the slot is freed BEFORE the ended event reaches the consumer (the next turn can start as the previous one reports)', async () => {
    const fake = controllable()
    const limiter = new AccountLimiter({ sleep: async () => undefined, max: 1 })
    const runner = withAccountLimit(fake.runner, limiter, 'k')
    const first = await runner.startTurn(turnInput('a'))
    const second = runner.startTurn(turnInput('b'))
    expect(limiter.snapshot('k')).toEqual({ active: 1, waiting: 1 })
    const seen: string[] = []
    const stream = (async () => { for await (const event of runner.stream(first)) { seen.push(event.type); if (event.type === 'ended') expect(limiter.snapshot('k')).toEqual({ active: 1, waiting: 0 }) } })()
    fake.finish('a')
    await stream
    await second
    expect(seen).toEqual(['ended'])
  })

  it('cancel gives the slot back', async () => {
    const fake = controllable()
    const limiter = new AccountLimiter({ sleep: async () => undefined, max: 1 })
    const runner = withAccountLimit(fake.runner, limiter, 'k')
    const handle = await runner.startTurn(turnInput('a'))
    expect(limiter.snapshot('k').active).toBe(1)
    await runner.cancel(handle)
    expect(fake.cancelled).toEqual(['a'])
    expect(limiter.snapshot('k').active).toBe(0)
  })

  it('a consumer that stops reading early (break) gives the slot back', async () => {
    const fake = controllable()
    const limiter = new AccountLimiter({ sleep: async () => undefined, max: 1 })
    const runner = withAccountLimit(fake.runner, limiter, 'k')
    const handle = await runner.startTurn(turnInput('a'))
    const loop = (async () => { for await (const event of runner.stream(handle)) { if (event.type === 'ended') break } })()
    fake.finish('a')
    await loop
    expect(limiter.snapshot('k').active).toBe(0)
  })

  it('a start that throws gives the slot back and rethrows', async () => {
    const fake = controllable()
    const limiter = new AccountLimiter({ sleep: async () => undefined, max: 1 })
    const runner = withAccountLimit(fake.runner, limiter, 'k')
    fake.failStart(true)
    await expect(runner.startTurn(turnInput('a'))).rejects.toThrow('boom')
    await expect(runner.start(turnInput('a'))).rejects.toThrow('boom')
    await expect(runner.resume(turnInput('a'))).rejects.toThrow('boom')
    expect(limiter.snapshot('k')).toEqual({ active: 0, waiting: 0 })
  })

  it('dispose gives back every slot still held, then disposes the inner runner', async () => {
    const fake = controllable()
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    const runner = withAccountLimit(fake.runner, limiter, 'k')
    await runner.startTurn(turnInput('a'))
    await runner.startTurn(turnInput('b'))
    expect(limiter.snapshot('k').active).toBe(2)
    await runner.dispose?.()
    expect(fake.disposed()).toBe(true)
    expect(limiter.snapshot('k').active).toBe(0)
  })

  it('start, startTurn and resume are all counted; prime (a session opened with no model call) is not', async () => {
    const fake = controllable()
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    const runner = withAccountLimit(fake.runner, limiter, 'k')
    await runner.start(turnInput('a'))
    await runner.resume(turnInput('b'))
    expect(limiter.snapshot('k').active).toBe(2)
    await runner.prime?.(turnInput('p'))
    expect(limiter.snapshot('k').active).toBe(2)
  })

  it('two runners of the SAME account share the ceiling; runners of two accounts do not', async () => {
    const one = controllable()
    const two = controllable()
    const other = controllable()
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    const a = withAccountLimit(one.runner, limiter, 'claude:acc-1')
    const b = withAccountLimit(two.runner, limiter, 'claude:acc-1')
    const c = withAccountLimit(other.runner, limiter, 'claude:acc-2')
    await a.startTurn(turnInput('a1'))
    await a.startTurn(turnInput('a2'))
    let third = false
    void b.startTurn(turnInput('b1')).then(() => { third = true })
    await c.startTurn(turnInput('c1'))
    await flush()
    expect(third).toBe(false)
    expect(other.started).toEqual(['c1'])
  })

  it('passes everything else through untouched', async () => {
    const fake = controllable()
    const runner = withAccountLimit(fake.runner, new AccountLimiter({ sleep: async () => undefined }), 'k')
    expect(runner.capabilities()).toEqual(fake.runner.capabilities())
    expect(await runner.usage()).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(await runner.health()).toEqual({ ok: true, detail: 'ok' })
  })
})

describe('wired through resolveRunner', () => {
  function runtime(): Runtime {
    const base = scriptedRuntime({ id: 'fake-cli', turn: async (turn) => { turn.say('ok') } })
    return Object.assign(base, {
      installation: async () => ({ kind: 'available', via: 'bundled' }),
      authStatus: async () => ({ kind: 'logged_in' }),
      listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }] }),
    }) as unknown as Runtime
  }
  const spying = (): { limiter: AccountLimiter; keys: string[] } => {
    const keys: string[] = []
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    const original = limiter.acquire.bind(limiter)
    limiter.acquire = async (key, options) => { keys.push(key); return original(key, options) }
    return { limiter, keys }
  }

  it('a CLI turn takes a slot of its provider:account and the turn runs through to the end', async () => {
    const { limiter, keys } = spying()
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'codex', model: 'haiku' }, permissionMode: 'deny', runtime: runtime(), personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/l', accountId: 'acc-7',
      pool: createSessionPool<Runner>(), infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' }, accountLimiter: limiter,
    })
    const handle = await runner.start(turnInput('a'))
    const events = await drain(runner, handle)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
    expect(keys).toEqual(['codex:acc-7'])
    expect(limiter.snapshot('codex:acc-7')).toEqual({ active: 0, waiting: 0 })
    await runner.dispose?.()
  })

  it('without an account id the key is provider:default; a DSH (API key) call is not limited at all', async () => {
    const { limiter, keys } = spying()
    const cli = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'deny', runtime: runtime(), personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/l',
      pool: createSessionPool<Runner>(), infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' }, accountLimiter: limiter,
    })
    await drain(cli, await cli.start(turnInput('a')))
    await cli.dispose?.()
    expect(keys).toEqual(['claude:default'])
    const agent: DshAgentPort = {
      start: async () => ({ sessionId: 's1', events: (async function *() { yield { type: 'ended' as const, text: 'ok' } })() }),
      resume: async () => ({ sessionId: 's1', events: (async function *() { yield { type: 'ended' as const, text: 'ok' } })() }),
      cancel: async () => undefined,
      usage: async () => ({ inputTokens: 1, outputTokens: 1 }),
    }
    const dsh = await resolveRunner({ spec: { kind: 'dsh', model: 'deepseek-chat' }, permissionMode: 'deny', agent, accountLimiter: limiter, infra: { wait: async () => undefined } })
    await drain(dsh, await dsh.start(turnInput('b')))
    expect(keys).toEqual(['claude:default'])
  })

  it('3 turns at once on one account never run more than 2, and every slot comes back', async () => {
    const limiter = new AccountLimiter({ sleep: async () => undefined })
    const make = async (): Promise<Runner> => resolveRunner({
      spec: { kind: 'cli', cli: 'codex', model: 'haiku' }, permissionMode: 'deny', runtime: runtime(), personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/l', accountId: 'acc-9',
      infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' }, accountLimiter: limiter,
    })
    const runners = await Promise.all([make(), make(), make()])
    let peak = 0
    await Promise.all(runners.map(async (runner, index) => {
      const handle = await runner.start(turnInput(`t${String(index)}`))
      peak = Math.max(peak, limiter.snapshot('codex:acc-9').active)
      await drain(runner, handle)
    }))
    expect(peak).toBeLessThanOrEqual(2)
    expect(limiter.snapshot('codex:acc-9')).toEqual({ active: 0, waiting: 0 })
    await Promise.all(runners.map(async runner => runner.dispose?.()))
  })
})
