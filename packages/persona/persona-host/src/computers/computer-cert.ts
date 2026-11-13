/**
 * D-116 (Bolt): a COMPUTER of the team and how the team knows it. A computer has an identity born ON it (Ed25519 + X25519, the private halves sealed in its own Cofre); the OWNER of the team signs a
 * CERTIFICATE that names it, and a ROSTER (certificates + the revoked) that carries a version that only goes up and a date. Everything that matters is decided from what the owner signed, never from what
 * arrives on the wire:
 *  - the key a bundle is sealed for is read from the certificate (a man in the middle cannot swap it);
 *  - `caps.expose` (what the OPERATOR of the computer exposes: connectors, Cofre, browser; EMPTY by default) and `caps.hostFor` (who may put a persona here, and how many each) are in the certificate (Lumen L1/L2);
 *  - a roster with a LOWER version is refused, so replaying an old one cannot bring a revoked computer back; a computer with no roster from the last 24 hours stops accepting bundles (Lumen L4).
 */

import { createHash } from 'node:crypto'
import { fingerprint, signBytes, verifyBytes, type PublicIdentity } from '@deepseek-ai/dsh-persona-sync'

/** What the certificate lets the computer do. */
export interface ComputerCaps {
  /** What the operator of the computer EXPOSES to personas that live there (connector ids as `computerId:id`, `cofre`, `browser`). Empty = nothing: what is the operator's own never reaches a creator's grant. */
  readonly expose: readonly string[]
  /** Who may put a persona on this computer: member ids (the owner of the team and the people the owner listed). */
  readonly hostFor: readonly string[]
  /** How many personas ONE creator may keep here. */
  readonly perCreatorMax: number
  /** The highest autonomy a persona may have here. */
  readonly maxAutonomy: 'baixa' | 'media' | 'alta'
}

/** The record the owner signs. */
export interface ComputerCert {
  readonly schema: 'computer-cert/v1'
  readonly computerId: string
  readonly label: string
  /** The computer's own keys (public halves). */
  readonly signing: string
  readonly agreement: string
  readonly registeredBy: string
  readonly registeredAt: string
  readonly caps: ComputerCaps
}

/** A certificate with the owner's signature. */
export interface SignedCert {
  readonly cert: ComputerCert
  readonly signature: string
}

/** The roster the owner signs: who is a computer of the team, and who is not any more. */
export interface Roster {
  readonly schema: 'roster/v1'
  readonly workspaceId: string
  /** Only goes up. */
  readonly version: number
  readonly issuedAt: string
  readonly certs: readonly SignedCert[]
  /** Computer ids that were revoked (a revoked id never comes back: a new computer is a new identity). */
  readonly revoked: readonly string[]
}

/** The roster with the owner's signature. */
export interface SignedRoster {
  readonly roster: Roster
  readonly signature: string
}

/** A roster is fresh for this long; after it a computer stops accepting bundles (safe failure). */
export const ROSTER_FRESH_MS = 24 * 3_600_000

/**
 * The id of a computer: derived from its PUBLIC signing key, so it cannot be claimed by another key.
 * @param identity - The computer's public identity.
 * @returns 16 hex characters.
 */
export function computerIdOf(identity: PublicIdentity): string {
  return createHash('sha256').update(`persona/computer/v1\n${identity.signing}`).digest('hex').slice(0, 16)
}

/**
 * What the owner compares out loud before approving a computer ("o seu código de segurança é …"): 20 hex digits (80 bits) of BOTH keys.
 * @param identity - The computer's public identity.
 * @returns Five groups of four hex digits.
 */
export function computerFingerprint(identity: PublicIdentity): string {
  return fingerprint(identity)
}

const ID = /^[A-Za-z0-9._:@-]{1,200}$/u
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: unknown, max: number): readonly string[] | undefined => (Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.length <= 200) ? value as string[] : undefined)

function certText(cert: ComputerCert): string {
  return `persona/computer-cert/v1\n${JSON.stringify(cert)}`
}

function rosterText(roster: Roster): string {
  return `persona/roster/v1\n${JSON.stringify(roster)}`
}

/**
 * Read a certificate from untrusted text, rebuilt from the allowed fields only.
 * @param value - Parsed JSON.
 * @returns The certificate, or `undefined` when it is not one (an unknown field, a wrong type, an id that is not the id of its key).
 */
