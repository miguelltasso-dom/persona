import { request } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateIdentity, publicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { RosterGuard, computerIdOf, memoryRosterStore } from '../src/computers/computer-cert.ts'
import { COMPUTER_HEADER, ComputerAuth, signComputerRequest } from '../src/computers/computer-auth.ts'
import { BEAT_MS, ComputerDirectory, ComputerLink, MAX_ENDPOINTS, PRESENCE_MS, cleanMessage, type ComputerLinkDeps } from '../src/computers/computer-link.ts'
import { ComputerRegistry, memoryRegistryStore } from '../src/computers/computer-registry.ts'
import { HandoffError, type HandoffMessage } from '../src/computers/handoff.ts'
import { DeviceBook } from '../src/remote-web/device-book.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'
import { PairRequests } from '../src/remote-web/pair-requests.ts'
import { RemoteGate, type GateAuditEvent, type RemoteGateDeps } from '../src/remote-web/remote-gate.ts'

/**
 * D-116: the computers of the team talk through two small routes on their gates, answered only to a computer whose signed request checks out. The owner's PC is the directory; a member tells it "I am here" every
 * half minute and gets back the signed roster; the handoff's messages go straight from computer to computer. Two REAL gates on two loopback aliases stand in for two tailnet addresses (the CI has no Tailscale).
 */
const ADDR_A = '127.0.0.2'
const ADDR_B = '127.0.0.3'
const OWNER = generateIdentity()
const IA = generateIdentity()
const IB = generateIdentity()
const STRANGER = generateIdentity()
const idOf = (who: ReturnType<typeof generateIdentity>): string => computerIdOf(publicIdentity(who))

let clock: { now: number }
let registry: ComputerRegistry
let rosterA: RosterGuard
let rosterB: RosterGuard
let dirA: ComputerDirectory
let dirB: ComputerDirectory
let linkA: ComputerLink
let linkB: ComputerLink
let gateA: RemoteGate
let gateB: RemoteGate
let portA = 0
let portB = 0
let gotA: { from: string; message: HandoffMessage }[]
let gotB: { from: string; message: HandoffMessage }[]
let throwOnA: Error | undefined
let audited: GateAuditEvent[]

/** A fetch whose connection leaves from a chosen loopback address, so the gate sees the "tailnet address" of the caller. */
const fetchFrom = (localAddress: string): typeof fetch => (input, init) => new Promise<Response>((resolve, reject) => {
  const url = new URL(String(input))
  const req = request({ host: url.hostname, port: url.port, path: url.pathname + url.search, method: init?.method ?? 'GET', localAddress, agent: false, headers: init?.headers as Record<string, string> }, (res) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => { resolve(new Response(new Uint8Array(Buffer.concat(chunks)), { status: res.statusCode ?? 0 })) })
  })
  req.on('error', reject)
  init?.signal?.addEventListener('abort', () => { req.destroy(new Error('aborted')) })
  req.end(init?.body as string | undefined)
})

type DepsOver = { [K in keyof RemoteGateDeps]?: RemoteGateDeps[K] | undefined }
const openGate = (over: DepsOver): RemoteGate => {
  const merged: Record<string, unknown> = {
    book: new DeviceBook(undefined, () => clock.now), pairing: new DevicePairing(memoryPairStore(), () => clock.now), requests: new PairRequests(new DeviceBook(undefined, () => clock.now), () => clock.now),
    hostLabel: 'PC', memberOf: () => undefined, allowAddress: () => true, allowRemote: () => true, now: () => clock.now,
    whois: () => Promise.resolve(undefined), selfLogin: () => Promise.resolve(undefined), audit: (event: GateAuditEvent) => audited.push(event), ...over,
  }
  return new RemoteGate(merged as unknown as RemoteGateDeps)
}

const linkDeps = (self: ReturnType<typeof generateIdentity>, over: Partial<ComputerLinkDeps> & Pick<ComputerLinkDeps, 'roster' | 'directory' | 'role' | 'port' | 'onMessage'>): ComputerLinkDeps => ({
  self: { id: idOf(self), signingSeed: self.signing.seed }, now: () => clock.now, allowAddress: () => true, ...over,
})

