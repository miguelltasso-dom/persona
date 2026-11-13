import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateIdentity, publicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { RosterGuard, computerFingerprint, computerIdOf, memoryRosterStore, verifyCert } from '../src/computers/computer-cert.ts'
import { ComputerEnrollment, fileMembershipStore, memoryMembershipStore, type EnrollInput, type MembershipStore } from '../src/computers/computer-enroll.ts'
import { ComputerRegistry, memoryRegistryStore } from '../src/computers/computer-registry.ts'
import { DeviceBook } from '../src/remote-web/device-book.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'
import { PairRequests } from '../src/remote-web/pair-requests.ts'
import { POLL_HEADER, REMOTE_HEADER, RemoteGate, type GateAuditEvent, type RemoteGateDeps } from '../src/remote-web/remote-gate.ts'

/**
 * D-116 B2 on REAL sockets: the owner's PC (a gate on the loopback alias that stands in for the tailnet address, with its registry behind `computers`) and a NEW computer that types the code. What is proved: a right
 * code opens a request and registers nothing; the owner's confirmation makes the certificate; the new computer keeps only what names ITS key and carries the owner's signature; every refusal has one stable reason.
 */
const TAILNET = '127.0.0.2'
const OWNER = generateIdentity()
const OWNER_PC = generateIdentity()
const NEW_PC = generateIdentity()
const dirs: string[] = []

let clock: { now: number }
let registry: ComputerRegistry
let gate: RemoteGate
let port: number
let audited: GateAuditEvent[]
let sent: string[]

const newRegistry = (): ComputerRegistry => new ComputerRegistry({
  workspaceId: 'ws1', owner: { memberId: 'm-ana', signingSeed: OWNER.signing.seed, signingPublic: OWNER.signing.publicKey }, thisComputerId: computerIdOf(publicIdentity(OWNER_PC)),
  pairing: new DevicePairing(memoryPairStore(), () => clock.now), store: memoryRegistryStore(), now: () => clock.now,
})

/** A test may name a dependency as `undefined` to take it away (the gate then runs without it). */
type DepsOver = { [K in keyof RemoteGateDeps]?: RemoteGateDeps[K] | undefined }
const openGate = (over: DepsOver = {}): RemoteGate => {
  const merged: Record<string, unknown> = {
    book: new DeviceBook(undefined, () => clock.now), pairing: new DevicePairing(memoryPairStore(), () => clock.now), requests: new PairRequests(new DeviceBook(undefined, () => clock.now), () => clock.now),
    hostLabel: 'PC da Ana', memberOf: () => undefined, allowAddress: (address: string) => address === TAILNET, allowRemote: () => true, now: () => clock.now,
    whois: () => Promise.resolve({ node: 'padaria', login: 'ana@example.com' }), selfLogin: () => Promise.resolve(undefined), audit: (event: GateAuditEvent) => audited.push(event),
    computers: registry, ...over,
  }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  return new RemoteGate(merged as unknown as RemoteGateDeps)
}

/** The new computer: real fetch (recorded), the loopback alias allowed, polls fast. */
const newcomer = (store: MembershipStore = memoryMembershipStore(), over: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}): ComputerEnrollment => new ComputerEnrollment({
  identity: NEW_PC, store, allowAddress: host => host === TAILNET, pollMs: 15, callTimeoutMs: 5_000, now: () => clock.now, ...over,
  fetch: (input, init) => { sent.push(typeof init?.body === 'string' ? init.body : ''); return fetch(input, init) },
})
const input = (over: Partial<EnrollInput> = {}): EnrollInput => ({ ownerAddress: `${TAILNET}:${String(port)}`, code: registry.issueCode().code, label: 'PC da padaria', ramMb: 8192, ...over })

