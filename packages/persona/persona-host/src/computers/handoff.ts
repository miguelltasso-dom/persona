/**
 * D-116 (Bolt): "Levar para outro computador" — the handoff of a persona from computer A (her home today) to computer B, and the rule that she is NEVER active in two places.
 *
 * The order is the whole safety:
 *   1. A CLOSES her (durable `moving` BEFORE anything stops) and seals a bundle for B, plus a copy sealed for ITSELF (escrow: the way back if B never answers).
 *   2. B checks everything and KEEPS the bundle in quarantine, not active, and answers `received(epoch, digest)`, signed.
 *   3. A, on `received`, WIPES her and records `released(epoch)` DURABLY, then tells B (`released`, signed, with `activateBefore`).
 *   4. B, on `released` inside its window, imports the bundle and becomes her home at `epoch` (compare-and-set), then says `activated`.
 * A releases only AFTER B holds the bundle and B activates only AFTER A released: between 3 and 4 she is simply OFF (safe failure). If B never answers, A reopens her at the same epoch (nothing lost).
 * If B is slow past `activateBefore`, B refuses and the owner may reactivate her on A at epoch + 1 (from the escrow). Fencing by epoch: any computer that SEES a higher epoch for her stops running her at once.
 * The honest limit (said on the screen): with no arbiter, a network partition with B already active plus a FORCED reactivation on A runs her on both until they hear each other; the higher epoch then stops the old one.
 *
 * Ports are injected (the persona's home book is Flint's; the transport is the tailnet or the hub; the roster is {@link RosterGuard}) so this file is the protocol and nothing else.
 */

import { signBytes, verifyBytes } from '@deepseek-ai/dsh-persona-sync'
import { BundleError, newBundleId, openPersonaBundle, sealPersonaBundle, type PersonaBundle, type SealedBundle } from '@deepseek-ai/dsh-persona-sync'
import { mayHost, type RosterGuard } from './computer-cert.ts'

/** How long A waits for B's `received` before it reopens the persona. */
export const RECEIVE_WAIT_MS = 120_000
/** How long B has, after A released, to activate (Lumen L6.1). A reactivates on A only AFTER this window. */
export const ACTIVATE_WINDOW_MS = 10 * 60_000

/** Why a handoff did not start or a message was refused. */
export type HandoffRefusal =
  | 'not-home' | 'transfer-in-progress' | 'destination-unknown' | 'bundle-refused' | 'stale-roster' | 'sender-unknown' | 'bad-signature' | 'unknown-persona' | 'not-for-me' | 'wrong-transfer'
  | 'host-not-allowed' | 'creator-quota' | 'autonomy-too-high' | 'sheet-invalid' | 'late-activation' | 'stale-epoch' | 'too-early' | 'not-released' | 'confirm-required' | 'bundle-bad' | 'already-moved' | 'wrong-workspace' | 'placement-refused'

/** A refusal, with the stable code. */
export class HandoffError extends Error {
  /** @param code - Why. */
  constructor(readonly code: HandoffRefusal) {
    super(`handoff refused: ${code}`)
    this.name = 'HandoffError'
  }
}

/** The persona's home on THIS computer's view (Flint's PersonaHomeBook). */
export interface HomeView {
  readonly computerId: string
  readonly epoch: number
  readonly state: 'active' | 'moving'
  readonly movingTo?: string
}

/** What the protocol needs from the persona's home book (Flint's `PersonaHomeBook`). */
export interface HomePort {
  resolve(personaId: string): HomeView | undefined
  /** `moving` is written DURABLY before the runtime stops; idempotent. */
  close(personaId: string, why: 'moving', movingTo: string): void
  /** Reopens only a persona that is `moving`. */
  open(personaId: string): void
  /** Compare-and-set by epoch: an equal or lower epoch throws `HandoffError('stale-epoch')`. */
  set(personaId: string, home: { readonly computerId: string; readonly epoch: number }): void
}

