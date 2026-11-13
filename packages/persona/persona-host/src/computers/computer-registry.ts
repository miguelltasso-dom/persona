/**
 * D-116 (Bolt): the OWNER's side of registering a computer of the team (B2 of `marco-dogfood-onde-roda.md`). The code is born on the owner's PC and TYPED on the new computer; a right code is NOT a
 * registration: it opens a REQUEST that the owner confirms on the PC, seeing the name the computer gave itself, its RAM, what Tailscale says about the address and the fingerprint of its two keys. Only the
 * confirmation makes a certificate, and only the owner's key signs it. Everything else the team believes about computers is the ROSTER built here: certificates + the revoked, with a version that only goes up
 * (Lumen L4). A revoked id never comes back: a computer that returns is a new identity.
 *
 * Nothing here opens a socket or reads a clock but the injected one: the transport (`/remote/computer-hello`) and the screens call it. The private keys of the new computer never travel (it makes them
 * ON itself); the owner's seed is held by the caller and used only to sign.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { agreementPublicKey, signingPublicKey, type PublicIdentity } from '@deepseek-ai/dsh-persona-sync'
import type { DevicePairing } from '../remote-web/pair-guard.ts'
import type { TailnetIdentity } from '../remote-web/tailnet-identity.ts'
import { ROSTER_FRESH_MS, certFor, computerFingerprint, computerIdOf, readCert, signCert, signRoster, verifyCert, type ComputerCaps, type ComputerCert, type SignedCert, type SignedRoster } from './computer-cert.ts'

/** How long a request waits for the owner (someone types a code at the new computer, then walks to the PC). */
export const COMPUTER_REQUEST_TTL_MS = 5 * 60_000
/** After the confirmation the new computer has this long to collect its certificate. */
export const COMPUTER_COLLECT_MS = 60_000
/** Requests waiting at once. */
export const MAX_COMPUTER_REQUESTS = 3
/** Computers of one team (the roster refuses more than 200; a household or a small office is far below). */
export const MAX_COMPUTERS = 50
/** A roster is re-signed (a higher version, a new date) after this long, so a computer is never left without a fresh one (it is fresh for 24 h). */
export const ROSTER_REISSUE_MS = ROSTER_FRESH_MS / 4
/** Computer ids the roster remembers as revoked (the guard accepts up to 1000). */
export const MAX_REVOKED = 1_000

/** What the roster is made of, as the owner's PC keeps it. */
export interface RegistryState {
  /** The version of the last roster signed (0 = none yet). */
  readonly version: number
  readonly certs: readonly SignedCert[]
  readonly revoked: readonly string[]
}

/** Where the registry's state lives (a file in the machine's data folder; memory in tests). */
export interface RegistryStore {
  read(): RegistryState | undefined
  write(state: RegistryState): void
}

/** @returns A store in memory (tests). */
export function memoryRegistryStore(): RegistryStore {
  let held: RegistryState | undefined
  return { read: () => (held === undefined ? undefined : structuredClone(held)), write: (state) => { held = structuredClone(state) } }
}

/**
 * A store in one JSON file, written atomically. Every certificate read back must still carry the owner's signature (a hand-edited file loses the lines it changed); a damaged file is "nothing registered".
 * @param path - The file (its folder is created on the first write).
 * @param ownerSigningPublic - The owner's public signing key.
 * @returns The store.
 */
