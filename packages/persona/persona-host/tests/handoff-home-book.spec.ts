import { describe, expect, it } from 'vitest'
import { generateIdentity, publicIdentity, BUNDLE_SCHEMA, BUNDLE_TTL_MS, newBundleId, type PersonaBundle } from '@deepseek-ai/dsh-persona-sync'
import { RosterGuard, certFor, computerIdOf, memoryRosterStore, signCert, signRoster } from '../src/computers/computer-cert.ts'
import { homePortOf } from '../src/computers/home-adapter.ts'
import { HandoffError, HandoffReceiver, HandoffSender, type HandoffMessage, type Quarantined, type QuarantineStore, type TransferRecord, type TransferStore } from '../src/computers/handoff.ts'
import { HOME_KIND, PersonaHomeBook, type HomeDoc, type HomeStore } from '../src/persona-home.ts'

/**
 * D-116: the handoff protocol running on the REAL `PersonaHomeBook` of the host (Flint's), through the adapter: the compare-and-set by epoch, the durable `moving` BEFORE the runtime stops, the runtime stop itself,
 * the fencing by a higher epoch seen, and the placement rule of D-117 all keep their meaning when the protocol drives them.
 */
const NOW = 1_800_000_000_000
const PERSONA = 'nina'
const PROJECT = 'p1'
const OWNER = generateIdentity()
const iso = (at: number): string => new Date(at).toISOString()

class KvStore implements HomeStore {
  readonly docs = new Map<string, HomeDoc>()
  get(projectId: string, kind: string, id: string): HomeDoc | undefined { return this.docs.get(`${projectId}|${kind}|${id}`) }
  put(projectId: string, kind: string, id: string, value: HomeDoc): void { this.docs.set(`${projectId}|${kind}|${id}`, value) }
}
class Transfers implements TransferStore {
  readonly records = new Map<string, TransferRecord>()
  get(personaId: string): TransferRecord | undefined { return this.records.get(personaId) }
  put(record: TransferRecord): void { this.records.set(record.personaId, record) }
  open(): readonly TransferRecord[] { return [...this.records.values()].filter(item => item.phase === 'sealed' || item.phase === 'released') }
}
class Quarantine implements QuarantineStore {
  readonly held = new Map<string, Quarantined>()
  readonly ids = new Set<string>()
  get(personaId: string): Quarantined | undefined { return this.held.get(personaId) }
  put(item: Quarantined): void { this.held.set(item.personaId, item) }
  drop(personaId: string): void { this.held.delete(personaId) }
  seen(bundleId: string): boolean { return this.ids.has(bundleId) }
  markSeen(bundleId: string): void { this.ids.add(bundleId) }
}

function world(placement?: (personaId: string, computerId: string) => string | undefined): { A: Node; B: Node; wire: { to: 'A' | 'B'; message: HandoffMessage }[]; pump(): string[]; clock: { now: number } } {
  const clock = { now: NOW }
  const wire: { to: 'A' | 'B'; message: HandoffMessage }[] = []
  const ids = { A: generateIdentity(), B: generateIdentity() }
  const idOf = (key: 'A' | 'B'): string => computerIdOf(publicIdentity(ids[key]))
  const certs = (['A', 'B'] as const).map(key => certFor({ identity: publicIdentity(ids[key]), label: `PC ${key}`, registeredBy: 'ana', registeredAt: iso(NOW) }))
  const signed = signRoster({ schema: 'roster/v1', workspaceId: 'ws1', version: 1, issuedAt: iso(NOW), certs: certs.map(cert => signCert(cert, OWNER.signing.seed)), revoked: [] }, OWNER.signing.seed)
  const refusals: string[] = []
  const make = (key: 'A' | 'B'): Node => {
    const self = { id: idOf(key), signingSeed: ids[key].signing.seed, agreement: ids[key].agreement }
    const roster = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => clock.now)
    roster.accept(signed)
    const stops: string[] = []
    const store = new KvStore()
    const book = new PersonaHomeBook({
      store, thisComputerId: () => self.id, projectOf: id => (id === PERSONA ? PROJECT : undefined), personaIds: () => [PERSONA],
      stopRuntime: (_id, reason) => { stops.push(reason) }, ...(placement === undefined || key === 'A' ? {} : { placement }),
    })
    const home = homePortOf(book, () => clock.now)
    const transfers = new Transfers()
    const quarantine = new Quarantine()
    const applied: PersonaBundle[] = []
    const link = { send: (to: string, message: HandoffMessage): void => { wire.push({ to: to === idOf('A') ? 'A' : 'B', message }) } }
    const node: Node = {
      self, book, store, stops, applied, transfers, quarantine, wiped: [],
      sender: new HandoffSender({
        self, roster, home, link, store: transfers, now: () => clock.now,
        makeBundle: ({ personaId, toComputerId, epoch, includesPrivateDm }): PersonaBundle => ({
          schema: BUNDLE_SCHEMA, id: newBundleId(), personaId, workspaceId: 'ws1', fromComputerId: self.id, toComputerId, epoch, createdAt: iso(clock.now), notAfter: iso(clock.now + BUNDLE_TTL_MS), includesPrivateDm,
          sheet: { json: '{"name":"Nina"}', signature: 'c2ln', signerSigningPublic: OWNER.signing.publicKey }, memory: [{ id: 'm1', kind: 'note', body: 'A Ana gosta de bolo.', updatedAt: iso(NOW) }], rules: [], skills: [],
        }),
        wipe: (id) => { node.wiped.push(id) }, restore: () => undefined,
      }),
      receiver: new HandoffReceiver({
        self, workspaceId: 'ws1', roster, home, link, quarantine, now: () => clock.now, apply: (bundle) => { applied.push(bundle) }, verifySheet: () => true,
        hostingFacts: () => ({ creatorMemberId: 'ana', personasOfCreatorHere: 0, autonomy: 'baixa' }),
      }),
    }
    return node
  }
  const A = make('A')
  const B = make('B')
  // the persona lives on A at epoch 3 (and B knows it)
  A.book.set(PERSONA, { computerId: A.self.id, epoch: 3 }, iso(NOW))
  B.book.set(PERSONA, { computerId: A.self.id, epoch: 3 }, iso(NOW))
  const nodes = { A, B }
  return {
    A, B, wire, clock,
    pump() {
      for (let guard = 0; guard < 50 && wire.length > 0; guard += 1) {
        const item = wire.shift()
        if (item === undefined) break
        const node = nodes[item.to]
        try {
          if (item.message.type === 'bundle') node.receiver.onBundle(item.message)
          else if (item.message.type === 'released') node.receiver.onReleased(item.message)
          else node.sender.onMessage(item.message)
        } catch (error) {
          refusals.push(error instanceof HandoffError ? error.code : 'other')
        }
      }
      return refusals
    },
  }
}