/** The messages of the handoff. Each one that decides something is SIGNED by the computer that says it. */
export type HandoffMessage =
  | { readonly type: 'bundle'; readonly transferId: string; readonly sealed: SealedBundle; readonly digest: string }
  | { readonly type: 'received'; readonly transferId: string; readonly personaId: string; readonly epoch: number; readonly digest: string; readonly by: string; readonly sig: string }
  | { readonly type: 'released'; readonly transferId: string; readonly personaId: string; readonly epoch: number; readonly from: string; readonly to: string; readonly activateBefore: number; readonly sig: string }
  | { readonly type: 'activated'; readonly transferId: string; readonly personaId: string; readonly epoch: number; readonly by: string; readonly sig: string }

/** The transport: fire and forget, may drop, may repeat. */
export interface Link {
  send(to: string, message: HandoffMessage): void
}

/** The computer's own identity (the seed lives in its Cofre). */
export interface SelfComputer {
  readonly id: string
  readonly signingSeed: string
  readonly agreement: { readonly secret: string; readonly publicKey: string }
}

const sign = (seed: string, fields: readonly (string | number)[]): string => signBytes(seed, Buffer.from(`persona/handoff/v1\n${JSON.stringify(fields)}`, 'utf8'))
const check = (publicKey: string, fields: readonly (string | number)[], sig: string): boolean => verifyBytes(publicKey, Buffer.from(`persona/handoff/v1\n${JSON.stringify(fields)}`, 'utf8'), sig)
const receivedFields = (m: { type: string; transferId: string; personaId: string; epoch: number; digest: string; by: string }): (string | number)[] => ['received', m.transferId, m.personaId, m.epoch, m.digest, m.by]
const releasedFields = (m: { transferId: string; personaId: string; epoch: number; from: string; to: string; activateBefore: number }): (string | number)[] => ['released', m.transferId, m.personaId, m.epoch, m.from, m.to, m.activateBefore]
const activatedFields = (m: { transferId: string; personaId: string; epoch: number; by: string }): (string | number)[] => ['activated', m.transferId, m.personaId, m.epoch, m.by]

// ---- sender (A) ---------------------------------------------------------------------------------------------------------------------------

/** What A keeps, DURABLY, about one handoff (a crash at any point reads it back). */
export interface TransferRecord {
  readonly transferId: string
  readonly personaId: string
  readonly from: string
  readonly to: string
  readonly epoch: number
  readonly phase: 'sealed' | 'released' | 'rolled-back' | 'done'
  readonly digest: string
  readonly startedAt: number
  readonly activateBefore?: number
  /** The bundle sealed for A ITSELF: the way back if B never activates. Dropped when B says `activated`. */
  readonly escrow?: SealedBundle
}

/** Where A keeps the record (a file in the machine's data folder; memory in tests). */
export interface TransferStore {
  get(personaId: string): TransferRecord | undefined
  put(record: TransferRecord): void
  /** The handoffs that are not over (a restart reads these back and goes on). */
  open(): readonly TransferRecord[]
}

/** What A needs. */
export interface SenderDeps {
  readonly self: SelfComputer
  readonly roster: RosterGuard
  readonly home: HomePort
  readonly link: Link
  readonly store: TransferStore
  readonly now?: () => number
  /** Builds the bundle of the persona from what A holds (memory, rules, skills, the signed sheet). */
  readonly makeBundle: (input: { personaId: string; toComputerId: string; epoch: number; includesPrivateDm: boolean }) => PersonaBundle
  /** Wipes what A holds of the persona (the P0-09 procedure plus the backups). Called ONLY after B holds the bundle. */
  readonly wipe: (personaId: string) => void
  /** Puts the persona back from a bundle (the escrow) on A. */
  readonly restore: (bundle: PersonaBundle) => void
}

/** The sending side. */
export class HandoffSender {
  private readonly now: () => number

  /** @param deps - Identity, roster, home book, transport, store and the persona's own data. */
  constructor(private readonly deps: SenderDeps) {
    this.now = deps.now ?? Date.now
  }

