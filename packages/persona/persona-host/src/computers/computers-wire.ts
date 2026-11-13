/**
 * D-116 (Bolt): the wire shapes of the Remotes of "Computadores da equipe" and "Levar para outro computador": plain objects with flat optional fields (no discriminated unions, no template literals), so Typert can
 * generate the client for them. The Remotes themselves are thin: they check WHO asks and call {@link ComputersService}; these converters turn its `{ ok: true, … } | { ok: false, reason }` into the flat answer.
 */

import type { ProjectScopeRequest } from '../types.ts'
import type { EnrollState } from './computer-enroll.ts'
import type { ComputerPresenceView } from '../station/computer-presence.ts'
import type { ComputerRequestRow, ComputerRow, ComputersView, MovePreview, PersonaHomeRow, PersonaPreview, Refused, TransferRow } from './computers-service.ts'

export type { ComputerRequestRow, ComputerRow, PersonaHomeRow, PersonaPreview, TransferRow }

/** The code of the next computer, from the PC that has the team. */
export interface IssueComputerCodeRequest extends ProjectScopeRequest {
  readonly label?: string
}

/** Typed on the NEW computer: where the owner's PC is, the code its screen showed and the name this computer gives itself. */
export interface EnrollComputerRequest extends ProjectScopeRequest {
  /** `ip:port` of the owner's PC. */
  readonly ownerAddress: string
  readonly code: string
  readonly label: string
  readonly ramMb?: number
}

/** One computer asking to join. */
export interface ComputerRequestRef extends ProjectScopeRequest {
  readonly requestId: string
}

/** One computer of the team. */
export interface ComputerRef extends ProjectScopeRequest {
  readonly computerId: string
}

/** One persona. */
export interface PersonaHomeRequest extends ProjectScopeRequest {
  readonly personaId: string
}

/** A persona and the computer she might go to. */
export interface MovePreviewRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly toComputerId: string
}

/** Take her. Without `confirm: true` nothing moves. */
export interface MovePersonaRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly toComputerId: string
  readonly confirm: boolean
  /** The creator confirmed that her private DM memory may travel ("quem cuida do PC novo pode ler"). */
  readonly includePrivateDm?: boolean
}

/** One transfer. */
export interface TransferRef extends ProjectScopeRequest {
  readonly transferId: string
}

/** "Ativar de novo aqui": the owner read the partition warning. */
export interface ReactivateRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly confirm: boolean
}

/** The answer of an action: done, or the stable reason it was not. */
export interface ComputersAnswer {
  readonly ok: boolean
  readonly reason?: string
}

/** A code for the next computer. */
export interface IssueComputerCodeAnswer extends ComputersAnswer {
  readonly code?: string
  readonly expiresAt?: string
}

/** Where this computer's own joining is, flat. */
export interface EnrollmentWire {
  readonly state: string
  readonly ownerAddress?: string
  /** The fingerprint of this computer's two keys: what the owner compares out loud. */
  readonly fingerprint?: string
  readonly computerId?: string
  readonly label?: string
  /** Why joining failed (`state: 'falhou'`). */
  readonly reason?: string
  readonly retryAfterS?: number
}

/** The answer of typing a code. */
export interface EnrollComputerAnswer extends ComputersAnswer {
  readonly enrollment?: EnrollmentWire
}

/** M4/D-116: RAM headroom carried inside {@link ComputerPresenceRow} when visible to the caller. */
export interface ComputerPresenceRamRow {
  readonly totalBytes: number
  readonly freeBytes: number
  readonly floorBytes: number
  readonly perCliBytes: number
}

/** M4/D-116: Live presence of one computer in the team (`ComputerPresence` projected for the screen). */
export interface ComputerPresenceRow {
  readonly computerId: string
  readonly label: string
  readonly registeredBy: string
  readonly isThis: boolean
  readonly kind?: 'personal' | 'team'
  readonly state: 'ligado' | 'pausado' | 'desligado'
  readonly personas: number
  readonly lastSeenAt?: number
  readonly aiAccountLabel?: string
  readonly ram?: ComputerPresenceRamRow
  readonly capacity?: number
}

/** The whole screen. */
export interface ComputersViewWire {
  readonly thisComputerId: string
  readonly isOwnerPc: boolean
  readonly computers: readonly ComputerRow[]
  readonly requests: readonly ComputerRequestRow[]
  readonly enrollment: EnrollmentWire
  /** Why the computers are not available on this PC right now (`identity-unavailable`: no Cofre; `no-workspace`: onboarding not done). Absent = available. */
  readonly unavailable?: string
  /** M4/D-116: live presence per computer (`ligado`/`pausado`/`desligado`, capacity, non-PII AI account label; RAM masked on another member's personal PC). */
  readonly presence?: readonly ComputerPresenceRow[]
}

/** Where a persona lives. */
export interface PersonaHomeAnswer extends ComputersAnswer {
  readonly home?: PersonaHomeRow
}

/** What taking her would do. */
export interface MovePreviewAnswer extends ComputersAnswer {
  readonly toLabel?: string
  readonly preview?: PersonaPreview
  /** What the screen must SAY: `ai-login-stays`, `open-turn-cancelled`, `private-dm-stays`. */
  readonly notes?: readonly string[]
}