const received = (by: string): HandoffMessage => ({ type: 'received', transferId: 't1', personaId: 'nina', epoch: 4, digest: 'd', by, sig: 'c2ln' })

beforeEach(async () => {
  clock = { now: 1_800_000_000_000 }
  audited = []
  gotA = []
  gotB = []
  throwOnA = undefined
  registry = new ComputerRegistry({
    workspaceId: 'ws1', owner: { memberId: 'm-ana', signingSeed: OWNER.signing.seed, signingPublic: OWNER.signing.publicKey }, thisComputerId: idOf(IA),
    pairing: new DevicePairing(memoryPairStore(), () => clock.now), store: memoryRegistryStore(), now: () => clock.now,
  })
  registry.ensureSelf(publicIdentity(IA), 'PC da Ana')
  // B joins the team (the whole handshake is proved in computer-enroll.spec.ts; here it is the starting point)
  const { code } = registry.issueCode()
  const hello = registry.hello({ code, label: 'PC da padaria', signing: IB.signing.publicKey, agreement: IB.agreement.publicKey }, '100.64.0.9')
  if (!hello.ok) throw new Error('hello refused')
  registry.confirm(hello.requestId)
  const polled = registry.poll(hello.pollToken)
  if (polled.state !== 'aprovado') throw new Error('not approved')

  rosterA = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => clock.now)
  rosterA.accept(registry.signedRoster())
  registry.onRoster((roster) => { rosterA.accept(roster) })
  rosterB = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => clock.now)
  expect(rosterB.accept(polled.grant.roster)).toBe('ok')
  dirA = new ComputerDirectory(() => clock.now)
  dirB = new ComputerDirectory(() => clock.now)

  linkA = new ComputerLink(linkDeps(IA, {
    roster: rosterA, directory: dirA, port: () => portA, fetch: fetchFrom(ADDR_A),
    role: { kind: 'owner', roster: () => registry.signedRoster(), selfEndpoint: () => `${ADDR_A}:${String(portA)}` },
    onMessage: (from, message) => { if (throwOnA !== undefined) throw throwOnA; gotA.push({ from, message }) },
  }))
  gateA = openGate({ computers: registry, computerLink: { auth: new ComputerAuth(rosterA, () => clock.now), handle: (kind, from, remote, text) => linkA.handle(kind, from, remote, text) } })
  portA = await gateA.listen(ADDR_A, 0)
  linkB = new ComputerLink(linkDeps(IB, {
    roster: rosterB, directory: dirB, port: () => portB, fetch: fetchFrom(ADDR_B),
    role: { kind: 'member', ownerComputerId: idOf(IA), ownerAddress: () => `${ADDR_A}:${String(portA)}` },
    onMessage: (from, message) => { gotB.push({ from, message }) },
  }))
  gateB = openGate({ computerLink: { auth: new ComputerAuth(rosterB, () => clock.now), handle: (kind, from, remote, text) => linkB.handle(kind, from, remote, text) } })
  portB = await gateB.listen(ADDR_B, 0)
})
afterEach(async () => { linkB.stop(); await gateA.close(); await gateB.close() })

/** Every call signs at a new millisecond: the same request twice is a replay (that is the point of the memory of signatures). */
const tick = (): void => { clock.now += 1 }

