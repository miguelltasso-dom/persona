import { beforeEach, describe, expect, it } from 'vitest'
import { RosterGuard, certFor, computerIdOf, memoryRosterStore, signCert, signRoster, type ComputerCert, type SignedRoster } from '../src/computers/computer-cert.ts'
import {
  ACTIVATE_WINDOW_MS, HandoffError, HandoffReceiver, HandoffSender, RECEIVE_WAIT_MS, type HandoffMessage, type HandoffRefusal, type HomePort, type HomeView, type Quarantined, type QuarantineStore,
  type SelfComputer, type TransferRecord, type TransferStore,
} from '../src/computers/handoff.ts'
import { generateIdentity, publicIdentity, type Identity } from '@deepseek-ai/dsh-persona-sync'
import { BUNDLE_SCHEMA, BUNDLE_TTL_MS, newBundleId, type PersonaBundle } from '@deepseek-ai/dsh-persona-sync'

/**
 * D-116: the handoff of a persona between computers, as a SIMULATION with failures — a clock, a network that drops and repeats, a home book per computer that gossips, and an ORACLE that, after every step,
 * counts the computers that are running the persona. The invariant: never two (except the one place the design says out loud: a forced reactivation during a partition, until the computers meet).
 */
const NOW0 = 1_800_000_000_000
const PERSONA = 'nina'
const OWNER = generateIdentity()
const iso = (at: number): string => new Date(at).toISOString()

interface Node {
  readonly id: string
  readonly identity: Identity
  readonly self: SelfComputer
  readonly cert: ComputerCert
  readonly roster: RosterGuard
  readonly home: FakeHome
  readonly store: MemoryTransfers
  readonly quarantine: MemoryQuarantine
  sender: HandoffSender
  receiver: HandoffReceiver
  readonly data: Set<string>
  wipes: number
  applies: number
  restores: number
}

class MemoryTransfers implements TransferStore {
  readonly records = new Map<string, TransferRecord>()
  get(personaId: string): TransferRecord | undefined { return this.records.get(personaId) }
  put(record: TransferRecord): void { this.records.set(record.personaId, record) }
  open(): readonly TransferRecord[] { return [...this.records.values()].filter(record => record.phase === 'sealed' || record.phase === 'released') }
}

class MemoryQuarantine implements QuarantineStore {
  readonly held = new Map<string, Quarantined>()
  readonly ids = new Set<string>()
  get(personaId: string): Quarantined | undefined { return this.held.get(personaId) }
  put(item: Quarantined): void { this.held.set(item.personaId, item) }
  drop(personaId: string): void { this.held.delete(personaId) }
  seen(bundleId: string): boolean { return this.ids.has(bundleId) }
  markSeen(bundleId: string): void { this.ids.add(bundleId) }
}

/** One computer's view of the persona's home, with the "stop running" that fencing triggers. */
class FakeHome implements HomePort {
  readonly views = new Map<string, HomeView>()
  readonly running = new Set<string>()
  constructor(private readonly selfId: string, private readonly gossip: (record: { personaId: string; computerId: string; epoch: number }) => void) {}
  resolve(personaId: string): HomeView | undefined { return this.views.get(personaId) }
  close(personaId: string, _why: 'moving', movingTo: string): void {
    const view = this.views.get(personaId)
    if (view === undefined) return
    this.views.set(personaId, { ...view, state: 'moving', movingTo })
    this.running.delete(personaId) // the runtime stops AFTER the durable `moving`
  }
  open(personaId: string): void {
    const view = this.views.get(personaId)
    if (view?.state !== 'moving') return
    this.views.set(personaId, { computerId: view.computerId, epoch: view.epoch, state: 'active' })
    if (view.computerId === this.selfId) this.running.add(personaId)
  }
  set(personaId: string, home: { computerId: string; epoch: number }): void {
    const view = this.views.get(personaId)
    if (view !== undefined && home.epoch <= view.epoch) throw new HandoffError('stale-epoch')
    this.views.set(personaId, { computerId: home.computerId, epoch: home.epoch, state: 'active' })
    if (home.computerId === this.selfId) this.running.add(personaId)
    else this.running.delete(personaId)
    this.gossip({ personaId, computerId: home.computerId, epoch: home.epoch })
  }
  /** Fencing: a HIGHER epoch seen on the mesh stops the persona here at once. */
  see(record: { personaId: string; computerId: string; epoch: number }): void {
    const view = this.views.get(record.personaId)
    if (view !== undefined && record.epoch <= view.epoch) return
    this.views.set(record.personaId, { computerId: record.computerId, epoch: record.epoch, state: 'active' })
    if (record.computerId !== this.selfId) this.running.delete(record.personaId)
  }
}