export function readCert(value: unknown): ComputerCert | undefined {
  if (!isObject(value)) return undefined
  const keys = Object.keys(value)
  if (keys.some(key => !['schema', 'computerId', 'label', 'signing', 'agreement', 'registeredBy', 'registeredAt', 'caps'].includes(key))) return undefined
  const caps = value.caps
  if (!isObject(caps) || Object.keys(caps).some(key => !['expose', 'hostFor', 'perCreatorMax', 'maxAutonomy'].includes(key))) return undefined
  const expose = strings(caps.expose, 200)
  const hostFor = strings(caps.hostFor, 200)
  if (expose === undefined || hostFor === undefined) return undefined
  if (typeof caps.perCreatorMax !== 'number' || !Number.isSafeInteger(caps.perCreatorMax) || caps.perCreatorMax < 0 || caps.perCreatorMax > 1000) return undefined
  if (caps.maxAutonomy !== 'baixa' && caps.maxAutonomy !== 'media' && caps.maxAutonomy !== 'alta') return undefined
  if (value.schema !== 'computer-cert/v1' || typeof value.computerId !== 'string' || !ID.test(value.computerId) || typeof value.label !== 'string' || value.label.length === 0 || value.label.length > 80) return undefined
  if (typeof value.signing !== 'string' || typeof value.agreement !== 'string' || typeof value.registeredBy !== 'string' || !ID.test(value.registeredBy) || typeof value.registeredAt !== 'string') return undefined
  const cert: ComputerCert = {
    schema: 'computer-cert/v1', computerId: value.computerId, label: value.label, signing: value.signing, agreement: value.agreement, registeredBy: value.registeredBy, registeredAt: value.registeredAt,
    caps: { expose, hostFor, perCreatorMax: caps.perCreatorMax, maxAutonomy: caps.maxAutonomy },
  }
  return cert.computerId === computerIdOf({ signing: cert.signing, agreement: cert.agreement }) ? cert : undefined // the id IS the key's id
}

/**
 * The owner signs a certificate.
 * @param cert - The computer, as the owner saw it on the approval screen.
 * @param ownerSigningSeed - The owner's Ed25519 seed.
 * @returns The signed certificate.
 */
export function signCert(cert: ComputerCert, ownerSigningSeed: string): SignedCert {
  return { cert, signature: signBytes(ownerSigningSeed, Buffer.from(certText(cert), 'utf8')) }
}

/**
 * Check a certificate against the owner of the team.
 * @param signed - As it arrived.
 * @param ownerSigningPublic - The owner's public signing key (the trust anchor this computer was given at registration).
 * @returns The certificate when it is well formed, names its own key and carries the owner's signature; `undefined` otherwise.
 */
export function verifyCert(signed: unknown, ownerSigningPublic: string): ComputerCert | undefined {
  if (!isObject(signed) || typeof signed.signature !== 'string') return undefined
  const cert = readCert(signed.cert)
  if (cert === undefined) return undefined
  return verifyBytes(ownerSigningPublic, Buffer.from(certText(cert), 'utf8'), signed.signature) ? cert : undefined
}

/**
 * The owner signs a roster.
 * @param roster - The certificates and the revoked, with the next version.
 * @param ownerSigningSeed - The owner's Ed25519 seed.
 * @returns The signed roster.
 */
export function signRoster(roster: Roster, ownerSigningSeed: string): SignedRoster {
  return { roster, signature: signBytes(ownerSigningSeed, Buffer.from(rosterText(roster), 'utf8')) }
}

/** What a roster that was not accepted says. */
export type RosterRefusal = 'schema' | 'bad-signature' | 'rollback' | 'wrong-workspace' | 'bad-cert'

/** Where the highest roster version seen is kept (a file in the machine's data folder; memory in tests). */
export interface RosterStore {
  read(): { readonly version: number; readonly roster: SignedRoster } | undefined
  write(state: { readonly version: number; readonly roster: SignedRoster }): void
}

/** @returns A store in memory (tests). */
export function memoryRosterStore(): RosterStore {
  let held: { version: number; roster: SignedRoster } | undefined
  return { read: () => held, write: (state) => { held = { ...state } } }
}

/** What one computer knows of the team's computers, from what the owner signed. */
export class RosterGuard {
  private held: { version: number; roster: SignedRoster } | undefined

  /**
   * @param workspaceId - The team.
   * @param ownerSigningPublic - The owner's public signing key (the trust anchor).
   * @param store - Where the highest roster is kept.
   * @param now - Clock (tests replace it).
   */
  constructor(private readonly workspaceId: string, private readonly ownerSigningPublic: string, private readonly store: RosterStore = memoryRosterStore(), private readonly now: () => number = Date.now) {
    this.held = store.read()
  }

