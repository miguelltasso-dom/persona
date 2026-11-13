import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryIdentityStore, generateIdentity, publicIdentity, type IdentityStore } from '@deepseek-ai/dsh-persona-sync'
import { RosterGuard, computerIdOf, memoryRosterStore } from '../src/computers/computer-cert.ts'
import { ComputerAuth } from '../src/computers/computer-auth.ts'
import type { ComputerLinkDeps } from '../src/computers/computer-link.ts'
import { ComputerDirectory, ComputerLink } from '../src/computers/computer-link.ts'
import { ComputerRegistry, memoryRegistryStore } from '../src/computers/computer-registry.ts'
import { ComputersHost } from '../src/computers/computers-host.ts'
import { viewWire } from '../src/computers/computers-wire.ts'
import { DeviceBook } from '../src/remote-web/device-book.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'
import { PairRequests } from '../src/remote-web/pair-requests.ts'
import { RemoteGate, type RemoteGateDeps } from '../src/remote-web/remote-gate.ts'
import { ComputerPresence, createBeatBuilder, type Beat } from '../src/station/computer-presence.ts'

const ADDR_A = '127.0.0.2'
const ADDR_B = '127.0.0.3'
const idOf = (who: ReturnType<typeof generateIdentity>): string => computerIdOf(publicIdentity(who))

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

const openGate = (clock: { now: number }, over: Partial<RemoteGateDeps>): RemoteGate => {
  const merged: Record<string, unknown> = {
    book: new DeviceBook(undefined, () => clock.now),
    pairing: new DevicePairing(memoryPairStore(), () => clock.now),
    requests: new PairRequests(new DeviceBook(undefined, () => clock.now), () => clock.now),
    hostLabel: 'PC',
    memberOf: () => undefined,
    allowAddress: () => true,
    allowRemote: () => true,
    now: () => clock.now,
    whois: () => Promise.resolve(undefined),
    selfLogin: () => Promise.resolve(undefined),
    audit: () => undefined,
    ...over,
  }
  return new RemoteGate(merged as unknown as RemoteGateDeps)
}

