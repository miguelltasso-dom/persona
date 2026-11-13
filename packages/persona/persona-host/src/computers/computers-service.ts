/**
 * D-116 (Bolt): what the screens ask about the team's computers and about taking a persona to another one — everything the Remotes of B0 do, as plain methods over ports, so the Remote methods of the host are
 * one line each and every rule here is proved without the host. Each answer is a value, never a throw: a refusal is `{ ok: false, reason }` with a stable code the screens have a sentence for (Muse M0).
 *
 * Who may do what is the Remote's job (`requireMachineOwner`: the PC of the owner, never a paired phone). What THIS layer refuses on its own: a computer that is not the owner's cannot issue codes, confirm or revoke;
 * a persona is taken only from the computer that is her home, only to a computer of the team that is on and may host her (the destination's own certificate decides, Lumen L2), and only with `confirm: true`.
 */

import { computerFingerprint, mayHost, type ComputerCaps, type RosterGuard } from './computer-cert.ts'
import type { ComputerEnrollment, EnrollState } from './computer-enroll.ts'
import type { ComputerRegistry } from './computer-registry.ts'
import { HandoffError, type HandoffRefusal, type HandoffSender, type TransferRecord, type TransferStore } from './handoff.ts'

/** What travels, as the preview shows it (counts, never content). */
export interface PersonaPreview {
  readonly memoryItems: number
  readonly rules: number
  readonly skills: number
  readonly bytes: number
  /** A turn is open: it is cancelled when she is taken (the cards go back to the queue). */
  readonly openTurn: boolean
  /** She holds private DM memory: it stays unless the creator confirms. */
  readonly hasPrivateDm: boolean
}

/** What the host knows about a persona's home (the `PersonaHomeBook`). */
export interface HomeFacts {
  readonly computerId: string
  readonly epoch: number
  readonly state: 'active' | 'moving'
  readonly movingTo?: string
}

/** What the service needs. */
export interface ComputersDeps {
  readonly thisComputerId: string
  /** The book of computers while this PC is not a member of another team (`undefined` once it joined one). It is the OWNER's only when it holds a computer: a fresh PC is neither until it issues a code or joins. */
  readonly registry: () => ComputerRegistry | undefined
  /** The first code of a fresh PC makes it the owner's: its own certificate is signed then (not before). */
  readonly claimOwner?: () => void
  readonly enrollment: ComputerEnrollment
  readonly isOnline: (computerId: string) => boolean
  /** What THIS computer knows of the team: the list of computers on the screen and the certificate that decides a move. */
  readonly roster: Pick<RosterGuard, 'certOf' | 'certs' | 'fresh'>
  readonly sender: Pick<HandoffSender, 'start' | 'reactivateHere'>
  readonly transfers: Pick<TransferStore, 'get' | 'open'>
  readonly homeOf: (personaId: string) => HomeFacts | undefined
  readonly previewOf: (personaId: string) => PersonaPreview | undefined
  /** Who created the persona and the autonomy she asks for (the destination's certificate is checked against both). */
  readonly creatorOf: (personaId: string) => { readonly memberId: string; readonly autonomy: ComputerCaps['maxAutonomy'] } | undefined
  /** How many personas of this creator already live on that computer. */
  readonly hostedBy: (computerId: string, creatorMemberId: string) => number
  readonly now?: () => number
}

/** The refusals of this layer, on top of the handoff's own codes. */
export type ComputersRefusal = HandoffRefusal | 'identity-unavailable' | 'no-workspace' | 'not-owner-pc' | 'owner-pc-cannot-join' | 'unknown-request' | 'unknown-computer' | 'cheio' | 'is-this-computer' | 'unknown-persona' | 'destination-offline' | 'unknown-transfer'
/** A refusal. */
export interface Refused { readonly ok: false; readonly reason: ComputersRefusal }