interface World {
  readonly clock: { now: number }
  readonly nodes: Record<'A' | 'B' | 'C', Node>
  readonly offline: Set<string>
  readonly refusals: HandoffRefusal[]
  readonly log: string[]
  /** Messages in flight: delivered by pump(); `drop` removes them. */
  readonly wire: { to: string; message: HandoffMessage }[]
  maxRunning: number
  pump(filter?: (item: { to: string; message: HandoffMessage }) => boolean): void
  running(): string[]
  oracle(): void
  restartA(): void
  verifySheet: { ok: boolean }
  /** The workspace B believes it belongs to (a bundle for another one is refused). */
  workspace: { id: string }
  facts: { creator: string; count: number; autonomy: 'baixa' | 'media' | 'alta' }
}

function makeWorld(): World {
  const clock = { now: NOW0 }
  const offline = new Set<string>()
  const refusals: HandoffRefusal[] = []
  const log: string[] = []
  const wire: { to: string; message: HandoffMessage }[] = []
  const identities = { A: generateIdentity(), B: generateIdentity(), C: generateIdentity() }
  const certs = (['A', 'B', 'C'] as const).map(key => certFor({ identity: publicIdentity(identities[key]), label: `PC ${key}`, registeredBy: 'ana', registeredAt: iso(NOW0) }))
  const signedRoster: SignedRoster = signRoster({ schema: 'roster/v1', workspaceId: 'ws1', version: 1, issuedAt: iso(NOW0), certs: certs.map(cert => signCert(cert, OWNER.signing.seed)), revoked: [] }, OWNER.signing.seed)
  const verifySheet = { ok: true }
  const workspace = { id: 'ws1' }
  const facts = { creator: 'ana', count: 0, autonomy: 'baixa' as 'baixa' | 'media' | 'alta' }
  const world: World = {
    clock, nodes: {} as World['nodes'], offline, refusals, log, wire, maxRunning: 0, verifySheet, workspace, facts,
    pump(filter = () => true) {
      for (let guard = 0; guard < 200 && wire.length > 0; guard += 1) {
        const index = wire.findIndex(filter)
        if (index === -1) return
        const [item] = wire.splice(index, 1)
        if (item === undefined || offline.has(item.to)) continue // an offline computer hears nothing
        const node = item.to === 'A' ? world.nodes.A : item.to === 'B' ? world.nodes.B : world.nodes.C
        log.push(`${item.to}<-${item.message.type}`)
        try {
          if (item.message.type === 'bundle') node.receiver.onBundle(item.message)
          else if (item.message.type === 'released') node.receiver.onReleased(item.message)
          else node.sender.onMessage(item.message)
        } catch (error) {
          if (error instanceof HandoffError) refusals.push(error.code)
          else throw error
        }
        world.oracle()
      }
    },
    running: () => (['A', 'B', 'C'] as const).filter(key => world.nodes[key].home.running.has(PERSONA)),
    oracle() { world.maxRunning = Math.max(world.maxRunning, world.running().length) },
    restartA() { world.nodes.A.sender = senderOf(world.nodes.A) },
  }
  const idOf = (key: 'A' | 'B' | 'C'): string => computerIdOf(publicIdentity(identities[key]))
  const byId: Record<string, 'A' | 'B' | 'C'> = { [idOf('A')]: 'A', [idOf('B')]: 'B', [idOf('C')]: 'C' }
  const link = (fromKey: 'A' | 'B' | 'C'): { send: (to: string, message: HandoffMessage) => void } => ({
    send: (to, message) => { log.push(`${fromKey}->${message.type}`); wire.push({ to: byId[to] ?? to, message }) },
  })
  const senderOf = (node: Node): HandoffSender => new HandoffSender({
    self: node.self, roster: node.roster, home: node.home, link: link(byId[node.id] as 'A' | 'B' | 'C'), store: node.store, now: () => clock.now,
    makeBundle: ({ personaId, toComputerId, epoch, includesPrivateDm }): PersonaBundle => ({
      schema: BUNDLE_SCHEMA, id: newBundleId(), personaId, workspaceId: 'ws1', fromComputerId: node.id, toComputerId, epoch, createdAt: iso(clock.now), notAfter: iso(clock.now + BUNDLE_TTL_MS), includesPrivateDm,
      sheet: { json: '{"name":"Nina"}', signature: 'c2ln', signerSigningPublic: OWNER.signing.publicKey },
      memory: [{ id: 'm1', kind: 'note', body: 'A Ana gosta de bolo de cenoura.', updatedAt: iso(NOW0) }], rules: [{ id: 'r1', text: 'Responda em uma frase.' }], skills: [],
    }),
    wipe: () => { node.wipes += 1; node.data.delete(PERSONA); log.push(`${byId[node.id]}:wipe`) },
    restore: () => { node.restores += 1; node.data.add(PERSONA) },
  })
  const gossip = (record: { personaId: string; computerId: string; epoch: number }): void => {
    for (const key of ['A', 'B', 'C'] as const) if (!offline.has(key)) world.nodes[key].home.see(record)
  }
  for (const key of ['A', 'B', 'C'] as const) {
    const identity = identities[key]
    const id = idOf(key)
    const self: SelfComputer = { id, signingSeed: identity.signing.seed, agreement: identity.agreement }
    const roster = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => clock.now)
    roster.accept(signedRoster)
    const home = new FakeHome(id, gossip)
    const store = new MemoryTransfers()
    const quarantine = new MemoryQuarantine()
    const node: Node = {
      id, identity, self, cert: certs[['A', 'B', 'C'].indexOf(key)] as ComputerCert, roster, home, store, quarantine, data: new Set<string>(), wipes: 0, applies: 0, restores: 0,
      sender: undefined as unknown as HandoffSender,
      receiver: undefined as unknown as HandoffReceiver,
    }
    node.receiver = new HandoffReceiver({
      self, get workspaceId() { return workspace.id }, roster, home, link: link(key), quarantine, now: () => clock.now,
      apply: () => { node.applies += 1; node.data.add(PERSONA); log.push(`${key}:apply`) },
      verifySheet: () => verifySheet.ok,
      hostingFacts: () => ({ creatorMemberId: facts.creator, personasOfCreatorHere: facts.count, autonomy: facts.autonomy }),
    })
    node.sender = senderOf(node)
    world.nodes[key] = node
  }
  // the persona lives on A (home epoch 3), and every computer knows it
  world.nodes.A.home.views.set(PERSONA, { computerId: world.nodes.A.id, epoch: 3, state: 'active' })
  world.nodes.A.home.running.add(PERSONA)
  world.nodes.A.data.add(PERSONA)
  for (const key of ['B', 'C'] as const) world.nodes[key].home.views.set(PERSONA, { computerId: world.nodes.A.id, epoch: 3, state: 'active' })
  world.oracle()
  return world
}

