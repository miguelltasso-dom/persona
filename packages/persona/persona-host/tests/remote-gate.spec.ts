import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVICE_IDLE_MS, DeviceBook, type DeviceRecord } from '../src/remote-web/device-book.ts'
import { DevicePairing, memoryPairStore, PAIR_ADDRESS_MAX } from '../src/remote-web/pair-guard.ts'
// (the gate fixture below passes whois / selfLogin / audit so no test ever starts the tailscale CLI)
import { PairRequests } from '../src/remote-web/pair-requests.ts'
import type { TailnetIdentity } from '../src/remote-web/tailnet-identity.ts'
import {
  ANON_RATE_MAX, DEVICE_COOKIE, MAX_CONN_PER_ADDRESS, MAX_INFLIGHT_PER_DEVICE, PAIR_BODY_MAX, POLL_HEADER, REMOTE_CSP, REMOTE_HEADER, RemoteGate, type DeviceMember, type GateAuditEvent, type RemoteGateDeps,
} from '../src/remote-web/remote-gate.ts'

/**
 * M5: the remote gate on REAL sockets. The CI has no Tailscale, so a loopback alias (127.0.0.2) stands in for the tailnet address; what is proved is the shape that matters: the gate is bound to ONE
 * address (127.0.0.1 on the same port is refused), behind the fence (421 for a wrong Host), with pairing that ends in the OWNER's approval before any session, and a paired device for everything else.
 */
const TAILNET = '127.0.0.2'
const ANA: DeviceMember = { workspace: { id: 'ws1', name: 'Padaria Lua' }, member: { id: 'm-ana', name: 'Ana', role: 'owner' } }
const members = new Map<string, DeviceMember>([['m-ana', ANA]])

interface Answer { readonly status: number; readonly headers: Record<string, string | string[] | undefined>; readonly body: string }
interface Call { readonly method?: string; readonly path: string; readonly headers?: Record<string, string>; readonly body?: string; readonly host?: string; readonly from?: string }

let gate: RemoteGate
let book: DeviceBook
let pairing: DevicePairing
let requests: PairRequests
let dispatched: { readonly url: string; readonly method: string; readonly memberId: string; readonly cookie: string | null; readonly headers: string[] }[]
let audited: GateAuditEvent[]
let identity: TailnetIdentity | undefined
let ownLogin: string | undefined
let dist: string | undefined
let now = 1_800_000_000_000

/** A test may name a dependency as `undefined` to take it away (the gate then runs without it). */
type DepsOver = { [K in keyof RemoteGateDeps]?: RemoteGateDeps[K] | undefined }
const withOver = (base: RemoteGateDeps, over: DepsOver): RemoteGateDeps => {
  const merged: Record<string, unknown> = { ...base, ...over }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  return merged as unknown as RemoteGateDeps
}
const deps = (over: DepsOver = {}): RemoteGateDeps => withOver({
  book, pairing, requests, hostLabel: 'PC da padaria', memberOf: id => members.get(id),
  allowAddress: address => address === TAILNET, allowRemote: () => true, now: () => now,
  whois: () => Promise.resolve(identity), selfLogin: () => Promise.resolve(ownLogin), audit: event => audited.push(event),
  ...(dist === undefined ? {} : { distDir: dist }),
  dispatch: (req: Request, device: DeviceRecord) => {
    dispatched.push({ url: new URL(req.url).pathname, method: req.method, memberId: device.memberId, cookie: req.headers.get('cookie'), headers: [...req.headers.keys()] })
    return Promise.resolve(new Response(JSON.stringify({ echo: new URL(req.url).pathname, memberId: device.memberId }), {
      status: 200, headers: { 'content-type': 'application/json', 'x-from-gateway': '1', 'x-internal-debug': 'host-secret', 'set-cookie': 'persona-session=OWNER-COOKIE; Path=/; HttpOnly' },
    }))
  },
}, over)

const call = (port: number, input: Call): Promise<Answer> => new Promise((resolve, reject) => {
  const req = request({
    host: TAILNET, port, path: input.path, method: input.method ?? 'GET', agent: false, ...(input.from === undefined ? {} : { localAddress: input.from }),
    headers: { host: input.host ?? `${TAILNET}:${String(port)}`, ...(input.headers ?? {}) },
  }, (res) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => { resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }) })
  })
  req.on('error', reject)
  req.end(input.body)
})

const pairOn = (port: number, code: string, label = 'Pixel da Ana', from?: string): Promise<Answer> =>
  call(port, { method: 'POST', path: '/remote/pair', headers: { [REMOTE_HEADER]: '1', 'content-type': 'application/json' }, body: JSON.stringify({ code, label }), ...(from === undefined ? {} : { from }) })
