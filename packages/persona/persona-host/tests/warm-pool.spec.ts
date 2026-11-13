import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it } from 'vitest'
import { WarmPool, warmSweepBootLine, warmSweepEnabled } from '../src/warm-pool.ts'
import { DEFAULT_WARM_LIMITS, parseWarmKey, planWarmEviction, warmCapForRam, type WarmEntry, type WarmLimits } from '../src/warm-pool-policy.ts'

/** M4 / 24 h: the resident runners go back to the ceiling at rest. Fake clock, fake runners; nothing here opens a process. */
const MIN = 60_000
const entry = (key: string, lastUsedAt: number, busy = false): WarmEntry => {
  const parts = parseWarmKey(key)
  if (parts === undefined) throw new Error(`bad key ${key}`)
  return { key, ...parts, lastUsedAt, busy }
}

describe('warm policy: what a host may let go of', () => {
  it('an idle runner past the TTL goes; a working one never does, however long it has been at it', () => {
    const plan = planWarmEviction([entry('p:a:talk', 0), entry('p:b:task', 0, true), entry('p:c:talk', 20 * MIN)], 20 * MIN)
    expect(plan).toEqual([{ key: 'p:a:talk', reason: 'idle' }])
  })

  it('a persona keeps 1 conversation and 1 Task runner: the oldest IDLE ones past that go, the newest stays, other personas are untouched', () => {
    const now = 10 * MIN
    const plan = planWarmEviction([
      entry('p:a:talk', 1 * MIN), entry('p:a:talk:t:x', 5 * MIN), entry('p:a:talk:t:y', 9 * MIN),
      entry('p:a:task', 2 * MIN), entry('p:a:task:files', 8 * MIN),
      entry('p:b:talk', 1 * MIN),
    ], now)
    expect(plan.map(item => item.key).sort()).toEqual(['p:a:talk', 'p:a:talk:t:x', 'p:a:task'].sort())
    expect(plan.every(item => item.reason === 'persona-cap')).toBe(true)
  })

  it('an answer-only (triage) runner is its own class: it never pushes the conversation of the same persona out (and 2 lanes stay)', () => {
    const plan = planWarmEviction([
      entry('p:a:talk', 1 * MIN), entry('p:a:talk:answer-only', 2 * MIN), entry('p:a:talk:lane1:answer-only', 3 * MIN), entry('p:a:talk:lane2:answer-only', 4 * MIN),
    ], 5 * MIN)
    expect(parseWarmKey('p:a:talk:answer-only')?.kind).toBe('answer')
    expect(plan).toEqual([{ key: 'p:a:talk:answer-only', reason: 'persona-cap' }])
  })

  it('a working runner counts toward the share but is never the one evicted (the idle one beside it goes)', () => {
    const plan = planWarmEviction([entry('p:a:task', 9 * MIN, true), entry('p:a:task:files', 8 * MIN)], 10 * MIN)
    expect(plan).toEqual([{ key: 'p:a:task:files', reason: 'persona-cap' }])
  })

  it('the host ceiling: past it the oldest idle go, the working never', () => {
    const entries = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => entry(`p:${id}:talk`, index * MIN, id === 'a'))
    const plan = planWarmEviction(entries, 7 * MIN, { ...DEFAULT_WARM_LIMITS, globalCap: 3 })
    expect(plan).toEqual([{ key: 'p:b:talk', reason: 'global-cap' }, { key: 'p:c:talk', reason: 'global-cap' }, { key: 'p:d:talk', reason: 'global-cap' }])
  })

  it('a key it cannot read is left alone, and the cap follows the RAM (3 to 8)', () => {
    expect(parseWarmKey('weird')).toBeUndefined()
    const gb = 1024 ** 3
    expect([2 * gb, 8 * gb, 16 * gb, 64 * gb].map(warmCapForRam)).toEqual([3, 4, 8, 8])
  })
})

/** A runner that only reports events (the pool follows nothing else). */
function fakeRunner(): { readonly runner: Runner; readonly emit: (type: 'running' | 'idle' | 'error') => void } {
  const listeners: Array<(event: { type: string }) => void> = []
  const runner = { onEvent: (listener: (event: { type: string }) => void) => { listeners.push(listener); return () => undefined } } as unknown as Runner
  return { runner, emit: (type) => { for (const listener of listeners) listener({ type }) } }
}

function bed(limits: Partial<WarmLimits> = {}): {
  readonly pool: WarmPool
  readonly clock: { ms: number }
  readonly runners: Map<string, ReturnType<typeof fakeRunner>>
  readonly dropped: string[]
  readonly open: (key: string) => ReturnType<typeof fakeRunner>
} {
  const clock = { ms: 0 }
  const runners = new Map<string, ReturnType<typeof fakeRunner>>()
  const dropped: string[] = []
  const pool = new WarmPool({
    list: () => [...runners].map(([key, fake]) => [key, fake.runner] as const),
    drop: (key) => { dropped.push(key); runners.delete(key) },
    now: () => clock.ms,
    limits: () => limits,
  })
  const open = (key: string): ReturnType<typeof fakeRunner> => {
    const fake = fakeRunner()
    runners.set(key, fake)
    pool.track(fake.runner)
    return fake
  }
  return { pool, clock, runners, dropped, open }
}

