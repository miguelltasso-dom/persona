/**
 * boot-estatico (persona-spec/contracts/boot-estatico.md §3): the Gateway's WebSocket of the static shell. The shell mounts before the host answers, so the socket cannot be opened when the
 * connection asks for it: this factory hands the connection a socket that is still "connecting" while the link is `waking`, and opens the REAL one (at the host's origin, which only exists
 * from `ready`) when the link turns ready. The listeners the connection registered meanwhile move to the real socket. If the link fails first, the socket reports an error and a close (the
 * connection's own recovery takes it from there). Install it as `__DSH_TRANSPORT__.createWebSocket`.
 *
 * Structural types only: this package has no edge to the connection package; a `ConnectionWebSocket` fits `LateSocket`.
 */

import type { HostLinkState } from './late-transport.ts'

/** The events of the Gateway's socket. */
export type LateSocketEvent = 'open' | 'error' | 'close' | 'message'

/** What the facade needs of a socket (the shape of `ConnectionWebSocket`). */
export interface LateSocket {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(event: LateSocketEvent, listener: (event: never) => void, options?: { readonly once?: boolean }): void
  removeEventListener(event: LateSocketEvent, listener: (event: never) => void): void
}

/** What the factory needs of the host link. */
export interface LateSocketLink {
  state(): HostLinkState
  subscribe(listener: (state: HostLinkState) => void): () => void
}

export interface LateWebSocketOptions<S extends LateSocket> {
  readonly link: LateSocketLink
  /** The origin of the host (`http://127.0.0.1:<port>`), known from `ready`; absent outside the Desktop (the URL the connection built is used as it is). */
  readonly hostOrigin: () => string | undefined
  /** The real carrier (default of the app: `url => new WebSocket(url)`). */
  readonly open: (url: string) => S
}

const CONNECTING = 0
const CLOSED = 3
const HOST_UNAVAILABLE = 1006

/**
 * The same channel, at the host's own origin.
 * @param url - The URL the connection built (against a base that was not the host).
 * @param origin - The host origin.
 * @returns A `ws:`/`wss:` URL with the channel's path and query at that origin.
 */
function atHost(url: string, origin: string | undefined): string {
  if (origin === undefined || origin === '') return url
  const provisional = new URL(url)
  const base = new URL(origin)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  return new URL(`${provisional.pathname}${provisional.search}`, base).href
}

/**
 * Create the socket factory of the static shell.
 * @param options - The link, the host origin and the real carrier.
 * @returns A factory with the signature of `ConnectionWebSocketFactory`.
 */
export function createLateWebSocketFactory<S extends LateSocket>(options: LateWebSocketOptions<S>): (url: string) => S {
  return (url) => {
    if (options.link.state() === 'ready') return options.open(atHost(url, options.hostOrigin())) // the host is up: a plain socket
    const listeners: { event: LateSocketEvent; listener: (event: never) => void; once: boolean }[] = []
    let real: S | undefined
    let closed = false
    let stop: (() => void) | undefined
    const tell = (event: LateSocketEvent, payload: object): void => {
      for (const entry of [...listeners]) {
        if (entry.event !== event) continue
        if (entry.once) listeners.splice(listeners.indexOf(entry), 1)
        ;(entry.listener as (value: object) => void)(payload)
      }
    }
    const finish = (code: number, reason: string): void => {
      closed = true
      stop?.()
      stop = undefined
      tell('error', { reason })
      tell('close', { code, reason })
    }
    stop = options.link.subscribe((state) => {
      if (closed || real !== undefined) return
      if (state === 'ready') {
        stop?.()
        stop = undefined
        real = options.open(atHost(url, options.hostOrigin()))
        for (const entry of listeners.splice(0)) real.addEventListener(entry.event, entry.listener, { once: entry.once })
      } else if (state === 'failed') {
        finish(HOST_UNAVAILABLE, 'host unavailable')
      }
    })
    const facade: LateSocket = {
      get readyState() { return real?.readyState ?? (closed ? CLOSED : CONNECTING) },
      send(data) {
        if (real === undefined) throw new Error('the socket is not open yet: the host is still starting')
        real.send(data)
      },
      close(code, reason) {
        if (real !== undefined) { real.close(code, reason); return }
        if (closed) return
        closed = true
        stop?.()
        stop = undefined
        tell('close', { code: code ?? 1000, reason: reason ?? '' })
      },
      addEventListener(event, listener, listenerOptions) {
        if (real !== undefined) { real.addEventListener(event, listener, listenerOptions); return }
        listeners.push({ event, listener, once: listenerOptions?.once === true })
      },
      removeEventListener(event, listener) {
        if (real !== undefined) { real.removeEventListener(event, listener); return }
        const index = listeners.findIndex(entry => entry.event === event && entry.listener === listener)
        if (index >= 0) listeners.splice(index, 1)
      },
    }
    return facade as unknown as S // the facade implements the whole socket surface the connection uses
  }
}