const statusOn = (port: number, pollToken: string): Promise<Answer> => call(port, { path: '/remote/pair/status', headers: { [POLL_HEADER]: pollToken } })
const cookieOf = (answer: Answer): string => {
  const raw = answer.headers['set-cookie']
  return ((Array.isArray(raw) ? raw[0] : raw) ?? '').split(';')[0] ?? ''
}
/** The whole flow: the owner opens a code, the phone types it, the owner approves on the PC, the phone collects the cookie. */
const pairFully = async (port: number, member = 'm-ana'): Promise<string> => {
  const typed = await pairOn(port, pairing.issue(member).code)
  const { requestId, pollToken } = JSON.parse(typed.body) as { requestId: string; pollToken: string }
  expect(requests.approve(requestId)).toBe(true)
  return cookieOf(await statusOn(port, pollToken))
}

beforeEach(() => {
  now = 1_800_000_000_000
  book = new DeviceBook(undefined, () => now)
  pairing = new DevicePairing(memoryPairStore(), () => now)
  requests = new PairRequests(book, () => now)
  dispatched = []
  audited = []
  identity = undefined
  ownLogin = undefined
  gate = new RemoteGate(deps())
})
afterEach(async () => { await gate.close(); if (dist !== undefined) { rmSync(dist, { recursive: true, force: true }); dist = undefined } })

describe('the gate listens on the tailnet address and NOWHERE else', () => {
  it('the production rule refuses a wildcard, loopback and a LAN address BEFORE any socket exists', async () => {
    const strict = new RemoteGate({ book, pairing, requests, hostLabel: 'x', memberOf: () => undefined })
    for (const address of ['0.0.0.0', '::', '127.0.0.1', '192.168.0.10', '10.0.0.4', '']) await expect(strict.listen(address, 0), address).rejects.toThrow(/tailnet address/u)
    expect(strict.port).toBe(0)
  })

  it('bound to ONE address: the same port on 127.0.0.1 is refused, on the chosen address it answers', async () => {
    const port = await gate.listen(TAILNET, 0)
    expect((await call(port, { path: '/remote/me' })).status).toBe(200)
    await expect(new Promise((resolve, reject) => { const socket = connect({ host: '127.0.0.1', port }, () => { socket.destroy(); resolve('connected') }); socket.on('error', reject) })).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })

  it('close() frees the port and drops live connections; it cannot listen twice', async () => {
    const port = await gate.listen(TAILNET, 0)
    await expect(gate.listen(TAILNET, 0)).rejects.toThrow(/already listening/u)
    await gate.close()
    await expect(call(port, { path: '/remote/me' })).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })
})

describe('defence in depth on the connection', () => {
  it('a REMOTE address outside the tailnet is closed with no answer (the production rule: a loopback client is not a tailnet one)', async () => {
    const strict = new RemoteGate(deps({ allowRemote: undefined }))
    const port = await strict.listen(TAILNET, 0)
    try { await expect(call(port, { path: '/remote/me' })).rejects.toThrow() } finally { await strict.close() }
  })

  it('connections per address are capped (the one past the cap is closed)', async () => {
    const port = await gate.listen(TAILNET, 0)
    const sockets = Array.from({ length: MAX_CONN_PER_ADDRESS + 1 }, () => connect({ host: TAILNET, port }))
    const closed = new Set<number>()
    sockets.forEach((socket, index) => { socket.on('close', () => closed.add(index)); socket.on('error', () => undefined) })
    await new Promise<void>((resolve) => { setTimeout(resolve, 400) })
    sockets.forEach((socket) => { socket.destroy() })
    expect(closed.size).toBeGreaterThanOrEqual(1)
  })
})

