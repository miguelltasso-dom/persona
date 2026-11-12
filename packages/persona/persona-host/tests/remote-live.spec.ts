/**
 * H23 / F4: the live link of a connected team (a fake socket and fake timers; the real worker is in `apps/persona-edge/tests/remote-live.spec.ts`). It WAKES the host when the hub
 * pushes, wakes it once after every (re)connect, reconnects with a growing backoff, stops for good when the hub cuts the person off, keeps the heartbeat, and carries presence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteLive, type LiveSocket } from '../src/remote-live.ts'

type Listener = (event: { readonly data?: unknown; readonly code?: number }) => void

class FakeSocket implements LiveSocket {
  static all: FakeSocket[] = []
  readonly sent: string[] = []
  closedWith: number | undefined
  private readonly listeners = new Map<string, Listener[]>()
  constructor(readonly url: string, readonly headers: Record<string, string>) { FakeSocket.all.push(this) }
  send(data: string): void { this.sent.push(data) }
  close(code?: number): void { this.closedWith = code }
  addEventListener(type: string, listener: Listener): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  fire(type: 'open' | 'message' | 'close' | 'error', event: { data?: unknown; code?: number } = {}): void { for (const listener of this.listeners.get(type) ?? []) listener(event) }
  say(value: unknown): void { this.fire('message', { data: typeof value === 'string' ? value : JSON.stringify(value) }) }
}

const factory = (url: string, headers: Record<string, string>): LiveSocket => new FakeSocket(url, headers)
const row = (actor: string, state = 'online') => ({ actor, device: '', state, since: 1 })

function link(extra: Partial<ConstructorParameters<typeof RemoteLive>[0]> = {}) {
  const woke = vi.fn()
  const rosters: unknown[] = []
  const revoked = vi.fn()
  const authorize = vi.fn(() => Promise.resolve('Persona-Sig actor=ana,ts=1,sig=x'))
  const live = new RemoteLive({ url: 'ws://edge.test/w/ws/sync', authorize, onWake: woke, onRoster: (rows) => { rosters.push(rows) }, onRevoked: revoked, factory, ...extra })
  return { live, woke, rosters, revoked, authorize }
}

const socket = (index = FakeSocket.all.length - 1): FakeSocket => FakeSocket.all[index]!
const tick = async (ms: number): Promise<void> => { await vi.advanceTimersByTimeAsync(ms) }

beforeEach(() => { FakeSocket.all = []; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('the link wakes the host', () => {
  it('connects signed, wakes the host on a push and once after the hello (what was said while away), and reports who is live', async () => {
    const { live, woke, rosters, authorize } = link()
    live.start()
    await tick(0)
    expect(authorize).toHaveBeenCalledOnce()
    expect(socket().headers).toEqual({ authorization: 'Persona-Sig actor=ana,ts=1,sig=x' })
    socket().fire('open')
    expect(live.connected()).toBe(true)
    socket().say({ type: 'hello', actor: 'ana', roster: [row('ana')] })
    expect(woke).toHaveBeenCalledTimes(1) // catch up after (re)connecting
    expect(live.roster()).toEqual([row('ana')])
    socket().say({ type: 'envelope', envelope: { streamId: 'channel:geral', seq: 3 } })
    expect(woke).toHaveBeenCalledTimes(2)
    socket().say({ type: 'roster', roster: [row('ana'), row('beto', 'away')] })
    expect(rosters.at(-1)).toEqual([row('ana'), row('beto', 'away')])
    expect(woke).toHaveBeenCalledTimes(2) // a roster change is not "something new to sync"
    live.stop()
  })

  it('ignores what is not the hub\'s protocol: garbage, binary, a roster with a bad row, an unknown type, pong', async () => {
    const { live, woke } = link()
    live.start()
    await tick(0)
    socket().fire('open')
    socket().say('not json')
    socket().say('pong')
    socket().fire('message', { data: new Uint8Array([1, 2, 3]) })
    socket().say({ type: 'something-else' })
    socket().say({ type: 'roster', roster: [row('ana'), { actor: 5 }, { actor: 'x', device: '', state: 'invented', since: 1 }, null] })
    expect(woke).not.toHaveBeenCalled()
    expect(live.roster()).toEqual([row('ana')])
    live.stop()
  })
})

describe('the link survives a bad network', () => {
  it('reconnects with a growing wait (1 s, 2 s, 4 s…), signs again each time, and a hello starts the backoff over', async () => {
    const { live, authorize } = link()
    live.start()
    await tick(0)
    expect(FakeSocket.all).toHaveLength(1)
    socket().fire('close', { code: 1006 })
    await tick(1100)
    expect(FakeSocket.all).toHaveLength(2) // after ~1 s
    socket().fire('error') // an error, then its close: only one retry is scheduled
    socket().fire('close', { code: 1006 })
    await tick(1500)
    expect(FakeSocket.all).toHaveLength(2) // the second wait is ~2 s: not yet
    await tick(800)
    expect(FakeSocket.all).toHaveLength(3)
    expect(authorize).toHaveBeenCalledTimes(3)
    socket().fire('open')
    socket().say({ type: 'hello', actor: 'ana', roster: [] })
    socket().fire('close', { code: 1006 })
    await tick(1100)
    expect(FakeSocket.all).toHaveLength(4) // back to ~1 s after a link that worked
    live.stop()
  })

  it('a `revoked` message from the hub stops the link for good even when the close event never arrives (the network is dead, the runtime lags)', async () => {
    const { live, revoked, woke } = link()
    live.start()
    await tick(0)
    socket().fire('open')
    socket().say({ type: 'hello', actor: 'ana', roster: [row('ana')] })
    socket().say({ type: 'revoked' }) // no 'close' follows
    expect(revoked).toHaveBeenCalledOnce()
    expect(socket().closedWith).toBe(1000)
    expect(live.connected()).toBe(false)
    expect(live.roster()).toEqual([])
    await tick(120_000)
    expect(FakeSocket.all).toHaveLength(1) // not retried
    expect(woke).toHaveBeenCalledTimes(1) // only the hello's wake
  })

  it('keeps trying when it cannot even sign or open a socket (no identity yet, no WebSocket in this runtime): the poll carries on', async () => {
    let calls = 0
    const { live } = link({ authorize: () => { calls += 1; return Promise.reject(new Error('identity-unavailable')) } })
    live.start()
    await tick(0)
    await tick(1100)
    await tick(2100)
    expect(calls).toBe(3)
    expect(FakeSocket.all).toHaveLength(0)
    live.stop()
    await tick(60_000)
    expect(calls).toBe(3) // stopped: nothing more is tried
  })

  it('a hub that cuts the person off (1008, ACCESS_REVOKED) is NOT retried: the person was removed', async () => {
    const { live, revoked } = link()
    live.start()
    await tick(0)
    socket().fire('open')
    socket().fire('close', { code: 1008 })
    expect(revoked).toHaveBeenCalledOnce()
    await tick(120_000)
    expect(FakeSocket.all).toHaveLength(1)
    expect(live.connected()).toBe(false)
  })
})

describe('the heartbeat and presence', () => {
  it('pings every 25 s (the hub answers by itself) and reconnects when it hears nothing for 70 s', async () => {
    const { live } = link()
    live.start()
    await tick(0)
    socket().fire('open')
    await tick(25_000)
    expect(socket().sent).toContain('ping')
    socket().say('pong')
    await tick(25_000)
    expect(socket().sent.filter(item => item === 'ping')).toHaveLength(2)
    await tick(75_000) // nothing heard for longer than the silence limit
    expect(socket(0).closedWith).toBe(4000)
    live.stop()
  })

  it('sends this device\'s presence when it opens and again after a reconnect', async () => {
    const { live } = link({ machine: 'Notebook do Bob' })
    live.start()
    await tick(0)
    socket(0).fire('open')
    expect(JSON.parse(socket(0).sent.at(-1) ?? '{}')).toEqual({ type: 'presence', state: 'online', machine: 'Notebook do Bob' })
    live.setPresence('busy', 'Notebook do Bob')
    expect(JSON.parse(socket(0).sent.at(-1) ?? '{}')).toMatchObject({ type: 'presence', state: 'busy' })
    socket(0).fire('close', { code: 1006 })
    await tick(1100)
    socket(1).fire('open')
    expect(JSON.parse(socket(1).sent.at(-1) ?? '{}')).toMatchObject({ type: 'presence', state: 'busy' }) // the last state, not the default
    live.stop()
  })

  it('stop() closes the socket, forgets the roster and ignores anything the old socket says afterwards', async () => {
    const { live, woke } = link()
    live.start()
    await tick(0)
    socket().fire('open')
    socket().say({ type: 'hello', actor: 'ana', roster: [row('ana')] })
    live.stop()
    expect(socket().closedWith).toBe(1000)
    expect(live.roster()).toEqual([])
    socket().say({ type: 'envelope', envelope: {} })
    socket().fire('close', { code: 1006 })
    await tick(60_000)
    expect(woke).toHaveBeenCalledTimes(1) // only the hello's wake
    expect(FakeSocket.all).toHaveLength(1)
  })
})
