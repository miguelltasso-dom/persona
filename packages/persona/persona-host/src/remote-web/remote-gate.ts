/**
 * MARCO M5: the remote gate — a SECOND door on this PC, listening only on the Tailscale address. Before a session it shows the pairing page and takes `POST /remote/pair`; with a paired device's cookie
 * it hands `/api/*` to the Gateway as that device's Peer (the S2 `dispatch`) and nothing else. The Electron door (loopback) and the owner's Peer are not touched.
 *
 * Every connection and request passes the same fence first (the remote address is a tailnet one, the Host is exactly this address and port, the Origin the same, no cross-site fetch), and a request
 * that is not a page or a file needs a paired device BOUND to the address it comes from. A right code is not a session: it opens a request the OWNER approves on the PC, seeing what Tailscale says the
 * address is. Nothing here knows a Persona rule: who the device is comes from the book, never from the wire; and only an allow-list of headers goes to the Gateway and comes back (never a cookie).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { isTailnetAddress, refuseBind } from './tailnet-bind.ts'
import { selfLogin as readSelfLogin, whois as readWhois, type TailnetIdentity } from './tailnet-identity.ts'
import type { DeviceBook, DeviceRecord } from './device-book.ts'
import type { DevicePairing } from './pair-guard.ts'
import type { PairRequests } from './pair-requests.ts'
import type { ComputerPoll, HelloInput, HelloResult } from '../computers/computer-registry.ts'
import { COMPUTER_HEADER, type ComputerAuth } from '../computers/computer-auth.ts'
import { COMPUTER_BODY_MAX, type LinkAnswer } from '../computers/computer-link.ts'
import type { PairedStreams, StreamAnswer } from './remote-stream.ts'
import { EXECUTOR_PATH } from '../computers/executor-protocol.ts'

/** The header every state-changing request must carry (a cross-site form cannot set it). */
export const REMOTE_HEADER = 'x-persona-remote'
/** The header the phone sends to ask what became of its pairing request. */
export const POLL_HEADER = 'x-persona-poll'
/** The cookie that names a paired device: `<deviceId>.<secret>`; HttpOnly, so the page's script never reads it. */
export const DEVICE_COOKIE = 'persona-device'
/** Biggest body the public routes read (a code and a label). */
export const PAIR_BODY_MAX = 2_048
/** Biggest body relayed to the Gateway (an attachment is the largest thing a phone sends). */
export const RELAY_BODY_MAX = 16_000_000
/** Calls of one device in flight at once (Lumen P3). */
export const MAX_INFLIGHT_PER_DEVICE = 8
/** M5 (c): polls and opens of the stream door ONE device may have in flight (a page polls each stream it follows, one long poll per connection; a flood is refused with a Retry-After). Under the 16 connections one address may hold. */
export const MAX_RPC_INFLIGHT = 12
/** The body of a call of the stream door (an op, an id, an endpoint name and a small payload). */
export const RPC_BODY_MAX = 65_536
/** Requests without a paired device (anything but a file) allowed per address in the window. */
export const ANON_RATE_MAX = 30
/** The window of {@link ANON_RATE_MAX}. */
export const ANON_RATE_WINDOW_MS = 10_000
/** Open connections per remote address, and in all. */
export const MAX_CONN_PER_ADDRESS = 16
export const MAX_CONN_TOTAL = 128
/** How often the gate re-checks the devices of the sockets it keeps open (a revoked or expired device is cut within this, whoever revoked it). */
export const RECHECK_MS = 1_000
const COOKIE_MAX_AGE_S = 30 * 24 * 3_600

/** The Content-Security-Policy of every response: the packaged client only, no eval, no framing. */
export const REMOTE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
/** Headers on every response. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': REMOTE_CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
}
/** What a request may carry to the Gateway (no cookie, no authorization, nothing the phone invents). */
export const FORWARD_REQUEST_HEADERS: readonly string[] = ['content-type', 'accept', 'accept-language', 'content-length', 'range', 'if-none-match', REMOTE_HEADER]
/** What a Gateway answer may carry back to the phone (never `set-cookie`, never an internal header). */
export const FORWARD_RESPONSE_HEADERS: readonly string[] = ['content-type', 'cache-control', 'content-length', 'content-encoding', 'etag', 'last-modified', 'content-disposition', 'content-range', 'accept-ranges', 'retry-after', 'vary']

/** Who the device speaks for, as the screen needs it (the host builds it from the member). */
export interface DeviceMember {
  readonly workspace: { readonly id: string; readonly name: string }
  readonly member: { readonly id: string; readonly name: string; readonly role: string }
}