describe('the fence (Host, Origin, cross-site fetch) and the headers of every answer', () => {
  it('a Host that is not this address and port is 421 (DNS rebinding); a declared name is accepted', async () => {
    const port = await gate.listen(TAILNET, 0)
    for (const host of ['evil.example.com', `${TAILNET}:${String(port + 1)}`, 'localhost', `${TAILNET}`, '[::1]:80']) expect((await call(port, { path: '/remote/me', host })).status, host).toBe(421)
    const named = new RemoteGate(deps({ trustedHosts: ['pc-padaria.tail1234.ts.net'] }))
    try {
      const namedPort = await named.listen(TAILNET, 0)
      expect((await call(namedPort, { path: '/remote/me', host: 'pc-padaria.tail1234.ts.net' })).status).toBe(200)
    } finally { await named.close() }
  })

  it('an Origin of another site, and a cross-site fetch, are 403; the same origin passes', async () => {
    const port = await gate.listen(TAILNET, 0)
    const here = `http://${TAILNET}:${String(port)}`
    expect((await call(port, { path: '/remote/me', headers: { origin: 'http://evil.example.com' } })).status).toBe(403)
    expect((await call(port, { path: '/remote/me', headers: { origin: 'not a url' } })).status).toBe(403)
    expect((await call(port, { path: '/remote/me', headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await call(port, { path: '/remote/me', headers: { origin: here, 'sec-fetch-site': 'same-origin' } })).status).toBe(200)
  })

  it('every answer — JSON, refusal, 404, the Gateway\'s own — carries the strict CSP, nosniff and no-referrer', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    const answers = [
      await call(port, { path: '/remote/me' }),
      await call(port, { path: '/api/x' }), // 401
      await call(port, { path: '/remote/me', host: 'evil' }), // 421
      await call(port, { path: '/api/persona/listChannels', headers: { cookie } }), // the Gateway's answer
      await call(port, { path: '/nada.js' }), // 404 (no bundle)
    ]
    for (const answer of answers) {
      expect(answer.headers['content-security-policy'], String(answer.status)).toBe(REMOTE_CSP)
      expect(answer.headers['x-content-type-options']).toBe('nosniff')
      expect(answer.headers['referrer-policy']).toBe('no-referrer')
    }
    expect(REMOTE_CSP).not.toMatch(/unsafe-eval|unsafe-inline|\*/u)
    expect(REMOTE_CSP).toContain("connect-src 'self'")
    expect(answers[3]?.headers['content-type']).toContain('application/json') // what the client needs still passes (the allow-list, not a blanket copy: see relay-strips-set-cookie)
  })

  it('a secret in the URL is refused, whatever the route (history, referers and logs)', async () => {
    const port = await gate.listen(TAILNET, 0)
    for (const path of ['/remote/me?token=abc', '/?code=ABCD-EFGH', '/remote/pair/status?poll=xyz', `/assets/app.js?${DEVICE_COOKIE}=1.2`, '/api/x?secret=1']) expect((await call(port, { path })).status, path).toBe(400)
    expect((await call(port, { path: '/remote/me?lang=pt' })).status).toBe(200) // an ordinary query is fine
  })
})

describe('pairing: a right code is a REQUEST, the owner approves on the PC, and only then there is a session', () => {
  it('GET /remote/me with no cookie is the pairing screen\'s truth: tailnet, this PC, not paired', async () => {
    const port = await gate.listen(TAILNET, 0)
    const answer = await call(port, { path: '/remote/me' })
    expect(JSON.parse(answer.body)).toEqual({ kind: 'tailnet', hostLabel: 'PC da padaria', paired: false })
    expect(answer.headers['cache-control']).toBe('no-store')
  })

  it('the right code gives 202 and NO cookie; the PC sees who asks; the phone waits; the owner approves; then the phone gets the cookie ONCE', async () => {
    const port = await gate.listen(TAILNET, 0)
    const { code } = pairing.issue('m-ana')
    const typed = await pairOn(port, code, '  Pixel da Ana  ')
    expect(typed.status).toBe(202)
    expect(typed.headers['set-cookie']).toBeUndefined()
    const body = JSON.parse(typed.body) as { ok: boolean; state: string; requestId: string; pollToken: string }
    expect(body).toMatchObject({ ok: true, state: 'esperando-o-dono' })
    expect((await call(port, { path: '/remote/me' })).body).toContain('"paired":false') // still no session
    expect((await call(port, { path: '/api/x' })).status).toBe(401)
    expect(requests.list()).toEqual([expect.objectContaining({ requestId: body.requestId, memberId: 'm-ana', label: 'Pixel da Ana', address: expect.any(String) })])
    expect(JSON.parse((await statusOn(port, body.pollToken)).body)).toEqual({ ok: true, state: 'esperando-o-dono' })

    expect(requests.approve(body.requestId)).toBe(true)
    const done = await statusOn(port, body.pollToken)
    expect(done.status).toBe(200)
    const parsed = JSON.parse(done.body) as { state: string; member: { id: string }; device: { id: string; label: string } }
    expect(parsed).toMatchObject({ ok: true, state: 'aprovado', workspace: ANA.workspace, member: ANA.member, device: { label: 'Pixel da Ana' } })
    const raw = done.headers['set-cookie']
    const line = (Array.isArray(raw) ? raw[0] : raw) ?? ''
    expect(line).toMatch(new RegExp(`^${DEVICE_COOKIE}=${parsed.device.id}\\.[0-9a-f]{64}; HttpOnly; SameSite=Strict; Path=/; Max-Age=\\d+$`, 'u'))
    expect(done.body).not.toMatch(/[0-9a-f]{64}/u) // the secret travels in the cookie only
    expect(JSON.parse((await call(port, { path: '/remote/me', headers: { cookie: cookieOf(done) } })).body)).toMatchObject({ paired: true, member: { id: 'm-ana' } })
    expect((await statusOn(port, body.pollToken)).status).toBe(404) // the cookie left once
  })

  it('a refusal (or no answer) from the owner means NO session, ever', async () => {
    const port = await gate.listen(TAILNET, 0)
    const typed = JSON.parse((await pairOn(port, pairing.issue('m-ana').code)).body) as { requestId: string; pollToken: string }
    requests.reject(typed.requestId)
    const refused = await statusOn(port, typed.pollToken)
    expect(JSON.parse(refused.body)).toEqual({ ok: false, state: 'recusado' })
    expect(refused.headers['set-cookie']).toBeUndefined()
    expect(book.list()).toHaveLength(0)

    const second = JSON.parse((await pairOn(port, pairing.issue('m-ana').code)).body) as { requestId: string; pollToken: string }
    now += 3 * 60_000 // the owner never answered
    const expired = await statusOn(port, second.pollToken)
    expect(expired.headers['set-cookie']).toBeUndefined()
    expect(book.list()).toHaveLength(0)
  })

  it('a POST without the remote header is refused (a cross-site form cannot set it), and the body is capped', async () => {
    const port = await gate.listen(TAILNET, 0)
    const { code } = pairing.issue('m-ana')
    expect((await call(port, { method: 'POST', path: '/remote/pair', body: JSON.stringify({ code }) })).status).toBe(403)
    expect((await call(port, { method: 'POST', path: '/remote/pair', headers: { [REMOTE_HEADER]: '1' }, body: JSON.stringify({ code, pad: 'x'.repeat(PAIR_BODY_MAX) }) })).status).toBe(413)
    expect((await pairOn(port, code)).status).toBe(202) // the code survived the refused attempts
  })

  it('wrong, expired and malformed answers are all "recusado" (403): the route is no oracle of the code', async () => {
    const port = await gate.listen(TAILNET, 0)
    pairing.issue('m-ana')
    const wrong = await pairOn(port, 'AAAA-BBBB')
    expect([wrong.status, JSON.parse(wrong.body)]).toEqual([403, { ok: false, reason: 'recusado' }])
    const junk = await call(port, { method: 'POST', path: '/remote/pair', headers: { [REMOTE_HEADER]: '1' }, body: '{not json' })
    expect([junk.status, JSON.parse(junk.body)]).toEqual([403, { ok: false, reason: 'recusado' }])
  })

  it('five wrong tries lock THAT address (429 + Retry-After), and the owner\'s open code still works from another address (Lumen: no DoS by a malicious node)', async () => {
    const port = await gate.listen(TAILNET, 0)
    const { code } = pairing.issue('m-ana')
    for (let miss = 0; miss < PAIR_ADDRESS_MAX; miss += 1) await pairOn(port, `ZZZZ-${String(2000 + miss)}`, 'x', '127.0.0.3')
    const locked = await pairOn(port, code, 'x', '127.0.0.3') // even the RIGHT code, from the address that kept erring
    expect([locked.status, JSON.parse(locked.body)]).toEqual([429, { ok: false, reason: 'bloqueado' }])
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0)
    expect((await pairOn(port, code, 'Pixel', '127.0.0.4')).status).toBe(202) // the owner's phone is not affected
  })

  it('anonymous requests that are not files are rate-limited (429 + Retry-After), per address, and the window slides', async () => {
    const port = await gate.listen(TAILNET, 0)
    let limited = 0
    let last: Answer | undefined
    for (let index = 0; index < ANON_RATE_MAX + 5; index += 1) { const answer = await call(port, { path: '/remote/me' }); if (answer.status === 429) { limited += 1; last = answer } }
    expect(limited).toBe(5)
    expect(last?.headers['retry-after']).toBeDefined()
    now += 11_000
    expect((await call(port, { path: '/remote/me' })).status).toBe(200)
  })

  it('a device whose member is gone is not paired any more', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    members.delete('m-ana')
    try {
      expect(JSON.parse((await call(port, { path: '/remote/me', headers: { cookie } })).body)).toMatchObject({ paired: false })
      expect((await call(port, { path: '/api/x', headers: { cookie } })).status).toBe(401)
    } finally { members.set('m-ana', ANA) }
  })
})