let world: World
const start = (to: 'B' | 'C' = 'B'): { transferId: string } => {
  const result = world.nodes.A.sender.start({ personaId: PERSONA, toComputerId: world.nodes[to].id, includesPrivateDm: false })
  world.oracle()
  return result
}
const code = (run: () => unknown): HandoffRefusal | 'none' | 'other' => { try { run(); return 'none' } catch (error) { return error instanceof HandoffError ? error.code : 'other' } }

beforeEach(() => { world = makeWorld() })

describe('the happy path', () => {
  it('A closes her, B keeps the bundle, A wipes and releases ONLY after B holds it, B activates; she is never running in two places', () => {
    start()
    world.pump()
    expect(world.log).toEqual(['A->bundle', 'B<-bundle', 'B->received', 'A<-received', 'A:wipe', 'A->released', 'B<-released', 'B:apply', 'B->activated', 'A<-activated'])
    expect(world.running()).toEqual(['B'])
    expect(world.maxRunning).toBe(1)
    expect(world.nodes.B.home.resolve(PERSONA)).toMatchObject({ computerId: world.nodes.B.id, epoch: 4, state: 'active' })
    expect(world.nodes.A.home.resolve(PERSONA)).toMatchObject({ computerId: world.nodes.B.id, epoch: 4 }) // A learned it from the mesh
    expect(world.nodes.A.data.has(PERSONA)).toBe(false) // wiped
    expect(world.nodes.B.data.has(PERSONA)).toBe(true)
    expect(world.nodes.A.store.get(PERSONA)?.phase).toBe('done')
    expect(world.nodes.A.store.get(PERSONA)?.escrow).toBeUndefined() // the way back is dropped once B is her home
    expect(world.refusals).toEqual([])
  })

  it('she stops on A BEFORE anything is sent, and A does not wipe before B has answered', () => {
    start()
    expect(world.nodes.A.home.running.has(PERSONA)).toBe(false) // closed, durable `moving`, nothing sent yet processed
    expect(world.nodes.A.home.resolve(PERSONA)?.state).toBe('moving')
    expect(world.nodes.A.data.has(PERSONA)).toBe(true) // still holds her
    world.pump(item => item.message.type === 'bundle') // B gets the bundle
    expect(world.nodes.B.quarantine.get(PERSONA)).toBeDefined() // quarantine, not active
    expect(world.running()).toEqual([]) // nobody runs her yet (safe: off)
    expect(world.nodes.A.wipes).toBe(0)
    world.pump(item => item.message.type === 'received') // A hears `received`
    expect(world.nodes.A.wipes).toBe(1)
    expect(world.nodes.A.store.get(PERSONA)?.phase).toBe('released') // recorded as released
  })
})

