import { afterEach, describe, expect, it } from 'vitest'
import type { DeviceRecord } from '../src/remote-web/device-book.ts'
import { createPairedStreams, STREAM_BATCH_MAX, type PairedStreams, type StreamGateway } from '../src/remote-web/remote-stream.ts'

/**
 * M5 (Keel 12/11 20:09, c): the authenticated HTTP stream door of the phone, with the protocol of the Liveshare viewer carrier (`stream-open` / `stream-next` / `stream-cancel`, one poll per HTTP call) over
 * the SAME Gateway stream the WebSocket mux would open for that Peer (so the policy of the paired principal and the funnel are the ones of every other call). Proved here against a Gateway whose streams the
 * test drives by hand.
 */
const device = (id: string): DeviceRecord => ({ id, memberId: `m-${id}`, label: id, pairedAt: '2026-11-12T10:00:00.000Z', lastSeenAt: '2026-11-12T10:00:00.000Z' }) as unknown as DeviceRecord

interface Control { push(value: unknown): void; end(): void; fail(error: Error): void; readonly signal: AbortSignal; readonly endpoint: string; readonly payload: unknown; readonly peer: unknown }

function rig(over: { holdMs?: number; idleMs?: number; max?: number; now?: () => number } = {}) {
  const opened: Control[] = []
  const revoked: ((deviceId: string) => void)[] = []
  let refuse: Error | undefined
  const gateway: StreamGateway = {
    wireStream: {
      open: (endpoint, payload, _uplink, peer, signal) => {
        if (refuse !== undefined) return Promise.reject(refuse)
        const queue: ({ v: unknown } | Error | 'end')[] = []
        let wake: (() => void) | undefined
        const put = (item: { v: unknown } | Error | 'end'): void => { queue.push(item); wake?.() }
        opened.push({ push: (value) => { put({ v: value }) }, end: () => { put('end') }, fail: (error) => { put(error) }, signal, endpoint, payload, peer })
        signal.addEventListener('abort', () => { put('end') }, { once: true })
        const iterable: AsyncIterable<unknown> = {
          [Symbol.asyncIterator]: () => ({
            next: async () => {
              for (;;) {
                const item = queue.shift()
                if (item === undefined) { await new Promise<void>((resolve) => { wake = resolve }); wake = undefined; continue }
                if (item === 'end') return { done: true as const, value: undefined }
                if (item instanceof Error) throw item
                return { done: false as const, value: item.v }
              }
            },
            return: () => { put('end'); return Promise.resolve({ done: true as const, value: undefined }) },
          }),
        }
        return Promise.resolve(iterable)
      },
      failure: error => ({ code: error instanceof Error && error.name !== 'Error' ? error.name : 'gateway/failed', message: error instanceof Error ? error.message : 'failed' }),
    },
  }
  const streams: PairedStreams = createPairedStreams({
    gateway: () => gateway, peerOf: d => ({ signal: new AbortController().signal, dispose: () => Promise.resolve(), who: d.id }) as never,
    book: { onRevoked: (cb) => { revoked.push(cb); return () => undefined }, isLive: () => true },
    holdMs: over.holdMs ?? 30, idleMs: over.idleMs ?? 60_000, ...(over.max === undefined ? {} : { maxPerDevice: over.max }), ...(over.now === undefined ? {} : { now: over.now }),
  })
  return { streams, opened, revoke: (id: string): void => { for (const cb of revoked) cb(id) }, refuseOpens: (error: Error): void => { refuse = error } }
}

let live: PairedStreams[] = []
afterEach(async () => { for (const s of live) await s.dispose(); live = [] })
const make = (over: Parameters<typeof rig>[0] = {}): ReturnType<typeof rig> => { const made = rig(over); live.push(made.streams); return made }
const ac = (): AbortSignal => new AbortController().signal