describe('a paired device, and only a paired device, reaches the Gateway', () => {
  it('no cookie / a forged cookie / another secret = 401 and the Gateway is never asked', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    const [name, value] = cookie.split('=') as [string, string]
    const id = value.split('.')[0] as string
    for (const headers of [{}, { cookie: `${name}=${id}.${'0'.repeat(64)}` }, { cookie: `${name}=garbage` }, { cookie: `${name}=.${value}` }, { cookie: `other=${value}` }]) {
      expect((await call(port, { path: '/api/persona/listChannels', headers })).status, JSON.stringify(headers)).toBe(401)
    }
    expect(dispatched).toEqual([])
  })

  it('with the cookie the request goes to the Gateway AS THAT DEVICE\'S MEMBER; the device secret goes no further than this door', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    const answer = await call(port, { path: '/api/persona/listChannels', headers: { cookie } })
    expect(answer.status).toBe(200)
    expect(JSON.parse(answer.body)).toEqual({ echo: '/api/persona/listChannels', memberId: 'm-ana' })
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]?.cookie).toBeNull()
    const spoof = await call(port, { path: '/api/persona/listChannels', headers: { cookie, 'x-member-id': 'm-owner', 'x-actor-id': 'm-owner' } })
    expect(JSON.parse(spoof.body).memberId).toBe('m-ana') // who the device is comes from the book, never from the wire
  })

  it('a state-changing request needs the remote header', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    expect((await call(port, { method: 'POST', path: '/api/persona/postMessage', headers: { cookie }, body: '{}' })).status).toBe(403)
    expect((await call(port, { method: 'POST', path: '/api/persona/postMessage', headers: { cookie, [REMOTE_HEADER]: '1' }, body: '{}' })).status).toBe(200)
    expect(dispatched.at(-1)).toMatchObject({ method: 'POST', memberId: 'm-ana' })
  })

  const streamingGate = (): RemoteGate => new RemoteGate(deps({
    dispatch: () => Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('first\n')) }, cancel() { cancelled = true } }), { status: 200 })),
  }))
  let cancelled = false
  const follow = (port: number, cookie: string): Promise<string> => new Promise<string>((resolve) => {
    const req = request({ host: TAILNET, port, path: '/api/follow', agent: false, headers: { host: `${TAILNET}:${String(port)}`, cookie } }, (res) => {
      let seen = ''
      res.on('data', (chunk: Buffer) => { seen += chunk.toString('utf8') })
      res.on('close', () => { resolve(seen) })
      res.on('error', () => { resolve(seen) })
    })
    req.on('error', () => { resolve('error') })
    req.end()
  })

  it('revoked from the PC: a stream still open is cut within a second and the Gateway side is told to stop; the next request is 401', async () => {
    cancelled = false
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    const open = streamingGate()
    const openPort = await open.listen(TAILNET, 0)
    try {
      const closed = follow(openPort, cookie)
      await new Promise<void>((resolve) => { setTimeout(resolve, 150) })
      const started = Date.now()
      book.revoke(book.list()[0]?.id ?? '')
      const seen = await closed
      expect(Date.now() - started).toBeLessThan(1_000)
      expect(seen).toContain('first')
      await vi.waitFor(() => { expect(cancelled).toBe(true) }, { timeout: 1_000 })
    } finally { await open.close() }
    expect((await call(port, { path: '/api/x', headers: { cookie } })).status).toBe(401)
    expect(JSON.parse((await call(port, { path: '/remote/me', headers: { cookie } })).body)).toMatchObject({ paired: false })
  })

  it('the gate re-checks the device EVERY SECOND for sockets it keeps open: expired (not revoked through the listener) is cut too', async () => {
    cancelled = false
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    const open = streamingGate()
    const openPort = await open.listen(TAILNET, 0)
    try {
      const closed = follow(openPort, cookie)
      await new Promise<void>((resolve) => { setTimeout(resolve, 150) })
      now += DEVICE_IDLE_MS + 1 // the device is now idle for too long: no revoke event fires
      const started = Date.now()
      await closed
      expect(Date.now() - started).toBeLessThan(2_500)
    } finally { await open.close() }
  })

  it('POST /remote/leave forgets this device (the cookie is cleared and the device is cut off)', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    expect((await call(port, { method: 'POST', path: '/remote/leave', headers: { cookie } })).status).toBe(403) // header required
    const left = await call(port, { method: 'POST', path: '/remote/leave', headers: { cookie, [REMOTE_HEADER]: '1' } })
    expect(left.status).toBe(200)
    expect(String(left.headers['set-cookie'])).toContain('Max-Age=0')
    expect((await call(port, { path: '/api/x', headers: { cookie } })).status).toBe(401)
  })

  it('without a dispatcher nothing past the cookie is served (404), even for a paired device', async () => {
    const bare = new RemoteGate(deps({ dispatch: undefined }))
    const port = await bare.listen(TAILNET, 0)
    try {
      const cookie = await pairFully(port)
      expect((await call(port, { path: '/api/x', headers: { cookie } })).status).toBe(404)
    } finally { await bare.close() }
  })
})

