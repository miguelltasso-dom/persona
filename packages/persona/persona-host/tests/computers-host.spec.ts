import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUNDLE_SCHEMA, BUNDLE_TTL_MS, MemoryIdentityStore, generateIdentity, newBundleId, publicIdentity, type Identity, type IdentityStore, type PersonaBundle } from '@deepseek-ai/dsh-persona-sync'
import { computerIdOf } from '../src/computers/computer-cert.ts'
import { ComputersHost, type ComputersHostDeps, type PersonaTransferPorts } from '../src/computers/computers-host.ts'
import { ComputersService } from '../src/computers/computers-service.ts'
import type { RunEvent, RunHandle, StartTurnInput } from '@deepseek-ai/dsh-persona-runners'
import type { ExecutorRunner } from '../src/computers/turn-executor.ts'
import { PersonaHomeBook, type HomeDoc, type HomeStore } from '../src/persona-home.ts'
import { DeviceBook } from '../src/remote-web/device-book.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'
import { PairRequests } from '../src/remote-web/pair-requests.ts'
import { RemoteGate, type RemoteGateDeps } from '../src/remote-web/remote-gate.ts'

/**
 * D-116 end to end on REAL sockets: two PCs, each with its own host composition and its own gate (two loopback aliases stand in for two tailnet addresses). The first PC issues a code and becomes the owner's; the
 * second types it, is confirmed, beats, and a persona is taken from the first to the second: A releases only after B holds her, B activates after A released, and the persona is never `active` on both.
 */
const ADDR_A = '127.0.0.2'
const ADDR_B = '127.0.0.3'
const PERSONA = 'nina'
const dirs: string[] = []
const tmp = (): string => { const dir = mkdtempSync(join(tmpdir(), 'persona-computers-')); dirs.push(dir); return dir }

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

class Kv implements HomeStore {
  readonly docs = new Map<string, HomeDoc>()
  get(projectId: string, kind: string, id: string): HomeDoc | undefined { return this.docs.get(`${projectId}|${kind}|${id}`) }
  put(projectId: string, kind: string, id: string, value: HomeDoc): void { this.docs.set(`${projectId}|${kind}|${id}`, value) }
}

interface Pc {
  readonly name: 'A' | 'B'
  readonly identity: Identity
  readonly id: string
  readonly host: ComputersHost
  readonly gate: RemoteGate
  readonly book: PersonaHomeBook
  readonly kv: Kv
  readonly applied: PersonaBundle[]
  readonly wiped: string[]
  readonly stops: string[]
  port: number
  dir: string
}

let clock: { now: number }
const tick = (): void => { clock.now += 1 }