/** What the PC's Atividade needs to show ("alguém no tailnet está chutando o código"). Never carries a code. */
export interface GateAuditEvent {
  readonly kind: 'pair-wrong' | 'pair-blocked' | 'pair-malformed' | 'pair-request' | 'rate-limited' | 'address-mismatch' | 'computer-wrong' | 'computer-blocked' | 'computer-request' | 'computer-refused'
  readonly address: string
  readonly at: number
  readonly retryAfterS?: number
  readonly node?: string
  readonly login?: string
}

/** What the gate needs from the product. */
export interface RemoteGateDeps {
  readonly book: DeviceBook
  readonly pairing: DevicePairing
  readonly requests: PairRequests
  /** The name of this PC, for the screen ("o PC da Padaria"). */
  readonly hostLabel: string
  /** The member a device speaks for, as `/remote/me` shows it; `undefined` when the member is gone (the device is then refused). */
  readonly memberOf: (memberId: string) => DeviceMember | undefined
  /** Hands an authenticated `/api/*` request to the Gateway for the device's Peer (S2). Without it, nothing past the cookie is served. */
  readonly dispatch?: (request: Request, device: DeviceRecord) => Promise<Response>
  /** M9: Stops a computer-use run for a device that may command it (the host checks "who may" per call). `true` when the run was stopped or was already over. Without it `/remote/computer/stop` is a 404. */
  readonly stopRun?: (runId: string, device: DeviceRecord) => Promise<boolean>
  /** M5 (c): the streams of the phone (the HTTP stream door `POST /remote/rpc`, with the ops of the Liveshare viewer carrier). Without it the route is a 404. */
  readonly streams?: PairedStreams
  /** D-116: the owner's registry of computers, as the public door of a NEW computer sees it (`POST /remote/computer-hello`, `GET /remote/computer-hello/status`). Without it both are a 404 (the surface `computers` is OFF). */
  readonly computers?: {
    hello(input: HelloInput, address: string): HelloResult
    /** What Tailscale says about the address, added to the owner's screen after a right code (so `tailscale whois` runs for right codes only). */
    annotate(requestId: string, identity: TailnetIdentity): void
    poll(pollToken: string): ComputerPoll
  }
  /** D-116: the door ONE COMPUTER of the team uses to talk to another (`POST /remote/computer/beat` and `/remote/computer/message`), answered only to a computer whose signed request checks out. Without it both are a 404. */
  readonly computerLink?: {
    readonly auth: Pick<ComputerAuth, 'precheck' | 'verify'>
    handle(kind: 'beat' | 'message' | 'executor', from: string, remote: string, text: string): LinkAnswer | Promise<LinkAnswer>
  }
  /** The folder with the client bundle (the same Casa); without it only the routes above answer. */
  readonly distDir?: string
  /** Other authorities the Host header may carry (the MagicDNS name of this PC). */
  readonly trustedHosts?: readonly string[]
  /** What Tailscale says about an address (default: `tailscale whois`). Tests inject one. */
  readonly whois?: (address: string) => Promise<TailnetIdentity | undefined>
  /** The login that owns this PC's Tailscale node (default: `tailscale status`). Tests inject one. */
  readonly selfLogin?: () => Promise<string | undefined>
  /** Where the PC's Atividade hears about refused and blocked tries (address only, never the code). */
  readonly audit?: (event: GateAuditEvent) => void
  /** TESTS ONLY: replaces the "tailnet addresses only" rule for the address to listen on (the CI has no Tailscale; a loopback alias stands in for it). The app never passes this. */
  readonly allowAddress?: (address: string) => boolean
  /** TESTS ONLY: replaces the "remote address is a tailnet one" rule (a test client is on loopback). The app never passes this. */
  readonly allowRemote?: (address: string) => boolean
  /** Clock (tests replace it). */
  readonly now?: () => number
}

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
}

/** A remote address as the socket reports it: an IPv4-mapped IPv6 text is the IPv4. */
const plainAddress = (raw: string | undefined): string => (raw ?? '').replace(/^::ffff:/iu, '')

/** The remote gate. */
export class RemoteGate {
  private server: Server | undefined
  private address = ''
  private boundPort = 0
  private readonly sockets = new Set<Socket>()
  private readonly perAddress = new Map<string, number>()
  private readonly byDevice = new Map<string, Set<Socket>>()
  private readonly inflight = new Map<string, Set<AbortController>>()
  private readonly rpcInflight = new Map<string, number>()
  private readonly seen = new Map<string, number[]>()
  private stopRevoke: (() => void) | undefined
  private recheck: ReturnType<typeof setInterval> | undefined

  /** @param deps - The books, the product's member lookup and the optional bundle. */
  constructor(private readonly deps: RemoteGateDeps) {}

