import { request } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DeviceBook } from '../src/remote-web/device-book.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'
import { PairRequests } from '../src/remote-web/pair-requests.ts'
import { DEVICE_COOKIE, MAX_RPC_INFLIGHT, REMOTE_HEADER, RemoteGate, type DeviceMember } from '../src/remote-web/remote-gate.ts'
import type { PairedStreams, StreamAnswer } from '../src/remote-web/remote-stream.ts'

/**
 * M5 (Keel 20:09, c): `POST /remote/rpc` on the real gate: the phone's stream door (`stream-open` / `stream-next` / `stream-cancel`). The fence is the one of every write (a paired device and the `x-persona-remote`
 * header), the ops go to the stream table of the DEVICE the cookie names and nothing else, and what the table answers is what the phone reads (status and JSON).
 */
const TAILNET = '127.0.0.2'
const ANA: DeviceMember = { workspace: { id: 'ws1', name: 'Padaria Lua' }, member: { id: 'm-ana', name: 'Ana', role: 'owner' } }

interface Answer { readonly status: number; readonly headers: Record<string, string | string[] | undefined>; readonly body: string }
const call = (port: number, input: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<Answer> => new Promise((resolve, reject) => {
  const req = request({ host: TAILNET, port, path: input.path, method: input.method ?? 'POST', agent: false, headers: { host: `${TAILNET}:${String(port)}`, ...(input.headers ?? {}) } }, (res) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => { resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }) })
  })
  req.on('error', reject)
  req.end(input.body)
})

let now = 1_800_000_000_000
let book: DeviceBook
let pairing: DevicePairing
let requests: PairRequests
let gate: RemoteGate
let seen: { readonly op: string; readonly device: string; readonly request: unknown; readonly signal?: AbortSignal }[]
let nextAnswer: (signal: AbortSignal) => Promise<StreamAnswer>

const streams: PairedStreams = {
  open: (device, request, signal) => { seen.push({ op: 'open', device: device.id, request, signal }); return Promise.resolve({ status: 200, body: { opened: true } }) },
  next: (device, id, signal) => { seen.push({ op: 'next', device: device.id, request: id, signal }); return nextAnswer(signal) },
  cancel: (device, id) => { seen.push({ op: 'cancel', device: device.id, request: id }); return { status: 200, body: {} } },
  sweep: () => undefined,
  dispose: () => Promise.resolve(),
}

const make = (withStreams: boolean): RemoteGate => new RemoteGate({
  book, pairing, requests, hostLabel: 'PC', memberOf: (id: string) => (id === 'm-ana' ? ANA : undefined),
  allowAddress: (address: string) => address === TAILNET, allowRemote: () => true, now: () => now, whois: () => Promise.resolve({ node: 'n', login: 'ana@example.com' }), selfLogin: () => Promise.resolve(undefined), audit: () => undefined,
  ...(withStreams ? { streams } : {}),
})