/** Taking her started. */
export interface MovePersonaAnswer extends ComputersAnswer {
  readonly transferId?: string
}

/** How far a transfer is. */
export interface TransferAnswer extends ComputersAnswer {
  readonly transfer?: TransferRow
}

/**
 * @param state - This computer's joining.
 * @returns The flat wire shape.
 */
export function enrollmentWire(state: EnrollState): EnrollmentWire {
  switch (state.state) {
    case 'esperando-o-dono': return { state: state.state, ownerAddress: state.ownerAddress, fingerprint: state.fingerprint }
    case 'cadastrado': return { state: state.state, computerId: state.computerId, label: state.label, ownerAddress: state.ownerAddress }
    case 'falhou': return { state: state.state, reason: state.reason, ...(state.retryAfterS === undefined ? {} : { retryAfterS: state.retryAfterS }) }
    default: return { state: state.state }
  }
}

/**
 * @param view - What the service reads.
 * @param presence - Optional projected live presence rows (`ComputerPresence`).
 * @returns The whole screen, flat.
 */
export function viewWire(view: ComputersView, presence?: readonly ComputerPresenceRow[]): ComputersViewWire {
  return { ...view, enrollment: enrollmentWire(view.enrollment), ...(presence === undefined ? {} : { presence }) }
}

/**
 * @param result - `ok`, or why not.
 * @returns The flat answer.
 */
export function answerOfComputers(result: { readonly ok: true } | Refused): ComputersAnswer {
  return result.ok ? { ok: true } : { ok: false, reason: result.reason }
}

/**
 * @param result - The code, or why not.
 * @returns The flat answer.
 */
export function codeAnswer(result: { readonly ok: true; readonly code: string; readonly expiresAt: string } | Refused): IssueComputerCodeAnswer {
  return result.ok ? { ok: true, code: result.code, expiresAt: result.expiresAt } : { ok: false, reason: result.reason }
}

/**
 * Project one presence row for a specific caller: team computers expose RAM and headroom to all members;
 * personal computers keep RAM and capacity visible only to who registered them or the workspace owner.
 * @param row - Presence view from {@link ComputerPresence.list}.
 * @param viewer - Computer kind, caller member id, and workspace owner member id.
 * @returns Flat wire row with optional personal-PC RAM redaction.
 */
export function presenceRowWire(
  row: ComputerPresenceView,
  viewer: { readonly kind: 'personal' | 'team'; readonly callerMemberId?: string | undefined; readonly ownerMemberId?: string | undefined },
): ComputerPresenceRow {
  const showRam = viewer.kind === 'team' || (viewer.callerMemberId !== undefined && (viewer.callerMemberId === row.registeredBy || viewer.callerMemberId === viewer.ownerMemberId))
  return {
    computerId: row.computerId,
    label: row.label,
    registeredBy: row.registeredBy,
    isThis: row.isThis,
    kind: viewer.kind,
    state: row.state,
    personas: row.personas,
    ...(row.lastSeenAt === undefined ? {} : { lastSeenAt: row.lastSeenAt }),
    ...(row.aiAccountLabel === undefined ? {} : { aiAccountLabel: row.aiAccountLabel }),
    ...(showRam && row.ram !== undefined ? { ram: row.ram } : {}),
    ...(showRam && row.capacity !== undefined ? { capacity: row.capacity } : {}),
  }
}

/**
 * @param result - Where joining is, or why not.
 * @returns The flat answer.
 */
export function enrollAnswer(result: { readonly ok: true; readonly enrollment: EnrollState } | Refused): EnrollComputerAnswer {
  return result.ok ? { ok: true, enrollment: enrollmentWire(result.enrollment) } : { ok: false, reason: result.reason }
}

/**
 * @param result - Where a persona lives, or why not.
 * @returns The flat answer.
 */
export function homeAnswer(result: { readonly ok: true; readonly home: PersonaHomeRow } | Refused): PersonaHomeAnswer {
  return result.ok ? { ok: true, home: result.home } : { ok: false, reason: result.reason }
}

/**
 * @param result - The preview, or why not.
 * @returns The flat answer.
 */
export function previewAnswer(result: MovePreview | Refused): MovePreviewAnswer {
  return result.ok ? { ok: true, toLabel: result.toLabel, preview: result.preview, notes: result.notes } : { ok: false, reason: result.reason }
}

/**
 * @param result - The transfer id, or why not.
 * @returns The flat answer.
 */
export function moveAnswer(result: { readonly ok: true; readonly transferId: string } | Refused): MovePersonaAnswer {
  return result.ok ? { ok: true, transferId: result.transferId } : { ok: false, reason: result.reason }
}

/**
 * @param result - The transfer, or why not.
 * @returns The flat answer.
 */
export function transferAnswer(result: { readonly ok: true; readonly transfer: TransferRow } | Refused): TransferAnswer {
  return result.ok ? { ok: true, transfer: result.transfer } : { ok: false, reason: result.reason }
}