  /** @returns The port while listening, else 0. */
  get port(): number {
    return this.boundPort
  }

  /**
   * Start listening. Refuses any address that is not the tailnet's (a wildcard, loopback or a LAN address throws before a socket exists) and checks, after binding, that the socket is on exactly that address.
   * @param address - The Tailscale address of this machine.
   * @param port - The port (0 asks the OS).
   * @returns The port.
   */
  async listen(address: string, port: number): Promise<number> {
    if (this.server !== undefined) throw new Error('remote-gate: already listening')
    const allowed = this.deps.allowAddress ?? ((candidate: string) => refuseBind(candidate) === undefined)
    if (!allowed(address)) throw new Error(`remote-gate: ${JSON.stringify(address)} is not a tailnet address (the gate listens on the Tailscale address only)`)
    const server = createServer({ maxHeaderSize: 16_384 }, (req, res) => { void this.handle(req, res).catch(() => { this.fail(res, 400, 'bad request') }) })
    server.maxConnections = MAX_CONN_TOTAL
    server.headersTimeout = 10_000
    server.requestTimeout = 60_000
    server.on('connection', (socket) => { this.admit(socket) })
    server.on('upgrade', (_req, socket) => { socket.destroy() }) // S4 owns the socket route; until then nothing upgrades
    await new Promise<void>((done, fail) => {
      server.once('error', fail)
      server.listen(port, address, () => { server.off('error', fail); done() })
    })
    const bound = server.address() as AddressInfo
    if (bound.address !== address) {
      await new Promise<void>((done) => { server.close(() => { done() }) })
      throw new Error(`remote-gate: bound ${bound.address}, wanted ${address}`)
    }
    this.server = server
    this.address = address
    this.boundPort = bound.port
    this.stopRevoke = this.deps.book.onRevoked((id) => { this.closeDevice(id) })
    return this.boundPort
  }

  /** Stop listening and drop every connection. */
  async close(): Promise<void> {
    const server = this.server
    if (server === undefined) return
    this.server = undefined
    this.boundPort = 0
    this.stopRevoke?.()
    if (this.recheck !== undefined) { clearInterval(this.recheck); this.recheck = undefined }
    for (const calls of this.inflight.values()) for (const call of calls) call.abort()
    const closed = new Promise<void>((done) => { server.close(() => { done() }) })
    server.closeAllConnections()
    for (const socket of this.sockets) socket.destroy()
    await closed
  }

  /**
   * Cut a device off: abort the calls it has in flight (Lumen P2-7: a unary call must not outlive the revocation) and drop its connections.
   * @param deviceId - The device.
   */
  closeDevice(deviceId: string): void {
    for (const call of this.inflight.get(deviceId) ?? []) call.abort()
    this.inflight.delete(deviceId)
    for (const socket of this.byDevice.get(deviceId) ?? []) socket.destroy()
    this.byDevice.delete(deviceId)
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  private audit(event: Omit<GateAuditEvent, 'at'>): void {
    this.deps.audit?.({ ...event, at: this.now() })
  }

  /** Defence in depth on every connection: a remote address outside the tailnet is closed with no answer, and so is one over its share of connections. */
  private admit(socket: Socket): void {
    const remote = plainAddress(socket.remoteAddress)
    const allowed = this.deps.allowRemote ?? isTailnetAddress
    const mine = (this.perAddress.get(remote) ?? 0) + 1
    if (!allowed(remote) || mine > MAX_CONN_PER_ADDRESS) { socket.destroy(); return }
    this.perAddress.set(remote, mine)
    this.sockets.add(socket)
    socket.once('close', () => {
      this.sockets.delete(socket)
      const left = (this.perAddress.get(remote) ?? 1) - 1
      if (left <= 0) this.perAddress.delete(remote)
      else this.perAddress.set(remote, left)
    })
  }

  private headers(extra: Record<string, string | string[]> = {}): Record<string, string | string[]> {
    return { ...SECURITY_HEADERS, 'cache-control': 'no-store', ...extra }
  }

  private fail(res: ServerResponse, status: number, text: string, extra: Record<string, string | string[]> = {}): void {
    if (res.headersSent) { res.destroy(); return }
    res.writeHead(status, this.headers({ 'content-type': 'text/plain; charset=utf-8', ...extra }))
    res.end(text)
  }

  private json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string | string[]> = {}): void {
    res.writeHead(status, this.headers({ 'content-type': 'application/json; charset=utf-8', ...extra }))
    res.end(JSON.stringify(body))
  }

