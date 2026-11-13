/**
 * D-116 (Bolt): how one computer of the team proves to another who is calling. The caller signs the request itself — method, path, the `Host` it is talking to, the time and the SHA-256 of the body — with its own
 * Ed25519 key; the receiver checks the signature against the key in the certificate the OWNER signed (the roster), never against a key that arrives with the request. So:
 *  - a request meant for B cannot be replayed to C (the host is signed), nor to another path (the path is signed), nor with another body (the hash is signed);
 *  - a request older or newer than a minute is refused, and one seen before is refused (a small memory of recent signatures);
 *  - a computer that is not in a fresh roster, or was revoked, is nobody (safe failure: no roster, no calls).
 * The cheap checks (shape, time, who) run BEFORE the body is read, so an unknown caller never makes the door read a bundle's worth of bytes.
 */

import { createHash } from 'node:crypto'
import { signBytes, verifyBytes } from '@deepseek-ai/dsh-persona-sync'
import type { RosterGuard } from './computer-cert.ts'

/** The header that carries the proof: `v1.<computerId>.<timestamp>.<signature>`. */
export const COMPUTER_HEADER = 'x-persona-computer'
/** How far from this computer's clock a request may be. */
export const COMPUTER_SKEW_MS = 60_000
/** Signatures remembered to refuse a replay (a request is worth a minute either side, so far fewer than this can be live). */
export const COMPUTER_REPLAY_KEPT = 4_096

/** What a request says about itself (everything here is signed). */
export interface SignedRequestFacts {
  readonly method: string
  /** Path and query as sent. */
  readonly path: string
  /** The `Host` the caller addressed (`ip:port`). */
  readonly host: string
  readonly body: string | Uint8Array
}

const sha256Hex = (body: string | Uint8Array): string => createHash('sha256').update(body).digest('hex')
const textOf = (facts: SignedRequestFacts, timestamp: number): string => `persona/computer-req/v1\n${facts.method.toUpperCase()}\n${facts.path}\n${facts.host}\n${String(timestamp)}\n${sha256Hex(facts.body)}`

/**
 * The caller's side: the header value for one request.
 * @param input - Who is calling (its id and seed), the request and the caller's clock.
 * @returns The value of {@link COMPUTER_HEADER}.
 */
export function signComputerRequest(input: SignedRequestFacts & { readonly computerId: string; readonly signingSeed: string; readonly now: number }): string {
  return `v1.${input.computerId}.${String(input.now)}.${signBytes(input.signingSeed, Buffer.from(textOf(input, input.now), 'utf8'))}`
}

/** Why a request was not accepted. */
export type ComputerAuthRefusal = 'malformed' | 'skew' | 'unknown-computer' | 'bad-signature' | 'replay'

/** What the receiver knows after the cheap checks. */
export interface Precheck {
  readonly computerId: string
  readonly timestamp: number
  readonly signature: string
  /** The public signing key from the certificate in the roster. */
  readonly signingPublic: string
}

/** The receiver's side. */
export class ComputerAuth {
  private readonly seen = new Map<string, number>()

  /**
   * @param roster - What this computer knows of the team (only `certOf` is used: a stale roster or a revoked computer is "unknown").
   * @param now - Clock (tests replace it).
   * @param kept - How many signatures are remembered (tests make it small).
   */
  constructor(private readonly roster: Pick<RosterGuard, 'certOf'>, private readonly now: () => number = Date.now, private readonly kept: number = COMPUTER_REPLAY_KEPT) {}

  /**
   * The checks that need no body: the shape, the time and who the caller is. Run before the body is read.
   * @param header - The value of {@link COMPUTER_HEADER}.
   * @returns What the rest of the check needs, or why not.
   */
  precheck(header: string | undefined): Precheck | { readonly refused: ComputerAuthRefusal } {
    const parts = typeof header === 'string' && header.length <= 300 ? header.split('.') : []
    if (parts.length !== 4 || parts[0] !== 'v1' || parts[1] === '' || parts[3] === '' || !/^\d{1,16}$/u.test(parts[2] ?? '')) return { refused: 'malformed' }
    const [, computerId, stamp, signature] = parts as [string, string, string, string]
    const timestamp = Number(stamp)
    if (Math.abs(this.now() - timestamp) > COMPUTER_SKEW_MS) return { refused: 'skew' }
    const cert = this.roster.certOf(computerId)
    return cert === undefined ? { refused: 'unknown-computer' } : { computerId, timestamp, signature, signingPublic: cert.signing }
  }

  /**
   * The rest: the signature over THIS request, and that it was not seen before.
   * @param pre - What {@link ComputerAuth.precheck} returned.
   * @param facts - The request as it arrived (the body is hashed here).
   * @returns The caller's id, or why not.
   */
  verify(pre: Precheck, facts: SignedRequestFacts): { readonly ok: true; readonly computerId: string } | { readonly ok: false; readonly reason: ComputerAuthRefusal } {
    if (!verifyBytes(pre.signingPublic, Buffer.from(textOf(facts, pre.timestamp), 'utf8'), pre.signature)) return { ok: false, reason: 'bad-signature' }
    const at = this.now()
    for (const [signature, until] of this.seen) if (until <= at) this.seen.delete(signature)
    if (this.seen.has(pre.signature)) return { ok: false, reason: 'replay' }
    if (this.seen.size >= this.kept) { const oldest = this.seen.keys().next().value; if (oldest !== undefined) this.seen.delete(oldest) }
    this.seen.set(pre.signature, pre.timestamp + COMPUTER_SKEW_MS + 1_000)
    return { ok: true, computerId: pre.computerId }
  }
}