  /**
   * Start taking a persona to another computer. The persona stops here NOW (and stays stopped until B answers or the wait is over).
   * @param input - The persona, the destination, and whether the creator confirmed that private DM memory may travel.
   * @returns The transfer id.
   * @throws {HandoffError} `not-home`, `transfer-in-progress`, `destination-unknown` or `bundle-refused` (and then the persona is untouched: nothing was closed).
   */
  start(input: { personaId: string; toComputerId: string; includesPrivateDm: boolean }): { readonly transferId: string } {
    const held = this.deps.store.get(input.personaId)
    if (held !== undefined && (held.phase === 'sealed' || held.phase === 'released')) throw new HandoffError('transfer-in-progress')
    const home = this.deps.home.resolve(input.personaId)
    if (home === undefined || home.computerId !== this.deps.self.id || home.state !== 'active') throw new HandoffError('not-home')
    const cert = this.deps.roster.certOf(input.toComputerId)
    const mine = this.deps.roster.certOf(this.deps.self.id)
    if (cert === undefined || mine === undefined || input.toComputerId === this.deps.self.id) throw new HandoffError('destination-unknown')
    const epoch = home.epoch + 1
    const base = this.deps.makeBundle({ personaId: input.personaId, toComputerId: input.toComputerId, epoch, includesPrivateDm: input.includesPrivateDm })
    let sealed: { sealed: SealedBundle; digest: string }
    let escrow: SealedBundle
    try {
      sealed = sealPersonaBundle({ bundle: base, fromSigningSeed: this.deps.self.signingSeed, toAgreementPublic: cert.agreement })
      // The way back: the same bundle sealed for A ITSELF, good for 30 days (the owner may be away; it is not a message that goes stale in a day).
      escrow = sealPersonaBundle({ bundle: { ...base, id: newBundleId(), toComputerId: this.deps.self.id, notAfter: new Date(this.now() + 30 * 24 * 3_600_000).toISOString() }, fromSigningSeed: this.deps.self.signingSeed, toAgreementPublic: mine.agreement }).sealed
    } catch (error) {
      if (error instanceof BundleError) throw new HandoffError('bundle-refused')
      throw error
    }
    // The record first, then the close, then the send: a crash between any two leaves her either still running (the wait then ends harmlessly) or closed WITH a record that reopens her. Never closed with no record.
    const transferId = newBundleId()
    this.deps.store.put({ transferId, personaId: input.personaId, from: this.deps.self.id, to: input.toComputerId, epoch, phase: 'sealed', digest: sealed.digest, startedAt: this.now(), escrow })
    this.deps.home.close(input.personaId, 'moving', input.toComputerId) // `moving` is durable BEFORE the runtime stops and before anything is sent
    this.deps.link.send(input.toComputerId, { type: 'bundle', transferId, sealed: sealed.sealed, digest: sealed.digest })
    return { transferId }
  }

  /**
   * A message from B.
   * @param message - `received` or `activated`.
   * @returns Nothing; a message that does not fit is ignored (a repeat, a late one, a forged one).
   */
  onMessage(message: HandoffMessage): void {
    if (message.type === 'received') this.onReceived(message)
    else if (message.type === 'activated') this.onActivated(message)
  }

  private recordFor(personaId: string, transferId: string): TransferRecord | undefined {
    const record = this.deps.store.get(personaId)
    return record?.transferId === transferId ? record : undefined
  }

  private onReceived(message: Extract<HandoffMessage, { type: 'received' }>): void {
    const record = this.recordFor(message.personaId, message.transferId)
    if (record === undefined || record.phase !== 'sealed') return // a repeat, a late answer after the rollback, or not ours
    const cert = this.deps.roster.certOf(record.to)
    if (cert === undefined || message.by !== record.to || message.epoch !== record.epoch || message.digest !== record.digest || !check(cert.signing, receivedFields(message), message.sig)) return
    // B HOLDS the bundle: only now does A let go of her. The record is durable BEFORE the wipe and before B hears of it.
    const activateBefore = this.now() + ACTIVATE_WINDOW_MS
    this.deps.store.put({ ...record, phase: 'released', activateBefore })
    this.deps.wipe(record.personaId)
    this.sendReleased({ ...record, phase: 'released', activateBefore })
  }

  private sendReleased(record: TransferRecord): void {
    if (record.activateBefore === undefined) return
    const fields = { transferId: record.transferId, personaId: record.personaId, epoch: record.epoch, from: record.from, to: record.to, activateBefore: record.activateBefore }
    this.deps.link.send(record.to, { type: 'released', ...fields, sig: sign(this.deps.self.signingSeed, releasedFields(fields)) })
  }

