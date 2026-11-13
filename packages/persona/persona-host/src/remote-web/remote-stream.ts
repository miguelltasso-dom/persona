/**
 * MARCO M5 (Keel 12/11 20:09, c): the authenticated HTTP stream door of the phone. The gate refuses WebSocket on purpose; a phone that follows a channel reads the SAME Gateway stream the mux would open for it
 * through the protocol of the Liveshare viewer carrier, one poll per HTTP call:
 *   `stream-open {id, endpoint, payload}` → `{opened:true}` | `{failure}`   (a refusal is a 200 frame: terminal, never retried as if the carrier were lost)
 *   `stream-next {id}`                    → `{values:[…]}` | `{pending:true}` | `{end:true}` | `{failure}` | 404 `stream-not-found` (the page re-opens)
 *   `stream-cancel {id}`                  → `{}`
 * The stream is opened with the device's own Peer (the `paired` principal of {@link createPairedDispatch}), so the Gateway asks the paired policy and the funnel binds the caller exactly as for every other call; a stream
 * belongs to the device that opened it (the table is per device, so no other device can poll or cancel it), a device holds only a few, a stream nobody polls goes away, and a revoked device loses all of them at once.
 */

import type { DeviceBook, DeviceRecord } from './device-book.ts'
import type { PeerLike } from './remote-dispatch.ts'

/** Longest batch one poll answers (a burst costs one round trip per batch, not per value). */
export const STREAM_BATCH_MAX = 64
/** How long a poll waits for the FIRST value before it says `pending` (the page asks again at once). */
export const STREAM_HOLD_MS = 10_000
/** A stream nobody polled for this long is closed (the page is gone). */
export const STREAM_IDLE_MS = 60_000
/** Streams one device may hold at once. */
export const STREAMS_PER_DEVICE = 16
const BATCH_WINDOW_MS = 4
const SWEEP_MS = 15_000
const ENDPOINT = /^[A-Za-z][A-Za-z0-9/_.:-]{0,120}$/u
const MAX_ID = 0x7fff_ffff

/** What this module needs of the Gateway (its `wireStream`). */
export interface StreamGateway {
  readonly wireStream: {
    open(endpoint: string, payload: unknown, uplink: AsyncIterable<unknown>, peer: PeerLike, signal: AbortSignal): Promise<unknown> | unknown
    failure(error: unknown): unknown
  }
}

/** What an answer of this door is: an HTTP status and a JSON body. */
export interface StreamAnswer {
  readonly status: number
  readonly body: unknown
}

/** What the gate needs. */
export interface PairedStreams {
  /** `stream-open`. */
  open(device: DeviceRecord, request: { readonly id: number; readonly endpoint: string; readonly payload: unknown }, signal: AbortSignal): Promise<StreamAnswer>
  /** `stream-next`: one poll (the answer of an abandoned poll is a 204 and the stream keeps what it had pulled). */
  next(device: DeviceRecord, id: number, signal: AbortSignal): Promise<StreamAnswer>
  /** `stream-cancel`: idempotent, and silent about streams that are not the device's. */
  cancel(device: DeviceRecord, id: number): StreamAnswer
  /** Closes the streams nobody polled for the idle time (a timer does it; a test calls it). */
  sweep(): void
  /** Closes everything (the host is closing). */
  dispose(): Promise<void>
}

/** What {@link createPairedStreams} needs. */
export interface PairedStreamsDeps {
  /** The Gateway, asked on every open (it may not exist yet at boot). */
  readonly gateway: () => StreamGateway | undefined
  /** The device's Peer (the one the unary dispatch uses), created on demand; `undefined` when the host cannot make one. */
  readonly peerOf: (device: DeviceRecord) => PeerLike | undefined
  readonly book: Pick<DeviceBook, 'onRevoked' | 'isLive'>
  readonly holdMs?: number
  readonly idleMs?: number
  readonly maxPerDevice?: number
  readonly now?: () => number
}