describe('open, poll, end', () => {
  it('opens the Gateway stream for the device\'s Peer, hands the values in ONE answer, says `pending` when nothing came within the hold, and `end` once, then the id is gone', async () => {
    const { streams, opened } = make()
    expect(await streams.open(device('d1'), { id: 1, endpoint: 'followMessages', payload: { channelId: 'c1' } }, ac())).toEqual({ status: 200, body: { opened: true } })
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ endpoint: 'followMessages', payload: { channelId: 'c1' }, peer: { who: 'd1' } })
    opened[0]?.push('a'); opened[0]?.push('b'); opened[0]?.push('c')
    expect(await streams.next(device('d1'), 1, ac())).toEqual({ status: 200, body: { values: ['a', 'b', 'c'] } })
    expect(await streams.next(device('d1'), 1, ac()), 'nothing within the hold').toEqual({ status: 200, body: { pending: true } })
    opened[0]?.end()
    expect(await streams.next(device('d1'), 1, ac())).toEqual({ status: 200, body: { end: true } })
    expect((await streams.next(device('d1'), 1, ac())).status, 'the id is gone: the page must re-open, never poll forever').toBe(404)
  })

  it('a burst is split in batches of at most the cap and nothing is lost or reordered', async () => {
    const { streams, opened } = make()
    await streams.open(device('d1'), { id: 7, endpoint: 'e', payload: null }, ac())
    for (let n = 0; n < 150; n += 1) opened[0]?.push(n)
    const got: number[] = []
    while (got.length < 150) {
      const answer = await streams.next(device('d1'), 7, ac())
      const values = (answer.body as { values?: number[] }).values
      if (values === undefined) throw new Error(`unexpected answer ${JSON.stringify(answer)}`)
      expect(values.length).toBeLessThanOrEqual(STREAM_BATCH_MAX)
      got.push(...values)
    }
    expect(got).toEqual(Array.from({ length: 150 }, (_, n) => n))
  })

  it('a poll the page abandons keeps the stream and loses no value', async () => {
    const { streams, opened } = make({ holdMs: 5_000 })
    await streams.open(device('d1'), { id: 2, endpoint: 'e', payload: null }, ac())
    const gone = new AbortController()
    const waiting = streams.next(device('d1'), 2, gone.signal)
    gone.abort()
    expect((await waiting).status, 'abandoned').toBe(204)
    opened[0]?.push('later')
    expect(await streams.next(device('d1'), 2, ac())).toEqual({ status: 200, body: { values: ['later'] } })
  })
})

describe('refusals and failures are frames the page can read', () => {
  it('a Gateway that refuses the open (the policy says no, an unknown stream) is a `failure` frame and no stream is kept', async () => {
    const { streams, refuseOpens } = make()
    refuseOpens(Object.assign(new Error('Isto só pelo PC.'), { name: 'remote-access/denied' }))
    expect(await streams.open(device('d1'), { id: 1, endpoint: 'saveConnectorSecret', payload: null }, ac())).toEqual({ status: 200, body: { failure: { code: 'remote-access/denied', message: 'Isto só pelo PC.' } } })
    expect((await streams.next(device('d1'), 1, ac())).status).toBe(404)
  })

  it('a stream that fails midway ends with a `failure` frame and is released', async () => {
    const { streams, opened } = make()
    await streams.open(device('d1'), { id: 1, endpoint: 'e', payload: null }, ac())
    opened[0]?.fail(new Error('caiu'))
    expect(await streams.next(device('d1'), 1, ac())).toEqual({ status: 200, body: { failure: { code: 'gateway/failed', message: 'caiu' } } })
    expect((await streams.next(device('d1'), 1, ac())).status).toBe(404)
  })

  it('a malformed open (an id that is not a positive integer, an endpoint that is not a name) is `bad-request`, and nothing reaches the Gateway', async () => {
    const { streams, opened } = make()
    for (const bad of [{ id: 0, endpoint: 'e' }, { id: -3, endpoint: 'e' }, { id: 1.5, endpoint: 'e' }, { id: 1, endpoint: '' }, { id: 1, endpoint: '../x' }, { id: 1, endpoint: 'a b' }, { id: 1, endpoint: 'x'.repeat(200) }, { id: 'a', endpoint: 'e' }]) {
      expect((await streams.open(device('d1'), { ...bad, payload: null } as never, ac())).status, JSON.stringify(bad)).toBe(400)
    }
    expect(opened).toEqual([])
  })
})

