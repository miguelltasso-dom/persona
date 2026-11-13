/**
 * D-116 (Bolt): the composition of everything a computer needs to be part of a team — its identity (the device's own, in the Cofre), the book of computers (the owner's PC) or the membership (a member), the
 * roster guard, the link between computers, the handoff of a persona and the service the Remotes call — built ONCE from a few ports, so the host's `index.ts` only has to hand them over and call `service()`.
 *
 * Roles are not chosen: a fresh PC is neither the owner's nor a member until it does one of the two. Its first code makes it the owner's (its own certificate is signed then); typing a code from another PC's
 * screen makes it a member (the owner's key becomes its anchor). A PC never plays both. After a member joins, the next call rebuilds the live state in the member's role.
 *
 * The gate talks to this through two STABLE doors (`door`, `linkDoor`) that answer "nobody" until the state is built, so the gate can open before the identity (an async read of the Cofre) is ready.
 * Everything about the persona's own data (her memory, rules, skills, her home book) arrives as ports (`PersonaTransferPorts`): until the host provides them, `movePersona` answers honestly that it cannot.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { BUNDLE_SCHEMA, BUNDLE_TTL_MS, loadOrCreateIdentity, newBundleId, publicIdentity, signBytes, verifyBytes, type Identity, type IdentityStore, type PublicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { DevicePairing, filePairStore } from '../remote-web/pair-guard.ts'
import type { TailnetIdentity } from '../remote-web/tailnet-identity.ts'
import type { Beat, ComputerPresence, ComputerPresenceView, RosterComputer } from '../station/computer-presence.ts'
import type { PersonaHomeBook } from '../persona-home.ts'
import { ComputerAuth, type Precheck, type SignedRequestFacts } from './computer-auth.ts'
import { RosterGuard, computerIdOf, mayHost, memoryRosterStore, type RosterStore, type SignedRoster } from './computer-cert.ts'
import { ComputerEnrollment, fileMembershipStore, type MembershipStore } from './computer-enroll.ts'
import { ComputerDirectory, ComputerLink, type LinkAnswer } from './computer-link.ts'
import { ComputerRegistry, fileRegistryStore, type ComputerPoll, type HelloInput, type HelloResult } from './computer-registry.ts'
import { ComputersService, type ComputersDeps, type HomeFacts } from './computers-service.ts'
import { HandoffError, HandoffReceiver, HandoffSender, type HandoffMessage, type ReceiverDeps, type SenderDeps } from './handoff.ts'
import { fileQuarantineStore, fileTransferStore } from './handoff-store.ts'
import { homePortOf } from './home-adapter.ts'
import { LentHomes, envelopeBytes, envelopeText, readEnvelope } from './lent-homes.ts'
import { EXECUTOR_PATH, cleanOp } from './executor-protocol.ts'
import { RemoteTurns } from './remote-turns.ts'
import { TurnExecutor, type ExecutorRunner } from './turn-executor.ts'

/** How often a computer lets its handoffs go on (a wait that is over reopens the persona; a released one tells the destination again). */
export const HOST_TICK_MS = 15_000