async function pc(name: 'A' | 'B', over: { identity?: Identity; dir?: string; store?: IdentityStore; workspaceId?: () => string | undefined; persona?: boolean; runner?: ExecutorRunner; creator?: string; grant?: boolean; noGrantPort?: boolean; d121?: boolean } = {}): Promise<Pc> {
  const identity = over.identity ?? generateIdentity()
  const id = computerIdOf(publicIdentity(identity))
  const store = over.store ?? new MemoryIdentityStore()
  if (over.store === undefined) await store.save(identity)
  const dir = over.dir ?? tmp()
  const kv = new Kv()
  const stops: string[] = []
  const applied: PersonaBundle[] = []
  const wiped: string[] = []
  const book = new PersonaHomeBook({ store: kv, thisComputerId: () => id, projectOf: p => (p === PERSONA ? 'p1' : undefined), personaIds: () => [PERSONA], stopRuntime: (_p, reason) => { stops.push(reason) } })
  const addr = name === 'A' ? ADDR_A : ADDR_B
  const state: { port: number } = { port: 0 }
  const persona: PersonaTransferPorts = {
    homes: book,
    makeBundle: ({ personaId, toComputerId, epoch, includesPrivateDm }): PersonaBundle => ({
      schema: BUNDLE_SCHEMA, id: newBundleId(), personaId, workspaceId: 'ws1', fromComputerId: id, toComputerId, epoch, createdAt: new Date(clock.now).toISOString(), notAfter: new Date(clock.now + BUNDLE_TTL_MS).toISOString(), includesPrivateDm,
      sheet: { json: '{"name":"Nina"}', signature: 'c2ln', signerSigningPublic: identity.signing.publicKey }, memory: [{ id: 'm1', kind: 'note', body: 'A Ana gosta de bolo.', updatedAt: new Date(clock.now).toISOString() }], rules: [], skills: [],
    }),
    wipe: (personaId) => { wiped.push(personaId) }, restore: () => undefined, apply: (bundle) => { applied.push(bundle) }, verifySheet: () => true,
    hostingFacts: () => ({ creatorMemberId: 'm-ana', personasOfCreatorHere: 0, autonomy: 'baixa' }),
    previewOf: p => (p === PERSONA ? { memoryItems: 1, rules: 0, skills: 0, bytes: 100, openTurn: false, hasPrivateDm: false } : undefined),
    creatorOf: p => (p === PERSONA ? { memberId: over.creator ?? 'm-ana', autonomy: 'baixa' } : undefined), hostedBy: () => 0,
    ...(over.noGrantPort === true ? {} : { hostGrantOf: () => ({ granted: over.grant ?? true, by: over.grant === false ? '' : 'm-ana' }) }),
  }
  const ports: PersonaTransferPorts = over.d121 === true
    ? { homes: persona.homes, creatorOf: persona.creatorOf, hostedBy: persona.hostedBy, ...(persona.hostGrantOf === undefined ? {} : { hostGrantOf: persona.hostGrantOf }), sheetJsonOf: id => (id === PERSONA ? '{"name":"Nina","instructions":"Ajude."}' : undefined) }
    : persona
  const deps: ComputersHostDeps = {
    dataDir: dir, hostLabel: name === 'A' ? 'PC da Ana' : 'PC da padaria', identityStore: store, workspaceId: over.workspaceId ?? (() => (name === 'A' ? 'ws1' : 'ws-b')), ownerMemberId: () => (name === 'A' ? 'm-ana' : 'm-b'),
    gatePort: () => state.port, gateEndpoint: () => `${addr}:${String(state.port)}`, ...(over.persona === false ? {} : { persona: () => ports }), ...(over.runner === undefined ? {} : { runner: () => over.runner }), now: () => clock.now, fetch: fetchFrom(addr), allowAddress: () => true,
  }
  const host = new ComputersHost(deps)
  const merged: Record<string, unknown> = {
    book: new DeviceBook(undefined, () => clock.now), pairing: new DevicePairing(memoryPairStore(), () => clock.now), requests: new PairRequests(new DeviceBook(undefined, () => clock.now), () => clock.now),
    hostLabel: 'PC', memberOf: () => undefined, allowAddress: () => true, allowRemote: () => true, now: () => clock.now, whois: () => Promise.resolve({ node: 'padaria', login: 'ana@example.com' }),
    selfLogin: () => Promise.resolve(undefined), audit: () => undefined, computers: host.door, computerLink: host.linkDoor,
  }
  const gate = new RemoteGate(merged as unknown as RemoteGateDeps)
  state.port = await gate.listen(addr, 0)
  return { name, identity, id, host, gate, book, kv, applied, wiped, stops, get port() { return state.port }, set port(value: number) { state.port = value }, dir }
}

const serviceOf = async (p: Pc): Promise<ComputersService> => {
  const service = await p.host.service()
  if (typeof service === 'string') throw new Error(`computers unavailable: ${service}`)
  return service
}

/** This PC's computer-to-computer link, once built (a test drives the beat by hand; the app beats on a timer). */
const beatOf = async (p: Pc): Promise<string> => {
  const live = await p.host.ready()
  if (typeof live === 'string') throw new Error(`computers unavailable: ${live}`)
  return live.link.beat()
}

