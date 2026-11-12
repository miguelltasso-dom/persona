import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHostLink, HostLinkFailed, HostLinkQueueFull, type Delivery, type HostLinkState } from '../src/client/boot/late-transport.ts'

/**
 * boot-estatico (persona-spec/contracts/boot-estatico.md), the late transport of the static shell: the state machine on a fake clock. No DOM, no Electron, no network: the carrier is a fake `send`.
 */
class Refused extends Error {}
class Fault extends Error {}
const classify = (error: unknown): Delivery => {
  if (error instanceof Refused) return 'not-delivered'
  if (error instanceof Fault) return 'delivered'
  return 'unknown'
}
const settle = async (ms = 0): Promise<void> => { await vi.advanceTimersByTimeAsync(ms) }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('createHostLink (boot-estatico)', () => {
  it('calls made while the host is waking wait, and leave in order at ready, four at a time, each sent ONCE', async () => {
    const started: number[] = []
    const gates: (() => void)[] = []
    let active = 0
    let peak = 0
    const send = (n: number): Promise<string> => new Promise((resolve) => {
      started.push(n)
      active += 1
      peak = Math.max(peak, active)
      gates.push(() => { active -= 1; resolve(`r${String(n)}`) })
    })
    const link = createHostLink<number, string>({ send, random: () => 0.5 })
    const results = [1, 2, 3, 4, 5, 6].map(n => link.call(n))
    await settle()
    expect(started).toEqual([]) // nothing reaches a host that has not answered
    link.markReady()
    expect(started).toEqual([1, 2, 3, 4]) // in order, the concurrency of the drain
    gates[0]?.()
    await settle()
    expect(started).toEqual([1, 2, 3, 4, 5])
    gates[1]?.()
    await settle()
    expect(started).toEqual([1, 2, 3, 4, 5, 6])
    for (const release of gates) release()
    expect(await Promise.all(results)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'])
    expect(peak).toBe(4)
    expect(started).toHaveLength(6) // never twice
  })

  it('tells its subscribers the three states, and a call made after ready goes straight out', async () => {
    const send = vi.fn((n: number) => Promise.resolve(n * 2))
    const link = createHostLink<number, number>({ send })
    const seen: HostLinkState[] = []
    const stop = link.subscribe((state) => { seen.push(state) })
    expect(link.state()).toBe('waking')
    link.markReady()
    expect(await link.call(21)).toBe(42)
    link.markFailed('o host saiu')
    link.retry()
    stop()
    link.markReady()
    expect(seen).toEqual(['ready', 'failed', 'waking'])
  })

  it('plan B: with no ready push, the probe is asked after 1 s and then at 250 → 500 → 1000 ms, and its answer makes the link ready', async () => {
    const answers: HostLinkState[] = ['waking', 'waking', 'ready']
    const probe = vi.fn(() => Promise.resolve(answers.shift() ?? 'ready'))
    const link = createHostLink<number, number>({ send: n => Promise.resolve(n), probe })
    await settle(999)
    expect(probe).not.toHaveBeenCalled()
    await settle(1)
    expect(probe).toHaveBeenCalledTimes(1) // 1000 ms
    await settle(249)
    expect(probe).toHaveBeenCalledTimes(1)
    await settle(1)
    expect(probe).toHaveBeenCalledTimes(2) // 1250: a 250 ms step
    await settle(499)
    expect(probe).toHaveBeenCalledTimes(2)
    await settle(1)
    expect(probe).toHaveBeenCalledTimes(3) // 1750: a 500 ms step
    expect(link.state()).toBe('ready')
    await settle(5000)
    expect(probe).toHaveBeenCalledTimes(3) // ready: nobody asks again
  })

  it('a failure that PROVES the call never reached the host never surfaces: it is retried with backoff (200, 400, 800 ms) until it goes through', async () => {
    let calls = 0
    const send = (): Promise<string> => {
      calls += 1
      return calls <= 3 ? Promise.reject(new Refused('ECONNREFUSED')) : Promise.resolve('ok')
    }
    const link = createHostLink<number, string>({ send, classify, random: () => 0.5 })
    link.markReady()
    const result = link.call(1)
    await settle()
    expect(calls).toBe(1)
    await settle(199)
    expect(calls).toBe(1)
    await settle(1)
    expect(calls).toBe(2) // after 200 ms
    await settle(399)
    expect(calls).toBe(2)
    await settle(1)
    expect(calls).toBe(3) // after 400 ms more
    await settle(799)
    expect(calls).toBe(3)
    await settle(1)
    expect(await result).toBe('ok') // after 800 ms more
    expect(calls).toBe(4)
  })

  it('after ready the retry window is 30 s: then the real error surfaces', async () => {
    const send = vi.fn(() => Promise.reject(new Refused('ECONNREFUSED')))
    const link = createHostLink<number, string>({ send, classify, random: () => 0.5 })
    link.markReady()
    const caught = link.call(1).catch((error: unknown) => error)
    await settle(29_000)
    expect(send.mock.calls.length).toBeGreaterThan(5)
    await settle(2_000)
    expect(await caught).toBeInstanceOf(Refused)
    const after = send.mock.calls.length
    await settle(10_000)
    expect(send.mock.calls.length).toBe(after) // it stopped
  })

  it('a write is never sent twice on a doubt: "unknown" is retried only for an idempotent call', async () => {
    let writes = 0
    const write = vi.fn(() => { writes += 1; return Promise.reject(new Error('socket hang up')) })
    const link = createHostLink<string, string>({ send: write, classify, random: () => 0.5 })
    link.markReady()
    const caught = link.call('enviar', { idempotent: false }).catch((error: unknown) => error)
    await settle(5_000)
    expect(await caught).toBeInstanceOf(Error)
    expect(writes).toBe(1)

    let reads = 0
    const read = vi.fn(() => { reads += 1; return reads < 3 ? Promise.reject(new Error('socket hang up')) : Promise.resolve('dados') })
    const readLink = createHostLink<string, string>({ send: read, classify, random: () => 0.5 })
    readLink.markReady()
    const got = readLink.call('ler', { idempotent: true })
    await settle(2_000)
    expect(await got).toBe('dados')
    expect(reads).toBe(3)
  })

  it('a real Remote fault (the host answered) is an ordinary error at once: no retry', async () => {
    const send = vi.fn(() => Promise.reject(new Fault('forbidden')))
    const link = createHostLink<number, string>({ send, classify })
    link.markReady()
    const caught = link.call(1, { idempotent: true }).catch((error: unknown) => error)
    await settle(1_000)
    expect(await caught).toBeInstanceOf(Fault)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('90 s without ready is failed: the queue is rejected, later calls too, and retry() starts the wait again (and the old timer does not fire)', async () => {
    const link = createHostLink<number, string>({ send: n => Promise.resolve(`r${String(n)}`) })
    const waiting = link.call(1).catch((error: unknown) => error)
    await settle(89_999)
    expect(link.state()).toBe('waking')
    await settle(1)
    expect(link.state()).toBe('failed')
    expect(await waiting).toBeInstanceOf(HostLinkFailed)
    await expect(link.call(2)).rejects.toBeInstanceOf(HostLinkFailed)
    link.retry()
    expect(link.state()).toBe('waking')
    const again = link.call(3)
    await settle(89_000)
    expect(link.state()).toBe('waking') // a fresh 90 s, not the leftover of the first
    link.markReady()
    expect(await again).toBe('r3')
  })

  it('the main saying the host exited is failed at once, with its reason', async () => {
    const link = createHostLink<number, string>({ send: n => Promise.resolve(`r${String(n)}`) })
    const waiting = link.call(1).catch((error: unknown) => error)
    link.markFailed('o host saiu com código 1')
    expect(link.state()).toBe('failed')
    const error = await waiting
    expect(error).toBeInstanceOf(HostLinkFailed)
    expect((error as HostLinkFailed).message).toContain('o host saiu com código 1')
  })

  it('the queue is bounded: the call after the last place is told so, and the others still go out at ready', async () => {
    const link = createHostLink<number, string>({ send: n => Promise.resolve(`r${String(n)}`), maxQueue: 2 })
    const first = link.call(1)
    const second = link.call(2)
    await expect(link.call(3)).rejects.toBeInstanceOf(HostLinkQueueFull)
    link.markReady()
    expect(await Promise.all([first, second])).toEqual(['r1', 'r2'])
  })

  it('dispose rejects what still waits and stops every timer', async () => {
    const probe = vi.fn(() => Promise.resolve<HostLinkState>('waking'))
    const link = createHostLink<number, string>({ send: n => Promise.resolve(`r${String(n)}`), probe })
    const waiting = link.call(1).catch((error: unknown) => error)
    link.dispose()
    expect(await waiting).toBeInstanceOf(HostLinkFailed)
    await settle(200_000)
    expect(probe).not.toHaveBeenCalled()
    expect(link.state()).toBe('waking') // a disposed link does not move on its own
  })
})