/** What the persona's own data and her home need from the host (Flint's home book; the memory model). */
export interface PersonaTransferPorts {
  readonly homes: Pick<PersonaHomeBook, 'resolve' | 'close' | 'open' | 'set'>
  /** The bundle ports (what travels when a persona is TAKEN to another computer): optional, so the host can hand over only the home ports first. Without them `movePersona` says it cannot and nothing is closed. */
  readonly makeBundle?: SenderDeps['makeBundle']
  readonly wipe?: SenderDeps['wipe']
  readonly restore?: SenderDeps['restore']
  readonly apply?: ReceiverDeps['apply']
  readonly verifySheet?: ReceiverDeps['verifySheet']
  readonly hostingFacts?: ReceiverDeps['hostingFacts']
  readonly previewOf?: ComputersDeps['previewOf']
  readonly creatorOf: ComputersDeps['creatorOf']
  readonly hostedBy: ComputersDeps['hostedBy']
  /**
   * Flint's `hostGrantOf` (D-116 L2): the creator's concession "she may run on THAT team computer", and who gave it. Read AT START by `mayHost`: `granted` with a `by` is a grant; anything else (no data, no `by`, an unknown
   * persona, a port that is not there) is NO grant and no remote turn (fails closed). Where she may LIVE by her audience x the computer's kind is the placement rule of the home book (D-117), which refuses a home the rule forbids.
   */
  readonly hostGrantOf?: (personaId: string, computerId: string) => { readonly granted: boolean; readonly by: string }
  /**
   * D-121: the text of her sheet (what the owner reviews and signs: instructions, tools, limits). With it and no bundle ports, "Levar" is a change of HOME: only this sheet, signed by the owner, travels (no memory, no rules, no
   * skills, no private DM); the destination registers her as LENT and runs her turns, the project stays here. Absent (and no bundle ports): `movePersona` says it cannot.
   */
  readonly sheetJsonOf?: (personaId: string) => string | undefined
}

/** What the host hands over. */
export interface ComputersHostDeps {
  /** The machine's data folder (the files below live in a `computers` folder inside it). */
  readonly dataDir: string
  /** The name of this PC on the owner's screen. */
  readonly hostLabel: string
  /** This device's identity (the Cofre's sealed slot). */
  readonly identityStore: IdentityStore
  /** The team of the owner's workspace; `undefined` until onboarding made one. */
  readonly workspaceId: () => string | undefined
  /** The owner member of that workspace. */
  readonly ownerMemberId: () => string | undefined
  /** The port of THIS computer's door (a member announces it) and `ip:port` of it (the owner is in its own directory); `undefined` while the door is closed. */
  readonly gatePort: () => number | undefined
  readonly gateEndpoint: () => string | undefined
  /** The persona's own data and her home book, read when the state is built (the host's home book is created lazily, so this is a function). */
  readonly persona?: () => PersonaTransferPorts | undefined
  /** This computer's own runner (its own account): runs the turns of personas that live HERE for the project's PC (the executor). `undefined` = none. */
  readonly runner?: () => ExecutorRunner | undefined
  /** Takes one slot of THIS host's capacity for a remote turn (like a local turn does) and returns what gives it back; `undefined` = no slot, the start is `busy`. Absent = the executor's own cap only. */
  readonly admit?: (personaId: string) => (() => void) | undefined
  /** Called once the state is built, with this computer's id (the host tells its home book who "this computer" is). */
  readonly onReady?: (info: { readonly computerId: string }) => void
  readonly now?: () => number
  /** Replaced in tests. */
  readonly fetch?: typeof fetch
  /** TESTS ONLY: replaces "a tailnet address only" for the computers this one dials. The app never passes this. */
  readonly allowAddress?: (host: string) => boolean
  /** The beats and the handoff timer run only when this is `true` (the installed app); a test drives them by hand. */
  readonly timers?: boolean
  /** M4/D-116: optional beat status supplied by this host for outbound member heartbeats. */
  readonly beatStatus?: (() => Beat | undefined) | undefined
  /** M4/D-116: optional verified beat receiver on the owner's PC. */
  readonly onBeat?: ((from: string, status: Beat | undefined) => void) | undefined
  /** M4/D-116: optional live presence tracker synchronized from verified beats and the roster. */
  readonly presence?: ComputerPresence | undefined
}

/** Why the computers are not available on this PC right now. */
export type ComputersUnavailable = 'identity-unavailable' | 'no-workspace'