let pcs: Pc[]
beforeEach(() => { clock = { now: 1_800_000_000_000 }; pcs = [] })
afterEach(async () => { for (const item of pcs) { item.host.stop(); await item.gate.close() } for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const spawn = async (...args: Parameters<typeof pc>): Promise<Pc> => { const made = await pc(...args); pcs.push(made); return made }

/** A issues a code, B types it, A confirms, B collects what A signed and becomes a member. */
async function joinTeam(a: Pc, b: Pc): Promise<void> {
  const serviceA = await serviceOf(a)
  const serviceB = await serviceOf(b)
  const issued = serviceA.issueCode()
  if (!issued.ok) throw new Error(`no code: ${issued.reason}`)
  const typed = await serviceB.enroll({ ownerAddress: `${ADDR_A}:${String(a.port)}`, code: issued.code, label: 'PC da padaria', ramMb: 8192 })
  expect(typed).toMatchObject({ ok: true, enrollment: { state: 'esperando-o-dono' } })
  const request = serviceA.view().requests[0]
  expect(request).toMatchObject({ label: 'PC da padaria', node: 'padaria' })
  expect(serviceA.confirm(request?.requestId ?? '')).toEqual({ ok: true })
  await vi.waitFor(() => { expect(serviceB.view().enrollment.state).toBe('cadastrado') }, { timeout: 5_000 })
}

describe('becoming the owner\'s PC and joining it', () => {
  it('a fresh PC is neither; its first code makes it the owner\'s; the second PC types it and becomes a member; both then list both computers', async () => {
    const a = await spawn('A')
    const b = await spawn('B')
    const fresh = await serviceOf(a)
    expect(fresh.view()).toMatchObject({ isOwnerPc: false, computers: [] })
    await joinTeam(a, b)
    const owner = await serviceOf(a)
    expect(owner.view().isOwnerPc).toBe(true)
    expect(owner.view().computers.map(item => item.label)).toEqual(['PC da Ana', 'PC da padaria'])
    const member = await serviceOf(b) // the next call rebuilds the state in the member's role
    expect(member.view()).toMatchObject({ isOwnerPc: false, requests: [], enrollment: { state: 'cadastrado' } })
    expect(member.view().computers.map(item => item.label)).toEqual(['PC da padaria', 'PC da Ana'])
    expect(member.issueCode()).toEqual({ ok: false, reason: 'not-owner-pc' })
    expect(await owner.enroll({ ownerAddress: `${ADDR_B}:${String(b.port)}`, code: 'AAAA-BBBB', label: 'x' })).toEqual({ ok: false, reason: 'owner-pc-cannot-join' })
  })

  it('the identity is the DEVICE\'s own and stays: a restart reads back the same computer, the same role and the same list', async () => {
    const a = await spawn('A')
    const b = await spawn('B')
    await joinTeam(a, b)
    await serviceOf(b)
    const reopenedA = await spawn('A', { identity: a.identity, dir: a.dir })
    expect((await serviceOf(reopenedA)).view()).toMatchObject({ isOwnerPc: true, thisComputerId: a.id })
    expect((await serviceOf(reopenedA)).view().computers).toHaveLength(2)
    const reopenedB = await spawn('B', { identity: b.identity, dir: b.dir })
    expect((await serviceOf(reopenedB)).view()).toMatchObject({ isOwnerPc: false, thisComputerId: b.id, enrollment: { state: 'cadastrado' } })
  })

  it('without the Cofre (no DPAPI) no identity is made and the computers say so; with no workspace yet they say that', async () => {
    const broken: IdentityStore = { load: () => Promise.reject(new Error('Cofre indisponível')), save: () => Promise.reject(new Error('Cofre indisponível')) }
    const noCofre = await spawn('A', { store: broken })
    expect(await noCofre.host.service()).toBe('identity-unavailable')
    expect(noCofre.host.door.hello({ code: 'AAAA-BBBB', label: 'x', signing: 'a', agreement: 'b' }, '100.64.0.2')).toEqual({ ok: false, reason: 'recusado' })
    const noTeam = await spawn('A', { workspaceId: () => undefined })
    expect(await noTeam.host.service()).toBe('no-workspace')
  })

  it('the doors answer "nobody" until the state is built (the gate can open before the identity is read)', async () => {
    const a = await spawn('A')
    expect(a.host.door.poll('x')).toEqual({ state: 'desconhecido' })
    expect(a.host.linkDoor.auth.precheck('v1.a.1.b')).toEqual({ refused: 'unknown-computer' })
    expect(a.host.linkDoor.handle('beat', 'x', '127.0.0.1', '{}')).toEqual({ status: 404, body: { ok: false } })
  })
})

describe('taking a persona to the other computer, over the wire', () => {
  it('A releases only after B holds her and B activates only after A released: she ends on B at epoch + 1, never active on both', async () => {
    const a = await spawn('A')
    const b = await spawn('B')
    await joinTeam(a, b)
    const serviceA = await serviceOf(a)
    const serviceB = await serviceOf(b)
    a.book.set(PERSONA, { computerId: a.id, epoch: 3 }, new Date(clock.now).toISOString())
    b.book.set(PERSONA, { computerId: a.id, epoch: 3 }, new Date(clock.now).toISOString())
    tick()
    expect(await beatOf(b)).toBe('ok') // B tells A "I am here, my door is on this port"
    expect(serviceA.view().computers.find(item => !item.isThis)?.online).toBe(true)
    expect(serviceA.preview(PERSONA, b.id)).toMatchObject({ ok: true, toLabel: 'PC da padaria', notes: ['ai-login-stays'] })
    expect(serviceA.move({ personaId: PERSONA, toComputerId: b.id, confirm: false })).toEqual({ ok: false, reason: 'confirm-required' })

    const moved = serviceA.move({ personaId: PERSONA, toComputerId: b.id, confirm: true })
    if (!moved.ok) throw new Error(`move refused: ${moved.reason}`)
    expect(a.book.runsHere(PERSONA)).toBe(false) // closed on A at once: `moving` is durable BEFORE anything is sent
    await vi.waitFor(() => { expect(b.book.resolve(PERSONA)).toMatchObject({ computerId: b.id, epoch: 4, state: 'active' }) }, { timeout: 5_000 })
    expect(a.wiped).toEqual([PERSONA]) // A let go of her only because B had answered `received`
    expect(b.applied).toHaveLength(1)
    expect(b.applied[0]?.memory[0]?.body).toContain('bolo')
    expect(b.book.runsHere(PERSONA)).toBe(true)
    expect(a.book.runsHere(PERSONA)).toBe(false)
    await vi.waitFor(() => { expect(serviceA.transfer(moved.transferId)).toMatchObject({ ok: true, transfer: { phase: 'done', toLabel: 'PC da padaria', destinationSilent: false } }) }, { timeout: 5_000 })
    expect(serviceB.home(PERSONA)).toMatchObject({ ok: true, home: { isThis: true, computerLabel: 'PC da padaria', epoch: 4 } })
    expect(serviceA.home(PERSONA)).toMatchObject({ ok: true, home: { isThis: false, computerLabel: 'PC da padaria', epoch: 4 } })
  })

  it('a computer that has not beaten is `destination-offline`: nothing is closed and nothing is sent', async () => {
    const a = await spawn('A')
    const b = await spawn('B')
    await joinTeam(a, b)
    const serviceA = await serviceOf(a)
    await serviceOf(b)
    a.book.set(PERSONA, { computerId: a.id, epoch: 3 }, new Date(clock.now).toISOString())
    expect(serviceA.move({ personaId: PERSONA, toComputerId: b.id, confirm: true })).toEqual({ ok: false, reason: 'destination-offline' })
    expect(a.book.runsHere(PERSONA)).toBe(true)
    expect(a.stops).toEqual([])
  })

  it('without the host\'s persona ports `movePersona` says it cannot, and does not close anything', async () => {
    const a = await spawn('A', { persona: false })
    const b = await spawn('B')
    await joinTeam(a, b)
    const serviceA = await serviceOf(a)
    await serviceOf(b)
    tick()
    await beatOf(b)
    expect(serviceA.move({ personaId: PERSONA, toComputerId: b.id, confirm: true })).toEqual({ ok: false, reason: 'unknown-persona' })
  })
})

/** A runner for B: it calls the first product tool of the turn once, then ends. It records what it was asked to run. */
function fakeRunner(seen: StartTurnInput[]): ExecutorRunner {
  const handles = new Map<string, StartTurnInput>()
  return {
    startTurn: (input) => {
      seen.push(input)
      const handle: RunHandle = { runId: `b-run-${String(seen.length)}`, sessionId: 's-b', ticketId: input.ticketId, assignmentId: input.assignmentId, personaId: input.personaId, cwd: input.cwd, model: input.model }
      handles.set(handle.runId, input)
      return Promise.resolve(handle)
    },
    async *stream(handle): AsyncGenerator<RunEvent> {
      const input = handles.get(handle.runId)
      yield { type: 'started', at: new Date().toISOString(), handle }
      const result = await input?.mcpTools?.tools[0]?.handler({ text: 'bom dia, equipe' })
      yield { type: 'delta', at: new Date().toISOString(), text: result?.content ?? 'sem ferramenta' }
      yield { type: 'ended', at: new Date().toISOString(), report: { state: 'ready', summary: `postei: ${result?.content ?? '?'}` } }
    },
    cancel: () => Promise.resolve(),
  }
}

describe('the executor over the wire: the persona lives on B, the project and her tools stay on A', () => {
  it('A sends the turn to B through the signed door; B runs it with ITS runner in ITS folder; the tool call comes back to A, runs there once, and the events come back', async () => {
    const seen: StartTurnInput[] = []
    const a = await spawn('A')
    const b = await spawn('B', { runner: fakeRunner(seen) })
    await joinTeam(a, b)
    await serviceOf(a)
    await serviceOf(b)
    const stamp = new Date(clock.now).toISOString()
    a.book.set(PERSONA, { computerId: b.id, epoch: 4 }, stamp) // she lives on B (the book of each computer says so)
    b.book.set(PERSONA, { computerId: b.id, epoch: 4 }, stamp)
    tick()
    expect(await beatOf(b)).toBe('ok') // A knows B is on and where its door is
    const turns = a.host.remoteTurns()
    if (turns === undefined) throw new Error('no remote turns on the owner PC')
    expect(turns.isRemote(PERSONA)).toBe(true)

    const ran: Record<string, unknown>[] = []
    const closed = vi.fn()
    const handle = await turns.runner.startTurn({
      ticketId: 'tk1', assignmentId: 'as1', personaId: PERSONA, cwd: 'C:\\projeto-da-A', prompt: 'Cumprimente a equipe.', model: 'sonnet',
      mcpTools: { server: 'persona', tools: [{ name: 'post_message', description: 'Fala no canal.', inputSchema: { type: 'object' }, handler: (args) => { ran.push(args); return Promise.resolve({ content: 'mensagem postada' }) } }], close: closed },
    })
    const events: RunEvent[] = []
    for await (const event of turns.runner.stream(handle)) events.push(event)
    expect(events.map(event => event.type)).toEqual(['started', 'delta', 'ended'])
    expect(events[1]).toMatchObject({ text: 'mensagem postada' })
    expect(events[2]).toMatchObject({ report: { state: 'ready', summary: 'postei: mensagem postada' } })
    expect(ran).toEqual([{ text: 'bom dia, equipe' }]) // the handler of A ran once, with the arguments B's runner gave
    expect(closed).toHaveBeenCalledTimes(1)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.cwd).not.toContain('projeto-da-A') // B's own folder, never A's
    expect(seen[0]?.cwd).toContain('executor')
    expect(JSON.stringify(events[0])).not.toContain('b-run-') // A's handle, not B's
  })

  it('B refuses a turn whose epoch it does not hold, and a member has no remote turns of its own to send', async () => {
    const seen: StartTurnInput[] = []
    const a = await spawn('A')
    const b = await spawn('B', { runner: fakeRunner(seen) })
    await joinTeam(a, b)
    await serviceOf(a)
    await serviceOf(b)
    const stamp = new Date(clock.now).toISOString()
    a.book.set(PERSONA, { computerId: b.id, epoch: 4 }, stamp) // A believes she is on B at epoch 4...
    // ...but B's own book has no record of her (so she is "here at epoch 0" for it): an order for epoch 4 is not one it can obey
    tick()
    await beatOf(b)
    const turns = a.host.remoteTurns()
    if (turns === undefined) throw new Error('no remote turns')
    await expect(turns.runner.startTurn({ ticketId: 'tk2', assignmentId: 'as2', personaId: PERSONA, cwd: 'C:\\x', prompt: 'x', model: 'm' })).rejects.toMatchObject({ code: 'epoch' })
    expect(seen).toEqual([])
    const asMember = b.host.remoteTurns()
    expect(asMember).toBeUndefined() // a member has no turns of its own to send
  })

  it('the home is checked again AT START (Lumen b): a creator the home certificate does not host for is `home-not-trusted`, and no prompt is sent', async () => {
    const seen: StartTurnInput[] = []
    const a = await spawn('A', { creator: 'm-zed' }) // the persona's creator is not among the members B's certificate hosts for
    const b = await spawn('B', { runner: fakeRunner(seen) })
    await joinTeam(a, b)
    await serviceOf(a)
    await serviceOf(b)
    const stamp = new Date(clock.now).toISOString()
    a.book.set(PERSONA, { computerId: b.id, epoch: 4 }, stamp)
    b.book.set(PERSONA, { computerId: b.id, epoch: 4 }, stamp)
    tick()
    await beatOf(b)
    const turns = a.host.remoteTurns()
    if (turns === undefined) throw new Error('no remote turns')
    await expect(turns.runner.startTurn({ ticketId: 'tk3', assignmentId: 'as3', personaId: PERSONA, cwd: 'C:\\x', prompt: 'x', model: 'm' })).rejects.toMatchObject({ code: 'home-not-trusted' })
    expect(seen, 'nothing reached B').toEqual([])
  })

  it('the persona\'s audience x the computer\'s kind is asked AT START (Lumen D-117): no grant = `home-not-trusted` and nothing is sent; a port that is not there is no grant (fails closed)', async () => {
    for (const over of [{ grant: false }, { noGrantPort: true }]) {
      const seen: StartTurnInput[] = []
      const a = await spawn('A', over)
      const b = await spawn('B', { runner: fakeRunner(seen) })
      await joinTeam(a, b)
      await serviceOf(a)
      await serviceOf(b)
      const stamp = new Date(clock.now).toISOString()
      a.book.set(PERSONA, { computerId: b.id, epoch: 4 }, stamp)
      b.book.set(PERSONA, { computerId: b.id, epoch: 4 }, stamp)
      tick()
      await beatOf(b)
      const turns = a.host.remoteTurns()
      if (turns === undefined) throw new Error('no remote turns')
      await expect(turns.runner.startTurn({ ticketId: 'tk4', assignmentId: 'as4', personaId: PERSONA, cwd: 'C:\\x', prompt: 'x', model: 'm' })).rejects.toMatchObject({ code: 'home-not-trusted' })
      expect(seen, 'nothing reached B').toEqual([])
    }
  })
})

describe('what a computer knows about the OTHER computers (D-117 facts for the placement of a persona\'s home)', () => {
  const HOUR = 3_600_000

  it('a computer of the FRESH roster is a team computer (its `ownerId` is who REGISTERED it: the team\'s owner signs the certificate; the use of the computer is OFF unless its certificate says so); a stranger is unknown', async () => {
    const a = await spawn('A')
    const b = await spawn('B')
    await joinTeam(a, b)
    await serviceOf(a)
    await serviceOf(b)
    expect(a.host.computerFacts(b.id)).toEqual({ computerId: b.id, kind: 'team', ownerId: 'm-ana', teamComputerUse: false })
    expect(a.host.computerFacts('comp-que-ninguem-cadastrou'), 'not in the roster = unknown (a move there is refused)').toBeUndefined()
  })

  it('an EXPIRED roster knows nobody (it fails closed: unknown, not "still team")', async () => {
    const a = await spawn('A')
    const b = await spawn('B')
    await joinTeam(a, b)
    await serviceOf(a)
    expect(a.host.computerFacts(b.id)).toBeDefined()
    clock.now += 25 * HOUR // past the 24 h the roster is worth
    expect(a.host.computerFacts(b.id)).toBeUndefined()
  })

  it('THIS computer: the owner\'s PC has no word of its own here (the host\'s default, a personal PC of the owner, holds); the owner\'s PC seen from a member is that owner\'s PERSONAL computer; a member itself is a team computer', async () => {
    const a = await spawn('A')
    const b = await spawn('B')
    expect(a.host.computerFacts(a.id), 'nothing is built yet: nothing is known').toBeUndefined()
    await joinTeam(a, b)
    await serviceOf(a)
    await serviceOf(b)
    expect(a.host.computerFacts(a.id), 'the owner\'s own PC: the default of the host decides').toBeUndefined()
    expect(b.host.computerFacts(a.id)).toMatchObject({ computerId: a.id, kind: 'personal', ownerId: 'm-ana', teamComputerUse: false })
    expect(b.host.computerFacts(b.id)).toMatchObject({ computerId: b.id, kind: 'team', ownerId: 'm-ana', teamComputerUse: false })
  })

  it('a REVOKED computer is unknown', async () => {
    const a = await spawn('A')
    const b = await spawn('B')
    await joinTeam(a, b)
    const service = await serviceOf(a)
    const revoked = service.revoke(b.id)
    expect(revoked).toMatchObject({ ok: true })
    expect(a.host.computerFacts(b.id)).toBeUndefined()
  })
})

/** B's runner that never ends on its own: it is stopped by the cancel (the "Parar"), and says so. */
function holdingRunner(seen: StartTurnInput[], cancelled: string[]): ExecutorRunner {
  const stops = new Map<string, () => void>()
  return {
    startTurn: (input) => {
      seen.push(input)
      return Promise.resolve({ runId: `b-hold-${String(seen.length)}`, sessionId: 's-b', ticketId: input.ticketId, assignmentId: input.assignmentId, personaId: input.personaId, cwd: input.cwd, model: input.model })
    },
    async *stream(handle): AsyncGenerator<RunEvent> {
      yield { type: 'started', at: new Date().toISOString(), handle }
      await new Promise<void>((resolve) => { stops.set(handle.runId, resolve) })
      yield { type: 'ended', at: new Date().toISOString(), report: { state: 'dropped', summary: 'parou' } }
    },
    cancel: (handle) => { cancelled.push(handle.runId); stops.get(handle.runId)?.(); return Promise.resolve() },
  }
}

describe('D-121: "Levar" is a change of HOME: only the signed sheet travels, the persona stays whole on the owner\'s PC and runs her turns on the other one', () => {
  async function twoPcs(): Promise<{ a: Pc; b: Pc; seen: StartTurnInput[]; cancelled: string[]; transferId: string }> {
    const seen: StartTurnInput[] = []
    const cancelled: string[] = []
    const a = await spawn('A', { d121: true })
    const b = await spawn('B', { d121: true, runner: holdingRunner(seen, cancelled) })
    await joinTeam(a, b)
    const serviceA = await serviceOf(a)
    await serviceOf(b)
    a.book.set(PERSONA, { computerId: a.id, epoch: 3 }, new Date(clock.now).toISOString())
    tick()
    expect(await beatOf(b)).toBe('ok')
    expect(serviceA.preview(PERSONA, b.id), 'a preview needs no memory: only her signed sheet moves').toMatchObject({ ok: true, toLabel: 'PC da padaria' })
    const moved = serviceA.move({ personaId: PERSONA, toComputerId: b.id, confirm: true })
    if (!moved.ok) throw new Error(`move refused: ${moved.reason}`)
    return { a, b, seen, cancelled, transferId: moved.transferId }
  }

  it('B registers her as LENT at epoch + 1 with the sheet the owner signed, A stops running her here and keeps all of her data, and nothing is active on both', async () => {
    const { a, b, transferId } = await twoPcs()
    const serviceA = await serviceOf(a)
    const serviceB = await serviceOf(b)
    await vi.waitFor(() => { expect(serviceB.home(PERSONA)).toMatchObject({ ok: true, home: { isThis: true, computerLabel: 'PC da padaria', epoch: 4 } }) }, { timeout: 5_000 })
    expect(a.book.resolve(PERSONA)).toMatchObject({ computerId: b.id, epoch: 4, state: 'active' })
    expect(a.book.runsHere(PERSONA)).toBe(false)
    expect(a.stops, 'her local runners were let go').not.toEqual([])
    expect(a.wiped, 'nothing of hers is erased on the owner\'s PC').toEqual([])
    await vi.waitFor(() => { expect(serviceA.transfer(transferId)).toMatchObject({ ok: true, transfer: { phase: 'done', destinationSilent: false } }) }, { timeout: 5_000 })
    expect(serviceA.home(PERSONA)).toMatchObject({ ok: true, home: { isThis: false, epoch: 4 } })
  })

  it('then the turn runs on B with B\'s runner, and "Parar" stops it THERE (the cancel reaches B and the stream ends as dropped)', async () => {
    const { a, b, seen, cancelled } = await twoPcs()
    const serviceB = await serviceOf(b)
    await vi.waitFor(() => { expect(serviceB.home(PERSONA)).toMatchObject({ ok: true, home: { isThis: true, epoch: 4 } }) }, { timeout: 5_000 })
    tick()
    await beatOf(b)
    const turns = a.host.remoteTurns()
    if (turns === undefined) throw new Error('no remote turns')
    expect(turns.isRemote(PERSONA)).toBe(true)
    const handle = await turns.runner.startTurn({ ticketId: 'tk9', assignmentId: 'as9', personaId: PERSONA, cwd: 'C:\\projeto-da-A', prompt: 'Cumprimente a equipe.', model: 'sonnet' })
    const events: RunEvent[] = []
    const reading = (async (): Promise<void> => { for await (const event of turns.runner.stream(handle)) events.push(event) })()
    await vi.waitFor(() => { expect(seen).toHaveLength(1) }, { timeout: 5_000 })
    expect(seen[0]?.cwd).not.toContain('projeto-da-A')
    await turns.runner.cancel(handle)
    await reading
    expect(cancelled, 'B\'s own runner was told to stop').toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'dropped' } })
  })

  it('when B stops beating her computer is off: she is out of the air (no turn is sent, nobody is asked to compose), and when it beats again she is back', async () => {
    const { a, b } = await twoPcs()
    const serviceB = await serviceOf(b)
    await vi.waitFor(() => { expect(serviceB.home(PERSONA)).toMatchObject({ ok: true, home: { isThis: true, epoch: 4 } }) }, { timeout: 5_000 })
    tick()
    await beatOf(b)
    const turns = a.host.remoteTurns()
    if (turns === undefined) throw new Error('no remote turns')
    const input = { ticketId: 'tk10', assignmentId: 'as10', personaId: PERSONA, cwd: 'C:\\x', prompt: 'x', model: 'm' }
    clock.now += 10 * 60_000 // B has been silent for ten minutes
    await expect(turns.runner.startTurn(input)).rejects.toMatchObject({ code: 'executor-offline' })
    expect((await turns.runnerFor(PERSONA).health()).ok, 'the runner says the persona\'s computer is off').toBe(false)
    await beatOf(b)
    expect((await turns.runnerFor(PERSONA).health()).ok).toBe(true)
  })
})