describe('B does not answer: A reopens her, nothing is lost', () => {
  it('B offline: after the wait A reopens her at the SAME epoch; nothing was wiped; she is never in two places', () => {
    world.offline.add('B')
    start()
    world.pump()
    expect(world.running()).toEqual([])
    world.clock.now += RECEIVE_WAIT_MS - 1
    world.nodes.A.sender.tick()
    expect(world.running()).toEqual([]) // still waiting
    world.clock.now += 2
    world.nodes.A.sender.tick()
    expect(world.running()).toEqual(['A'])
    expect(world.nodes.A.home.resolve(PERSONA)).toMatchObject({ epoch: 3, state: 'active' })
    expect(world.nodes.A.wipes).toBe(0)
    expect(world.nodes.A.store.get(PERSONA)?.phase).toBe('rolled-back')
    expect(world.maxRunning).toBe(1)
  })

  it('A crashes after sealing: on restart the record is read back and, with no answer, she is reopened', () => {
    world.offline.add('B')
    start()
    world.restartA() // a new sender over the same durable store and home book
    world.clock.now += RECEIVE_WAIT_MS + 1
    world.nodes.A.sender.tick()
    expect(world.running()).toEqual(['A'])
  })

  it('a late `received` after the rollback is ignored: A never wipes a persona it reopened', () => {
    start() // the bundle is in flight, slow
    world.clock.now += RECEIVE_WAIT_MS + 1
    world.nodes.A.sender.tick() // the wait is over: A reopened her
    expect(world.running()).toEqual(['A'])
    world.pump() // B finally gets the bundle and answers `received`; A hears it too late
    expect(world.nodes.A.wipes).toBe(0)
    expect(world.nodes.A.data.has(PERSONA)).toBe(true)
    expect(world.running()).toEqual(['A'])
    expect(world.maxRunning).toBe(1)
  })

  it('B refuses (this computer\'s OWN certificate does not allow the creator): no answer, so A reopens her', () => {
    world.facts.creator = 'mallory'
    start()
    world.pump()
    expect(world.refusals).toEqual(['host-not-allowed'])
    expect(world.nodes.B.quarantine.get(PERSONA)).toBeUndefined()
    world.clock.now += RECEIVE_WAIT_MS + 1
    world.nodes.A.sender.tick()
    expect(world.running()).toEqual(['A'])
  })

  it('a crash between the record and the close leaves her RUNNING (never closed with no record): the wait ends harmlessly and she is not doubled', () => {
    const { store, home, id } = world.nodes.A
    store.put({ transferId: 'crashed', personaId: PERSONA, from: id, to: world.nodes.B.id, epoch: 4, phase: 'sealed', digest: 'd', startedAt: world.clock.now }) // the record was written; the close never happened
    expect(world.running()).toEqual(['A'])
    world.clock.now += RECEIVE_WAIT_MS + 1
    world.nodes.A.sender.tick()
    expect(home.resolve(PERSONA)).toMatchObject({ epoch: 3, state: 'active' })
    expect(world.running()).toEqual(['A'])
    expect(store.get(PERSONA)?.phase).toBe('rolled-back')
  })

  it('a bundle for ANOTHER workspace is refused by what B knows of itself, not by what the header says', () => {
    world.workspace.id = 'ws-outro'
    start()
    world.pump()
    expect(world.refusals).toEqual(['wrong-workspace'])
    expect(world.nodes.B.quarantine.get(PERSONA)).toBeUndefined()
  })

  it('other refusals of B: a creator over its quota, an autonomy over the cap, a sheet that does not verify', () => {
    world.facts.count = 3
    start()
    world.pump()
    expect(world.refusals).toEqual(['creator-quota'])
    world = makeWorld()
    world.facts.autonomy = 'alta'
    start()
    world.pump()
    expect(world.refusals).toEqual(['autonomy-too-high'])
    world = makeWorld()
    world.verifySheet.ok = false
    start()
    world.pump()
    expect(world.refusals).toEqual(['sheet-invalid'])
  })
})