/** The state once it is built. */
export interface ComputersLive {
  readonly member: boolean
  readonly identity: Identity
  readonly pub: PublicIdentity
  readonly thisId: string
  readonly roster: RosterGuard
  readonly link: ComputerLink
  readonly auth: ComputerAuth
  readonly registry: ComputerRegistry | undefined
  readonly sender: HandoffSender
  readonly service: ComputersService
  /** The owner's PC: the turns it sent to other computers. */
  readonly turns: RemoteTurns | undefined
  /** A member: the turns it runs for the owner's PC. */
  readonly executor: TurnExecutor | undefined
}

/**
 * A roster on disk, re-checked at every read: what is read back must carry the owner's signature for THIS team (a hand-edited file is "no roster", and a computer with no roster accepts nobody).
 * @param path - The file (its folder is created on the first write).
 * @param workspaceId - The team.
 * @param ownerSigningPublic - The owner's public signing key.
 * @returns The store.
 */
export function fileRosterStore(path: string, workspaceId: string, ownerSigningPublic: string): RosterStore {
  return {
    read() {
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as { roster?: unknown }
        const check = new RosterGuard(workspaceId, ownerSigningPublic, memoryRosterStore(), () => 0)
        return check.accept(parsed.roster) === 'ok' ? { version: check.version(), roster: parsed.roster as SignedRoster } : undefined
      } catch (error) {
        void error // missing or damaged: no roster
        return undefined
      }
    },
    write(state) {
      mkdirSync(dirname(path), { recursive: true })
      const temp = `${path}.tmp`
      writeFileSync(temp, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, path)
    },
  }
}

/** What the gate's public door `POST /remote/computer-hello` asks of the host. */
export interface ComputersDoor {
  readonly hello: (input: HelloInput, address: string) => HelloResult
  readonly annotate: (requestId: string, identity: TailnetIdentity) => void
  readonly poll: (pollToken: string) => ComputerPoll
}

/** What the gate's door between computers asks of the host. */
export interface ComputersLinkDoor {
  readonly auth: {
    readonly precheck: (header: string | undefined) => ReturnType<ComputerAuth['precheck']>
    readonly verify: (pre: Precheck, facts: SignedRequestFacts) => ReturnType<ComputerAuth['verify']>
  }
  readonly handle: (kind: 'beat' | 'message' | 'executor', from: string, remote: string, text: string) => LinkAnswer | Promise<LinkAnswer>
}

/** The computers of the team on this PC. */
export class ComputersHost {
  private live: ComputersLive |undefined
  private building: Promise<ComputersLive |ComputersUnavailable> | undefined
  private identity: Identity | undefined
  private enrollment: ComputerEnrollment | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly dir: string
  private readonly membershipStore: MembershipStore
  private readonly now: () => number

  /** What the gate's public door `POST /remote/computer-hello` asks: nobody until the owner's state is built. */
  readonly door: ComputersDoor = {
    hello: (input: HelloInput, address: string): HelloResult => this.live?.registry?.hello(input, address) ?? { ok: false, reason: 'recusado' },
    annotate: (requestId: string, identity: TailnetIdentity): void => { this.live?.registry?.annotate(requestId, identity) },
    poll: (pollToken: string): ComputerPoll => this.live?.registry?.poll(pollToken) ?? { state: 'desconhecido' },
  }

  /** What the gate's door between computers asks: nobody is "unknown" until the state is built. */
  readonly linkDoor: ComputersLinkDoor = {
    auth: {
      precheck: (header: string | undefined): ReturnType<ComputerAuth['precheck']> => this.live?.auth.precheck(header) ?? { refused: 'unknown-computer' },
      verify: (pre: Precheck, facts: SignedRequestFacts): ReturnType<ComputerAuth['verify']> => this.live?.auth.verify(pre, facts) ?? { ok: false, reason: 'unknown-computer' },
    },
    handle: (kind: 'beat' | 'message' | 'executor', from: string, remote: string, text: string): LinkAnswer | Promise<LinkAnswer> => this.live?.link.handle(kind, from, remote, text) ?? { status: 404, body: { ok: false } },
  }