beforeEach(async () => {
  clock = { now: 1_800_000_000_000 }
  audited = []
  sent = []
  registry = newRegistry()
  registry.ensureSelf(publicIdentity(OWNER_PC), 'PC da Ana')
  gate = openGate()
  port = await gate.listen(TAILNET, 0)
})
afterEach(async () => { await gate.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const raw = (path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: string }> => new Promise((resolve, reject) => {
  const req = request({ host: TAILNET, port, path, method: init.method ?? 'GET', agent: false, headers: { host: `${TAILNET}:${String(port)}`, ...(init.headers ?? {}) } }, (res) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }) })
  })
  req.on('error', reject)
  req.end(init.body)
})

describe('joining the team', () => {
  it('a right code opens a request the owner sees (name, RAM, what Tailscale says, fingerprint); nothing is registered until she confirms; then the new computer keeps what she signed', async () => {
    const store = memoryMembershipStore()
    const enrollment = newcomer(store)
    const before = registry.signedRoster()?.roster.version
    const started = await enrollment.start(input())
    expect(started).toMatchObject({ state: 'esperando-o-dono', ownerAddress: `${TAILNET}:${String(port)}`, fingerprint: computerFingerprint(publicIdentity(NEW_PC)) })
    expect(registry.requests()).toHaveLength(1)
    expect(registry.requests()[0]).toMatchObject({ label: 'PC da padaria', node: 'padaria', login: 'ana@example.com', ramMb: 8192, fingerprint: enrollment.fingerprint(), known: false })
    expect(registry.computers()).toHaveLength(1) // nothing registered yet
    expect(registry.signedRoster()?.roster.version).toBe(before)
    expect(store.read()).toBeUndefined()
    expect(audited.map(event => event.kind)).toEqual(['computer-request'])

    expect(registry.confirm(registry.requests()[0]?.requestId ?? '')).toBe('ok')
    await expect.poll(() => enrollment.status().state).toBe('cadastrado')
    const membership = store.read()
    expect(membership).toMatchObject({ workspaceId: 'ws1', ownerSigningPublic: OWNER.signing.publicKey, ownerAddress: `${TAILNET}:${String(port)}` })
    expect(verifyCert(membership?.cert, OWNER.signing.publicKey)).toMatchObject({ computerId: computerIdOf(publicIdentity(NEW_PC)), label: 'PC da padaria', registeredBy: 'm-ana' })
    const guard = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => clock.now)
    expect(guard.accept(membership?.roster)).toBe('ok')
    expect(guard.certOf(computerIdOf(publicIdentity(NEW_PC)))).toBeDefined()
    expect(guard.certOf(computerIdOf(publicIdentity(OWNER_PC)))).toBeDefined() // and it knows the owner's PC
  })

  it('what the new computer sends holds its PUBLIC keys only: no seed, no secret, nothing of the owner', async () => {
    await newcomer().start(input())
    const body = sent.join('\n')
    expect(body).toContain(NEW_PC.signing.publicKey)
    expect(body).toContain(NEW_PC.agreement.publicKey)
    for (const secret of [NEW_PC.signing.seed, NEW_PC.agreement.secret, OWNER.signing.seed]) expect(body).not.toContain(secret)
  })

  it('a wrong code is `codigo-recusado`, then `bloqueado` (with how long to wait) after five; the owner\'s screen shows nothing', async () => {
    const enrollment = newcomer()
    registry.issueCode()
    for (let index = 0; index < 5; index += 1) expect(await enrollment.start(input({ code: 'ZZZZ-ZZZZ' }))).toEqual({ state: 'falhou', reason: 'codigo-recusado' })
    expect(await enrollment.start(input({ code: 'ZZZZ-ZZZZ' }))).toMatchObject({ state: 'falhou', reason: 'bloqueado', retryAfterS: expect.any(Number) as number })
    expect(registry.requests()).toEqual([])
    expect(audited.filter(event => event.kind === 'computer-wrong')).toHaveLength(5)
    expect(audited.some(event => event.kind === 'computer-blocked')).toBe(true)
  })

  it('the owner says no: `recusado`, and the new computer keeps nothing', async () => {
    const store = memoryMembershipStore()
    const enrollment = newcomer(store)
    await enrollment.start(input())
    expect(registry.reject(registry.requests()[0]?.requestId ?? '')).toBe(true)
    await expect.poll(() => enrollment.status().state).toBe('recusado')
    expect(store.read()).toBeUndefined()
    expect(registry.computers()).toHaveLength(1)
  })

  it('a computer that is already a member does not join again (`ja-cadastrado`) and says so without touching the network', async () => {
    const enrollment = newcomer()
    await enrollment.start(input())
    registry.confirm(registry.requests()[0]?.requestId ?? '')
    await expect.poll(() => enrollment.status().state).toBe('cadastrado')
    sent.length = 0
    expect(await enrollment.start(input())).toEqual({ state: 'falhou', reason: 'ja-cadastrado' })
    expect(sent).toEqual([])
  })

  it('a revoked computer that types a new code is told `revogado` (it must come back as a NEW identity)', async () => {
    const first = newcomer()
    await first.start(input())
    registry.confirm(registry.requests()[0]?.requestId ?? '')
    await expect.poll(() => first.status().state).toBe('cadastrado')
    registry.revoke(computerIdOf(publicIdentity(NEW_PC)))
    expect(await newcomer().start(input())).toEqual({ state: 'falhou', reason: 'revogado' })
  })

  it('this computer only speaks to a TAILNET address: a public one, loopback, a name and a malformed address are refused BEFORE any call', async () => {
    const strict = new ComputerEnrollment({ identity: NEW_PC, store: memoryMembershipStore(), fetch: () => { throw new Error('the network must not be touched') } })
    for (const address of ['8.8.8.8:80', '127.0.0.1:80', '192.168.0.10:80', 'pc-da-ana.local:80', '100.64.0.1', '100.64.0.1:0', '100.64.0.1:99999', '']) expect(await strict.start(input({ ownerAddress: address })), address).toEqual({ state: 'falhou', reason: 'endereco-invalido' })
  })

  it('a dead address is `sem-resposta`, not a hang', async () => {
    await gate.close()
    expect(await newcomer().start(input())).toEqual({ state: 'falhou', reason: 'sem-resposta' })
  })

  it('cancel stops the waiting and leaves the computer free to try again', async () => {
    const enrollment = newcomer()
    await enrollment.start(input())
    enrollment.cancel()
    expect(enrollment.status()).toEqual({ state: 'livre' })
    registry.confirm(registry.requests()[0]?.requestId ?? '') // the owner confirms later: nobody is listening
    await new Promise((resolve) => { setTimeout(resolve, 80) })
    expect(enrollment.status()).toEqual({ state: 'livre' })
    expect(enrollment.membership()).toBeUndefined()
  })

  it('if the owner never answers, the new computer gives up with `vencido` (it does not poll forever)', async () => {
    const local = { now: clock.now }
    const enrollment = newcomer(memoryMembershipStore(), { now: () => local.now, sleep: () => { local.now += 400_000; return Promise.resolve() } })
    await enrollment.start(input())
    await expect.poll(() => enrollment.status()).toEqual({ state: 'falhou', reason: 'vencido' })
  })
})