describe('whose stream it is', () => {
  it('another device can neither poll nor cancel the stream of a device', async () => {
    const { streams, opened } = make()
    await streams.open(device('d1'), { id: 1, endpoint: 'e', payload: null }, ac())
    opened[0]?.push('segredo-do-d1')
    expect((await streams.next(device('d2'), 1, ac())).status).toBe(404)
    expect(streams.cancel(device('d2'), 1).status).toBe(200) // idempotent and silent: nothing of d1 was touched
    expect(opened[0]?.signal.aborted).toBe(false)
    expect(await streams.next(device('d1'), 1, ac())).toEqual({ status: 200, body: { values: ['segredo-do-d1'] } })
  })

  it('the same id on two devices is two streams', async () => {
    const { streams, opened } = make()
    await streams.open(device('d1'), { id: 1, endpoint: 'e', payload: null }, ac())
    await streams.open(device('d2'), { id: 1, endpoint: 'e', payload: null }, ac())
    opened[0]?.push('um'); opened[1]?.push('dois')
    expect((await streams.next(device('d1'), 1, ac())).body).toEqual({ values: ['um'] })
    expect((await streams.next(device('d2'), 1, ac())).body).toEqual({ values: ['dois'] })
  })

  it('a device that is revoked loses every stream at once, and what it polls next is gone', async () => {
    const { streams, opened, revoke } = make()
    await streams.open(device('d1'), { id: 1, endpoint: 'e', payload: null }, ac())
    await streams.open(device('d1'), { id: 2, endpoint: 'e', payload: null }, ac())
    revoke('d1')
    expect(opened.map(item => item.signal.aborted)).toEqual([true, true])
    expect((await streams.next(device('d1'), 1, ac())).status).toBe(404)
  })
})

describe('what a device may hold', () => {
  it('cancel closes the Gateway stream, and asking again is fine', async () => {
    const { streams, opened } = make()
    await streams.open(device('d1'), { id: 1, endpoint: 'e', payload: null }, ac())
    expect(streams.cancel(device('d1'), 1)).toEqual({ status: 200, body: {} })
    expect(opened[0]?.signal.aborted).toBe(true)
    expect(streams.cancel(device('d1'), 1)).toEqual({ status: 200, body: {} })
  })

  it('opening an id again replaces the old stream (a page that restarted), which is closed', async () => {
    const { streams, opened } = make()
    await streams.open(device('d1'), { id: 1, endpoint: 'e', payload: null }, ac())
    await streams.open(device('d1'), { id: 1, endpoint: 'e2', payload: null }, ac())
    expect(opened[0]?.signal.aborted).toBe(true)
    expect(opened[1]?.signal.aborted).toBe(false)
  })

  it('a device holds only a few streams: the next open is a terminal `failure` frame (not a retryable status), the others keep running', async () => {
    const { streams, opened } = make({ max: 3 })
    for (const id of [1, 2, 3]) expect((await streams.open(device('d1'), { id, endpoint: 'e', payload: null }, ac())).body).toEqual({ opened: true })
    const over = await streams.open(device('d1'), { id: 4, endpoint: 'e', payload: null }, ac())
    expect(over).toMatchObject({ status: 200, body: { failure: { code: 'stream-limit' } } })
    expect(opened).toHaveLength(3)
    expect(opened.every(item => !item.signal.aborted)).toBe(true)
  })

  it('a stream nobody polls goes away after the idle time (the page is gone), and the sweep frees its Gateway stream', async () => {
    const clock = { now: 1_000 }
    const { streams, opened } = make({ idleMs: 60_000, now: () => clock.now })
    await streams.open(device('d1'), { id: 1, endpoint: 'e', payload: null }, ac())
    await streams.open(device('d1'), { id: 2, endpoint: 'e', payload: null }, ac())
    clock.now += 50_000
    opened[1]?.push('x')
    await streams.next(device('d1'), 2, ac()) // polled: alive
    clock.now += 20_000
    streams.sweep()
    expect(opened.map(item => item.signal.aborted)).toEqual([true, false])
  })

  it('dispose closes everything', async () => {
    const { streams, opened } = make()
    await streams.open(device('d1'), { id: 1, endpoint: 'e', payload: null }, ac())
    await streams.dispose()
    expect(opened[0]?.signal.aborted).toBe(true)
  })
})