describe('Lumen R2: the gate relays ONLY /api/*, and only an allow-list of headers goes in and comes back (never a cookie)', () => {
  const apiPost = (port: number, path: string, headers: Record<string, string>): Promise<Answer> => call(port, { method: 'POST', path, headers: { [REMOTE_HEADER]: '1', 'content-type': 'application/json', ...headers }, body: '{}' })

  it('relay-only-api-paths: a path that is not /api never reaches the Gateway (404), even for a paired device; /api does (the control)', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    for (const [method, path] of [['POST', '/remote/admin'], ['PUT', '/qualquer-coisa'], ['POST', '/internal/launch'], ['POST', '/apix'], ['DELETE', '/'], ['POST', '/remote/pairs']] as const) {
      const answer = await call(port, { method, path, headers: { cookie, [REMOTE_HEADER]: '1' }, body: '{}' })
      expect(answer.status, `${method} ${path}`).toBe(404)
    }
    expect(dispatched).toEqual([])
    expect((await apiPost(port, '/api/ping', { cookie })).status).toBe(200)
    expect((await apiPost(port, '/api', { cookie })).status).toBe(200)
    expect(dispatched.map(item => item.url)).toEqual(['/api/ping', '/api'])
  })

  it('relay-strips-set-cookie: nothing the Gateway sets as a cookie, and no internal header, reaches the phone; the content type does', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    const answer = await apiPost(port, '/api/ping', { cookie })
    expect(answer.headers['set-cookie']).toBeUndefined() // the owner's session cookie never goes to a phone
    expect(answer.headers['x-internal-debug']).toBeUndefined()
    expect(answer.headers['x-from-gateway']).toBeUndefined()
    expect(answer.headers['content-type']).toContain('application/json')
    expect(JSON.stringify(answer.headers)).not.toMatch(/OWNER-COOKIE|host-secret/u)
  })

  it('only an allow-list of REQUEST headers goes to the Gateway: no cookie, no authorization, no forwarded-for, nothing the phone invents', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    await apiPost(port, '/api/ping', { cookie, authorization: 'Bearer x', 'x-forwarded-for': '1.2.3.4', 'x-member-id': 'm-owner', 'x-actor-id': 'm-owner', accept: 'application/json', 'accept-language': 'pt-BR' })
    const sent = dispatched[0]?.headers ?? []
    expect(sent).toEqual(expect.arrayContaining(['content-type', 'accept', REMOTE_HEADER]))
    for (const forbidden of ['cookie', 'authorization', 'x-forwarded-for', 'x-member-id', 'x-actor-id', 'host', 'origin']) expect(sent, forbidden).not.toContain(forbidden)
  })
})

