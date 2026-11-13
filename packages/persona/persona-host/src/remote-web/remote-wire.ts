/**
 * MARCO M5: the wire shapes of the Remotes that manage remote access (the PC's "Configurações › Celular"): plain objects with flat optional fields (no unions, no template literals), so Typert can generate
 * the client for them. The Remotes themselves are thin: they check WHO asks (the owner, at the PC — or, for listing and revoking devices, the owner's own paired device) and call {@link RemoteAccess}.
 */

import type { ProjectScopeRequest } from '../types.ts'
import type { DeviceView } from './device-book.ts'
import type { PairRequestView } from './pair-requests.ts'
import type { RemoteAccessView } from './remote-access.ts'

export type { DeviceView, PairRequestView, RemoteAccessView }

/** Turn the remote access on or off. */
export interface RemoteAccessSetRequest extends ProjectScopeRequest {
  readonly on: boolean
}

/** Open a pairing code (for the owner, or for another member of the team). */
export interface IssueDeviceCodeRequest extends ProjectScopeRequest {
  readonly memberId?: string
}

/** One waiting pairing request. */
export interface PairRequestRef extends ProjectScopeRequest {
  readonly requestId: string
}

/** One paired device. */
export interface DeviceRef extends ProjectScopeRequest {
  readonly deviceId: string
}

/** Rename one paired device. */
export interface RenameDeviceRequest extends ProjectScopeRequest {
  readonly deviceId: string
  readonly label: string
}

/** The answer of an action: done, or the stable reason it was not. */
export interface RemoteAccessAnswer {
  readonly ok: boolean
  readonly reason?: string
}

/** The answer of opening a code: the code (shown once), when it stops working and the address to type on the phone — or the reason it was not opened. */
export interface IssueDeviceCodeAnswer {
  readonly ok: boolean
  readonly reason?: string
  readonly code?: string
  readonly expiresAt?: string
  readonly url?: string
}

/**
 * @param result - What {@link RemoteAccess} answered: `ok`, or a stable reason.
 * @returns The wire answer.
 */
export function answerOf(result: string): RemoteAccessAnswer {
  return result === 'ok' ? { ok: true } : { ok: false, reason: result }
}