describe('the safety key', () => {
  it('PERSONA_WARM_SWEEP=0 turns the idle sweep off (the runners stay resident as before) and the boot line says which it is', () => {
    expect(warmSweepEnabled({})).toBe(true)
    expect(warmSweepEnabled({ PERSONA_WARM_SWEEP: '1' })).toBe(true)
    expect(warmSweepEnabled({ PERSONA_WARM_SWEEP: '0' })).toBe(false)
    expect(warmSweepBootLine({})).toContain('warmSweep on')
    expect(warmSweepBootLine({ PERSONA_WARM_SWEEP: '0' })).toContain('warmSweep off')
  })
})

describe('WarmPool: the sweep, the claim and the station door', () => {
  it('AFTER N REQUESTS THE RESIDENTS COME BACK TO THE CEILING AT REST: 20 runners over 10 personas, all idle', () => {
    const { pool, clock, runners, open } = bed({ globalCap: 8 })
    for (let persona = 0; persona < 10; persona += 1) {
      for (const purpose of ['talk', 'task']) {
        const fake = open(`p:persona${String(persona)}:${purpose}`)
        fake.emit('running')
        clock.ms += 1000
        fake.emit('idle')
      }
    }
    expect(pool.resident()).toBe(20)
    clock.ms += 2 * 60_000 // two minutes of rest: inside the TTL, so only the ceiling acts
    pool.sweep()
    expect(runners.size, 'the ceiling of the host').toBeLessThanOrEqual(8)
    clock.ms += 16 * MIN // a quarter of an hour more: nobody asked again
    pool.sweep()
    expect(runners.size, 'at rest nothing stays resident').toBe(0)
  })

  it('a runner just handed to a turn is safe until the turn reports (the claim), and is a normal idle one after', () => {
    const { pool, clock, runners, open } = bed({ idleTtlMs: 10 * MIN, talkPerPersona: 1 })
    const old = open('p:a:talk')
    open('p:a:talk:t:x') // a second conversation of the same persona: past the share
    clock.ms += 5 * MIN
    old.emit('idle')
    pool.touch(old.runner) // handed out again, the 'running' event has not come yet
    clock.ms += 30_000
    pool.sweep()
    expect(runners.has('p:a:talk'), 'the claimed one stays').toBe(true)
    expect(runners.has('p:a:talk:t:x'), 'the older one of the persona goes').toBe(false)
    old.emit('running')
    clock.ms += 30 * MIN
    pool.sweep()
    expect(runners.has('p:a:talk'), 'still working: never evicted').toBe(true)
    old.emit('idle')
    clock.ms += 11 * MIN
    pool.sweep()
    expect(runners.has('p:a:talk'), 'idle past the TTL').toBe(false)
  })

  it('the station asks for room: idle ones close (the ones it names), a working one never does', () => {
    const { pool, clock, runners, dropped, open } = bed()
    const working = open('p:a:talk')
    working.emit('running')
    const idleOne = open('p:b:talk')
    idleOne.emit('idle')
    clock.ms += 2 * MIN
    expect(pool.evictIdle(['p:a:talk', 'p:b:talk', 'p:nobody:talk'])).toEqual(['p:b:talk'])
    expect(dropped).toEqual(['p:b:talk'])
    expect([...runners.keys()]).toEqual(['p:a:talk'])
    expect(pool.warmClis()).toEqual([{ id: 'p:a:talk', idleSince: clock.ms }]) // a working one counts as "now"
  })

  it('the timer is unref\'d and stoppable; a sweep it runs evicts through the same door', () => {
    const calls: Array<{ run: () => void; ms: number }> = []
    const cancelled: unknown[] = []
    const clock = { ms: 0 }
    const runners = new Map<string, ReturnType<typeof fakeRunner>>()
    const pool = new WarmPool({
      list: () => [...runners].map(([key, fake]) => [key, fake.runner] as const),
      drop: (key) => { runners.delete(key) }, now: () => clock.ms,
      schedule: (run, ms) => { calls.push({ run, ms }); return 'handle' }, cancel: (handle) => { cancelled.push(handle) },
    })
    const fake = fakeRunner()
    runners.set('p:a:talk', fake)
    pool.track(fake.runner)
    pool.start(1234)
    pool.start(1234) // idempotent
    expect(calls.map(call => call.ms)).toEqual([1234])
    clock.ms = 16 * MIN
    calls[0]?.run()
    expect(runners.size).toBe(0)
    pool.stop()
    expect(cancelled).toEqual(['handle'])
  })
})
