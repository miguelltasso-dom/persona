/**
 * MARCO M5: how an authenticated request of the remote gate reaches the Gateway AS A PAIRED DEVICE. The same way the LiveShare viewer does it: one Peer per device (`connection.createPeer`, principal
 * `paired`), and the shared `/api` fetch handler of the connection answers the request for that Peer — so the Gateway asks the `paired` policy before it resolves an id or decodes an argument. The owner's
 * Peer is never used here.
 *
 * The Peer of a device lives until the device is revoked (the Peer is disposed: its streams end and a call in flight is refused by the Gateway) or until its own signal aborts (then the next request makes a new
 * one). A request for a device that is no longer live is refused here too, before the Gateway.
 */

import type { DeviceBook, DeviceRecord } from './device-book.ts'
import { pairedPrincipal, type PairedPrincipal } from './remote-principal.ts'

/** What this module needs of a Peer (the Gateway's `PeerScope`). */
export interface PeerLike {
  readonly signal: AbortSignal
  dispose(): Promise<void>
}

/** What this module needs of the host connection (`ctx.get('connection')`). */
export interface ConnectionLike {
  createPeer(options: { readonly principal: PairedPrincipal; readonly interactions?: 'answer' | 'none' }): PeerLike
  createSharedFetchHandler(channel: '/api'): { fetch(request: Request, peer: PeerLike): Promise<Response> }
}

/** What the dispatch needs. */
export interface PairedDispatchDeps {
  /** The connection of the host, asked on every request (the service may not exist yet at boot, or may be replaced). */
  readonly connection: () => ConnectionLike | undefined
  readonly book: DeviceBook
}

/** The dispatch of the remote gate. */
export interface PairedDispatch {
  /** Hand one authenticated `/api/*` request to the Gateway for the device's Peer. */
  dispatch(request: Request, device: DeviceRecord): Promise<Response>
  /** M5 (c): the device's Peer, the SAME one the unary calls use (made on demand), for its streams; `undefined` when the host has no connection or the device is no longer live. */
  peerFor(device: DeviceRecord): PeerLike | undefined
  /** Dispose every Peer (the host is closing). */
  dispose(): Promise<void>
}

const answer = (status: number, error: string): Response => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } })

/**
 * @param deps - The connection and the device book.
 * @returns The dispatch (give `dispatch` to the gate) and its `dispose`.
 */
export function createPairedDispatch(deps: PairedDispatchDeps): PairedDispatch {
  const peers = new Map<string, PeerLike>()
  const drop = (deviceId: string): Promise<void> => {
    const peer = peers.get(deviceId)
    peers.delete(deviceId)
    return peer === undefined ? Promise.resolve() : peer.dispose().catch(() => undefined) // a failed disposal belongs to what the Peer registered; the device is gone either way
  }
  deps.book.onRevoked((deviceId) => { void drop(deviceId) })
  const peerFor = (device: DeviceRecord): PeerLike | undefined => {
    if (!deps.book.isLive(device.id)) return undefined
    const connection = deps.connection()
    if (connection === undefined) return undefined
    let peer = peers.get(device.id)
    if (peer === undefined || peer.signal.aborted) {
      peer = connection.createPeer({ principal: pairedPrincipal(device.id) })
      peers.set(device.id, peer)
    }
    return peer
  }
  return {
    peerFor,
    dispatch: async (request, device) => {
      if (!deps.book.isLive(device.id)) return answer(401, 'device-revoked')
      const connection = deps.connection()
      const handler = connection?.createSharedFetchHandler('/api')
      if (connection === undefined || handler === undefined) return answer(503, 'remote-unavailable')
      const peer = peerFor(device)
      if (peer === undefined) return answer(503, 'remote-unavailable')
      return handler.fetch(request, peer)
    },
    dispose: async () => { await Promise.all([...peers.keys()].map(drop)) },
  }
}