describe('Lumen P1-3: the device is bound to the tailnet identity of the address it paired from', () => {
  it('approval-shows-tailscale-identity: the owner\'s screen gets the address, the node and the login Tailscale says — not only the name the phone gave itself', async () => {
    identity = { node: 'pixel-da-ana', login: 'ana@exemplo.com' }
    const port = await gate.listen(TAILNET, 0)
    await pairOn(port, pairing.issue('m-ana').code, 'Meu celular')
    expect(requests.list()[0]).toMatchObject({ label: 'Meu celular', node: 'pixel-da-ana', login: 'ana@exemplo.com', loginMismatch: false })
    expect(typeof requests.list()[0]?.address).toBe('string')
    expect(audited.find(event => event.kind === 'pair-request')).toMatchObject({ node: 'pixel-da-ana', login: 'ana@exemplo.com' })
  })

  it('an OWNER member whose Tailscale login is not the PC\'s: the request opens flagged, and approving it is refused', async () => {
    identity = { node: 'no-do-vizinho', login: 'vizinho@exemplo.com' }
    ownLogin = 'ana@exemplo.com'
    const port = await gate.listen(TAILNET, 0)
    const typed = JSON.parse((await pairOn(port, pairing.issue('m-ana').code)).body) as { requestId: string }
    expect(requests.list()[0]?.loginMismatch).toBe(true)
    expect(requests.approve(typed.requestId)).toBe(false)
    expect(book.list()).toHaveLength(0)
  })

  it('the same login as the PC\'s is approved normally', async () => {
    identity = { node: 'pixel-da-ana', login: 'ana@exemplo.com' }
    ownLogin = 'ana@exemplo.com'
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    expect(cookie).toContain(DEVICE_COOKIE)
    expect(book.list()[0]).toMatchObject({ node: 'pixel-da-ana', login: 'ana@exemplo.com' })
  })

  it('device-bound-to-address / cookie-from-other-node-refused: the same cookie from ANOTHER address is not paired and reaches nothing', async () => {
    const port = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(port)
    expect(JSON.parse((await call(port, { path: '/remote/me', headers: { cookie } })).body)).toMatchObject({ paired: true }) // from its own address
    for (const from of ['127.0.0.5', '127.0.0.9']) {
      expect(JSON.parse((await call(port, { path: '/remote/me', headers: { cookie }, from })).body), from).toMatchObject({ paired: false })
      expect((await call(port, { path: '/api/persona/listChannels', headers: { cookie }, from })).status, from).toBe(401)
    }
    expect(dispatched).toEqual([])
    expect(audited.some(event => event.kind === 'address-mismatch')).toBe(true)
  })

  it('a device enrolled with NO address is never accepted by the gate (it is not bound to anything)', async () => {
    const port = await gate.listen(TAILNET, 0)
    const free = book.enroll('m-ana', 'sem endereco')
    if (free === 'cheio') throw new Error('book full')
    const cookie = `${DEVICE_COOKIE}=${free.id}.${free.secret}`
    expect((await call(port, { path: '/api/x', headers: { cookie } })).status).toBe(401)
  })
})