  /** The Host/Origin/fetch-site fence: this address and port (or a declared name) — a wrong Host is 421 — same origin, never cross-site. */
  private fence(req: IncomingMessage): 'ok' | 'host' | 'origin' {
    const host = (req.headers.host ?? '').toLowerCase()
    const allowed = [`${this.address}:${String(this.boundPort)}`, ...(this.deps.trustedHosts ?? []).map(item => item.toLowerCase())]
    if (!allowed.includes(host)) return 'host'
    if (req.headers['sec-fetch-site'] === 'cross-site') return 'origin'
    const origin = req.headers.origin
    if (origin === undefined) return 'ok'
    try {
      return new URL(origin).host.toLowerCase() === host ? 'ok' : 'origin'
    } catch (error) {
      void error
      return 'origin'
    }
  }

  /** At most {@link ANON_RATE_MAX} requests per address per window for anything that is not a file. */
  private limited(address: string): boolean {
    const at = this.now()
    const recent = (this.seen.get(address) ?? []).filter(item => at - item < ANON_RATE_WINDOW_MS)
    recent.push(at)
    this.seen.set(address, recent)
    if (this.seen.size > 512) for (const key of this.seen.keys()) { if (key !== address) { this.seen.delete(key); break } }
    return recent.length > ANON_RATE_MAX
  }

  /** The paired device a request speaks for: the cookie is right, the member still exists, AND the request comes from the address the device paired from (a stolen cookie is no good on another node). */
  private deviceOf(req: IncomingMessage, remote: string): DeviceRecord | undefined {
    const raw = req.headers.cookie ?? ''
    for (const part of raw.split(';')) {
      const [name, ...rest] = part.trim().split('=')
      if (name !== DEVICE_COOKIE) continue
      const value = rest.join('=')
      const dot = value.indexOf('.')
      if (dot <= 0) return undefined
      const device = this.deps.book.verify(value.slice(0, dot), value.slice(dot + 1))
      if (device === undefined || this.deps.memberOf(device.memberId) === undefined) return undefined
      if (device.address === '' || device.address !== remote) { this.audit({ kind: 'address-mismatch', address: remote }); return undefined }
      return device
    }
    return undefined
  }

  private async body(req: IncomingMessage, max: number): Promise<string | undefined> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const piece = chunk as Buffer
      size += piece.length
      if (size > max) return undefined
      chunks.push(piece)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  private cookieFor(id: string, secret: string): string {
    return `${DEVICE_COOKIE}=${id}.${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${String(COOKIE_MAX_AGE_S)}`
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const fenced = this.fence(req)
    if (fenced === 'host') { this.fail(res, 421, 'misdirected request'); return }
    if (fenced === 'origin') { this.fail(res, 403, 'forbidden'); return }
    const url = new URL(req.url ?? '/', 'http://x')
    // A secret in the URL ends up in history, referers and logs: it is refused, whatever the route.
    for (const key of ['token', 'code', 'secret', 'poll', DEVICE_COOKIE]) if (url.searchParams.has(key)) { this.fail(res, 400, 'bad request'); return }
    const path = url.pathname
    const method = req.method ?? 'GET'
    const remote = plainAddress(req.socket.remoteAddress)
    const device = this.deviceOf(req, remote)
    const isFile = (method === 'GET' || method === 'HEAD') && !path.startsWith('/api') && !path.startsWith('/remote/')
    if (!isFile && device === undefined && this.limited(remote)) {
      this.audit({ kind: 'rate-limited', address: remote })
      this.json(res, 429, { ok: false, reason: 'devagar' }, { 'retry-after': String(Math.ceil(ANON_RATE_WINDOW_MS / 1000)) })
      return
    }

    if (path === '/remote/me' && method === 'GET') { this.me(res, device); return }
    if (path === '/remote/pair' && method === 'POST') { await this.pair(req, res, remote); return }
    if (path === '/remote/pair/status' && method === 'GET') { this.status(req, res); return }
    if (path === '/remote/computer-hello' && method === 'POST') { await this.computerHello(req, res, remote); return }
    if (path === '/remote/computer-hello/status' && method === 'GET') { this.computerStatus(req, res); return }
    if (path === '/remote/leave' && method === 'POST') {
      if (req.headers[REMOTE_HEADER] === undefined) { this.fail(res, 403, 'forbidden'); return }
      if (device !== undefined) this.deps.book.revoke(device.id)
      this.json(res, 200, { ok: true }, { 'set-cookie': `${DEVICE_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` })
      return
    }
    if ((path === '/remote/computer/beat' || path === '/remote/computer/message' || path === EXECUTOR_PATH) && method === 'POST') { await this.computerCall(path === '/remote/computer/beat' ? 'beat' : path === EXECUTOR_PATH ? 'executor' : 'message', req, res, remote); return }
    if (path === '/remote/computer/stop' && method === 'POST') { await this.stop(req, res, device); return }
    if (path === '/remote/rpc' && method === 'POST') { await this.rpc(req, res, device); return }
    if (isFile) { await this.serveFile(res, path, method === 'HEAD'); return }

    // Past this point only a paired device speaks, and only `/api/*` is the Gateway's (Lumen P1-2): any other path is not a route of this door.
    if (device === undefined) { this.fail(res, 401, 'unauthorized'); return }
    if (path !== '/api' && !path.startsWith('/api/')) { this.fail(res, 404, 'not found'); return }
    if (method !== 'GET' && method !== 'HEAD' && req.headers[REMOTE_HEADER] === undefined) { this.fail(res, 403, 'forbidden'); return }
    if (this.deps.dispatch === undefined) { this.fail(res, 404, 'not found'); return }
    if ((this.inflight.get(device.id)?.size ?? 0) >= MAX_INFLIGHT_PER_DEVICE) { this.json(res, 429, { ok: false, reason: 'devagar' }, { 'retry-after': '1' }); return }
    this.track(device.id, req.socket)
    await this.relay(req, res, device)
  }