describe('a member tells the owner\'s PC it is on', () => {
  it('the owner learns WHERE it is (the address the beat came from + the announced port), the member takes back the signed roster and the owner\'s own door, and both see each other online', async () => {
    expect(await linkB.beat()).toBe('ok')
    expect(dirA.endpointOf(idOf(IB))).toMatchObject({ address: `${ADDR_B}:${String(portB)}` })
    expect(dirB.endpointOf(idOf(IA))).toMatchObject({ address: `${ADDR_A}:${String(portA)}` })
    expect(rosterB.version()).toBe(registry.signedRoster()?.roster.version)
    expect(linkA.isOnline(idOf(IB))).toBe(true)
    expect(linkB.isOnline(idOf(IA))).toBe(true)
    expect(linkA.isOnline(idOf(IA))).toBe(true) // this computer is always on
    clock.now += PRESENCE_MS + 1
    expect(linkA.isOnline(idOf(IB))).toBe(false) // two beats missed: offline
    expect(linkB.isOnline(idOf(IA))).toBe(false)
  })

  it('a member that never beat is not online to the owner, and a beat from a member whose door is closed (no port) says `no-owner` without dialling', async () => {
    expect(linkA.isOnline(idOf(IB))).toBe(false)
    const deaf = new ComputerLink(linkDeps(IB, { roster: rosterB, directory: dirB, port: () => undefined, fetch: () => { throw new Error('must not dial') }, role: { kind: 'member', ownerComputerId: idOf(IA), ownerAddress: () => `${ADDR_A}:${String(portA)}` }, onMessage: () => undefined }))
    expect(await deaf.beat()).toBe('no-owner')
  })

  it('the owner does not beat (it IS the directory) and a member answers a beat with 404', async () => {
    expect(await linkA.beat()).toBe('no-owner')
    tick()
    const probe = signComputerRequest({ method: 'POST', path: '/remote/computer/beat', host: `${ADDR_B}:${String(portB)}`, body: '{"port":1}', computerId: idOf(IA), signingSeed: IA.signing.seed, now: clock.now })
    const reply = await fetchFrom(ADDR_A)(`http://${ADDR_B}:${String(portB)}/remote/computer/beat`, { method: 'POST', headers: { [COMPUTER_HEADER]: probe, 'x-persona-remote': '1' }, body: '{"port":1}' })
    expect(reply.status).toBe(404)
  })

  it('a roster that does not verify is not believed and the beat does not count (the owner is not online)', async () => {
    const lying = new ComputerLink(linkDeps(IB, {
      roster: rosterB, directory: dirB, port: () => portB, role: { kind: 'member', ownerComputerId: idOf(IA), ownerAddress: () => `${ADDR_A}:${String(portA)}` }, onMessage: () => undefined,
      fetch: () => Promise.resolve(Response.json({ ok: true, roster: { roster: { schema: 'roster/v1', workspaceId: 'ws1', version: 99, issuedAt: new Date(clock.now).toISOString(), certs: [], revoked: [] }, signature: 'AAAA' }, directory: [] })),
    }))
    expect(await lying.beat()).toBe('refused')
    expect(lying.isOnline(idOf(IA))).toBe(false)
    expect(rosterB.version()).toBe(registry.signedRoster()?.roster.version)
  })

  it('a dead owner is `unreachable`, not a hang', async () => {
    await gateA.close()
    expect(await linkB.beat()).toBe('unreachable')
    expect(linkB.isOnline(idOf(IA))).toBe(false)
  })

  it('the member keeps beating on its own: start() beats at once and every half minute, stop() ends it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const beats: number[] = []
      const spy = new ComputerLink(linkDeps(IB, { roster: rosterB, directory: dirB, port: () => portB, fetch: () => { beats.push(1); return Promise.reject(new Error('down')) }, role: { kind: 'member', ownerComputerId: idOf(IA), ownerAddress: () => `${ADDR_A}:${String(portA)}` }, onMessage: () => undefined }))
      spy.start()
      spy.start() // twice is once
      await vi.advanceTimersByTimeAsync(BEAT_MS * 2)
      expect(beats.length).toBe(3)
      spy.stop()
      await vi.advanceTimersByTimeAsync(BEAT_MS * 2)
      expect(beats.length).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('messages of the handoff go from computer to computer', () => {
  it('B reaches the owner\'s PC straight away (its address is the one it was given) and the owner reaches B once B has beaten', async () => {
    linkB.send(idOf(IA), received(idOf(IB)))
    await vi.waitFor(() => { expect(gotA).toHaveLength(1) })
    expect(gotA[0]).toMatchObject({ from: idOf(IB), message: { type: 'received', transferId: 't1' } })
    tick()
    await linkB.beat()
    tick()
    linkA.send(idOf(IB), { type: 'activated', transferId: 't1', personaId: 'nina', epoch: 4, by: idOf(IA), sig: 'c2ln' })
    await vi.waitFor(() => { expect(gotB).toHaveLength(1) })
    expect(gotB[0]).toMatchObject({ from: idOf(IA), message: { type: 'activated' } })
  })

  it('a computer whose door is not known is simply not reached: no throw, no call (the protocol\'s own timeouts decide what that means)', async () => {
    const calls: string[] = []
    const quiet = new ComputerLink(linkDeps(IA, { roster: rosterA, directory: new ComputerDirectory(() => clock.now), port: () => portA, fetch: (url) => { calls.push(String(url)); return Promise.reject(new Error('x')) }, role: { kind: 'owner', roster: () => undefined, selfEndpoint: () => undefined }, onMessage: () => undefined }))
    expect(() => { quiet.send('nao-existe', received('x')) }).not.toThrow()
    await new Promise((resolve) => { setTimeout(resolve, 30) })
    expect(calls).toEqual([])
  })

  it('this computer dials only a TAILNET address: a directory entry that says otherwise is never called', async () => {
    const calls: string[] = []
    const directory = new ComputerDirectory(() => clock.now)
    directory.note('alvo', '8.8.8.8:80')
    directory.note('lan', '192.168.0.10:80')
    const strict = new ComputerLink({ self: { id: idOf(IA), signingSeed: IA.signing.seed }, roster: rosterA, directory, port: () => portA, now: () => clock.now, fetch: (url) => { calls.push(String(url)); return Promise.reject(new Error('x')) }, role: { kind: 'owner', roster: () => undefined, selfEndpoint: () => undefined }, onMessage: () => undefined })
    strict.send('alvo', received('x'))
    strict.send('lan', received('x'))
    await new Promise((resolve) => { setTimeout(resolve, 30) })
    expect(calls).toEqual([])
  })

  it('the receiver\'s refusal is the protocol\'s own stable code (409), and any other failure is a plain 500 with no detail', () => {
    throwOnA = new HandoffError('stale-epoch')
    expect(linkA.handle('message', idOf(IB), '127.0.0.3', JSON.stringify(received(idOf(IB))))).toEqual({ status: 409, body: { ok: false, reason: 'stale-epoch' } })
    throwOnA = new Error('disk full at C:\\secret\\path')
    expect(linkA.handle('message', idOf(IB), '127.0.0.3', JSON.stringify(received(idOf(IB))))).toEqual({ status: 500, body: { ok: false, reason: 'internal' } })
  })

  it('bodies that are not JSON or not a message are 400 and reach nobody', () => {
    for (const text of ['{ nope', '[]', '{"type":"hack","transferId":"t"}', JSON.stringify({ type: 'received', transferId: 't1' })]) expect(linkA.handle('message', idOf(IB), '127.0.0.3', text), text).toEqual({ status: 400, body: { ok: false, reason: 'malformed' } })
    expect(gotA).toEqual([])
  })
})

describe('the door answers only to a computer of the team, and always with the same 401', () => {
  const callA = (headers: Record<string, string>, body: string, path = '/remote/computer/message', from = ADDR_B): Promise<Response> =>
    fetchFrom(from)(`http://${ADDR_A}:${String(portA)}${path}`, { method: 'POST', headers: { 'x-persona-remote': '1', 'content-type': 'application/json', ...headers }, body })
  const proof = (who: ReturnType<typeof generateIdentity>, body: string, path = '/remote/computer/message', host = `${ADDR_A}:${String(portA)}`): string =>
    signComputerRequest({ method: 'POST', path, host, body, computerId: idOf(who), signingSeed: who.signing.seed, now: clock.now })

  it('control: a member\'s signed message is accepted (202)', async () => {
    const body = JSON.stringify(received(idOf(IB)))
    expect((await callA({ [COMPUTER_HEADER]: proof(IB, body) }, body)).status).toBe(202)
    expect(gotA).toHaveLength(1)
  })

  it('no proof, a proof from a computer that is not on the team, a proof over another body, a replay and a proof meant for another door are all 401 and reach nobody', async () => {
    const body = JSON.stringify(received(idOf(IB)))
    const good = proof(IB, body)
    expect((await callA({}, body)).status).toBe(401)
    expect((await callA({ [COMPUTER_HEADER]: proof(STRANGER, body) }, body)).status).toBe(401)
    expect((await callA({ [COMPUTER_HEADER]: good }, body.replace('nina', 'maria'))).status).toBe(401)
    expect((await callA({ [COMPUTER_HEADER]: proof(IB, body, '/remote/computer/message', `${ADDR_B}:${String(portB)}`) }, body)).status).toBe(401)
    expect((await callA({ [COMPUTER_HEADER]: good }, body)).status).toBe(202)
    expect((await callA({ [COMPUTER_HEADER]: good }, body)).status).toBe(401) // the same request again
    expect(gotA).toHaveLength(1)
    expect(audited.filter(event => event.kind === 'computer-refused').length).toBe(5)
  })

  it('an unknown caller never makes the door read a big body: 401 (or the connection is cut while it still sends), never 413 and never a message', async () => {
    const big = 'x'.repeat(13_000_000)
    const outcome = async (run: Promise<Response>): Promise<number | 'cut'> => { try { return (await run).status } catch (error) { void error; return 'cut' } }
    for (const result of [await outcome(callA({}, big)), await outcome(callA({ [COMPUTER_HEADER]: proof(STRANGER, big) }, big))]) expect([401, 'cut']).toContain(result)
    expect(gotA).toEqual([])
    expect(audited.filter(event => event.kind === 'computer-refused').length).toBeGreaterThanOrEqual(1)
  })

  it('a revoked computer is refused from the moment the roster says so, and its beat is `refused`', async () => {
    expect(await linkB.beat()).toBe('ok')
    tick()
    registry.revoke(idOf(IB))
    tick()
    expect(await linkB.beat()).toBe('refused')
    const body = JSON.stringify(received(idOf(IB)))
    tick()
    expect((await callA({ [COMPUTER_HEADER]: proof(IB, body) }, body)).status).toBe(401)
    expect(gotA).toEqual([])
  })

  it('with no `computerLink` behind the door (the surface is OFF) both routes are a 404 and nothing is read', async () => {
    await gateA.close()
    gateA = openGate({ computers: registry })
    portA = await gateA.listen(ADDR_A, 0)
    const body = JSON.stringify(received(idOf(IB)))
    expect((await callA({ [COMPUTER_HEADER]: proof(IB, body) }, body)).status).toBe(404)
    expect((await callA({}, '{"port":1}', '/remote/computer/beat')).status).toBe(404)
  })

  it('a GET is not a route of this door', async () => {
    const reply = await fetchFrom(ADDR_B)(`http://${ADDR_A}:${String(portA)}/remote/computer/message`, { method: 'GET', headers: {} })
    expect(reply.status).toBe(401) // falls past the public routes: only a paired device speaks there
  })
})

describe('the directory', () => {
  it('keeps only `ip:port` addresses, never more than MAX_ENDPOINTS, and says who was heard within the presence window', () => {
    const at = { now: 1_000_000 }
    const directory = new ComputerDirectory(() => at.now)
    for (const bad of ['', 'host:80', '1.2.3.4', '1.2.3.4:0', '1.2.3.4:70000', '1.2.3.4:80/x', 'http://1.2.3.4:80']) expect(directory.note('x', bad), bad).toBe(false)
    expect(directory.note('a', '100.64.0.2:47310')).toBe(true)
    expect(directory.online('a')).toBe(true)
    at.now += PRESENCE_MS
    expect(directory.online('a')).toBe(false)
    expect(directory.online('desconhecido')).toBe(false)
    for (let index = 0; index < MAX_ENDPOINTS; index += 1) directory.note(`c${String(index)}`, '100.64.0.3:1')
    expect(directory.note('um-a-mais', '100.64.0.3:1')).toBe(false)
    expect(directory.note('c0', '100.64.0.4:2')).toBe(true) // an existing one may move
    directory.forget('c0')
    expect(directory.endpointOf('c0')).toBeUndefined()
  })

  it('takes the owner\'s directory by AGE (no clock of the other computer crosses the wire), keeps what is more recent, and never overwrites this computer\'s own entry', () => {
    const at = { now: 10_000_000 }
    const directory = new ComputerDirectory(() => at.now)
    directory.note('b', '100.64.0.5:1', at.now - 1_000) // heard 1 s ago
    directory.merge([
      { computerId: 'b', address: '100.64.0.5:9', ageMs: 50_000 }, // older than what is held: ignored
      { computerId: 'c', address: '100.64.0.6:2', ageMs: 20_000 },
      { computerId: 'eu', address: '100.64.0.7:3', ageMs: 0 }, // me: never overwritten
      { computerId: 'd', address: 'not an address', ageMs: 0 },
      { computerId: 'e', address: '100.64.0.8:4', ageMs: -5 },
      { computerId: 'f', address: '100.64.0.9:5', ageMs: Number.NaN },
      'lixo', null, 42,
    ], 'eu')
    expect(directory.endpointOf('b')?.address).toBe('100.64.0.5:1')
    expect(directory.endpointOf('c')).toMatchObject({ address: '100.64.0.6:2', lastSeen: at.now - 20_000 })
    expect(['eu', 'd', 'e', 'f'].map(id => directory.endpointOf(id))).toEqual([undefined, undefined, undefined, undefined])
    directory.merge('not a list', 'eu')
    expect(directory.wire().map(item => item.computerId).sort()).toEqual(['b', 'c'])
    at.now += 5_000
    expect(directory.wire().find(item => item.computerId === 'c')?.ageMs).toBe(25_000)
  })
})

describe('what counts as a handoff message', () => {
  const base = { transferId: 't1', personaId: 'nina', epoch: 4, by: 'c1', sig: 's' }
  it('accepts the four shapes the protocol sends', () => {
    const sealed = { header: {}, wrap: {}, sealed: {} }
    expect(cleanMessage({ type: 'bundle', transferId: 't1', digest: 'd', sealed })?.type).toBe('bundle')
    expect(cleanMessage({ type: 'received', ...base, digest: 'd' })?.type).toBe('received')
    expect(cleanMessage({ type: 'released', transferId: 't1', personaId: 'nina', epoch: 4, from: 'a', to: 'b', activateBefore: 1, sig: 's' })?.type).toBe('released')
    expect(cleanMessage({ type: 'activated', ...base })?.type).toBe('activated')
  })

  it('refuses what is missing a field, has the wrong type, a number that is not finite, or a type nobody sends', () => {
    expect(cleanMessage({ type: 'bundle', transferId: 't1', digest: 'd' })).toBeUndefined() // no sealed bundle
    expect(cleanMessage({ type: 'bundle', transferId: 't1', digest: 'd', sealed: { header: {}, wrap: {} } })).toBeUndefined()
    expect(cleanMessage({ type: 'received', ...base })).toBeUndefined() // no digest
    expect(cleanMessage({ type: 'activated', ...base, epoch: Number.POSITIVE_INFINITY })).toBeUndefined()
    expect(cleanMessage({ type: 'activated', ...base, epoch: '4' })).toBeUndefined()
    expect(cleanMessage({ type: 'activated', ...base, by: 'x'.repeat(400) })).toBeUndefined()
    expect(cleanMessage({ type: 'released', transferId: 't1', personaId: 'nina', epoch: 4, from: 'a', to: 'b', sig: 's' })).toBeUndefined() // no activateBefore
    for (const bad of [null, 'x', 42, [], {}, { type: 'hack', transferId: 't' }, { type: 'activated' }]) expect(cleanMessage(bad)).toBeUndefined()
  })
})