describe('ComputerLink & ComputersHost presence hooks (M4/D-116)', () => {
  const dirs: string[] = []
  const disposables: (() => Promise<void> | void)[] = []
  beforeEach(() => { dirs.length = 0; disposables.length = 0 })
  afterEach(async () => {
    for (const drop of disposables.splice(0).reverse()) await drop()
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  it('sends validated Beat status from member to owner, drops unknown/PII fields, and never triggers onBeat for un-rostered callers', async () => {
    const owner = generateIdentity()
    const idA = generateIdentity()
    const idB = generateIdentity()
    const stranger = generateIdentity()
    const clock = { now: 1_800_000_000_000 }
    const registry = new ComputerRegistry({
      workspaceId: 'ws1', owner: { memberId: 'm-ana', signingSeed: owner.signing.seed, signingPublic: owner.signing.publicKey }, thisComputerId: idOf(idA),
      pairing: new DevicePairing(memoryPairStore(), () => clock.now), store: memoryRegistryStore(), now: () => clock.now,
    })
    registry.ensureSelf(publicIdentity(idA), 'PC da Ana')
    const { code } = registry.issueCode()
    const hello = registry.hello({ code, label: 'PC da padaria', signing: idB.signing.publicKey, agreement: idB.agreement.publicKey }, '100.64.0.9')
    if (!hello.ok) throw new Error('hello failed')
    registry.confirm(hello.requestId)
    const polled = registry.poll(hello.pollToken)
    if (polled.state !== 'aprovado') throw new Error('not approved')

    const rosterA = new RosterGuard('ws1', owner.signing.publicKey, memoryRosterStore(), () => clock.now)
    rosterA.accept(registry.signedRoster())
    registry.onRoster((signed) => { rosterA.accept(signed) })
    const rosterB = new RosterGuard('ws1', owner.signing.publicKey, memoryRosterStore(), () => clock.now)
    rosterB.accept(polled.grant.roster)
    const dirA = new ComputerDirectory(() => clock.now)
    const dirB = new ComputerDirectory(() => clock.now)

    const beats: { from: string; status: Beat | undefined }[] = []
    let portA = 0
    let portB = 0
    const nextBeat: Beat = {
      counter: 1, running: true, ram: { totalBytes: 16 * 1024 ** 3, freeBytes: 8 * 1024 ** 3 }, personaCount: 2, queue: 0, aiAccountLabel: 'Claude',
    }

    const linkA = new ComputerLink({
      self: { id: idOf(idA), signingSeed: idA.signing.seed }, roster: rosterA, directory: dirA, port: () => portA, fetch: fetchFrom(ADDR_A),
      allowAddress: () => true, now: () => clock.now, role: { kind: 'owner', roster: () => registry.signedRoster(), selfEndpoint: () => `${ADDR_A}:${String(portA)}` },
      onMessage: () => undefined,
      onBeat: (from, status) => { beats.push({ from, status }) },
    } satisfies ComputerLinkDeps)
    const gateA = openGate(clock, { computers: registry, computerLink: { auth: new ComputerAuth(rosterA, () => clock.now), handle: (kind, from, remote, text) => linkA.handle(kind, from, remote, text) } })
    portA = await gateA.listen(ADDR_A, 0)
    disposables.push(() => gateA.close())

    const linkB = new ComputerLink({
      self: { id: idOf(idB), signingSeed: idB.signing.seed }, roster: rosterB, directory: dirB, port: () => portB, fetch: fetchFrom(ADDR_B),
      allowAddress: () => true, now: () => clock.now, role: { kind: 'member', ownerComputerId: idOf(idA), ownerAddress: () => `${ADDR_A}:${String(portA)}` },
      onMessage: () => undefined,
      beatStatus: () => nextBeat,
    } satisfies ComputerLinkDeps)
    const gateB = openGate(clock, { computerLink: { auth: new ComputerAuth(rosterB, () => clock.now), handle: (kind, from, remote, text) => linkB.handle(kind, from, remote, text) } })
    portB = await gateB.listen(ADDR_B, 0)
    disposables.push(() => { linkB.stop(); return gateB.close() })

    expect(await linkB.beat()).toBe('ok')
    expect(beats).toHaveLength(1)
    expect(beats[0]).toEqual({
      from: idOf(idB),
      status: { counter: 1, running: true, ram: { totalBytes: 16 * 1024 ** 3, freeBytes: 8 * 1024 ** 3 }, personaCount: 2, queue: 0, aiAccountLabel: 'Claude' },
    })

    // Closed schema validation: direct malformed/unknown fields or PII label on the beat door must not leak into onBeat.
    clock.now += 1
    const withGarbage = linkA.handle('beat', idOf(idB), ADDR_B, JSON.stringify({
      port: portB,
      status: { counter: 2, running: false, ram: { totalBytes: 100, freeBytes: 50 }, personaCount: 1, queue: 0, aiAccountLabel: 'Codex', evil: 'drop-me', token: 'sk-secret' },
    }))
    expect(withGarbage.status).toBe(200)
    expect(beats[1]?.status).toEqual({ counter: 2, running: false, ram: { totalBytes: 100, freeBytes: 50 }, personaCount: 1, queue: 0, aiAccountLabel: 'Codex' })

    clock.now += 1
    const withEmail = linkA.handle('beat', idOf(idB), ADDR_B, JSON.stringify({
      port: portB,
      status: { counter: 3, running: true, ram: { totalBytes: 100, freeBytes: 50 }, personaCount: 1, queue: 0, aiAccountLabel: 'ana@example.com' },
    }))
    expect(withEmail.status).toBe(200)
    expect(beats[2]?.status).toBeUndefined()

    // Un-rostered computer must be rejected with 401 and never reach onBeat.
    const unknownReply = linkA.handle('beat', idOf(stranger), ADDR_B, JSON.stringify({
      port: portB,
      status: { counter: 1, running: true, ram: { totalBytes: 100, freeBytes: 50 }, personaCount: 0, queue: 0 },
    }))
    expect(unknownReply.status).toBe(401)
    expect(beats).toHaveLength(3)
  })

  it('wires ComputersHost.rosterComputers(), presence(), beatStatus, and onBeat across two real gates, and viewWire carries optional presence', async () => {
    const tmp = (): string => { const dir = mkdtempSync(join(tmpdir(), 'persona-ch-pres-')); dirs.push(dir); return dir }
    const clock = { now: 1_800_000_000_000 }
    const idA = generateIdentity()
    const idB = generateIdentity()
    const storeA: IdentityStore = new MemoryIdentityStore(); await storeA.save(idA)
    const storeB: IdentityStore = new MemoryIdentityStore(); await storeB.save(idB)
    let portA = 0
    let portB = 0

    const hostRef: { current?: ComputersHost } = {}
    const presenceA = new ComputerPresence({
      now: () => clock.now,
      roster: () => hostRef.current?.rosterComputers() ?? [],
    })
    const hostA = new ComputersHost({
      dataDir: tmp(), hostLabel: 'PC da Ana', identityStore: storeA, workspaceId: () => 'ws1', ownerMemberId: () => 'm-ana',
      gatePort: () => portA, gateEndpoint: () => `${ADDR_A}:${String(portA)}`, now: () => clock.now, fetch: fetchFrom(ADDR_A), allowAddress: () => true,
      presence: presenceA,
      onBeat: (from, beat) => { if (beat !== undefined) presenceA.heartbeat(from, beat) },
    })
    hostRef.current = hostA
    expect(hostA.rosterComputers()).toEqual([])

    const buildBeatB = createBeatBuilder({
      isRunning: () => true, ram: () => ({ totalBytes: 16 * 1024 ** 3, freeBytes: 8 * 1024 ** 3 }), personaCount: () => 2, queue: () => 1, aiAccountLabel: () => 'Claude',
    })
    const hostB = new ComputersHost({
      dataDir: tmp(), hostLabel: 'PC da padaria', identityStore: storeB, workspaceId: () => 'ws-b', ownerMemberId: () => 'm-b',
      gatePort: () => portB, gateEndpoint: () => `${ADDR_B}:${String(portB)}`, now: () => clock.now, fetch: fetchFrom(ADDR_B), allowAddress: () => true,
      beatStatus: () => buildBeatB(),
    })

    const gateA = openGate(clock, { computers: hostA.door, computerLink: hostA.linkDoor, whois: () => Promise.resolve({ node: 'ana', login: 'ana@x' }) })
    portA = await gateA.listen(ADDR_A, 0)
    disposables.push(() => gateA.close())
    const gateB = openGate(clock, { computers: hostB.door, computerLink: hostB.linkDoor, whois: () => Promise.resolve({ node: 'padaria', login: 'ana@x' }) })
    portB = await gateB.listen(ADDR_B, 0)
    disposables.push(() => gateB.close())

    const svcA = await hostA.service()
    const svcB = await hostB.service()
    if (typeof svcA === 'string' || typeof svcB === 'string') throw new Error('service unavailable')
    const issued = svcA.issueCode()
    if (!issued.ok || issued.code === undefined) throw new Error('no code')
    await svcB.enroll({ ownerAddress: `${ADDR_A}:${String(portA)}`, code: issued.code, label: 'PC da padaria' })
    const req = svcA.view().requests[0]
    if (req === undefined) throw new Error('no request')
    expect(svcA.confirm(req.requestId).ok).toBe(true)
    await vi.waitFor(() => { expect(svcB.view().enrollment.state).toBe('cadastrado') }, { timeout: 5_000 })
    await hostB.service()

    const rosterA = hostA.rosterComputers()
    expect(rosterA).toHaveLength(2)
    expect(rosterA.find(item => item.computerId === idOf(idA))?.isThis).toBe(true)

    const liveB = await hostB.ready()
    if (typeof liveB === 'string') throw new Error('liveB unavailable')
    expect(await liveB.link.beat()).toBe('ok')

    const listA = hostA.presence()
    const rowB = listA.find(item => item.computerId === idOf(idB))
    expect(rowB).toMatchObject({ computerId: idOf(idB), state: 'ligado', aiAccountLabel: 'Claude', personas: 2 })
    expect(rowB?.capacity).toBeGreaterThan(0)

    const wired = viewWire(svcA.view(), listA)
    expect(wired.presence).toHaveLength(2)
  })
})