describe('A released and B never activates: she is OFF (never two), then the owner reactivates her on A', () => {
  const releasedButLost = (): void => {
    start()
    world.pump(item => item.message.type !== 'released') // B holds the bundle, A released, but the `released` never reaches B
    world.wire.length = 0
  }

  it('between release and activation she runs NOWHERE (safe failure)', () => {
    releasedButLost()
    expect(world.nodes.A.store.get(PERSONA)?.phase).toBe('released')
    expect(world.running()).toEqual([])
    expect(world.maxRunning).toBe(1) // (the one place she ran: A, at the start)
  })

  it('A keeps telling B (idempotent) inside the window; reactivation is refused before the window ends and without the owner\'s confirmation', () => {
    releasedButLost()
    world.clock.now += 60_000
    world.nodes.A.sender.tick()
    expect(world.wire.filter(item => item.message.type === 'released')).toHaveLength(1) // re-sent
    expect(code(() => world.nodes.A.sender.reactivateHere(PERSONA, true))).toBe('too-early')
    world.clock.now += ACTIVATE_WINDOW_MS
    expect(code(() => world.nodes.A.sender.reactivateHere(PERSONA, false))).toBe('confirm-required')
  })

  it('after the window she comes back on A at epoch + 1 from the escrow, and the late `released` is REFUSED by B (never two)', () => {
    releasedButLost()
    const late = (): HandoffMessage => {
      world.clock.now += 30_000
      world.nodes.A.sender.tick()
      const item = world.wire.find(entry => entry.message.type === 'released')
      if (item === undefined) throw new Error('no released message')
      return item.message
    }
    const releasedMessage = late()
    world.wire.length = 0
    world.clock.now += ACTIVATE_WINDOW_MS + 1
    world.nodes.A.sender.reactivateHere(PERSONA, true)
    world.oracle()
    expect(world.running()).toEqual(['A'])
    expect(world.nodes.A.home.resolve(PERSONA)).toMatchObject({ computerId: world.nodes.A.id, epoch: 5, state: 'active' })
    expect(world.nodes.A.restores).toBe(1)
    expect(world.nodes.A.data.has(PERSONA)).toBe(true)
    // B comes back and finally hears the old `released`: its window is over
    world.wire.push({ to: 'B', message: releasedMessage })
    world.pump()
    expect(world.refusals).toContain('late-activation')
    expect(world.nodes.B.quarantine.get(PERSONA)).toBeUndefined()
    expect(world.running()).toEqual(['A'])
    expect(world.maxRunning).toBe(1)
  })

  it('when the mesh tells A that B IS her home (the `activated` was lost), the handoff is over: no reactivation, the escrow is dropped', () => {
    start()
    world.pump(item => item.message.type !== 'activated')
    world.wire.length = 0 // B activated, but its `activated` never reached A
    expect(world.running()).toEqual(['B'])
    expect(world.nodes.A.home.resolve(PERSONA)).toMatchObject({ computerId: world.nodes.B.id, epoch: 4 }) // A heard it from the mesh
    world.clock.now += ACTIVATE_WINDOW_MS + 1
    expect(code(() => world.nodes.A.sender.reactivateHere(PERSONA, true))).toBe('already-moved') // bringing her back here would be the second copy
    world.nodes.A.sender.tick()
    expect(world.nodes.A.store.get(PERSONA)?.phase).toBe('done')
    expect(world.nodes.A.store.get(PERSONA)?.escrow).toBeUndefined()
    expect(world.running()).toEqual(['B'])
    expect(world.maxRunning).toBe(1)
  })

  it('a SLOW B still activates inside its window and not after it', () => {
    start()
    world.pump(item => item.message.type !== 'released')
    const released = world.wire.splice(0).find(item => item.message.type === 'released')
    if (released === undefined) throw new Error('no released')
    world.clock.now += ACTIVATE_WINDOW_MS - 1
    world.wire.push(released)
    world.pump()
    expect(world.running()).toEqual(['B'])
    expect(world.maxRunning).toBe(1)
  })
})