/** One computer, as the list shows it. */
export interface ComputerRow {
  readonly computerId: string
  readonly label: string
  readonly fingerprint: string
  readonly isThis: boolean
  readonly online: boolean
  readonly registeredAt: string
  /** Who may put a persona there (member ids). */
  readonly hostFor: readonly string[]
  readonly perCreatorMax: number
  readonly maxAutonomy: ComputerCaps['maxAutonomy']
  /** How many things its operator exposes to personas that live there (connectors, Cofre, browser). */
  readonly exposeCount: number
}

/** A computer asking to join, as the owner's screen shows it. */
export interface ComputerRequestRow {
  readonly requestId: string
  readonly label: string
  readonly address: string
  readonly node?: string
  readonly login?: string
  readonly fingerprint: string
  readonly ramMb?: number
  readonly known: boolean
  readonly expiresAt: string
}

/** Everything the "Computadores da equipe" screen needs in one read. */
export interface ComputersView {
  readonly thisComputerId: string
  /** This is the owner's PC: the only one that issues codes, confirms and revokes. */
  readonly isOwnerPc: boolean
  readonly computers: readonly ComputerRow[]
  readonly requests: readonly ComputerRequestRow[]
  /** This computer's own joining (only a computer that is not the owner's joins). */
  readonly enrollment: EnrollState
}

/** Where a persona lives. */
export interface PersonaHomeRow {
  readonly personaId: string
  readonly computerId: string
  readonly computerLabel: string
  readonly isThis: boolean
  readonly online: boolean
  readonly epoch: number
  readonly state: 'active' | 'moving'
  readonly movingTo?: string
}

/** What taking her would do, and what stands in the way. */
export interface MovePreview {
  readonly ok: true
  readonly personaId: string
  readonly toComputerId: string
  readonly toLabel: string
  readonly preview: PersonaPreview
  /** Things the screen must SAY (never block): the login of AI does not travel, the open turn is cancelled, private DM memory stays. */
  readonly notes: readonly ('ai-login-stays' | 'open-turn-cancelled' | 'private-dm-stays')[]
}

/** How far a transfer is. */
export interface TransferRow {
  readonly transferId: string
  readonly personaId: string
  readonly toComputerId: string
  readonly toLabel: string
  readonly epoch: number
  readonly phase: TransferRecord['phase']
  /** B did not answer inside its window: the screen says so and offers "Ativar de novo aqui" with the partition warning (Lumen L6.1). */
  readonly destinationSilent: boolean
  readonly activateBefore?: number
}

const refuse = (reason: ComputersRefusal): Refused => ({ ok: false, reason })

/** The service the Remotes of D-116 call. */
export class ComputersService {
  private readonly now: () => number
  private readonly byId = new Map<string, string>()

  /** @param deps - See {@link ComputersDeps}. */
  constructor(private readonly deps: ComputersDeps) {
    this.now = deps.now ?? Date.now
  }

  /** @returns The whole screen: the computers the roster names (with who is on), the requests waiting for the owner and this computer's own joining. */
  view(): ComputersView {
    const registry = this.deps.registry()
    const computers = this.deps.roster.certs().map((cert): ComputerRow => ({
      computerId: cert.computerId, label: cert.label, fingerprint: computerFingerprint({ signing: cert.signing, agreement: cert.agreement }), isThis: cert.computerId === this.deps.thisComputerId,
      online: this.deps.isOnline(cert.computerId), registeredAt: cert.registeredAt, hostFor: cert.caps.hostFor, perCreatorMax: cert.caps.perCreatorMax, maxAutonomy: cert.caps.maxAutonomy, exposeCount: cert.caps.expose.length,
    })).sort((a, b) => Number(b.isThis) - Number(a.isThis))
    const requests = (registry?.requests() ?? []).map((item): ComputerRequestRow => ({
      requestId: item.requestId, label: item.label, address: item.address, ...(item.node === undefined ? {} : { node: item.node }), ...(item.login === undefined ? {} : { login: item.login }),
      fingerprint: item.fingerprint, ...(item.ramMb === undefined ? {} : { ramMb: item.ramMb }), known: item.known, expiresAt: item.expiresAt,
    }))
    return { thisComputerId: this.deps.thisComputerId, isOwnerPc: this.isOwnerPc(), computers, requests, enrollment: this.deps.enrollment.status() }
  }