describe('Lumen P2/P3: audit, revocation of calls in flight, per-device limits', () => {
  it('the PC\'s Atividade hears about wrong tries, blocks and floods — the address, never the code', async () => {
    const port = await gate.listen(TAILNET, 0)
    const { code } = pairing.issue('m-ana')
    for (let miss = 0; miss < PAIR_ADDRESS_MAX; miss += 1) await pairOn(port, `ZZZZ-${String(2000 + miss)}`, 'x', '127.0.0.3')
    await pairOn(port, code, 'x', '127.0.0.3') // blocked
    await call(port, { method: 'POST', path: '/remote/pair', headers: { [REMOTE_HEADER]: '1' }, body: '{not json', from: '127.0.0.4' })
    const kinds = audited.map(event => event.kind)
    expect(kinds).toEqual(expect.arrayContaining(['pair-wrong', 'pair-blocked', 'pair-malformed']))
    expect(audited.find(event => event.kind === 'pair-blocked')?.retryAfterS).toBeGreaterThan(0)
    expect(audited.every(event => event.address !== '' && event.at > 0)).toBe(true)
    const everything = JSON.stringify(audited)
    expect(everything).not.toContain(code)
    expect(everything).not.toContain(code.replace('-', ''))
    expect(everything).not.toContain('ZZZZ')
  })

  it('a flood of anonymous requests is audited as rate-limited', async () => {
    const port = await gate.listen(TAILNET, 0)
    for (let index = 0; index < ANON_RATE_MAX + 2; index += 1) await call(port, { path: '/remote/me' })
    expect(audited.some(event => event.kind === 'rate-limited')).toBe(true)
  })

  it('a unary call in flight does not outlive the revocation: the Gateway side is told to abort and the phone is cut', async () => {
    let aborted = false
    const hanging = new RemoteGate(deps({
      dispatch: (req: Request) => new Promise<Response>((resolve) => { req.signal.addEventListener('abort', () => { aborted = true; resolve(new Response('late')) }, { once: true }) }),
    }))
    const port = await hanging.listen(TAILNET, 0)
    try {
      const cookie = await pairFully(port)
      const pending = call(port, { method: 'POST', path: '/api/persona/postMessage', headers: { cookie, [REMOTE_HEADER]: '1' }, body: '{}' }).then(() => 'answered', () => 'cut')
      await new Promise<void>((resolve) => { setTimeout(resolve, 200) })
      const started = Date.now()
      book.revoke(book.list()[0]?.id ?? '')
      await vi.waitFor(() => { expect(aborted).toBe(true) }, { timeout: 1_000 })
      expect(Date.now() - started).toBeLessThan(1_000)
      expect(await pending).toBe('cut') // the phone got nothing from the call
    } finally { await hanging.close() }
  })

  it('calls in flight per device are capped (429 + Retry-After); finishing one frees a seat', async () => {
    let release: () => void = () => undefined
    const hold = new Promise<void>((resolve) => { release = resolve })
    const busy = new RemoteGate(deps({ dispatch: async () => { await hold; return new Response('ok') } }))
    const port = await busy.listen(TAILNET, 0)
    try {
      const cookie = await pairFully(port)
      const first = Array.from({ length: MAX_INFLIGHT_PER_DEVICE }, () => call(port, { path: '/api/slow', headers: { cookie } }))
      await new Promise<void>((resolve) => { setTimeout(resolve, 300) })
      const over = await call(port, { path: '/api/slow', headers: { cookie } })
      expect([over.status, over.headers['retry-after']]).toEqual([429, '1'])
      release()
      expect((await Promise.all(first)).map(answer => answer.status)).toEqual(Array.from({ length: MAX_INFLIGHT_PER_DEVICE }, () => 200))
      expect((await call(port, { path: '/api/slow', headers: { cookie } })).status).toBe(200)
    } finally { release(); await busy.close() }
  })
})