/** The whole flow: the owner opens a code, the phone types it, the owner approves on the PC, the phone collects the cookie. */
const enroll = async (port: number): Promise<{ id: string; cookie: string }> => {
  const typed = await call(port, { path: '/remote/pair', headers: { [REMOTE_HEADER]: '1', 'content-type': 'application/json' }, body: JSON.stringify({ code: pairing.issue('m-ana').code, label: 'Pixel da Ana' }) })
  const { requestId, pollToken } = JSON.parse(typed.body) as { requestId: string; pollToken: string }
  expect(requests.approve(requestId)).toBe(true)
  const status = await call(port, { method: 'GET', path: '/remote/pair/status', headers: { 'x-persona-poll': pollToken } })
  const raw = status.headers['set-cookie']
  const cookie = ((Array.isArray(raw) ? raw[0] : raw) ?? '').split(';')[0] ?? ''
  const id = cookie.slice(`${DEVICE_COOKIE}=`.length).split('.')[0] ?? ''
  return { id, cookie }
}
const rpc = (port: number, cookie: string | undefined, body: unknown, fence = true): Promise<Answer> =>
  call(port, { path: '/remote/rpc', headers: { ...(cookie === undefined ? {} : { cookie }), ...(fence ? { [REMOTE_HEADER]: '1' } : {}), 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

beforeEach(() => {
  now = 1_800_000_000_000
  book = new DeviceBook(undefined, () => now)
  pairing = new DevicePairing(memoryPairStore(), () => now)
  requests = new PairRequests(book, () => now)
  seen = []
  nextAnswer = () => Promise.resolve({ status: 200, body: { values: ['a'] } })
})
afterEach(async () => { await gate.close() })

describe('the fence', () => {
  it('no session is 401, no `x-persona-remote` header is 403, no stream table is 404, and GET is not a route', async () => {
    gate = make(true)
    const port = await gate.listen(TAILNET, 0)
    const { cookie } = await enroll(port)
    expect((await rpc(port, undefined, { op: 'stream-next', id: 1 })).status).toBe(401)
    expect((await rpc(port, cookie, { op: 'stream-next', id: 1 }, false)).status).toBe(403)
    expect((await call(port, { method: 'GET', path: '/remote/rpc', headers: { cookie } })).status).toBe(404)
    expect(seen, 'nothing reached the table').toEqual([])
    await gate.close()
    gate = make(false)
    const bare = await gate.listen(TAILNET, 0)
    expect((await rpc(bare, cookie, { op: 'stream-next', id: 1 })).status, 'without a stream table the door does not exist').toBe(404)
  })

  it('a revoked device is 401 and reaches nothing', async () => {
    gate = make(true)
    const port = await gate.listen(TAILNET, 0)
    const { id, cookie } = await enroll(port)
    book.revoke(id)
    expect((await rpc(port, cookie, { op: 'stream-open', id: 1, endpoint: 'e', payload: null })).status).toBe(401)
    expect(seen).toEqual([])
  })
})

describe('the ops go to the stream table of the device the cookie names', () => {
  it('open, next and cancel arrive with the device and the fields, and what the table answers is what the phone reads', async () => {
    gate = make(true)
    const port = await gate.listen(TAILNET, 0)
    const { id, cookie } = await enroll(port)
    const opened = await rpc(port, cookie, { op: 'stream-open', id: 5, endpoint: 'followMessages', payload: { channelId: 'c1' } })
    expect(opened.status).toBe(200)
    expect(JSON.parse(opened.body)).toEqual({ opened: true })
    expect(String(opened.headers['content-type'])).toContain('application/json')
    expect(JSON.parse((await rpc(port, cookie, { op: 'stream-next', id: 5 })).body)).toEqual({ values: ['a'] })
    expect(JSON.parse((await rpc(port, cookie, { op: 'stream-cancel', id: 5 })).body)).toEqual({})
    expect(seen.map(item => [item.op, item.device, item.request])).toEqual([
      ['open', id, { id: 5, endpoint: 'followMessages', payload: { channelId: 'c1' } }], ['next', id, 5], ['cancel', id, 5],
    ])
  })

  it('a status the table gives is the status the phone gets (404 stream-not-found makes the page re-open; 204 is an empty answer)', async () => {
    gate = make(true)
    const port = await gate.listen(TAILNET, 0)
    const { cookie } = await enroll(port)
    nextAnswer = () => Promise.resolve({ status: 404, body: { error: 'stream-not-found' } })
    const gone = await rpc(port, cookie, { op: 'stream-next', id: 9 })
    expect([gone.status, JSON.parse(gone.body)]).toEqual([404, { error: 'stream-not-found' }])
    nextAnswer = () => Promise.resolve({ status: 204, body: null })
    const empty = await rpc(port, cookie, { op: 'stream-next', id: 9 })
    expect([empty.status, empty.body]).toEqual([204, ''])
  })

  it('a malformed call is 400 before the table: not JSON, not an object, an op nobody knows, ids and endpoints of the wrong type; a big body is 413', async () => {
    gate = make(true)
    const port = await gate.listen(TAILNET, 0)
    const { cookie } = await enroll(port)
    for (const bad of ['{nope', '[]', '"x"', 'null', { op: 'call', path: '/api/x' }, { op: 'stream-next' }, { op: 'stream-next', id: 'a' }, { op: 'stream-open', id: 1 }, { op: 'stream-open', id: 1, endpoint: 5 }, { op: 'stream-cancel', id: 1.5 }]) {
      expect((await rpc(port, cookie, bad)).status, JSON.stringify(bad)).toBe(400)
    }
    expect((await rpc(port, cookie, JSON.stringify({ op: 'stream-open', id: 1, endpoint: 'e', payload: 'x'.repeat(70_000) }))).status).toBe(413)
    expect(seen).toEqual([])
  })
})

describe('a poll lives as long as the page does', () => {
  it('a page that goes away in the middle of a poll aborts it (the table keeps what the stream had pulled)', async () => {
    gate = make(true)
    const port = await gate.listen(TAILNET, 0)
    const { cookie } = await enroll(port)
    let aborted = false
    nextAnswer = signal => new Promise<StreamAnswer>((resolve) => { signal.addEventListener('abort', () => { aborted = true; resolve({ status: 204, body: null }) }, { once: true }) })
    const req = request({ host: TAILNET, port, path: '/remote/rpc', method: 'POST', agent: false, headers: { host: `${TAILNET}:${String(port)}`, cookie, [REMOTE_HEADER]: '1' } })
    req.on('error', () => undefined)
    req.end(JSON.stringify({ op: 'stream-next', id: 1 }))
    await new Promise<void>((resolve) => { const t = setInterval(() => { if (seen.length > 0) { clearInterval(t); resolve() } }, 5) })
    req.destroy()
    await new Promise<void>((resolve) => { const t = setInterval(() => { if (aborted) { clearInterval(t); resolve() } }, 5) })
    expect(aborted).toBe(true)
  })

  it('a device has a limit of calls in flight (many polls at once are legitimate, a flood is not): the one past it is 429 with a Retry-After', async () => {
    gate = make(true)
    const port = await gate.listen(TAILNET, 0)
    const { cookie } = await enroll(port)
    const hung: ReturnType<typeof request>[] = []
    nextAnswer = signal => new Promise<StreamAnswer>((resolve) => { signal.addEventListener('abort', () => { resolve({ status: 204, body: null }) }, { once: true }) })
    for (let n = 0; n < MAX_RPC_INFLIGHT; n += 1) {
      const req = request({ host: TAILNET, port, path: '/remote/rpc', method: 'POST', agent: false, headers: { host: `${TAILNET}:${String(port)}`, cookie, [REMOTE_HEADER]: '1' } })
      req.on('error', () => undefined)
      req.end(JSON.stringify({ op: 'stream-next', id: n + 1 }))
      hung.push(req)
    }
    await new Promise<void>((resolve) => { const t = setInterval(() => { if (seen.length >= MAX_RPC_INFLIGHT) { clearInterval(t); resolve() } }, 5) })
    const over = await rpc(port, cookie, { op: 'stream-next', id: 99 })
    for (const req of hung) req.destroy()
    expect(over.status).toBe(429)
    expect(over.headers['retry-after']).toBe('1')
  })
})