  /** @returns Whether this PC holds the team's book of computers (it has at least itself in it). */
  private isOwnerPc(): boolean {
    const registry = this.deps.registry()
    return registry !== undefined && registry.computers().length > 0
  }

  /** @returns A new code for the next computer (the owner's PC; a fresh PC becomes it with its first code). */
  issueCode(): { readonly ok: true; readonly code: string; readonly expiresAt: string } | Refused {
    const registry = this.deps.registry()
    if (registry === undefined) return refuse('not-owner-pc')
    this.deps.claimOwner?.()
    return { ok: true, ...registry.issueCode() }
  }

  /**
   * Type the code on THIS (new) computer.
   * @param input - The address of the owner's PC, the code and the name.
   * @returns Where joining is right after the owner's PC took the code.
   */
  async enroll(input: { readonly ownerAddress: string; readonly code: string; readonly label: string; readonly ramMb?: number }): Promise<{ readonly ok: true; readonly enrollment: EnrollState } | Refused> {
    if (this.isOwnerPc()) return refuse('owner-pc-cannot-join') // the owner's PC IS the team's first computer
    return { ok: true, enrollment: await this.deps.enrollment.start(input) }
  }

  /**
   * @param requestId - The request on the owner's screen.
   * @returns `ok`, or why not.
   */
  confirm(requestId: string): { readonly ok: true } | Refused {
    const registry = this.deps.registry()
    if (registry === undefined) return refuse('not-owner-pc')
    const done = registry.confirm(requestId)
    return done === 'ok' ? { ok: true } : refuse(done === 'cheio' ? 'cheio' : 'unknown-request')
  }

  /**
   * @param requestId - The request on the owner's screen.
   * @returns `ok`, or why not.
   */
  reject(requestId: string): { readonly ok: true } | Refused {
    const registry = this.deps.registry()
    if (registry === undefined) return refuse('not-owner-pc')
    return registry.reject(requestId) ? { ok: true } : refuse('unknown-request')
  }

  /**
   * @param computerId - The computer to remove.
   * @returns `ok`, or why not.
   */
  revoke(computerId: string): { readonly ok: true } | Refused {
    const registry = this.deps.registry()
    if (registry === undefined) return refuse('not-owner-pc')
    const done = registry.revoke(computerId)
    return done === 'ok' ? { ok: true } : refuse(done === 'is-this-computer' ? 'is-this-computer' : 'unknown-computer')
  }

  /**
   * @param personaId - The persona.
   * @returns Where she lives and whether that computer is on.
   */
  home(personaId: string): { readonly ok: true; readonly home: PersonaHomeRow } | Refused {
    const home = this.deps.homeOf(personaId)
    if (home === undefined || this.deps.creatorOf(personaId) === undefined) return refuse('unknown-persona') // the book answers for any id ("no doc = this computer"): only a persona that exists has a home
    return {
      ok: true,
      home: {
        personaId, computerId: home.computerId, computerLabel: this.labelOf(home.computerId), isThis: home.computerId === this.deps.thisComputerId, online: this.deps.isOnline(home.computerId), epoch: home.epoch, state: home.state,
        ...(home.movingTo === undefined ? {} : { movingTo: home.movingTo }),
      },
    }
  }