describe('repeats and forgeries are not acted on twice', () => {
  it('a repeated `bundle` is refused (replay); a repeated `released` only re-answers `activated`; a repeated `received` does not wipe twice', () => {
    start()
    const bundle = world.wire.find(item => item.message.type === 'bundle')
    if (bundle === undefined) throw new Error('no bundle')
    const bundleCopy = { ...bundle }
    world.pump(item => item.message.type !== 'released')
    const released = world.wire.find(item => item.message.type === 'released')
    if (released === undefined) throw new Error('no released')
    const releasedCopy = { ...released }
    world.pump()
    expect(world.nodes.B.applies).toBe(1)
    expect(world.running()).toEqual(['B'])
    world.wire.push(bundleCopy)
    world.pump()
    expect(world.refusals.length).toBeGreaterThan(0) // the replayed bundle is refused (B is her home now: it no longer takes her from A)
    expect(world.nodes.B.applies).toBe(1)
    world.wire.push(releasedCopy)
    world.pump()
    expect(world.nodes.B.applies).toBe(1) // a repeated `released` is not applied twice
    expect(world.log.filter(entry => entry === 'B->activated').length).toBe(2) // it only answers `activated` again
    expect(world.nodes.A.wipes).toBe(1)
    expect(world.maxRunning).toBe(1)
  })

  it('a `received` with a wrong signature, wrong digest or from another computer does NOT make A release her', () => {
    start()
    const bundle = world.wire.splice(0).find(item => item.message.type === 'bundle')
    if (bundle === undefined) throw new Error('no bundle')
    // B answers for real, then we tamper with the answer on the wire
    world.wire.push(bundle)
    world.pump(item => item.message.type === 'bundle')
    const received = world.wire.splice(0).find(item => item.message.type === 'received')
    if (received === undefined || received.message.type !== 'received') throw new Error('no received')
    const forgeries: HandoffMessage[] = [
      { ...received.message, sig: `${received.message.sig.slice(0, 5)}${received.message.sig[5] === 'A' ? 'B' : 'A'}${received.message.sig.slice(6)}` },
      { ...received.message, digest: 'f'.repeat(64) },
      { ...received.message, by: world.nodes.C.id },
      { ...received.message, epoch: 9 },
    ]
    for (const message of forgeries) world.nodes.A.sender.onMessage(message)
    expect(world.nodes.A.wipes).toBe(0)
    expect(world.nodes.A.store.get(PERSONA)?.phase).toBe('sealed')
    world.nodes.A.sender.onMessage(received.message) // the real one still works
    expect(world.nodes.A.wipes).toBe(1)
  })

  it('B ignores a `released` that is not signed by A, is for another transfer, or for another computer', () => {
    start()
    world.pump(item => item.message.type !== 'released')
    const released = world.wire.splice(0).find(item => item.message.type === 'released')
    if (released === undefined || released.message.type !== 'released') throw new Error('no released')
    const message = released.message
    expect(code(() => world.nodes.B.receiver.onReleased({ ...message, sig: `${message.sig.slice(0, 5)}${message.sig[5] === 'A' ? 'B' : 'A'}${message.sig.slice(6)}` }))).toBe('bad-signature')
    expect(code(() => world.nodes.B.receiver.onReleased({ ...message, to: world.nodes.C.id }))).toBe('not-for-me')
    expect(code(() => world.nodes.B.receiver.onReleased({ ...message, from: world.nodes.C.id }))).toBe('bad-signature')
    expect(world.running()).toEqual([]) // none of the forgeries activated her
    expect(code(() => world.nodes.B.receiver.onReleased(message))).toBe('none') // the real one does
    expect(world.running()).toEqual(['B'])
  })
})

