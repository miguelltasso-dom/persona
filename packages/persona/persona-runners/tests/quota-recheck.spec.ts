import { scriptedRuntime } from '@botiverse/oar/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RunEvent, RunHandle, Runner, StartTurnInput } from '../src/contract.ts'
import {
  RunnerResolveError,
  createSessionPool,
  isRunnerResolveError,
  resetProbeCache,
  resolveRunner,
  type TurnRunner,
} from '../src/index.ts'
import { quotaVerdict, withQuotaRecheck } from '../src/resolve/quota-recheck.ts'

const input: StartTurnInput = {
  ticketId: 't1', assignmentId: 'a1', personaId: 'nina', cwd: 'C:/tmp', prompt: 'hi', model: 'haiku', permissionMode: 'deny',
}
// Reset clocks are relative to the REAL clock: the resolveRunner integration test goes through the real Date.now(), and a fixed
// date stops being "in the future" the day the suite runs after it (the pooled runner would then, correctly, not refuse).
const HOUR = 3_600_000
const FIVE_HOUR = new Date(Date.now() + 5 * HOUR).toISOString()
const WEEK = new Date(Date.now() + 7 * 24 * HOUR).toISOString()

const full = (extra: Array<Record<string, unknown>> = []) => ({
  kind: 'available',
  windows: [{ id: '5h', usedPercent: 100, resetsAt: FIVE_HOUR }, ...extra],
})
const roomy = { kind: 'available', windows: [{ id: '5h', usedPercent: 35, resetsAt: FIVE_HOUR }] }

const ended = (state: 'ready' | 'failed' | 'blocked' | 'dropped', summary = 'x'): RunEvent => (
  { type: 'ended', at: '2026-11-04T20:00:00.000Z', report: { state, summary } })

function fakeInner(script: () => AsyncIterable<RunEvent>): Runner & { calls: { start: number; startTurn: number; resume: number } } {
  const calls = { start: 0, startTurn: 0, resume: 0 }
  const handle = (): RunHandle => ({ runId: 'r', sessionId: 's', ticketId: 't1', assignmentId: 'a1', personaId: 'nina', cwd: 'C:/tmp', model: 'haiku' })
  return {
    calls,
    capabilities: () => ({}) as never,
    health: async () => ({ ok: true, detail: 'ok' }),
    authenticate: async () => ({ ok: true, detail: 'ok' }),
    start: async () => { calls.start += 1; return handle() },
    startTurn: async () => { calls.startTurn += 1; return handle() },
    stream: () => script(),
    events: () => script(),
    cancel: async () => undefined,
    resume: async () => { calls.resume += 1; return handle() },
    usage: async () => ({ inputTokens: 0, outputTokens: 0 }) as never,
  }
}

const drain = async (runner: Runner): Promise<RunEvent[]> => {
  const out: RunEvent[] = []
  for await (const event of runner.stream(await runner.start(input))) out.push(event)
  return out
}
const caught = (promise: Promise<unknown>): Promise<unknown> => promise.then(() => undefined, (error: unknown) => error)

describe('quotaVerdict', () => {
  it('says exhausted with the LATEST reset clock among the full windows', () => {
    const verdict = quotaVerdict('claude', full([{ id: 'week', usedPercent: 100, resetsAt: WEEK }]))
    expect(verdict).toEqual({ exhausted: true, resetAt: WEEK })
  })

  it('omits the clock when any full window has none', () => {
    expect(quotaVerdict('claude', full([{ id: 'week', usedPercent: 100 }]))).toEqual({ exhausted: true })
    expect(quotaVerdict('claude', { windows: [{ id: '5h', usedPercent: 100 }] })).toEqual({ exhausted: true })
  })

  it('is not exhausted with room left, an empty read, or nonsense', () => {
    expect(quotaVerdict('claude', roomy)).toEqual({ exhausted: false })
    expect(quotaVerdict('claude', { kind: 'unavailable' })).toEqual({ exhausted: false })
    expect(quotaVerdict('claude', null)).toEqual({ exhausted: false })
    expect(quotaVerdict('claude', 'x')).toEqual({ exhausted: false })
  })

  it('ignores a window that is only nearly full', () => {
    expect(quotaVerdict('claude', { windows: [{ id: '5h', usedPercent: 99.9, resetsAt: FIVE_HOUR }] }).exhausted).toBe(false)
  })
})