  /**
   * What taking her would do, and whether anything stands in the way. Nothing moves.
   * @param personaId - The persona.
   * @param toComputerId - The destination.
   * @returns The preview, or why not.
   */
  preview(personaId: string, toComputerId: string): MovePreview | Refused {
    const home = this.deps.homeOf(personaId)
    const facts = this.deps.previewOf(personaId)
    const creator = this.deps.creatorOf(personaId)
    if (home === undefined || facts === undefined || creator === undefined) return refuse('unknown-persona')
    if (home.computerId !== this.deps.thisComputerId || home.state !== 'active') return refuse('not-home')
    if (toComputerId === this.deps.thisComputerId) return refuse('is-this-computer')
    if (!this.deps.roster.fresh()) return refuse('stale-roster')
    const cert = this.deps.roster.certOf(toComputerId)
    if (cert === undefined) return refuse('unknown-computer')
    if (!this.deps.isOnline(toComputerId)) return refuse('destination-offline')
    const may = mayHost(cert, creator.memberId, this.deps.hostedBy(toComputerId, creator.memberId), creator.autonomy)
    if (may !== 'ok') return refuse(may)
    const notes: ('ai-login-stays' | 'open-turn-cancelled' | 'private-dm-stays')[] = ['ai-login-stays']
    if (facts.openTurn) notes.push('open-turn-cancelled')
    if (facts.hasPrivateDm) notes.push('private-dm-stays')
    return { ok: true, personaId, toComputerId, toLabel: cert.label, preview: facts, notes }
  }

  /**
   * Take her. Without `confirm: true` nothing moves.
   * @param input - The persona, the destination, the confirmation, and whether the creator confirmed that private DM memory may travel.
   * @returns The transfer id, or why not.
   */
  move(input: { readonly personaId: string; readonly toComputerId: string; readonly confirm: boolean; readonly includePrivateDm?: boolean }): { readonly ok: true; readonly transferId: string } | Refused {
    if (!input.confirm) return refuse('confirm-required')
    const checked = this.preview(input.personaId, input.toComputerId)
    if (!checked.ok) return checked
    try {
      const { transferId } = this.deps.sender.start({ personaId: input.personaId, toComputerId: input.toComputerId, includesPrivateDm: input.includePrivateDm === true })
      this.byId.set(transferId, input.personaId)
      return { ok: true, transferId }
    } catch (error) {
      if (error instanceof HandoffError) return refuse(error.code)
      throw error
    }
  }

  /**
   * @param transferId - What `move` returned.
   * @returns How far it is, or `unknown-transfer`.
   */
  transfer(transferId: string): { readonly ok: true; readonly transfer: TransferRow } | Refused {
    const open = this.deps.transfers.open().find(item => item.transferId === transferId)
    const personaId = open?.personaId ?? this.byId.get(transferId)
    const record = open ?? (personaId === undefined ? undefined : this.deps.transfers.get(personaId))
    if (record === undefined || record.transferId !== transferId) return refuse('unknown-transfer')
    const silent = record.phase === 'released' && record.activateBefore !== undefined && this.now() >= record.activateBefore
    return {
      ok: true,
      transfer: {
        transferId, personaId: record.personaId, toComputerId: record.to, toLabel: this.labelOf(record.to), epoch: record.epoch, phase: record.phase, destinationSilent: silent,
        ...(record.activateBefore === undefined ? {} : { activateBefore: record.activateBefore }),
      },
    }
  }

  /**
   * "Ativar de novo aqui": the destination never activated and its window is over. Needs the owner to have read the partition warning.
   * @param personaId - The persona.
   * @param confirm - The owner confirmed the warning.
   * @returns `ok`, or why not.
   */
  reactivate(personaId: string, confirm: boolean): { readonly ok: true } | Refused {
    try {
      this.deps.sender.reactivateHere(personaId, confirm)
      return { ok: true }
    } catch (error) {
      if (error instanceof HandoffError) return refuse(error.code)
      throw error
    }
  }

  private labelOf(computerId: string): string {
    return this.deps.roster.certOf(computerId)?.label ?? (computerId === this.deps.thisComputerId ? 'Este computador' : 'Computador')
  }
}