  private onActivated(message: Extract<HandoffMessage, { type: 'activated' }>): void {
    const record = this.recordFor(message.personaId, message.transferId)
    if (record === undefined || record.phase !== 'released') return
    const cert = this.deps.roster.certOf(record.to)
    if (cert === undefined || message.by !== record.to || message.epoch !== record.epoch || !check(cert.signing, activatedFields(message), message.sig)) return
    const { escrow, ...rest } = record
    void escrow
    this.deps.store.put({ ...rest, phase: 'done' }) // B is her home: the way back is no longer needed
    this.recordHome(record)
  }

  /**
   * B is her home now: this computer's book says so too (it was `moving`; without this the screen would say "em transferência" for ever and "onde roda" would answer with the old home). Best effort: the mesh may
   * have told this computer already (a higher or equal epoch is refused by the book, which is fine), and a book that cannot place her there changes nothing that matters: she does not run here.
   */
  private recordHome(record: TransferRecord): void {
    try {
      this.deps.home.set(record.personaId, { computerId: record.to, epoch: record.epoch })
    } catch (error) {
      void error
    }
  }

  /**
   * Time passes (a timer, and after a restart). A that is still waiting past the wait reopens the persona at the SAME epoch; A that released keeps telling B until it activates.
   */
  tick(): void {
    for (const record of this.deps.store.open()) {
      if (record.phase === 'released' && this.movedAlready(record)) {
        // The mesh told A that B is her home: the handoff is over, the way back is no longer needed.
        const { escrow, ...rest } = record
        void escrow
        this.deps.store.put({ ...rest, phase: 'done' })
      } else if (record.phase === 'sealed' && this.now() - record.startedAt >= RECEIVE_WAIT_MS) {
        this.deps.home.open(record.personaId) // nothing was wiped: she is as she was, at the epoch she had
        this.deps.store.put({ ...record, phase: 'rolled-back' })
      } else if (record.phase === 'released' && record.activateBefore !== undefined && this.now() < record.activateBefore) {
        this.sendReleased(record) // idempotent: B answers `activated` again if it already is
      }
    }
  }

  /** Whether this computer's view of the mesh already says that the destination is her home at (or past) the handoff's epoch. */
  private movedAlready(record: TransferRecord): boolean {
    const view = this.deps.home.resolve(record.personaId)
    return view !== undefined && view.computerId === record.to && view.epoch >= record.epoch
  }

  /**
   * "Ativar de novo aqui": B never activated and its window is over. The persona comes back from the ESCROW at epoch + 1. The owner confirmed the partition risk on the screen (if B is cut off from the network and
   * running her, both run her until they meet; the higher epoch then stops B).
   * @param personaId - The persona.
   * @param confirmedPartitionRisk - The owner read and accepted the warning.
   * @throws {HandoffError} `confirm-required`, `not-released`, `too-early` (the window is not over) or `bundle-bad`.
   */
  reactivateHere(personaId: string, confirmedPartitionRisk: boolean): void {
    if (!confirmedPartitionRisk) throw new HandoffError('confirm-required')
    const record = this.deps.store.get(personaId)
    if (record === undefined || record.phase !== 'released' || record.escrow === undefined || record.activateBefore === undefined) throw new HandoffError('not-released')
    if (this.movedAlready(record)) throw new HandoffError('already-moved') // the mesh says B IS her home: bringing her back here would be the second copy
    if (this.now() < record.activateBefore) throw new HandoffError('too-early') // a SLOW B may still activate inside its window
    const mine = this.deps.roster.certOf(this.deps.self.id)
    if (mine === undefined) throw new HandoffError('stale-roster')
    let bundle: PersonaBundle
    try {
      bundle = openPersonaBundle({
        myComputerId: this.deps.self.id, myAgreement: this.deps.self.agreement, senderSigningPublic: mine.signing,
        expected: { personaId, workspaceId: record.escrow.header.workspaceId, epoch: record.epoch, from: this.deps.self.id }, now: this.now,
      }, record.escrow).bundle
    } catch (error) {
      if (error instanceof BundleError) throw new HandoffError('bundle-bad')
      throw error
    }
    this.deps.restore(bundle)
    this.deps.home.set(personaId, { computerId: this.deps.self.id, epoch: record.epoch + 1 })
    const { escrow, ...rest } = record
    void escrow
    this.deps.store.put({ ...rest, phase: 'rolled-back' })
  }
}