  /** @returns The turns this PC sent to other computers, once the state is built (the orchestration asks it where it picks the runner of a persona whose home is not here). */
  remoteTurns(): RemoteTurns | undefined {
    return this.live?.turns
  }

  /** @returns Synchronously cached team roster entries (`[]` until ready), for {@link ComputerPresence}. */
  rosterComputers(): readonly RosterComputer[] {
    const live = this.live
    if (live === undefined) return []
    return live.roster.certs().map((cert): RosterComputer => ({
      computerId: cert.computerId,
      label: cert.label,
      registeredBy: cert.registeredBy,
      isThis: cert.computerId === live.thisId,
    }))
  }

  /** @returns Current presence rows from the attached {@link ComputerPresence}, or `[]` when none is configured. */
  presence(): readonly ComputerPresenceView[] {
    return this.deps.presence?.list() ?? []
  }

  /**
   * What this PC knows about a computer of the team, for the placement of a persona's home (D-117; the host's `computerFactsOf`). Three locks (Keel 12/11): (1) only a computer in the FRESH roster, whose certificate the roster
   * checked against the owner's key, and not revoked (an expired roster, a stranger and a revoked computer are all `undefined` = unknown, and a home there is refused); (2) the use of the computer is OFF unless the certificate says
   * `computerUse` (it does not today); (3) this is only about WHERE she may live: whether a persona may move the mouse of a computer stays with that computer's own local record (never this roster).
   * Kinds: a member's computer in the roster is a team computer owned by who registered it; the OWNER's PC, seen from a member, is that owner's personal computer; the owner's own PC has no word here (the host's default, a
   * personal PC of the owner, holds), and neither does anything before the state is built.
   * @param computerId - A computer.
   * @returns Its facts, or `undefined` when it is unknown.
   */
  computerFacts(computerId: string): { readonly computerId: string; readonly kind: 'personal' | 'team'; readonly ownerId: string; readonly teamComputerUse: boolean } | undefined {
    const live = this.live
    if (live === undefined) return undefined
    if (!live.member && computerId === live.thisId) return undefined
    const cert = live.roster.certOf(computerId)
    if (cert === undefined || cert.registeredBy === '') return undefined
    const ownerPc = live.member && computerId === this.membershipStore.read()?.ownerComputerId
    const grant = (cert.caps as { readonly computerUse?: unknown }).computerUse === true
    return { computerId, kind: ownerPc ? 'personal' : 'team', ownerId: cert.registeredBy, teamComputerUse: !ownerPc && grant }
  }

  /** Builds the state in the background (the installed app does it at boot, so the doors are ready when the gate opens; a call that needs it waits for it anyway). */
  warm(): void {
    void this.ready()
  }

  /** @param deps - See {@link ComputersHostDeps}. */
  constructor(private readonly deps: ComputersHostDeps) {
    this.dir = join(deps.dataDir, 'computers')
    this.membershipStore = fileMembershipStore(join(this.dir, 'membership.json'))
    this.now = deps.now ?? Date.now
  }

  /** @returns The service the Remotes call, or why the computers are not available on this PC. Builds the state on first use, and again once this PC joined a team. */
  async service(): Promise<ComputersService | ComputersUnavailable> {
    const live = await this.ready()
    return typeof live === 'string' ? live : live.service
  }

  /** @returns The state once it is built (the first call reads the Cofre), or why not. */
  async ready(): Promise<ComputersLive |ComputersUnavailable> {
    const member = this.membershipStore.read() !== undefined
    if (this.live !== undefined && this.live.member === member) return this.live
    this.building ??= this.build(member).finally(() => { this.building = undefined })
    return this.building
  }