  private me(res: ServerResponse, device: DeviceRecord | undefined): void {
    const known = device === undefined ? undefined : this.deps.memberOf(device.memberId)
    if (device === undefined || known === undefined) { this.json(res, 200, { kind: 'tailnet', hostLabel: this.deps.hostLabel, paired: false }); return }
    this.json(res, 200, { kind: 'tailnet', hostLabel: this.deps.hostLabel, paired: true, workspace: known.workspace, member: known.member, device: { id: device.id, label: device.label } })
  }

  /** A right code opens a REQUEST (the owner approves on the PC, seeing what Tailscale says about the address); it is not a session. */
  private async pair(req: IncomingMessage, res: ServerResponse, remote: string): Promise<void> {
    if (req.headers[REMOTE_HEADER] === undefined) { this.fail(res, 403, 'forbidden'); return }
    const text = await this.body(req, PAIR_BODY_MAX)
    if (text === undefined) { this.fail(res, 413, 'too large'); return }
    let code = ''
    let label = ''
    try {
      const parsed = JSON.parse(text) as { code?: unknown; label?: unknown }
      code = typeof parsed.code === 'string' ? parsed.code.slice(0, 32) : ''
      label = typeof parsed.label === 'string' ? parsed.label : ''
    } catch (error) {
      void error
      this.audit({ kind: 'pair-malformed', address: remote })
      this.json(res, 403, { ok: false, reason: 'recusado' })
      return
    }
    const answer = this.deps.pairing.redeem(code, remote)
    if (!answer.ok) {
      if (answer.reason === 'bloqueado') {
        this.audit({ kind: 'pair-blocked', address: remote, retryAfterS: answer.retryAfterS })
        this.json(res, 429, { ok: false, reason: 'bloqueado' }, { 'retry-after': String(answer.retryAfterS) })
      } else {
        this.audit({ kind: 'pair-wrong', address: remote })
        this.json(res, 403, { ok: false, reason: 'recusado' })
      }
      return
    }
    const known = this.deps.memberOf(answer.memberId)
    if (known === undefined) { this.json(res, 403, { ok: false, reason: 'recusado' }); return }
    // What the tailnet says about this address goes on the owner's screen, and for the OWNER's own member the login must be the PC's own (Lumen P1-3).
    const identity = await (this.deps.whois ?? ((address: string) => readWhois(address)))(remote)
    const self = known.member.role === 'owner' ? await (this.deps.selfLogin ?? (() => readSelfLogin()))() : undefined
    const loginMismatch = known.member.role === 'owner' && identity?.login !== undefined && self !== undefined && identity.login !== self
    const opened = this.deps.requests.open({ memberId: answer.memberId, label, address: remote, ...(identity === undefined ? {} : { identity }), loginMismatch })
    if (opened === 'cheio') { this.json(res, 429, { ok: false, reason: 'bloqueado' }, { 'retry-after': '30' }); return }
    this.audit({ kind: 'pair-request', address: remote, ...(identity?.node === undefined ? {} : { node: identity.node }), ...(identity?.login === undefined ? {} : { login: identity.login }) })
    this.json(res, 202, { ok: true, state: 'esperando-o-dono', requestId: opened.requestId, pollToken: opened.pollToken })
  }