// ---- receiver (B) -------------------------------------------------------------------------------------------------------------------------

/** What B keeps of a bundle it holds but has not activated: the SEALED bundle (still ciphertext on disk; it is opened again at activation), never the plaintext. */
export interface Quarantined {
  readonly transferId: string
  readonly personaId: string
  readonly epoch: number
  readonly from: string
  readonly digest: string
  readonly sealed: SealedBundle
}

/** Where B keeps it (memory is wrong for a real computer: a restart would forget; the app uses a file in the machine's data folder). */
export interface QuarantineStore {
  get(personaId: string): Quarantined | undefined
  put(item: Quarantined): void
  drop(personaId: string): void
  /** Bundle ids already accepted (a repeat is refused). */
  seen(bundleId: string): boolean
  markSeen(bundleId: string): void
}

/** What B needs. */
export interface ReceiverDeps {
  readonly self: SelfComputer
  /** The team this computer belongs to (a bundle for another workspace is refused: the header is not what decides). */
  readonly workspaceId: string
  readonly roster: RosterGuard
  readonly home: HomePort
  readonly link: Link
  readonly quarantine: QuarantineStore
  readonly now?: () => number
  /** Imports the bundle into this computer's stores (memory, rules, skills). Not active until the home says so. */
  readonly apply: (bundle: PersonaBundle) => void
  /** Law 3: the signed sheet inside the bundle is the creator's (verified with the creator's key, not A's). */
  readonly verifySheet: (bundle: PersonaBundle) => boolean
  /**
   * D-121: this computer is LENT personas (it holds no record of her living on the sender): a bundle is accepted only from this computer (the owner's PC) and for an epoch above the one known here (compare-and-set),
   * instead of "the persona lives on the sender at the epoch before". Absent: the usual rule.
   */
  readonly lentFrom?: string
  /** Who created the persona, how many of that creator's personas live here already, and the autonomy she asks for (for the hosting rule, Lumen L2). */
  readonly hostingFacts: (bundle: PersonaBundle) => { creatorMemberId: string; personasOfCreatorHere: number; autonomy: 'baixa' | 'media' | 'alta' }
}

/** The receiving side. */
export class HandoffReceiver {
  private readonly now: () => number

  /** @param deps - Identity, roster, home book, transport, quarantine and the persona's stores. */
  constructor(private readonly deps: ReceiverDeps) {
    this.now = deps.now ?? Date.now
  }

  /**
   * A bundle arrived. It is checked, KEPT in quarantine (not active) and answered with a signed `received`.
   * @param message - The `bundle` message.
   * @throws {HandoffError} why it was not accepted (nothing is kept and nothing is answered).
   */
  onBundle(message: Extract<HandoffMessage, { type: 'bundle' }>): void {
    const header = message.sealed.header
    if (header.to !== this.deps.self.id) throw new HandoffError('not-for-me')
    const certA = this.deps.roster.certOf(header.from)
    const mine = this.deps.roster.certOf(this.deps.self.id)
    if (!this.deps.roster.fresh()) throw new HandoffError('stale-roster')
    if (certA === undefined) throw new HandoffError('sender-unknown')
    if (mine === undefined) throw new HandoffError('stale-roster')
    const known = this.deps.home.resolve(header.personaId)
    const lent = this.deps.lentFrom !== undefined
    if (lent ? header.from !== this.deps.lentFrom : known === undefined || known.computerId !== header.from) throw new HandoffError('unknown-persona')
    if (lent && header.epoch <= (known?.epoch ?? 0)) throw new HandoffError('stale-epoch')
    let opened: { bundle: PersonaBundle; digest: string }
    try {
      opened = openPersonaBundle({
        myComputerId: this.deps.self.id, myAgreement: this.deps.self.agreement, senderSigningPublic: certA.signing,
        expected: { personaId: header.personaId, workspaceId: this.deps.workspaceId, epoch: lent ? header.epoch : (known?.epoch ?? 0) + 1, from: header.from }, now: this.now, alreadySeen: id => this.deps.quarantine.seen(id),
      }, message.sealed)
    } catch (error) {
      if (error instanceof BundleError) throw new HandoffError(error.code === 'wrong-epoch' ? 'stale-epoch' : error.code === 'wrong-persona' ? 'wrong-workspace' : 'bundle-bad')
      throw error
    }
    if (opened.digest !== message.digest) throw new HandoffError('bundle-bad')
    if (!this.deps.verifySheet(opened.bundle)) throw new HandoffError('sheet-invalid')
    const facts = this.deps.hostingFacts(opened.bundle)
    const allowed = mayHost(mine, facts.creatorMemberId, facts.personasOfCreatorHere, facts.autonomy)
    if (allowed !== 'ok') throw new HandoffError(allowed) // refused HERE, by this computer's own certificate — not only by the screen
    this.deps.quarantine.markSeen(opened.bundle.id)
    this.deps.quarantine.put({ transferId: message.transferId, personaId: header.personaId, epoch: header.epoch, from: header.from, digest: opened.digest, sealed: message.sealed })
    const fields = { type: 'received', transferId: message.transferId, personaId: header.personaId, epoch: header.epoch, digest: opened.digest, by: this.deps.self.id }
    this.deps.link.send(header.from, { ...fields, type: 'received', sig: sign(this.deps.self.signingSeed, receivedFields(fields)) })
  }