describe('what A refuses to start', () => {
  it('not her home, a handoff already running, a destination that is not on the roster, a bundle that may not travel', () => {
    expect(code(() => world.nodes.B.sender.start({ personaId: PERSONA, toComputerId: world.nodes.C.id, includesPrivateDm: false }))).toBe('not-home') // B is not her home
    expect(code(() => world.nodes.A.sender.start({ personaId: PERSONA, toComputerId: 'comp-desconhecido', includesPrivateDm: false }))).toBe('destination-unknown')
    expect(code(() => world.nodes.A.sender.start({ personaId: PERSONA, toComputerId: world.nodes.A.id, includesPrivateDm: false }))).toBe('destination-unknown') // not to itself
    expect(world.running()).toEqual(['A']) // the refusals closed nothing
    start()
    expect(code(() => start('C'))).toBe('transfer-in-progress')
  })

  it('a bundle that may not travel (a credential-shaped text) refuses the handoff and leaves the persona RUNNING where she was', () => {
    const node = world.nodes.A
    const sender = new HandoffSender({
      self: node.self, roster: node.roster, home: node.home, link: { send: () => undefined }, store: node.store, now: () => world.clock.now,
      makeBundle: ({ personaId, toComputerId, epoch, includesPrivateDm }) => ({
        schema: BUNDLE_SCHEMA, id: newBundleId(), personaId, workspaceId: 'ws1', fromComputerId: node.id, toComputerId, epoch, createdAt: iso(world.clock.now), notAfter: iso(world.clock.now + BUNDLE_TTL_MS), includesPrivateDm,
        sheet: { json: '{}', signature: 'x', signerSigningPublic: 'k' }, memory: [{ id: 'm', kind: 'note', body: 'minha chave sk-abcdefghijklmnopqrstuvwx1234', updatedAt: 'u' }], rules: [], skills: [],
      }),
      wipe: () => undefined, restore: () => undefined,
    })
    expect(code(() => sender.start({ personaId: PERSONA, toComputerId: world.nodes.B.id, includesPrivateDm: false }))).toBe('bundle-refused')
    expect(world.running()).toEqual(['A'])
    expect(world.nodes.A.home.resolve(PERSONA)?.state).toBe('active') // never closed
    expect(world.nodes.A.store.get(PERSONA)).toBeUndefined()
  })

  it('a revoked destination is not a destination (the roster says so)', () => {
    const keep = [world.nodes.A.cert, world.nodes.C.cert].map(cert => signCert(cert, OWNER.signing.seed)) // A and C stay on the roster; B is revoked
    const revokedRoster = signRoster({ schema: 'roster/v1', workspaceId: 'ws1', version: 2, issuedAt: iso(world.clock.now), certs: keep, revoked: [world.nodes.B.id] }, OWNER.signing.seed)
    expect(world.nodes.A.roster.accept(revokedRoster)).toBe('ok')
    expect(code(() => start('B'))).toBe('destination-unknown')
    expect(world.running()).toEqual(['A'])
  })

  it('a computer with a STALE roster accepts no bundles (safe failure), and one that does not know the sender refuses it', () => {
    start()
    world.clock.now += 25 * 3_600_000 // no fresh roster for more than 24 hours
    world.pump()
    expect(world.refusals).toContain('stale-roster')
    expect(world.nodes.B.quarantine.get(PERSONA)).toBeUndefined()
  })
})