  /** The phone asks what became of its request; an approval hands over the cookie, once. */
  private status(req: IncomingMessage, res: ServerResponse): void {
    const token = req.headers[POLL_HEADER]
    const answer = this.deps.requests.poll(typeof token === 'string' ? token.slice(0, 64) : '')
    if (answer.state !== 'aprovado') { this.json(res, answer.state === 'desconhecido' ? 404 : 200, { ok: answer.state === 'esperando-o-dono', state: answer.state }); return }
    const known = this.deps.memberOf(answer.memberId)
    if (known === undefined) { this.deps.book.revoke(answer.device.id); this.json(res, 404, { ok: false, state: 'desconhecido' }); return }
    this.json(res, 200, { ok: true, state: 'aprovado', workspace: known.workspace, member: known.member, device: { id: answer.device.id, label: answer.device.label } }, { 'set-cookie': this.cookieFor(answer.device.id, answer.device.secret) })
  }

  /** D-116: a NEW computer typed the code the owner opened on this PC. A right code opens a REQUEST for the owner; nothing is registered until the owner confirms on the PC. */
  private async computerHello(req: IncomingMessage, res: ServerResponse, remote: string): Promise<void> {
    const door = this.deps.computers
    if (door === undefined) { this.fail(res, 404, 'not found'); return }
    if (req.headers[REMOTE_HEADER] === undefined) { this.fail(res, 403, 'forbidden'); return }
    const text = await this.body(req, PAIR_BODY_MAX)
    if (text === undefined) { this.fail(res, 413, 'too large'); return }
    const field = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '')
    let input: HelloInput
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      input = { code: field(parsed.code, 32), label: field(parsed.label, 200), signing: field(parsed.signing, 64), agreement: field(parsed.agreement, 64), ...(typeof parsed.ramMb === 'number' ? { ramMb: parsed.ramMb } : {}) }
    } catch (error) {
      void error
      this.audit({ kind: 'pair-malformed', address: remote })
      this.json(res, 400, { ok: false, reason: 'invalido' })
      return
    }
    const answer = door.hello(input, remote)
    if (!answer.ok) {
      if (answer.reason === 'bloqueado') {
        this.audit({ kind: 'computer-blocked', address: remote, retryAfterS: answer.retryAfterS })
        this.json(res, 429, { ok: false, reason: 'bloqueado' }, { 'retry-after': String(answer.retryAfterS) })
      } else if (answer.reason === 'cheio') {
        this.json(res, 429, { ok: false, reason: 'cheio' }, { 'retry-after': '30' })
      } else if (answer.reason === 'invalido') {
        this.json(res, 400, { ok: false, reason: 'invalido' })
      } else {
        if (answer.reason === 'recusado') this.audit({ kind: 'computer-wrong', address: remote })
        this.json(res, 403, { ok: false, reason: answer.reason })
      }
      return
    }
    const identity = await (this.deps.whois ?? ((address: string) => readWhois(address)))(remote).catch(() => undefined)
    if (identity !== undefined) door.annotate(answer.requestId, identity)
    this.audit({ kind: 'computer-request', address: remote, ...(identity?.node === undefined ? {} : { node: identity.node }), ...(identity?.login === undefined ? {} : { login: identity.login }) })
    this.json(res, 202, { ok: true, state: 'esperando-o-dono', requestId: answer.requestId, pollToken: answer.pollToken })
  }

  /**
   * D-116: a call from another computer of the team. Who it is comes from its SIGNED request (the key the owner certified), checked in two steps: the cheap ones (shape, time, who) BEFORE the body is read,
   * so an unknown caller never makes this door read a bundle's worth of bytes, and the signature over the body after. Every refusal is the same 401: the door is no oracle of who is on the team.
   */
  private async computerCall(kind: 'beat' | 'message' | 'executor', req: IncomingMessage, res: ServerResponse, remote: string): Promise<void> {
    const link = this.deps.computerLink
    if (link === undefined) { this.fail(res, 404, 'not found'); return }
    const header = req.headers[COMPUTER_HEADER]
    const pre = link.auth.precheck(typeof header === 'string' ? header : undefined)
    if ('refused' in pre) { this.audit({ kind: 'computer-refused', address: remote }); this.json(res, 401, { ok: false }); return }
    const text = await this.body(req, COMPUTER_BODY_MAX)
    if (text === undefined) { this.fail(res, 413, 'too large'); return }
    const verdict = link.auth.verify(pre, { method: 'POST', path: req.url ?? '', host: req.headers.host ?? '', body: text })
    if (!verdict.ok) { this.audit({ kind: 'computer-refused', address: remote }); this.json(res, 401, { ok: false }); return }
    const answer = await link.handle(kind, verdict.computerId, remote, text)
    this.json(res, answer.status, answer.body)
  }

  /** D-116: the new computer asks what became of its request; a confirmation hands over what the owner signed, once. */
  private computerStatus(req: IncomingMessage, res: ServerResponse): void {
    const door = this.deps.computers
    if (door === undefined) { this.fail(res, 404, 'not found'); return }
    const token = req.headers[POLL_HEADER]
    const answer = door.poll(typeof token === 'string' ? token.slice(0, 64) : '')
    if (answer.state !== 'aprovado') { this.json(res, answer.state === 'desconhecido' ? 404 : 200, { ok: answer.state === 'esperando-o-dono', state: answer.state }); return }
    this.json(res, 200, { ok: true, state: 'aprovado', grant: answer.grant })
  }

  /**
   * M9 "Parar": its OWN route, always available. It does not go through the Gateway's queue, the in-flight cap or any rate limit of the other calls (only the device check and the fence), so it answers even when the
   * phone is flooding the Gateway or the live view is down. Idempotent; who may stop WHICH run is decided by `stopRun` (the host), per call.
   */
  private async stop(req: IncomingMessage, res: ServerResponse, device: DeviceRecord | undefined): Promise<void> {
    if (device === undefined) { this.fail(res, 401, 'unauthorized'); return }
    if (req.headers[REMOTE_HEADER] === undefined) { this.fail(res, 403, 'forbidden'); return }
    const stopRun = this.deps.stopRun
    if (stopRun === undefined) { this.fail(res, 404, 'not found'); return }
    const text = await this.body(req, 1_024)
    if (text === undefined) { this.fail(res, 413, 'too large'); return }
    let runId = ''
    try {
      const parsed = JSON.parse(text) as { runId?: unknown }
      runId = typeof parsed.runId === 'string' ? parsed.runId.slice(0, 100) : ''
    } catch (error) {
      void error
    }
    if (runId === '') { this.json(res, 400, { ok: false }); return }
    const stopped = await stopRun(runId, device).catch(() => false)
    this.json(res, stopped ? 200 : 403, { ok: stopped })
  }

  /**
   * M5 (c): the phone's stream door. One JSON op per call, the ones of the Liveshare viewer carrier: `stream-open {id, endpoint, payload}`, `stream-next {id}`, `stream-cancel {id}`. A paired device and the
   * `x-persona-remote` header like every write; the op goes to the stream table of the device the cookie names; a page that goes away in the middle of a poll aborts it.
   */
  private async rpc(req: IncomingMessage, res: ServerResponse, device: DeviceRecord | undefined): Promise<void> {
    if (device === undefined) { this.fail(res, 401, 'unauthorized'); return }
    if (req.headers[REMOTE_HEADER] === undefined) { this.fail(res, 403, 'forbidden'); return }
    const streams = this.deps.streams
    if (streams === undefined) { this.fail(res, 404, 'not found'); return }
    if ((this.rpcInflight.get(device.id) ?? 0) >= MAX_RPC_INFLIGHT) { this.json(res, 429, { ok: false, reason: 'devagar' }, { 'retry-after': '1' }); return }
    this.rpcInflight.set(device.id, (this.rpcInflight.get(device.id) ?? 0) + 1)
    const abort = new AbortController()
    res.once('close', () => { abort.abort() })
    try {
      this.track(device.id, req.socket)
      const text = await this.body(req, RPC_BODY_MAX)
      if (text === undefined) { this.fail(res, 413, 'too large'); return }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch (error) {
        void error
        this.json(res, 400, { error: 'bad-request' })
        return
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { this.json(res, 400, { error: 'bad-request' }); return }
      const call = parsed as { readonly op?: unknown; readonly id?: unknown; readonly endpoint?: unknown; readonly payload?: unknown }
      const id = call.id
      if (typeof id !== 'number' || !Number.isSafeInteger(id)) { this.json(res, 400, { error: 'bad-request' }); return }
      let out: StreamAnswer
      if (call.op === 'stream-open' && typeof call.endpoint === 'string') out = await streams.open(device, { id, endpoint: call.endpoint, payload: call.payload ?? null }, abort.signal)
      else if (call.op === 'stream-next') out = await streams.next(device, id, abort.signal)
      else if (call.op === 'stream-cancel') out = streams.cancel(device, id)
      else { this.json(res, 400, { error: 'bad-request' }); return }
      if (abort.signal.aborted || res.writableEnded) return // the page is gone: nobody reads the answer
      if (out.status === 204) { res.writeHead(204, this.headers({ 'cache-control': 'no-store' })); res.end(); return }
      this.json(res, out.status, out.body ?? {}, { 'cache-control': 'no-store' })
    } finally {
      const left = (this.rpcInflight.get(device.id) ?? 1) - 1
      if (left <= 0) this.rpcInflight.delete(device.id); else this.rpcInflight.set(device.id, left)
    }
  }

  private track(deviceId: string, socket: Socket): void {
    const set = this.byDevice.get(deviceId) ?? new Set<Socket>()
    set.add(socket)
    this.byDevice.set(deviceId, set)
    socket.once('close', () => { set.delete(socket) })
    if (this.recheck === undefined) {
      // Whoever revoked the device (this process or another path), a socket that stays open is re-checked every second.
      this.recheck = setInterval(() => {
        for (const id of [...this.byDevice.keys()]) if (!this.deps.book.isLive(id)) this.closeDevice(id)
        if (this.byDevice.size === 0 && this.recheck !== undefined) { clearInterval(this.recheck); this.recheck = undefined }
      }, RECHECK_MS)
      this.recheck.unref()
    }
  }

  /** Hand the request to the Gateway and stream the answer back; a client that goes away, or a revocation, cancels it. */
  private async relay(req: IncomingMessage, res: ServerResponse, device: DeviceRecord): Promise<void> {
    const dispatch = this.deps.dispatch
    if (dispatch === undefined) return
    const abort = new AbortController()
    const calls = this.inflight.get(device.id) ?? new Set<AbortController>()
    calls.add(abort)
    this.inflight.set(device.id, calls)
    res.once('close', () => { abort.abort(); calls.delete(abort) })
    const headers = new Headers()
    for (const name of FORWARD_REQUEST_HEADERS) {
      const value = req.headers[name]
      for (const item of typeof value === 'string' ? [value] : value ?? []) headers.append(name, item)
    }
    const method = req.method ?? 'GET'
    const hasBody = method !== 'GET' && method !== 'HEAD'
    let payload: Buffer | undefined
    if (hasBody) {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += (chunk as Buffer).length
        if (size > RELAY_BODY_MAX) { this.fail(res, 413, 'too large'); return }
        chunks.push(chunk as Buffer)
      }
      payload = Buffer.concat(chunks)
    }
    const request = new Request(new URL(req.url ?? '/', 'http://persona-remote'), { method, headers, signal: abort.signal, ...(payload === undefined ? {} : { body: new Uint8Array(payload) }) })
    const response = await dispatch(request, device)
    if (abort.signal.aborted) { await response.body?.cancel().catch(() => undefined); if (!res.writableEnded) res.destroy(); return }
    const out: Record<string, string | string[]> = {}
    for (const name of FORWARD_RESPONSE_HEADERS) { const value = response.headers.get(name); if (value !== null) out[name] = value }
    res.writeHead(response.status, this.headers(out))
    if (response.body === null || method === 'HEAD') { res.end(); return }
    const reader = response.body.getReader()
    abort.signal.addEventListener('abort', () => { reader.cancel().catch(() => undefined) }, { once: true })
    try {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        if (!res.write(chunk.value)) await new Promise<void>((done) => { res.once('drain', done); res.once('close', done) })
      }
    } catch (error) {
      void error // the device left or was cut: the stream simply ends
    } finally {
      if (!res.writableEnded) res.end()
    }
  }

  private async serveFile(res: ServerResponse, path: string, head: boolean): Promise<void> {
    const root = this.deps.distDir
    if (root === undefined) { this.fail(res, 404, 'not found'); return }
    let decoded: string
    try {
      decoded = decodeURIComponent(path)
    } catch (error) {
      void error
      this.fail(res, 400, 'bad request')
      return
    }
    if (decoded.includes('\0')) { this.fail(res, 400, 'bad request'); return }
    if (decoded.split(/[\\/]/u).some(part => part.startsWith('.'))) { this.fail(res, 404, 'not found'); return } // no dotfile, no ".."
    const base = resolve(root)
    let target = resolve(join(base, normalize(decoded)))
    if (target !== base && !target.startsWith(base + sep)) { this.fail(res, 404, 'not found'); return }
    let found = await stat(target).then(info => info.isFile()).catch(() => false)
    if (!found) {
      if (extname(decoded) !== '') { this.fail(res, 404, 'not found'); return } // a missing file is missing; only a route falls back to the page
      target = join(base, 'index.html')
      found = true
    }
    // A link inside the bundle that points outside it is not served: the REAL path must stay under the REAL root.
    const real = await realpath(target).catch(() => undefined)
    const realRoot = await realpath(base).catch(() => undefined)
    if (real === undefined || realRoot === undefined || (real !== realRoot && !real.startsWith(realRoot + sep))) { this.fail(res, 404, 'not found'); return }
    const bytes = await readFile(real).catch(() => undefined)
    if (bytes === undefined) { this.fail(res, 404, 'not found'); return }
    res.writeHead(200, this.headers({ 'content-type': TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream', 'content-length': String(bytes.length), 'cache-control': 'no-cache' }))
    res.end(head ? undefined : bytes)
  }
}