describe('withQuotaRecheck', () => {
  it('turns a failed turn into quota_exhausted with the reset clock when the account is full', async () => {
    let reads = 0
    const inner = fakeInner(async function *() { yield ended('failed', 'rate limit') })
    const runner = withQuotaRecheck(inner, { provider: 'claude', reread: async () => { reads += 1; return full() } })
    const error = await caught(drain(runner))
    expect(isRunnerResolveError(error)).toBe(true)
    expect(error).toMatchObject({ code: 'quota_exhausted', resetAt: FIVE_HOUR })
    expect((error as RunnerResolveError).message).toBe('A conta do Claude chegou ao limite.')
    expect(reads).toBe(1)
  })

  it('passes a failed turn through untouched when there is room, the read fails, or it times out', async () => {
    for (const reread of [async () => roomy, async () => { throw new Error('probe timeout') }, async () => ({ kind: 'unavailable' })]) {
      const runner = withQuotaRecheck(fakeInner(async function *() { yield ended('failed', 'boom') }), { provider: 'claude', reread })
      const events = await drain(runner)
      expect(events).toEqual([ended('failed', 'boom')])
    }
  })

  it('does not read the usage for a turn that went well, was dropped, or is only blocked', async () => {
    let reads = 0
    for (const state of ['ready', 'dropped', 'blocked'] as const) {
      const runner = withQuotaRecheck(fakeInner(async function *() { yield ended(state) }), {
        provider: 'claude', reread: async () => { reads += 1; return full() },
      })
      expect(await drain(runner)).toEqual([ended(state)])
    }
    expect(reads).toBe(0)
  })

  it('types an untyped stream error too, and never masks a typed one', async () => {
    const dying = withQuotaRecheck(fakeInner(async function *() { yield ended('ready'); throw new Error('socket hang up') }), {
      provider: 'codex', reread: async () => full(),
    })
    expect(await caught(drain(dying))).toMatchObject({ code: 'quota_exhausted', resetAt: FIVE_HOUR })

    const fine = withQuotaRecheck(fakeInner(async function *() { throw new Error('socket hang up') }), {
      provider: 'codex', reread: async () => roomy,
    })
    expect(await caught(drain(fine))).toMatchObject({ message: 'socket hang up' })

    const typedAlready = new RunnerResolveError('not_logged_in', 'claude')
    let reads = 0
    const login = withQuotaRecheck(fakeInner(async function *() { throw typedAlready }), {
      provider: 'claude', reread: async () => { reads += 1; return full() },
    })
    expect(await caught(drain(login))).toBe(typedAlready)
    expect(reads).toBe(0)
  })

  it('remembers the block: the next turn on the same warm runner is refused before the CLI starts, until the reset', async () => {
    let clock = Date.parse(FIVE_HOUR) - 2 * HOUR
    let reads = 0
    const inner = fakeInner(async function *() { yield ended('failed', 'limit') })
    const runner = withQuotaRecheck(inner, { provider: 'claude', now: () => clock, reread: async () => { reads += 1; return full() } })
    await caught(drain(runner))
    expect(inner.calls.start).toBe(1)

    // Same pooled instance, later turn: refused with the same clock, no CLI start, no new read.
    for (const turn of [() => runner.start(input), () => runner.startTurn(input), () => runner.resume(input)]) {
      expect(await caught(turn())).toMatchObject({ code: 'quota_exhausted', resetAt: FIVE_HOUR })
    }
    expect(inner.calls).toEqual({ start: 1, startTurn: 0, resume: 0 })
    expect(reads).toBe(1)

    // The clock passes: the block lifts and the turn runs.
    clock = Date.parse(FIVE_HOUR) + 1000
    await runner.start(input)
    expect(inner.calls.start).toBe(2)
  })

  it('with no reset clock, trusts the block for a minute and then re-reads before deciding', async () => {
    let clock = 0
    let usage: unknown = { windows: [{ id: '5h', usedPercent: 100 }] }
    let reads = 0
    const inner = fakeInner(async function *() { yield ended('failed', 'limit') })
    const runner = withQuotaRecheck(inner, { provider: 'claude', now: () => clock, rereadEveryMs: 60_000, reread: async () => { reads += 1; return usage } })
    const first = await caught(drain(runner))
    expect(first).toMatchObject({ code: 'quota_exhausted' })
    expect((first as RunnerResolveError).resetAt).toBeUndefined()
    expect(reads).toBe(1)

    clock = 30_000
    expect(await caught(runner.start(input))).toMatchObject({ code: 'quota_exhausted' })
    expect(reads).toBe(1)

    clock = 61_000
    expect(await caught(runner.start(input))).toMatchObject({ code: 'quota_exhausted' })
    expect(reads).toBe(2)
    expect(inner.calls.start).toBe(1)

    usage = roomy
    clock = 125_000
    await runner.start(input)
    expect(inner.calls.start).toBe(2)
  })

  it('prime (no model turn) is not guarded and the runner API passes through', async () => {
    const inner = Object.assign(fakeInner(async function *() { yield ended('failed') }), { prime: async () => ({ runId: 'p' }) as never })
    const runner = withQuotaRecheck(inner, { provider: 'claude', reread: async () => full() })
    await caught(drain(runner))
    await expect(runner.prime!(input)).resolves.toMatchObject({ runId: 'p' })
    expect(await runner.health()).toEqual({ ok: true, detail: 'ok' })
  })
})

