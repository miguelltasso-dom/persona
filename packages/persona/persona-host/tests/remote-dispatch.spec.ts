import { describe, expect, it } from 'vitest'
import { DeviceBook, type DeviceRecord } from '../src/remote-web/device-book.ts'
import { createPairedDispatch, type ConnectionLike, type PeerLike } from '../src/remote-web/remote-dispatch.ts'

/**
 * M5: a request of a paired device reaches the Gateway as THAT device's Peer (principal `paired`), never as the owner; the Peer lives until the device is revoked.
 */
interface Fake extends PeerLike { readonly principal: { kind: string; deviceId: string }; disposed: number; abort(): void }

function rig(): { book: DeviceBook; connection: ConnectionLike; peers: Fake[]; seen: { url: string; peer: Fake }[]; handlerCalls: { count: number }; on: { connection: boolean } } {
  const book = new DeviceBook()
  const peers: Fake[] = []
  const seen: { url: string; peer: Fake }[] = []
  const handlerCalls = { count: 0 }
  const on = { connection: true }
  const connection: ConnectionLike = {
    createPeer: ({ principal }) => {
      const controller = new AbortController()
      const peer: Fake = { principal, signal: controller.signal, disposed: 0, abort: () => { controller.abort() }, dispose: () => { peer.disposed += 1; controller.abort(); return Promise.resolve() } }
      peers.push(peer)
      return peer
    },
    createSharedFetchHandler: (channel) => {
      handlerCalls.count += 1
      expect(channel).toBe('/api')
      return { fetch: (request, peer) => { seen.push({ url: new URL(request.url).pathname, peer: peer as Fake }); return Promise.resolve(new Response('{"ok":true}', { status: 200 })) } }
    },
  }
  return { book, connection, peers, seen, handlerCalls, on }
}
const device = (book: DeviceBook): DeviceRecord => {
  const made = book.enroll('m-bob', 'Pixel', { address: '100.64.0.9' })
  if (made === 'cheio') throw new Error('full')
  const record = book.liveRecord(made.id)
  if (record === undefined) throw new Error('not live')
  return record
}
const req = (path: string): Request => new Request(`http://persona-remote${path}`, { method: 'POST', body: '{}' })

describe('createPairedDispatch', () => {
  it('the request reaches the Gateway for a Peer whose principal is `paired` with THAT device id (never the owner)', async () => {
    const { book, connection, seen } = rig()
    const record = device(book)
    const { dispatch } = createPairedDispatch({ connection: () => connection, book })
    const response = await dispatch(req('/api/persona/listMessages'), record)
    expect(response.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe('/api/persona/listMessages')
    expect(seen[0]?.peer.principal).toEqual({ kind: 'paired', deviceId: record.id })
  })

  it('one Peer per device, reused across requests; two devices have two Peers', async () => {
    const { book, connection, peers, seen } = rig()
    const one = device(book)
    const two = device(book)
    const { dispatch } = createPairedDispatch({ connection: () => connection, book })
    await dispatch(req('/api/a'), one)
    await dispatch(req('/api/b'), one)
    await dispatch(req('/api/c'), two)
    expect(peers).toHaveLength(2)
    expect(seen[0]?.peer).toBe(seen[1]?.peer)
    expect(seen[2]?.peer).not.toBe(seen[0]?.peer)
  })

  it('revoking the device disposes its Peer (its streams end, a call in flight is refused by the Gateway) and the next request is refused here', async () => {
    const { book, connection, peers, handlerCalls } = rig()
    const record = device(book)
    const { dispatch } = createPairedDispatch({ connection: () => connection, book })
    await dispatch(req('/api/a'), record)
    book.revoke(record.id)
    await Promise.resolve()
    expect(peers[0]?.disposed).toBe(1)
    const before = handlerCalls.count
    const refused = await dispatch(req('/api/a'), record)
    expect(refused.status).toBe(401)
    expect(JSON.parse(await refused.text())).toEqual({ error: 'device-revoked' })
    expect(handlerCalls.count).toBe(before) // it never reached the Gateway
  })

  it('a Peer that aborted by itself is replaced on the next request', async () => {
    const { book, connection, peers } = rig()
    const record = device(book)
    const { dispatch } = createPairedDispatch({ connection: () => connection, book })
    await dispatch(req('/api/a'), record)
    peers[0]?.abort()
    await dispatch(req('/api/a'), record)
    expect(peers).toHaveLength(2)
  })

  it('without a connection (not booted yet) the answer is 503, not a crash and not the owner', async () => {
    const { book } = rig()
    const record = device(book)
    const { dispatch } = createPairedDispatch({ connection: () => undefined, book })
    const response = await dispatch(req('/api/a'), record)
    expect(response.status).toBe(503)
    expect(JSON.parse(await response.text())).toEqual({ error: 'remote-unavailable' })
  })

  it('an expired device (idle too long) is refused before the Gateway, like a revoked one', async () => {
    let now = 1_800_000_000_000
    const book = new DeviceBook(undefined, () => now)
    const made = book.enroll('m-bob', 'x', { address: '100.64.0.9' })
    if (made === 'cheio') throw new Error('full')
    const record = book.liveRecord(made.id)
    if (record === undefined) throw new Error('not live')
    const { connection, handlerCalls } = rig()
    const { dispatch } = createPairedDispatch({ connection: () => connection, book })
    now += 8 * 24 * 3_600_000
    expect((await dispatch(req('/api/a'), record)).status).toBe(401)
    expect(handlerCalls.count).toBe(0)
  })

  it('dispose() disposes every Peer (the host is closing), and a failing disposal does not stop the others', async () => {
    const { book, connection, peers } = rig()
    const one = device(book)
    const two = device(book)
    const { dispatch, dispose } = createPairedDispatch({ connection: () => connection, book })
    await dispatch(req('/api/a'), one)
    await dispatch(req('/api/a'), two)
    if (peers[0] !== undefined) peers[0].dispose = () => Promise.reject(new Error('boom'))
    await dispose()
    expect(peers[1]?.disposed).toBe(1)
  })
})

describe('peerFor (the stream door uses the SAME Peer as the unary calls)', () => {
  it('is the Peer of that device: the one `dispatch` uses, made once, with the `paired` principal', async () => {
    const { book, connection, peers } = rig()
    const record = device(book)
    const { dispatch, peerFor } = createPairedDispatch({ connection: () => connection, book })
    await dispatch(req('/api/a'), record)
    const peer = peerFor(record) as Fake
    expect(peer).toBe(peers[0])
    expect(peer.principal).toEqual({ kind: 'paired', deviceId: record.id })
    expect(peerFor(record)).toBe(peer)
    expect(peers).toHaveLength(1)
  })

  it('makes the Peer when nothing was dispatched yet, and gives none when the host has no connection or the device is no longer live', () => {
    const { book, connection, peers } = rig()
    const record = device(book)
    const live = createPairedDispatch({ connection: () => connection, book })
    expect(live.peerFor(record)).toBe(peers[0])
    const without = createPairedDispatch({ connection: () => undefined, book })
    expect(without.peerFor(record)).toBeUndefined()
    book.revoke(record.id)
    expect(live.peerFor(record), 'revoked: no Peer, whatever was kept').toBeUndefined()
  })

  it('a Peer whose signal aborted is replaced by a new one', () => {
    const { book, connection, peers } = rig()
    const record = device(book)
    const { peerFor } = createPairedDispatch({ connection: () => connection, book })
    const first = peerFor(record) as Fake
    first.abort()
    const second = peerFor(record)
    expect(second).not.toBe(first)
    expect(peers).toHaveLength(2)
  })
})