  /**
   * Take a roster. A LOWER version is refused (replaying an old roster cannot bring a revoked computer back); the SAME version is accepted only if it says the same thing.
   * @param signed - As it arrived.
   * @returns `ok`, or why not.
   */
  accept(signed: unknown): 'ok' | RosterRefusal {
    if (!isObject(signed) || typeof signed.signature !== 'string' || !isObject(signed.roster)) return 'schema'
    const roster = signed.roster
    if (Object.keys(roster).some(key => !['schema', 'workspaceId', 'version', 'issuedAt', 'certs', 'revoked'].includes(key))) return 'schema'
    if (roster.schema !== 'roster/v1' || typeof roster.workspaceId !== 'string' || typeof roster.version !== 'number' || !Number.isSafeInteger(roster.version) || roster.version < 1 || typeof roster.issuedAt !== 'string'
      || !Array.isArray(roster.certs) || roster.certs.length > 200 || strings(roster.revoked, 1000) === undefined) return 'schema'
    if (roster.workspaceId !== this.workspaceId) return 'wrong-workspace'
    const certs: SignedCert[] = []
    for (const item of roster.certs as unknown[]) {
      const cert = verifyCert(item, this.ownerSigningPublic)
      if (cert === undefined) return 'bad-cert'
      certs.push({ cert, signature: (item as { signature: string }).signature })
    }
    const clean: Roster = { schema: 'roster/v1', workspaceId: roster.workspaceId, version: roster.version, issuedAt: roster.issuedAt, certs, revoked: roster.revoked as string[] }
    if (!verifyBytes(this.ownerSigningPublic, Buffer.from(rosterText(clean), 'utf8'), signed.signature)) return 'bad-signature'
    const highest = this.held?.version ?? 0
    if (clean.version < highest) return 'rollback'
    if (clean.version === highest && this.held !== undefined && rosterText(this.held.roster.roster) !== rosterText(clean)) return 'rollback' // the same version saying something else
    this.held = { version: clean.version, roster: { roster: clean, signature: signed.signature } }
    this.store.write(this.held)
    return 'ok'
  }

  /** @returns The version of the highest roster seen (0 = none). */
  version(): number {
    return this.held?.version ?? 0
  }

  /** @returns `true` when a roster issued in the last 24 hours is held. Without it this computer stops accepting bundles (safe failure). */
  fresh(): boolean {
    const issued = this.held === undefined ? Number.NaN : Date.parse(this.held.roster.roster.issuedAt)
    return Number.isFinite(issued) && this.now() - issued < ROSTER_FRESH_MS && issued <= this.now() + 5 * 60_000
  }

  /** @returns The certificates of the roster held that are not revoked, for a SCREEN: never for trust (that is `certOf`, which also needs a fresh roster). */
  certs(): readonly ComputerCert[] {
    return this.held === undefined ? [] : this.held.roster.roster.certs.map(item => item.cert).filter(cert => !this.isRevoked(cert.computerId))
  }

  /** @returns Whether the computer was revoked (a revoked id stays revoked in every later roster). */
  isRevoked(computerId: string): boolean {
    return this.held?.roster.roster.revoked.includes(computerId) === true
  }

  /**
   * The certificate of a computer of the team: it is in the roster, not revoked, and the roster is fresh.
   * @param computerId - The computer.
   * @returns Its certificate, or `undefined`.
   */
  certOf(computerId: string): ComputerCert | undefined {
    if (this.held === undefined || !this.fresh() || this.isRevoked(computerId)) return undefined
    return this.held.roster.roster.certs.find(item => item.cert.computerId === computerId)?.cert
  }
}

/** Why a persona may not be put on a computer. */
export type HostRefusal = 'host-not-allowed' | 'creator-quota' | 'autonomy-too-high'

const AUTONOMY: Readonly<Record<ComputerCaps['maxAutonomy'], number>> = { baixa: 0, media: 1, alta: 2 }

/**
 * Lumen L2: the computer, not the screen, decides who may put a persona on it. Called by the computer that would RECEIVE the persona.
 * @param cert - The certificate of THIS computer.
 * @param creatorMemberId - Who is putting the persona here.
 * @param personasOfCreatorHere - How many personas of that creator already live here.
 * @param autonomy - The autonomy the persona asks for.
 * @returns `ok`, or why not.
 */
export function mayHost(cert: ComputerCert, creatorMemberId: string, personasOfCreatorHere: number, autonomy: ComputerCaps['maxAutonomy']): 'ok' | HostRefusal {
  if (!cert.caps.hostFor.includes(creatorMemberId)) return 'host-not-allowed'
  if (personasOfCreatorHere >= cert.caps.perCreatorMax) return 'creator-quota'
  return AUTONOMY[autonomy] > AUTONOMY[cert.caps.maxAutonomy] ? 'autonomy-too-high' : 'ok'
}

/**
 * Lumen L1: the creator's grant is on TOP of what the operator exposes — the intersection, never the creator's list alone. A connector is identified by computer + id.
 * @param cert - The certificate of the computer where the persona runs.
 * @param granted - What the creator granted (ids as `computerId:id`, `cofre`, `browser`).
 * @returns What the persona may actually use there.
 */
export function effectiveExpose(cert: ComputerCert, granted: readonly string[]): readonly string[] {
  return granted.filter(item => cert.caps.expose.includes(item))
}

/** @returns A new certificate for a computer that asked to join, with NOTHING exposed and nobody but the owner as host (the owner widens it on purpose). */
export function certFor(input: { readonly identity: PublicIdentity; readonly label: string; readonly registeredBy: string; readonly registeredAt: string }): ComputerCert {
  const pub = input.identity
  return {
    schema: 'computer-cert/v1', computerId: computerIdOf(pub), label: input.label, signing: pub.signing, agreement: pub.agreement, registeredBy: input.registeredBy, registeredAt: input.registeredAt,
    caps: { expose: [], hostFor: [input.registeredBy], perCreatorMax: 3, maxAutonomy: 'baixa' },
  }
}