describe('M9 "Parar": its own route, always available', () => {
  const stopOn = (port: number, headers: Record<string, string>, body: string): Promise<Answer> => call(port, { method: 'POST', path: '/remote/computer/stop', headers, body })

  it('a paired device stops a run: the host is asked with the DEVICE and the run id, and answers { ok } (idempotent)', async () => {
    const stopped: { runId: string; memberId: string }[] = []
    const stoppable = new RemoteGate(deps({ stopRun: (runId, device) => { stopped.push({ runId, memberId: device.memberId }); return Promise.resolve(true) } }))
    const port = await stoppable.listen(TAILNET, 0)
    try {
      const cookie = await pairFully(port)
      for (let again = 0; again < 2; again += 1) {
        const answer = await stopOn(port, { cookie, [REMOTE_HEADER]: '1' }, JSON.stringify({ runId: 'run-7' }))
        expect([answer.status, JSON.parse(answer.body)]).toEqual([200, { ok: true }])
      }
      expect(stopped).toEqual([{ runId: 'run-7', memberId: 'm-ana' }, { runId: 'run-7', memberId: 'm-ana' }])
      expect(dispatched).toEqual([]) // it never went through the Gateway
    } finally { await stoppable.close() }
  })

  it('stop-works-without-stream / stop-under-300ms: it answers fast even when the device has saturated the Gateway', async () => {
    let release: () => void = () => undefined
    const hold = new Promise<void>((resolve) => { release = resolve })
    const busy = new RemoteGate(deps({ dispatch: async () => { await hold; return new Response('ok') }, stopRun: () => Promise.resolve(true) }))
    const port = await busy.listen(TAILNET, 0)
    try {
      const cookie = await pairFully(port)
      const flood = Array.from({ length: MAX_INFLIGHT_PER_DEVICE }, () => call(port, { path: '/api/slow', headers: { cookie } }))
      await new Promise<void>((resolve) => { setTimeout(resolve, 250) })
      expect((await call(port, { path: '/api/slow', headers: { cookie } })).status).toBe(429) // the Gateway is full for this device
      const started = Date.now()
      const answer = await stopOn(port, { cookie, [REMOTE_HEADER]: '1' }, JSON.stringify({ runId: 'run-7' }))
      expect(answer.status).toBe(200)
      expect(Date.now() - started).toBeLessThan(300)
      release()
      await Promise.all(flood)
    } finally { release(); await busy.close() }
  })

  it('needs a paired device (401), the remote header (403), a body that is a run id (400, 413 when large); a host that refuses is 403; a host that throws is 403', async () => {
    let mode: 'yes' | 'no' | 'throw' = 'yes'
    const stoppable = new RemoteGate(deps({ stopRun: () => (mode === 'throw' ? Promise.reject(new Error('boom')) : Promise.resolve(mode === 'yes')) }))
    const port = await stoppable.listen(TAILNET, 0)
    try {
      const cookie = await pairFully(port)
      expect((await stopOn(port, { [REMOTE_HEADER]: '1' }, '{"runId":"r"}')).status).toBe(401)
      expect((await stopOn(port, { cookie }, '{"runId":"r"}')).status).toBe(403)
      expect((await stopOn(port, { cookie, [REMOTE_HEADER]: '1' }, '{}')).status).toBe(400)
      expect((await stopOn(port, { cookie, [REMOTE_HEADER]: '1' }, 'not json')).status).toBe(400)
      expect((await stopOn(port, { cookie, [REMOTE_HEADER]: '1' }, JSON.stringify({ runId: 'x'.repeat(2_000) }))).status).toBe(413)
      mode = 'no'
      expect((await stopOn(port, { cookie, [REMOTE_HEADER]: '1' }, '{"runId":"r"}')).status).toBe(403)
      mode = 'throw'
      expect((await stopOn(port, { cookie, [REMOTE_HEADER]: '1' }, '{"runId":"r"}')).status).toBe(403)
    } finally { await stoppable.close() }
  })

  it('a revoked device cannot stop anything any more (401), and without a host stop function the route is a 404', async () => {
    const stoppable = new RemoteGate(deps({ stopRun: () => Promise.resolve(true) }))
    const port = await stoppable.listen(TAILNET, 0)
    try {
      const cookie = await pairFully(port)
      book.revoke(book.list()[0]?.id ?? '')
      expect((await stopOn(port, { cookie, [REMOTE_HEADER]: '1' }, '{"runId":"r"}')).status).toBe(401)
    } finally { await stoppable.close() }
    const none = await gate.listen(TAILNET, 0)
    const cookie = await pairFully(none)
    expect((await stopOn(none, { cookie, [REMOTE_HEADER]: '1' }, '{"runId":"r"}')).status).toBe(404)
  })
})

describe('the client bundle (static files are public; the Gateway is not)', () => {
  const withDist = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'persona-gate-dist-'))
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>Casa</title>')
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)')
    writeFileSync(join(root, '.env'), 'SECRET=1')
    writeFileSync(join(root, 'assets', '.hidden'), 'nope')
    return root
  }
  const serve = async (): Promise<number> => {
    dist = withDist()
    await gate.close()
    gate = new RemoteGate(deps())
    return gate.listen(TAILNET, 0)
  }

  it('serves the page and the assets, falls back to the page for a ROUTE (not for a missing file), types them, and answers HEAD', async () => {
    const port = await serve()
    const index = await call(port, { path: '/' })
    expect([index.status, index.headers['content-type']]).toEqual([200, 'text/html; charset=utf-8'])
    expect((await call(port, { path: '/assets/app.js' })).headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect((await call(port, { path: '/casa/canal/geral' })).body).toContain('<title>Casa</title>')
    expect((await call(port, { path: '/assets/missing.js' })).status).toBe(404)
    expect((await call(port, { path: '/api/persona/listChannels' })).status).toBe(401) // /api is never a file
    const head = await call(port, { method: 'HEAD', path: '/assets/app.js' })
    expect([head.status, head.body]).toEqual([200, ''])
  })

  it('never leaves the bundle folder (dot-dot, encoded dot-dot, NUL, backslashes) and serves no dotfile', async () => {
    const port = await serve()
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/assets/%2e%2e/%2e%2e/package.json', '/%00', '/..%5c..%5cpackage.json', '/assets/..%2f..%2f..%2fWindows/win.ini', '/.env', '/assets/.hidden', '/%2eenv']) {
      const answer = await call(port, { path })
      expect(answer.body, path).not.toContain('"name"')
      expect(answer.body, path).not.toContain('SECRET=1')
      expect(answer.body, path).not.toContain('nope')
      expect(answer.body, path).not.toMatch(/\[fonts\]|for 16-bit/iu)
    }
    expect((await call(port, { path: '/.env' })).status).toBe(404)
  })

  it('a link inside the bundle that points OUTSIDE it is not served', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'persona-gate-outside-'))
    try {
      writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE-SECRET')
      const port = await serve()
      symlinkSync(outside, join(dist as string, 'assets', 'link'), 'junction')
      const answer = await call(port, { path: '/assets/link/secret.txt' })
      expect(answer.status).toBe(404)
      expect(answer.body).not.toContain('OUTSIDE-SECRET')
    } finally { rmSync(outside, { recursive: true, force: true }) }
  })
})