  /** Stops the timers and the member's beats (the host is closing). */
  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
    this.live?.link.stop()
    void this.live?.executor?.stopAll()
  }

  private async build(member: boolean): Promise<ComputersLive |ComputersUnavailable> {
    if (this.identity === undefined) {
      try {
        this.identity = await loadOrCreateIdentity(this.deps.identityStore)
      } catch (error) {
        void error // no DPAPI / a damaged slot: no identity is made, so nothing is ever kept where it could be read
        return 'identity-unavailable'
      }
    }
    const identity = this.identity
    const pub = publicIdentity(identity)
    const thisId = computerIdOf(pub)
    const enrollment = this.enrollment ??= new ComputerEnrollment({ identity, store: this.membershipStore, now: this.now, ...(this.deps.fetch === undefined ? {} : { fetch: this.deps.fetch }), ...(this.deps.allowAddress === undefined ? {} : { allowAddress: this.deps.allowAddress }) })
    const membership = member ? this.membershipStore.read() : undefined
    const workspaceId = membership?.workspaceId ?? this.deps.workspaceId()
    const ownerPub = membership?.ownerSigningPublic ?? identity.signing.publicKey
    const ownerMember = this.deps.ownerMemberId()
    if (workspaceId === undefined || (membership === undefined && ownerMember === undefined)) return 'no-workspace'

    const roster = new RosterGuard(workspaceId, ownerPub, fileRosterStore(join(this.dir, 'roster.json'), workspaceId, ownerPub), this.now)
    if (membership !== undefined) roster.accept(membership.roster) // what the owner signed when it confirmed this computer (a higher version already on disk wins)
    const directory = new ComputerDirectory(this.now)
    const self = { id: thisId, signingSeed: identity.signing.seed, agreement: identity.agreement }
    const persona = this.deps.persona?.()
    const homes = persona?.homes
    let registry: ComputerRegistry | undefined
    if (membership === undefined) {
      registry = new ComputerRegistry({
        workspaceId, owner: { memberId: ownerMember as string, signingSeed: identity.signing.seed, signingPublic: identity.signing.publicKey }, thisComputerId: thisId,
        pairing: new DevicePairing(filePairStore(join(this.dir, 'computer-pair.json')), this.now), store: fileRegistryStore(join(this.dir, 'registry.json'), ownerPub), now: this.now,
      })
      const book = registry
      const first = book.signedRoster()
      if (first !== undefined) roster.accept(first)
      book.onRoster((signed) => { roster.accept(signed) })
    }
    const handoff: { receiver?: HandoffReceiver; sender?: HandoffSender } = {} // the link needs them and they need the link: filled right below
    const exec: { turns?: RemoteTurns; executor?: TurnExecutor } = {}
    const link = new ComputerLink({
      executor: {
        handle: (from, body) => {
          const op = cleanOp(body)
          if (typeof op === 'string') return Promise.resolve({ status: op === 'too-big' ? 413 : 400, body: { ok: false, reason: op } })
          if (op.op === 'event' || op.op === 'tool') return exec.turns === undefined ? Promise.resolve({ status: 404, body: { ok: false } }) : exec.turns.handle(from, op)
          return exec.executor === undefined ? Promise.resolve({ status: 404, body: { ok: false } }) : exec.executor.handle(from, op)
        },
      },
      self: { id: thisId, signingSeed: identity.signing.seed }, roster, directory, now: this.now, port: this.deps.gatePort,
      role: membership === undefined
        ? { kind: 'owner', roster: () => registry?.signedRoster(), selfEndpoint: this.deps.gateEndpoint }
        : { kind: 'member', ownerComputerId: membership.ownerComputerId, ownerAddress: () => membership.ownerAddress },
      onMessage: (_from, message: HandoffMessage) => {
        if (message.type === 'bundle') handoff.receiver?.onBundle(message)
        else if (message.type === 'released') handoff.receiver?.onReleased(message)
        else handoff.sender?.onMessage(message)
      },
      ...(this.deps.beatStatus === undefined ? {} : { beatStatus: this.deps.beatStatus }),
      ...(this.deps.onBeat === undefined && this.deps.presence === undefined ? {} : {
        onBeat: (from: string, status: Beat | undefined): void => {
          if (status !== undefined) this.deps.presence?.heartbeat(from, status)
          this.deps.onBeat?.(from, status)
        },
      }),
      ...(this.deps.fetch === undefined ? {} : { fetch: this.deps.fetch }), ...(this.deps.allowAddress === undefined ? {} : { allowAddress: this.deps.allowAddress }),
    })
    const refuseWithoutPersona = (): never => { throw new HandoffError('bundle-refused') }
    // D-121: a member computer that is handed no bundle ports keeps only WHERE the personas lent to it live (and the sheet the owner signed): its home port is that record, not a home book of a project it does not have.
    const lent = membership !== undefined && persona?.apply === undefined ? new LentHomes(join(this.dir, 'lent-homes.json'), () => thisId) : undefined
    const home = lent ?? (homes === undefined ? { resolve: () => undefined, close: () => undefined, open: () => undefined, set: () => undefined } : homePortOf(homes, this.now))
    const d121MakeBundle: SenderDeps['makeBundle'] | undefined = persona?.makeBundle === undefined && persona?.sheetJsonOf !== undefined
      ? ({ personaId, toComputerId, epoch }) => {
        const sheet = persona.sheetJsonOf?.(personaId)
        const creator = persona.creatorOf(personaId)
        if (sheet === undefined || creator === undefined) throw new HandoffError('bundle-refused')
        const json = envelopeText({ v: 1, personaId, workspaceId, creatorMemberId: creator.memberId, autonomy: creator.autonomy, sheet })
        const at = this.now()
        return {
          schema: BUNDLE_SCHEMA, id: newBundleId(), personaId, workspaceId, fromComputerId: thisId, toComputerId, epoch, createdAt: new Date(at).toISOString(), notAfter: new Date(at + BUNDLE_TTL_MS).toISOString(),
          includesPrivateDm: false, sheet: { json, signature: signBytes(identity.signing.seed, envelopeBytes(json)), signerSigningPublic: identity.signing.publicKey }, memory: [], rules: [], skills: [],
        }
      }
      : undefined
    const transfers = fileTransferStore(join(this.dir, 'transfers'))
    const sender = new HandoffSender({
      self, roster, home, link, store: transfers, now: this.now,
      makeBundle: persona?.makeBundle ?? d121MakeBundle ?? refuseWithoutPersona, wipe: persona?.wipe ?? (() => undefined), restore: persona?.restore ?? (() => undefined),
    })
    handoff.sender = sender
    handoff.receiver = new HandoffReceiver({
      self, workspaceId, roster, home, link, quarantine: fileQuarantineStore(join(this.dir, 'quarantine')), now: this.now,
      ...(lent === undefined || membership === undefined ? {} : { lentFrom: membership.ownerComputerId }),
      // D-121 (lent mode): the sheet must be the one the OWNER signed (his key is the team's anchor), and the hosting rule is read from what he signed.
      apply: persona?.apply ?? (lent === undefined ? refuseWithoutPersona : (bundle) => { lent.putSheet(bundle.personaId, bundle.sheet) }),
      verifySheet: persona?.verifySheet ?? (lent === undefined ? () => false : bundle => bundle.sheet.signerSigningPublic === ownerPub && verifyBytes(ownerPub, envelopeBytes(bundle.sheet.json), bundle.sheet.signature) && readEnvelope(bundle.sheet.json)?.personaId === bundle.personaId && readEnvelope(bundle.sheet.json)?.workspaceId === workspaceId),
      hostingFacts: persona?.hostingFacts ?? (lent === undefined ? refuseWithoutPersona : (bundle) => {
        const envelope = readEnvelope(bundle.sheet.json)
        if (envelope === undefined) throw new HandoffError('bundle-refused')
        return { creatorMemberId: envelope.creatorMemberId, personasOfCreatorHere: lent.countByCreator(envelope.creatorMemberId, bundle.personaId), autonomy: envelope.autonomy }
      }),
    })
    const label = this.deps.hostLabel
    const service = new ComputersService({
      thisComputerId: thisId, registry: () => registry, ...(registry === undefined ? {} : { claimOwner: () => { registry?.ensureSelf(pub, label) } }), enrollment, isOnline: id => link.isOnline(id), roster,
      sender, transfers, homeOf: (personaId): HomeFacts | undefined => (lent ?? homes)?.resolve(personaId),
      previewOf: persona?.previewOf ?? ((personaId) => {
        const sheet = persona?.sheetJsonOf?.(personaId)
        return sheet === undefined ? undefined : { memoryItems: 0, rules: 0, skills: 0, bytes: Buffer.byteLength(sheet, 'utf8'), openTurn: false, hasPrivateDm: false } // D-121: only her sheet moves
      }), creatorOf: persona?.creatorOf ?? (() => undefined), hostedBy: persona?.hostedBy ?? (() => 0), now: this.now,
    })
    // The executor (decision B): the owner's PC sends the turns of personas that live elsewhere; a member runs the turns of personas that live HERE for the owner's PC, with its own runner and account.
    const send = (to: string, op: unknown): ReturnType<ComputerLink['request']> => link.request(to, EXECUTOR_PATH, op)
    if (membership === undefined) {
      exec.turns = new RemoteTurns({
        selfId: thisId, homeOf: id => homes?.resolve(id), isOnline: id => link.isOnline(id), send: (to, op) => send(to, op), now: this.now,
        // Lumen (b): at START, not only when she was taken there: the FRESH roster still holds that computer's certificate and it still hosts for her creator (and her autonomy, and the creator's quota).
        // She already lives there, so she counts once in what the home hosts: the quota is asked for the others. No persona ports (no creator to ask about) = no remote turn.
        mayHost: (computerId, personaId) => {
          if (!roster.fresh()) return false
          const cert = roster.certOf(computerId)
          const creator = persona?.creatorOf(personaId)
          if (cert === undefined || creator === undefined) return false
          const grant = persona?.hostGrantOf?.(personaId, computerId)
          if (grant?.granted !== true || grant.by === '') return false // no concession of the creator for THAT computer = no remote turn (fails closed)
          return mayHost(cert, creator.memberId, Math.max(0, (persona?.hostedBy(computerId, creator.memberId) ?? 0) - 1), creator.autonomy) === 'ok'
        },
      })
    } else {
      exec.executor = new TurnExecutor({
        ownerComputerId: () => membership.ownerComputerId, runner: () => this.deps.runner?.(), now: this.now, send: (to, op) => send(to, op), ...(this.deps.admit === undefined ? {} : { admit: this.deps.admit }),
        homeCheck: (personaId, epoch) => {
          const here = (lent ?? homes)?.resolve(personaId)
          if (here === undefined || here.computerId !== thisId || here.state !== 'active') return 'not-here'
          return here.epoch >= epoch ? 'ok' : 'epoch'
        },
        scratchDir: (personaId) => {
          const dir = join(this.dir, 'executor', createHash('sha256').update(personaId).digest('hex').slice(0, 24))
          mkdirSync(dir, { recursive: true })
          return dir
        },
      })
    }
    this.live?.link.stop()
    const live: ComputersLive = { member: membership !== undefined, identity, pub, thisId, roster, link, auth: new ComputerAuth(roster, this.now), registry, sender, service, turns: exec.turns, executor: exec.executor }
    this.live = live
    try {
      this.deps.onReady?.({ computerId: thisId })
    } catch (error) {
      void error // the host's own hook must not break the computers
    }
    sender.tick() // a handoff that was open when the app closed goes on (or is reopened if its wait is over)
    if (this.deps.timers === true) {
      link.start()
      this.timer ??= setInterval(() => { this.live?.sender.tick(); this.live?.registry?.tick() }, HOST_TICK_MS)
      this.timer.unref()
    }
    return live
  }
}