describe('resolveRunner wiring (a real turn dies on the limit)', () => {
  beforeEach(() => { resetProbeCache() })

  function limitedRuntime(state: { usage: unknown; turns: number }) {
    const base = scriptedRuntime({
      id: 'fake-cli',
      turn: () => { state.turns += 1; throw new Error('Claude usage limit reached') },
    })
    return Object.assign(base, {
      installation: async () => ({ kind: 'available', via: 'bundled', version: '2.1.317 (fake-persona-e2e)' }),
      authStatus: async () => ({ kind: 'logged_in' }),
      listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }] }),
      accountUsage: async () => state.usage,
    })
  }

  it('raises quota_exhausted with the clock from a turn that failed mid-run, and the pooled runner then refuses at once', async () => {
    const state = { usage: roomy as unknown, turns: 0 }
    const pool = createSessionPool<TurnRunner>()
    const options = {
      spec: { kind: 'cli' as const, cli: 'claude' as const, model: 'haiku' },
      permissionMode: 'deny' as const,
      runtime: limitedRuntime(state),
      personId: 'nina',
      projectId: 'p1',
      cwd: 'C:/tmp/quota',
      pool,
      infra: { wait: async () => undefined },
    }
    const runner = await resolveRunner(options)
    state.usage = full()
    const failure = await caught((async () => {
      for await (const event of runner.stream(await runner.start(input))) void event
    })())
    expect(failure).toMatchObject({ code: 'quota_exhausted', resetAt: FIVE_HOUR })
    expect(state.turns).toBe(1)

    // The pool hands back the same warm runner (it skips the pre-flight); it must still refuse without opening the CLI.
    const again = await resolveRunner(options)
    expect(again).toBe(runner)
    expect(await caught(again.start(input))).toMatchObject({ code: 'quota_exhausted', resetAt: FIVE_HOUR })
    expect(state.turns).toBe(1)
  })

  it('leaves an ordinary failure alone when the account still has room', async () => {
    const state = { usage: roomy as unknown, turns: 0 }
    const runner = await resolveRunner({
      spec: { kind: 'cli' as const, cli: 'claude' as const, model: 'haiku' },
      permissionMode: 'deny' as const,
      runtime: limitedRuntime(state),
      infra: { wait: async () => undefined },
    })
    const events: RunEvent[] = []
    for await (const event of runner.stream(await runner.start(input))) events.push(event)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'failed' } })
  })
})