describe('what the new computer refuses to believe', () => {
  /** An owner's PC that is honest about everything except WHO the certificate names. */
  const liar = (grant: (own: ReturnType<typeof publicIdentity>) => unknown): typeof fetch => (url) => {
    const path = new URL(String(url)).pathname
    if (path.endsWith('/status')) return Promise.resolve(Response.json({ ok: true, state: 'aprovado', grant: grant(publicIdentity(NEW_PC)) }))
    return Promise.resolve(Response.json({ ok: true, state: 'esperando-o-dono', requestId: 'r', pollToken: 't'.repeat(32) }, { status: 202 }))
  }
  const grantFor = (identity: ReturnType<typeof publicIdentity>, signer = OWNER): unknown => {
    const other = newRegistry()
    other.ensureSelf(publicIdentity(OWNER_PC), 'PC da Ana')
    const pub = identity
    const code = other.issueCode().code
    const hello = other.hello({ code, label: 'x', signing: pub.signing, agreement: pub.agreement }, '100.64.0.5')
    if (!hello.ok) throw new Error('refused')
    other.confirm(hello.requestId)
    const polled = other.poll(hello.pollToken)
    if (polled.state !== 'aprovado') throw new Error('not approved')
    return signer === OWNER ? polled.grant : { ...polled.grant, ownerSigningPublic: signer.signing.publicKey }
  }
  const run = async (fetchImpl: typeof fetch, store = memoryMembershipStore()): Promise<{ state: ReturnType<ComputerEnrollment['status']>; store: MembershipStore }> => {
    const enrollment = new ComputerEnrollment({ identity: NEW_PC, store, allowAddress: () => true, pollMs: 5, now: () => clock.now, fetch: fetchImpl })
    await enrollment.start({ ownerAddress: `${TAILNET}:1`, code: 'AAAA-BBBB', label: 'x' })
    await expect.poll(() => enrollment.status().state).not.toBe('esperando-o-dono')
    return { state: enrollment.status(), store }
  }

  it('control: an honest grant for THIS computer is kept', async () => {
    const { state, store } = await run(liar(own => grantFor(own)))
    expect(state.state).toBe('cadastrado')
    expect(store.read()?.cert.cert.computerId).toBe(computerIdOf(publicIdentity(NEW_PC)))
  })

  it('a certificate that names ANOTHER computer\'s key is thrown away (`resposta-invalida`), nothing is stored', async () => {
    const { state, store } = await run(liar(() => grantFor(publicIdentity(generateIdentity()))))
    expect(state).toEqual({ state: 'falhou', reason: 'resposta-invalida' })
    expect(store.read()).toBeUndefined()
  })

  it('a grant whose roster was signed by a key that is not the one it names as owner is thrown away', async () => {
    const stranger = generateIdentity()
    const { state, store } = await run(liar(own => grantFor(own, stranger)))
    expect(state).toEqual({ state: 'falhou', reason: 'resposta-invalida' })
    expect(store.read()).toBeUndefined()
  })

  it('answers that are not the protocol (not JSON, wrong shape, an unknown state) are `resposta-invalida`', async () => {
    for (const make of [
      (): Promise<Response> => Promise.resolve(new Response('<html>', { status: 202 })),
      (): Promise<Response> => Promise.resolve(Response.json({ ok: true, state: 'esperando-o-dono' }, { status: 202 })), // no poll token
      (): Promise<Response> => Promise.resolve(Response.json({ ok: false }, { status: 500 })),
    ]) {
      const enrollment = new ComputerEnrollment({ identity: NEW_PC, store: memoryMembershipStore(), allowAddress: () => true, fetch: make })
      expect(await enrollment.start({ ownerAddress: `${TAILNET}:1`, code: 'AAAA-BBBB', label: 'x' })).toEqual({ state: 'falhou', reason: 'resposta-invalida' })
    }
  })

  it('a redirect is not followed (the owner\'s PC cannot send this computer somewhere else)', async () => {
    const seen: RequestRedirect[] = []
    const enrollment = new ComputerEnrollment({ identity: NEW_PC, store: memoryMembershipStore(), allowAddress: () => true, fetch: (_url, init) => { seen.push(init?.redirect ?? 'follow'); return Promise.reject(new TypeError('redirect')) } })
    await enrollment.start({ ownerAddress: `${TAILNET}:1`, code: 'AAAA-BBBB', label: 'x' })
    expect(seen).toEqual(['error'])
  })
})