interface Node {
  readonly self: { id: string; signingSeed: string; agreement: { publicKey: string; secret: string } }
  readonly book: PersonaHomeBook
  readonly store: KvStore
  readonly stops: string[]
  readonly applied: PersonaBundle[]
  readonly transfers: Transfers
  readonly quarantine: Quarantine
  readonly wiped: string[]
  readonly sender: HandoffSender
  readonly receiver: HandoffReceiver
}

describe('the handoff on the real PersonaHomeBook', () => {
  it('moves her: A\'s doc says `moving` and her runtime stops, B becomes her home at epoch + 1, and only B runs her', () => {
    const { A, B, pump } = world()
    A.sender.start({ personaId: PERSONA, toComputerId: B.self.id, includesPrivateDm: false })
    expect(A.book.resolve(PERSONA)).toMatchObject({ state: 'moving', movingTo: B.self.id, epoch: 3 })
    expect(A.stops).toEqual(['moving']) // the runtime stopped AFTER the durable doc said so
    expect(A.book.runsHere(PERSONA)).toBe(false)
    expect(pump()).toEqual([])
    expect(B.book.resolve(PERSONA)).toMatchObject({ computerId: B.self.id, epoch: 4, state: 'active', isThis: true, explicit: true })
    expect(B.book.runsHere(PERSONA)).toBe(true)
    expect(A.book.runsHere(PERSONA)).toBe(false)
    expect(A.wiped).toEqual([PERSONA])
    expect(B.applied).toHaveLength(1)
    expect(B.applied[0]?.memory[0]?.body).toContain('bolo')
  })

  it('B\'s home book refuses a stale epoch: if B already saw a HIGHER epoch for her, the `released` is refused with the protocol\'s own code and nothing runs on B', () => {
    const { A, B, wire } = world()
    A.sender.start({ personaId: PERSONA, toComputerId: B.self.id, includesPrivateDm: false })
    const bundle = wire.shift()
    if (bundle?.message.type !== 'bundle') throw new Error('no bundle')
    B.receiver.onBundle(bundle.message)
    const received = wire.shift()
    if (received?.message.type !== 'received') throw new Error('no received')
    A.sender.onMessage(received.message)
    const released = wire.shift()
    if (released?.message.type !== 'released') throw new Error('no released')
    B.book.onHigherEpochSeen(PERSONA, 9, { computerId: 'comp-x' }, iso(NOW)) // the mesh showed B a record of epoch 9 for her before the `released` arrived
    let code = 'none'
    try { B.receiver.onReleased(released.message) } catch (error) { code = error instanceof HandoffError ? error.code : 'other' }
    expect(code).toBe('stale-epoch')
    expect(B.book.runsHere(PERSONA)).toBe(false)
    expect(B.quarantine.get(PERSONA)).toBeUndefined() // the held bundle is dropped
  })

  it('the placement rule of D-117 holds: a computer that may not host her refuses at `set`, as `placement-refused`, and she runs NOWHERE until A reactivates', () => {
    const refuse = { computerId: '' }
    const { A, B, pump } = world((_personaId, computerId) => (computerId === refuse.computerId ? 'team-persona-never-personal-pc' : undefined))
    refuse.computerId = B.self.id // B may not host her (a personal PC)
    A.sender.start({ personaId: PERSONA, toComputerId: B.self.id, includesPrivateDm: false })
    expect(pump()).toEqual(['placement-refused'])
    expect(B.book.runsHere(PERSONA)).toBe(false)
    expect(B.book.resolve(PERSONA)).toMatchObject({ computerId: A.self.id, epoch: 3 }) // B did not take her
    expect(A.book.runsHere(PERSONA)).toBe(false) // A already released: safe failure (off), never two
    expect(A.transfers.get(PERSONA)?.phase).toBe('released')
  })

  it('a failed handoff reopens her on A at the SAME epoch (the real book: `open` only reopens a persona that is moving)', () => {
    const { A, B, clock } = world()
    A.sender.start({ personaId: PERSONA, toComputerId: B.self.id, includesPrivateDm: false })
    expect(A.book.runsHere(PERSONA)).toBe(false)
    clock.now += 121_000
    A.sender.tick()
    expect(A.book.resolve(PERSONA)).toMatchObject({ state: 'active', epoch: 3, isThis: true })
    expect(A.book.runsHere(PERSONA)).toBe(true)
    expect(A.stops).toEqual(['moving']) // stopped once; reopening does not stop anything
  })

  it('the persona\'s doc lives under her project\'s key, in the screens KV, as `persona_home`', () => {
    const { A } = world()
    expect([...A.store.docs.keys()]).toEqual([`${PROJECT}|${HOME_KIND}|${PERSONA}`])
  })
})