describe('the limit the design says out loud: a partition with a FORCED reactivation', () => {
  it('B active but cut off, A reactivates at epoch + 2: BOTH run her until they meet; the higher epoch then stops the old one', () => {
    start()
    world.pump(item => item.message.type !== 'activated' && item.message.type !== 'released') // bundle + received only
    // `released` reaches B, but B is cut off from the mesh right after it activates (its gossip and `activated` never leave)
    const released = world.wire.splice(0).find(item => item.message.type === 'released')
    world.offline.add('A') // B's gossip and answer cannot reach A
    if (released === undefined) throw new Error('no released')
    world.wire.push(released)
    world.pump()
    world.offline.delete('A')
    expect(world.nodes.B.home.running.has(PERSONA)).toBe(true) // B is her home at epoch 4
    // A never heard `activated`: after the window the owner (told the risk) reactivates her on A
    world.wire.length = 0
    world.clock.now += ACTIVATE_WINDOW_MS + 1
    world.offline.add('B') // B stays isolated
    world.nodes.A.sender.reactivateHere(PERSONA, true)
    world.oracle()
    expect(world.running().sort()).toEqual(['A', 'B']) // the honest limit: two, for as long as they cannot hear each other
    expect(world.maxRunning).toBe(2)
    // the network heals: A's higher epoch reaches B and stops the old copy
    world.offline.delete('B')
    world.nodes.B.home.see({ personaId: PERSONA, computerId: world.nodes.A.id, epoch: 5 })
    world.oracle()
    expect(world.running()).toEqual(['A'])
  })

  it('a computer that SEES a higher epoch for a persona it runs stops at once (fencing), and an equal or lower one changes nothing', () => {
    world.nodes.A.home.see({ personaId: PERSONA, computerId: world.nodes.A.id, epoch: 3 })
    expect(world.running()).toEqual(['A'])
    world.nodes.A.home.see({ personaId: PERSONA, computerId: world.nodes.B.id, epoch: 2 })
    expect(world.running()).toEqual(['A'])
    world.nodes.A.home.see({ personaId: PERSONA, computerId: world.nodes.B.id, epoch: 4 })
    expect(world.running()).toEqual([])
  })
})