describe('the membership on disk', () => {
  it('is read back after a restart and a new enrollment object starts as a member; a hand-edited file is "not a member"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-membership-'))
    dirs.push(dir)
    const path = join(dir, 'membership.json')
    const enrollment = newcomer(fileMembershipStore(path))
    await enrollment.start(input())
    registry.confirm(registry.requests()[0]?.requestId ?? '')
    await expect.poll(() => enrollment.status().state).toBe('cadastrado')
    const text = readFileSync(path, 'utf8')
    for (const secret of [NEW_PC.signing.seed, NEW_PC.agreement.secret]) expect(text).not.toContain(secret) // the private halves are this machine's own business (Cofre), never in this file
    const after = newcomer(fileMembershipStore(path)) // "restart"
    expect(after.status()).toMatchObject({ state: 'cadastrado', label: 'PC da padaria' })
    const edited = JSON.parse(text) as { cert: { cert: { caps: { hostFor: string[] } } } }
    edited.cert.cert.caps.hostFor.push('intruso')
    writeFileSync(path, JSON.stringify(edited))
    expect(fileMembershipStore(path).read()).toBeUndefined()
    writeFileSync(path, '{ not json')
    expect(fileMembershipStore(path).read()).toBeUndefined()
  })
})

describe('the public door of the gate', () => {
  const hello = (over: { headers?: Record<string, string>; body?: string } = {}): ReturnType<typeof raw> => raw('/remote/computer-hello', {
    method: 'POST', headers: { [REMOTE_HEADER]: '1', 'content-type': 'application/json', ...(over.headers ?? {}) },
    body: over.body ?? JSON.stringify({ code: registry.issueCode().code, label: 'x', signing: NEW_PC.signing.publicKey, agreement: NEW_PC.agreement.publicKey }),
  })

  it('a hello without the header every state-changing call carries is refused (a cross-site form cannot set it) and opens nothing', async () => {
    const bare = await raw('/remote/computer-hello', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: registry.issueCode().code, label: 'x', signing: NEW_PC.signing.publicKey, agreement: NEW_PC.agreement.publicKey }) })
    expect(bare.status).toBe(403)
    expect(registry.requests()).toEqual([])
  })

  it('a body that is too large is 413, malformed JSON is 400, and a GET to the hello route is not a route', async () => {
    expect((await hello({ body: 'x'.repeat(5_000) })).status).toBe(413)
    expect((await hello({ body: '{ nope' })).status).toBe(400)
    expect((await raw('/remote/computer-hello')).status).toBe(401) // falls past the public routes: only a paired device speaks there
  })

  it('the status of an unknown token is 404, and the token travels in a header, never in the URL', async () => {
    expect((await raw('/remote/computer-hello/status', { headers: { [POLL_HEADER]: 'nao-existe' } })).status).toBe(404)
    expect((await raw('/remote/computer-hello/status?poll=abc')).status).toBe(400)
  })

  it('wrong and spent codes are the same answer (403 `recusado`): the door is no oracle of a code\'s state', async () => {
    const good = registry.issueCode().code
    const body = (code: string): string => JSON.stringify({ code, label: 'x', signing: NEW_PC.signing.publicKey, agreement: NEW_PC.agreement.publicKey })
    expect((await hello({ body: body(good) })).status).toBe(202)
    const spent = await hello({ body: body(good) })
    const wrong = await hello({ body: body('QQQQ-QQQQ') })
    expect([spent.status, spent.body]).toEqual([wrong.status, wrong.body])
    expect(JSON.parse(wrong.body)).toEqual({ ok: false, reason: 'recusado' })
  })

  it('with the `computers` surface OFF (no registry behind the door) both routes are a 404 and nothing opens', async () => {
    await gate.close()
    gate = openGate({ computers: undefined })
    port = await gate.listen(TAILNET, 0)
    expect((await hello()).status).toBe(404)
    expect((await raw('/remote/computer-hello/status', { headers: { [POLL_HEADER]: 'x' } })).status).toBe(404)
    expect(registry.requests()).toEqual([])
  })
})