  /**
   * A said it released her. Inside its window the bundle is imported and this computer becomes her home; outside it, the bundle is dropped (a slow B never activates late).
   * @param message - The `released` message.
   * @throws {HandoffError} why she was not activated.
   */
  onReleased(message: Extract<HandoffMessage, { type: 'released' }>): void {
    if (message.to !== this.deps.self.id) throw new HandoffError('not-for-me')
    const certA = this.deps.roster.certOf(message.from)
    if (certA === undefined) throw new HandoffError('sender-unknown')
    if (!check(certA.signing, releasedFields(message), message.sig)) throw new HandoffError('bad-signature')
    const current = this.deps.home.resolve(message.personaId)
    if (current?.computerId === this.deps.self.id && current.epoch === message.epoch && current.state === 'active') { this.sendActivated(message); return } // a repeat: already her home
    const held = this.deps.quarantine.get(message.personaId)
    if (held === undefined || held.transferId !== message.transferId || held.epoch !== message.epoch || held.from !== message.from) throw new HandoffError('wrong-transfer')
    if (this.now() > message.activateBefore) { this.deps.quarantine.drop(message.personaId); throw new HandoffError('late-activation') }
    let bundle: PersonaBundle
    try {
      // The quarantine holds the SEALED bundle: it is opened again here, with this computer's key, and the checks (sender, epoch, deadline) run once more.
      bundle = openPersonaBundle({
        myComputerId: this.deps.self.id, myAgreement: this.deps.self.agreement, senderSigningPublic: certA.signing,
        expected: { personaId: message.personaId, workspaceId: this.deps.workspaceId, epoch: message.epoch, from: message.from }, now: this.now,
      }, held.sealed).bundle
    } catch (error) {
      this.deps.quarantine.drop(message.personaId)
      if (error instanceof BundleError) throw new HandoffError(error.code === 'expired' ? 'late-activation' : 'bundle-bad')
      throw error
    }
    this.deps.apply(bundle)
    try {
      this.deps.home.set(message.personaId, { computerId: this.deps.self.id, epoch: message.epoch }) // compare-and-set: a higher epoch seen meanwhile wins
    } catch (error) {
      if (error instanceof HandoffError) { this.deps.quarantine.drop(message.personaId); throw error }
      throw error
    }
    this.deps.quarantine.drop(message.personaId)
    this.sendActivated(message)
  }

  private sendActivated(message: { transferId: string; personaId: string; epoch: number; from: string }): void {
    const fields = { transferId: message.transferId, personaId: message.personaId, epoch: message.epoch, by: this.deps.self.id }
    this.deps.link.send(message.from, { type: 'activated', ...fields, sig: sign(this.deps.self.signingSeed, activatedFields(fields)) })
  }
}