export function fileRegistryStore(path: string, ownerSigningPublic: string): RegistryStore {
  return {
    read() {
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown; certs?: unknown; revoked?: unknown }
        if (typeof parsed.version !== 'number' || !Number.isSafeInteger(parsed.version) || parsed.version < 0 || !Array.isArray(parsed.certs) || !Array.isArray(parsed.revoked)) return undefined
        const certs = parsed.certs.flatMap((item): SignedCert[] => {
          const cert = verifyCert(item, ownerSigningPublic)
          return cert === undefined ? [] : [{ cert, signature: (item as { signature: string }).signature }]
        })
        return { version: parsed.version, certs, revoked: parsed.revoked.filter((item): item is string => typeof item === 'string').slice(0, MAX_REVOKED) }
      } catch (error) {
        void error // missing or damaged: nothing registered
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

/** What the new computer sends with the code. The keys are its PUBLIC halves; the private ones never leave it. */
export interface HelloInput {
  readonly code: string
  readonly label: string
  readonly signing: string
  readonly agreement: string
  readonly ramMb?: number
}

/** The answer to a hello. Wrong and spent codes are one reason, so the route is no oracle of the code's state. */
export type HelloResult =
  | { readonly ok: true; readonly requestId: string; readonly pollToken: string }
  | { readonly ok: false; readonly reason: 'recusado' | 'cheio' | 'invalido' | 'revogado' }
  | { readonly ok: false; readonly reason: 'bloqueado'; readonly retryAfterS: number }

/** What the owner's screen shows for a request waiting. */
export interface ComputerRequestView {
  readonly requestId: string
  readonly label: string
  readonly address: string
  /** What Tailscale says about the address (absent when it does not say). */
  readonly node?: string
  readonly login?: string
  /** The fingerprint of BOTH keys, to compare out loud with what the new computer shows. */
  readonly fingerprint: string
  readonly ramMb?: number
  /** This computer is already in the team (it lost its answer): confirming only hands the same certificate again. */
  readonly known: boolean
  readonly askedAt: string
  readonly expiresAt: string
}

/** What the new computer keeps once it is confirmed: the trust anchor (the owner's key) and what the owner signed about it. */
export interface EnrollGrant {
  readonly workspaceId: string
  readonly ownerSigningPublic: string
  /** The computer id of the owner's PC (the directory of the team: where the others find each other). */
  readonly ownerComputerId: string
  readonly cert: SignedCert
  readonly roster: SignedRoster
}

/** What the new computer gets when it asks. */
export type ComputerPoll =
  | { readonly state: 'esperando-o-dono' }
  | { readonly state: 'recusado' }
  | { readonly state: 'desconhecido' }
  | { readonly state: 'aprovado'; readonly grant: EnrollGrant }

/** A computer of the team, as the screen lists it. */
export interface ComputerView {
  readonly computerId: string
  readonly label: string
  readonly fingerprint: string
  readonly registeredAt: string
  readonly registeredBy: string
  readonly isThis: boolean
  readonly caps: ComputerCaps
}

interface Entry {
  readonly requestId: string
  readonly label: string
  readonly address: string
  identity: TailnetIdentity
  readonly pub: PublicIdentity
  readonly ramMb: number | undefined
  readonly known: boolean
  readonly askedAt: number
  deadline: number
  readonly pollHash: Buffer
  state: 'esperando' | 'aprovado' | 'recusado'
  cert?: SignedCert
}

/** What the registry needs. */
export interface RegistryDeps {
  readonly workspaceId: string
  /** The owner of the team: who signs, and the one who is always allowed to host. */
  readonly owner: { readonly memberId: string; readonly signingSeed: string; readonly signingPublic: string }
  /** This PC's own computer id (it is a computer of the team too). */
  readonly thisComputerId: string
  /** Codes of THIS registry: its own instance and its own file, apart from the phones'. */
  readonly pairing: DevicePairing
  readonly store: RegistryStore
  readonly now?: () => number
}

const sha256 = (text: string): Buffer => createHash('sha256').update(text).digest()
const clean = (text: string, fallback: string, max: number): string => text.replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max) || fallback

/** Whether the two keys are real keys of the right kinds (never throws). */
function keysOk(signing: string, agreement: string): boolean {
  try {
    signingPublicKey(signing)
    agreementPublicKey(agreement)
    return true
  } catch (error) {
    void error
    return false
  }
}

/** The computers of the team on the owner's PC. */
export class ComputerRegistry {
  private state: RegistryState
  private signed: SignedRoster | undefined
  private signedAt = 0
  private readonly entries = new Map<string, Entry>()
  private readonly listeners = new Set<(roster: SignedRoster) => void>()
  private readonly now: () => number

  /** @param deps - See {@link RegistryDeps}. */
  constructor(private readonly deps: RegistryDeps) {
    this.now = deps.now ?? Date.now
    this.state = deps.store.read() ?? { version: 0, certs: [], revoked: [] }
  }

  /**
   * This PC is a computer of the team: its certificate, signed by the owner, made once.
   * @param identity - This computer's public identity.
   * @param label - Its name on the screen.
   * @returns The certificate.
   */
  ensureSelf(identity: PublicIdentity, label: string): ComputerCert {
    const id = computerIdOf(identity)
    const held = this.state.certs.find(item => item.cert.computerId === id)
    if (held !== undefined) return held.cert
    const cert = certFor({ identity, label: clean(label, 'Este computador', 80), registeredBy: this.deps.owner.memberId, registeredAt: new Date(this.now()).toISOString() })
    this.commit([...this.state.certs, signCert(cert, this.deps.owner.signingSeed)], this.state.revoked)
    return cert
  }

  /** @returns A new code for the NEXT computer to register (shown once, ten minutes, one use). */
  issueCode(): { readonly code: string; readonly expiresAt: string } {
    return this.deps.pairing.issue(this.deps.owner.memberId)
  }

  /**
   * A new computer typed a code. A right code opens a REQUEST for the owner; it registers nothing.
   * @param input - What the computer sent.
   * @param address - The remote address it came from (the lock of wrong codes is per address).
   * @param identity - What Tailscale says about that address.
   * @returns The request and the token only that computer holds, or why not.
   */
  hello(input: HelloInput, address: string, identity: TailnetIdentity = {}): HelloResult {
    const ram = input.ramMb
    if (typeof input.code !== 'string' || typeof input.label !== 'string' || typeof input.signing !== 'string' || typeof input.agreement !== 'string' || !keysOk(input.signing, input.agreement)
      || (ram !== undefined && (typeof ram !== 'number' || !Number.isSafeInteger(ram) || ram < 0 || ram > 4_000_000))) return { ok: false, reason: 'invalido' }
    this.sweep()
    if ([...this.entries.values()].filter(item => item.state === 'esperando').length >= MAX_COMPUTER_REQUESTS) return { ok: false, reason: 'cheio' }
    const redeemed = this.deps.pairing.redeem(input.code, address)
    if (!redeemed.ok) return redeemed.reason === 'bloqueado' ? { ok: false, reason: 'bloqueado', retryAfterS: redeemed.retryAfterS } : { ok: false, reason: 'recusado' }
    const pub: PublicIdentity = { signing: input.signing, agreement: input.agreement }
    const id = computerIdOf(pub)
    if (this.state.revoked.includes(id)) return { ok: false, reason: 'revogado' } // a revoked id never comes back: a new computer is a new identity
    for (const [key, entry] of this.entries) if (computerIdOf(entry.pub) === id) this.entries.delete(key) // the same computer typing again replaces its earlier request
    const requestId = randomBytes(8).toString('hex')
    const pollToken = randomBytes(16).toString('hex')
    const at = this.now()
    this.entries.set(requestId, {
      requestId, label: clean(input.label, 'Computador', 80), address, identity, pub, ramMb: ram, known: this.state.certs.some(item => item.cert.computerId === id),
      askedAt: at, deadline: at + COMPUTER_REQUEST_TTL_MS, pollHash: sha256(pollToken), state: 'esperando',
    })
    return { ok: true, requestId, pollToken }
  }

  /** @returns The requests waiting for the owner, oldest first. */
  requests(): readonly ComputerRequestView[] {
    this.sweep()
    return [...this.entries.values()].filter(item => item.state === 'esperando').map(entry => ({
      requestId: entry.requestId, label: entry.label, address: entry.address,
      ...(entry.identity.node === undefined ? {} : { node: entry.identity.node }), ...(entry.identity.login === undefined ? {} : { login: entry.identity.login }),
      fingerprint: computerFingerprint(entry.pub), ...(entry.ramMb === undefined ? {} : { ramMb: entry.ramMb }), known: entry.known,
      askedAt: new Date(entry.askedAt).toISOString(), expiresAt: new Date(entry.deadline).toISOString(),
    }))
  }

  /**
   * What Tailscale says about the address a request came from, added after the code was right (so the lookup runs for right codes only).
   * @param requestId - The request.
   * @param identity - The node and login Tailscale reported.
   */
  annotate(requestId: string, identity: TailnetIdentity): void {
    const entry = this.entries.get(requestId)
    if (entry !== undefined && entry.state === 'esperando') entry.identity = identity
  }

  /**
   * The owner confirms: the certificate is signed NOW (nothing exposed, nobody but the owner as host: the owner widens it on purpose) and the roster goes up one version.
   * @param requestId - The request.
   * @returns `ok`, or why not.
   */
  confirm(requestId: string): 'ok' | 'desconhecido' | 'cheio' {
    this.sweep()
    const entry = this.entries.get(requestId)
    if (entry === undefined || entry.state !== 'esperando') return 'desconhecido'
    const id = computerIdOf(entry.pub)
    let signed = this.state.certs.find(item => item.cert.computerId === id)
    if (signed === undefined) {
      if (this.state.certs.length >= MAX_COMPUTERS) return 'cheio'
      signed = signCert(certFor({ identity: entry.pub, label: entry.label, registeredBy: this.deps.owner.memberId, registeredAt: new Date(this.now()).toISOString() }), this.deps.owner.signingSeed)
      this.commit([...this.state.certs, signed], this.state.revoked)
    }
    entry.state = 'aprovado'
    entry.cert = signed
    entry.deadline = this.now() + COMPUTER_COLLECT_MS
    return 'ok'
  }

  /**
   * The owner says no.
   * @param requestId - The request.
   * @returns `true` when a waiting request was refused.
   */
  reject(requestId: string): boolean {
    this.sweep()
    const entry = this.entries.get(requestId)
    if (entry === undefined || entry.state !== 'esperando') return false
    entry.state = 'recusado'
    return true
  }

  /**
   * The new computer asks what became of its request. A confirmation is handed over ONCE.
   * @param pollToken - What it was given when it typed the code.
   * @returns The state, and what the owner signed the one time it is confirmed.
   */
  poll(pollToken: string): ComputerPoll {
    this.sweep()
    if (typeof pollToken !== 'string') return { state: 'desconhecido' }
    const given = sha256(pollToken)
    let found: Entry | undefined
    for (const entry of this.entries.values()) if (timingSafeEqual(entry.pollHash, given)) found = entry
    if (found === undefined) return { state: 'desconhecido' }
    if (found.state === 'esperando') return { state: 'esperando-o-dono' }
    this.entries.delete(found.requestId)
    if (found.state === 'recusado') return { state: 'recusado' }
    const roster = this.signedRoster()
    return found.cert === undefined || roster === undefined ? { state: 'desconhecido' } : { state: 'aprovado', grant: { workspaceId: this.deps.workspaceId, ownerSigningPublic: this.deps.owner.signingPublic, ownerComputerId: this.deps.thisComputerId, cert: found.cert, roster } }
  }

  /**
   * The owner removes a computer: its certificate leaves the roster and its id is revoked for good.
   * @param computerId - The computer.
   * @returns `ok`, or why not (this PC cannot remove itself: the team would lose its owner's computer).
   */
  revoke(computerId: string): 'ok' | 'unknown' | 'is-this-computer' {
    if (computerId === this.deps.thisComputerId) return 'is-this-computer'
    if (!this.state.certs.some(item => item.cert.computerId === computerId)) return 'unknown'
    this.commit(this.state.certs.filter(item => item.cert.computerId !== computerId), [...this.state.revoked.filter(item => item !== computerId), computerId].slice(-MAX_REVOKED))
    return 'ok'
  }

  /**
   * The owner widens or narrows what a computer allows: who may host there, how many each, the autonomy ceiling and what its operator exposes (Lumen L1/L2). The owner is always a host.
   * @param computerId - The computer.
   * @param caps - The new caps.
   * @returns `ok`, or why not.
   */
  setCaps(computerId: string, caps: ComputerCaps): 'ok' | 'unknown' | 'invalid' {
    const held = this.state.certs.find(item => item.cert.computerId === computerId)
    if (held === undefined) return 'unknown'
    const hostFor = caps.hostFor.includes(this.deps.owner.memberId) ? caps.hostFor : [this.deps.owner.memberId, ...caps.hostFor]
    const next = readCert({ ...held.cert, caps: { ...caps, hostFor } })
    if (next === undefined) return 'invalid'
    this.commit(this.state.certs.map(item => (item.cert.computerId === computerId ? signCert(next, this.deps.owner.signingSeed) : item)), this.state.revoked)
    return 'ok'
  }

  /** @returns The computers of the team, this PC first. */
  computers(): readonly ComputerView[] {
    return this.state.certs.map(({ cert }): ComputerView => ({
      computerId: cert.computerId, label: cert.label, fingerprint: computerFingerprint({ signing: cert.signing, agreement: cert.agreement }), registeredAt: cert.registeredAt, registeredBy: cert.registeredBy,
      isThis: cert.computerId === this.deps.thisComputerId, caps: cert.caps,
    })).sort((a, b) => Number(b.isThis) - Number(a.isThis))
  }

  /** @returns The signed roster to hand to a computer (re-signed when the last one is getting old), or `undefined` when no computer is registered yet. */
  signedRoster(): SignedRoster | undefined {
    if (this.state.version === 0) return undefined
    if (this.signed === undefined || this.now() - this.signedAt >= ROSTER_REISSUE_MS) this.commit(this.state.certs, this.state.revoked)
    return this.signed
  }

  /** The host's timer calls this now and then: a roster that is getting old is signed again, so no computer of the team is left without a fresh one. */
  tick(): void {
    void this.signedRoster()
  }

  /**
   * @param listener - Called with every roster signed (the PC's own guard takes it, and the computers get it on their next visit).
   * @returns The function that stops listening.
   */
  onRoster(listener: (roster: SignedRoster) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private commit(certs: readonly SignedCert[], revoked: readonly string[]): void {
    this.state = { version: this.state.version + 1, certs, revoked }
    this.deps.store.write(this.state)
    this.signed = signRoster({ schema: 'roster/v1', workspaceId: this.deps.workspaceId, version: this.state.version, issuedAt: new Date(this.now()).toISOString(), certs, revoked }, this.deps.owner.signingSeed)
    this.signedAt = this.now()
    for (const listener of this.listeners) listener(this.signed)
  }

  /** Requests the owner never answered, and approvals nobody collected, expire. */
  private sweep(): void {
    const at = this.now()
    for (const [id, entry] of this.entries) if (entry.deadline <= at) this.entries.delete(id)
  }
}