interface Held {
  readonly controller: AbortController
  readonly iterator: AsyncIterator<unknown>
  pending: Promise<IteratorResult<unknown>> | undefined
  lastPolledAt: number
  /** The stream ended after the values of the last batch: the next poll says so. */
  ended: boolean
  /** The stream failed after the values of the last batch: the next poll says so. */
  failed: { readonly error: unknown } | undefined
}

type Polled = { readonly kind: 'value'; readonly result: IteratorResult<unknown> } | { readonly kind: 'failure'; readonly error: unknown } | { readonly kind: 'timeout' } | { readonly kind: 'aborted' }

const answer = (status: number, body: unknown): StreamAnswer => ({ status, body })
const gone = (): StreamAnswer => answer(404, { error: 'stream-not-found' })

/**
 * @param deps - See {@link PairedStreamsDeps}.
 * @returns The door.
 */
export function createPairedStreams(deps: PairedStreamsDeps): PairedStreams {
  const holdMs = deps.holdMs ?? STREAM_HOLD_MS
  const idleMs = deps.idleMs ?? STREAM_IDLE_MS
  const maxPerDevice = deps.maxPerDevice ?? STREAMS_PER_DEVICE
  const now = deps.now ?? Date.now
  const table = new Map<string, Map<number, Held>>()
  const opening = new Map<string, number>()

  const release = (deviceId: string, id: number): void => {
    const held = table.get(deviceId)?.get(id)
    if (held === undefined) return
    table.get(deviceId)?.delete(id)
    if (table.get(deviceId)?.size === 0) table.delete(deviceId)
    held.controller.abort()
    void Promise.resolve(held.iterator.return?.()).catch(() => undefined) // a stream that fails to close belongs to the Gateway; the device lost it either way
  }
  const dropDevice = (deviceId: string): void => {
    for (const id of [...(table.get(deviceId)?.keys() ?? [])]) release(deviceId, id)
  }
  deps.book.onRevoked((deviceId) => { dropDevice(deviceId) })

  const failureOf = (error: unknown): unknown => {
    try {
      return deps.gateway()?.wireStream.failure(error) ?? { code: 'liveshare/relay-error', message: 'failed' }
    } catch (failed) {
      void failed
      return { code: 'liveshare/relay-error', message: 'failed' }
    }
  }

  /** Waits for one pull of the stream, for at most `ms` and until `signal` aborts; the pull itself is never given up (the stream keeps it as its pending one). */
  const poll = async (pending: Promise<IteratorResult<unknown>>, ms: number, signal: AbortSignal | undefined): Promise<Polled> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    try {
      const pulled = pending.then((result): Polled => ({ kind: 'value', result }), (error: unknown): Polled => ({ kind: 'failure', error }))
      const timeout = new Promise<Polled>((resolve) => { timer = setTimeout(() => { resolve({ kind: 'timeout' }) }, ms) })
      const aborted = new Promise<Polled>((resolve) => {
        if (signal === undefined) return
        if (signal.aborted) { resolve({ kind: 'aborted' }); return }
        onAbort = () => { resolve({ kind: 'aborted' }) }
        signal.addEventListener('abort', onAbort, { once: true })
      })
      return await Promise.race([pulled, timeout, aborted])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      if (onAbort !== undefined) signal?.removeEventListener('abort', onAbort)
    }
  }

  const pull = (held: Held): Promise<IteratorResult<unknown>> => {
    const pending = held.pending ?? held.iterator.next()
    pending.catch(() => undefined) // a pull nobody waits for any more must not become an unhandled rejection
    held.pending = pending
    return pending
  }

  const sweep = (): void => {
    const at = now()
    for (const [deviceId, streams] of [...table]) for (const [id, held] of [...streams]) if (at - held.lastPolledAt > idleMs) release(deviceId, id)
  }
  const timer = setInterval(sweep, SWEEP_MS)
  timer.unref()

  return {
    open: async (device, request, signal) => {
      const { id, endpoint } = request
      if (!Number.isSafeInteger(id) || id < 1 || id > MAX_ID || typeof endpoint !== 'string' || !ENDPOINT.test(endpoint)) return answer(400, { error: 'bad-request' })
      if (!deps.book.isLive(device.id)) return answer(401, { error: 'device-revoked' })
      const gateway = deps.gateway()
      const peer = deps.peerOf(device)
      if (gateway === undefined || peer === undefined) return answer(503, { error: 'remote-unavailable' })
      release(device.id, id) // a page that restarted numbers its streams again: the old one is closed
      if ((table.get(device.id)?.size ?? 0) + (opening.get(device.id) ?? 0) >= maxPerDevice) {
        return answer(200, { failure: { code: 'stream-limit', message: 'Este aparelho já segue coisas demais ao mesmo tempo.' } })
      }
      opening.set(device.id, (opening.get(device.id) ?? 0) + 1)
      const controller = new AbortController()
      const callerGone = (): void => { controller.abort() }
      signal.addEventListener('abort', callerGone, { once: true })
      let values: unknown
      try {
        values = await gateway.wireStream.open(endpoint, request.payload, (async function* () { /* the phone sends nothing up */ })(), peer, controller.signal)
      } catch (error) {
        return answer(200, { failure: failureOf(error) })
      } finally {
        signal.removeEventListener('abort', callerGone)
        opening.set(device.id, (opening.get(device.id) ?? 1) - 1)
      }
      const iterable = values as { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> } | null | undefined
      const iterate = iterable?.[Symbol.asyncIterator]
      if (typeof iterate !== 'function') return answer(200, { failure: failureOf(values) })
      const iterator = iterate.call(iterable)
      if (controller.signal.aborted || !deps.book.isLive(device.id)) { // the page gave up, or the device was revoked, while the Gateway opened it
        controller.abort()
        void Promise.resolve(iterator.return?.()).catch(() => undefined)
        return answer(deps.book.isLive(device.id) ? 204 : 401, deps.book.isLive(device.id) ? null : { error: 'device-revoked' })
      }
      const streams = table.get(device.id) ?? new Map<number, Held>()
      table.set(device.id, streams)
      streams.set(id, { controller, iterator, pending: undefined, lastPolledAt: now(), ended: false, failed: undefined })
      return answer(200, { opened: true })
    },

    next: async (device, id, signal) => {
      const held = table.get(device.id)?.get(id)
      if (held === undefined) return gone()
      if (!deps.book.isLive(device.id)) { dropDevice(device.id); return answer(401, { error: 'device-revoked' }) }
      held.lastPolledAt = now()
      if (held.failed !== undefined) { release(device.id, id); return answer(200, { failure: failureOf(held.failed.error) }) }
      if (held.ended) { release(device.id, id); return answer(200, { end: true }) }
      const first = await poll(pull(held), holdMs, signal)
      if (first.kind === 'aborted') return answer(204, null) // the page left: what the stream pulled stays its pending pull for the next poll
      if (table.get(device.id)?.get(id) !== held) return gone()
      if (first.kind === 'timeout') return answer(200, { pending: true })
      held.pending = undefined
      if (first.kind === 'failure') { release(device.id, id); return answer(200, { failure: failureOf(first.error) }) }
      if (first.result.done === true) { release(device.id, id); return answer(200, { end: true }) }
      const values: unknown[] = [first.result.value]
      // what the stream already queued behind the first value answers together with it, up to the cap; a pull still unanswered when the window runs out stays the pending pull
      while (values.length < STREAM_BATCH_MAX) {
        const more = await poll(pull(held), BATCH_WINDOW_MS, undefined)
        if (more.kind === 'timeout' || more.kind === 'aborted') break
        held.pending = undefined
        if (more.kind === 'failure') { held.failed = { error: more.error }; break }
        if (more.result.done === true) { held.ended = true; break }
        values.push(more.result.value)
      }
      if (table.get(device.id)?.get(id) !== held) return gone() // revoked or cancelled while it waited
      return answer(200, { values })
    },

    cancel: (device, id) => {
      release(device.id, id)
      return answer(200, {})
    },

    sweep,

    dispose: () => {
      clearInterval(timer)
      for (const deviceId of [...table.keys()]) dropDevice(deviceId)
      return Promise.resolve()
    },
  }
}
