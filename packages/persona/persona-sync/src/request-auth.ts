/**
 * H23 / F2: who is calling the hub, proven (not claimed). Runs ANYWHERE (WebCrypto and plain bytes only, no `node:` import): the Worker verifies with it,
 * the host signs with `request-sign.ts`.
 *
 *   Authorization: Persona-Sig actor=<id>,ts=<epoch ms>,sig=<base64url Ed25519>
 *   signed bytes  = utf8("persona-req/v1\n<METHOD>\n<path?query>\n<ts>\n<sha256 hex of the body>")
 *
 * The edge NEVER has a way to skip this: there is no flag, variable or binding that turns the check off (decision of the Keel, 12/11 01:19).
 */

import { base64UrlOfBytes, bytesOfBase64Url } from './signature-web.ts'

/** How far a timestamp may be from the hub's clock. */
export const REQUEST_SKEW_MS = 2 * 60_000

const utf8 = new TextEncoder()

/** @param bytes - Anything. @returns Lowercase hex SHA-256. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
  let hex = ''
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/** What is signed. `target` is the path plus the query string, exactly as sent. */
export function canonicalRequest(input: { readonly method: string; readonly target: string; readonly ts: number; readonly bodySha256: string }): string {
  return `persona-req/v1\n${input.method.toUpperCase()}\n${input.target}\n${String(input.ts)}\n${input.bodySha256}`
}

/** The parsed header. */
export interface PersonaSig {
  readonly actor: string
  readonly ts: number
  readonly sig: string
}

/** @param header - The `Authorization` header value. @returns Its parts, or `undefined` when it is not a well-formed Persona-Sig. */
export function parsePersonaSig(header: string | null | undefined): PersonaSig | undefined {
  if (header === null || header === undefined) return undefined
  const match = /^Persona-Sig actor=([^,\s]{1,128}),ts=(\d{10,16}),sig=([A-Za-z0-9_-]{86})$/u.exec(header.trim())
  if (match === null) return undefined
  return { actor: match[1] ?? '', ts: Number(match[2]), sig: match[3] ?? '' }
}

export type RequestAuthFailure = 'MISSING' | 'MALFORMED' | 'STALE' | 'UNKNOWN_ACTOR' | 'BAD_SIGNATURE' | 'REPLAYED'

export type RequestAuthResult = { readonly ok: true; readonly actor: string } | { readonly ok: false; readonly code: RequestAuthFailure }

/** Remembers the signatures already seen inside the skew window. The hub backs it with its own SQLite, so a hibernation does not forget (see `seen_sig`). */
export interface ReplayStore {
  /** @returns `true` the first time a signature is seen (and remembers it until `expiresAt`), `false` for a repeat. */
  firstSight(sig: string, expiresAt: number, now: number): boolean
}

/** In-memory store (tests and fixtures). */
export class MemoryReplayStore implements ReplayStore {
  private readonly seen = new Map<string, number>()

  firstSight(sig: string, expiresAt: number, now: number): boolean {
    for (const [key, until] of this.seen) if (until <= now) this.seen.delete(key)
    if (this.seen.has(sig)) return false
    this.seen.set(sig, expiresAt)
    return true
  }
}

/**
 * Verify one request.
 * @param request - Method, target (`path?query`), the `Authorization` header and the raw body bytes.
 * @param signingPublicOf - The member's Ed25519 public key (base64url) from the hub's roster; `undefined` for an unknown or revoked actor.
 * @param replay - Where seen signatures are kept.
 * @param now - The hub's clock (ms).
 */
export async function verifyRequest(
  request: { readonly method: string; readonly target: string; readonly authorization: string | null; readonly body: Uint8Array },
  signingPublicOf: (actor: string) => string | undefined,
  replay: ReplayStore,
  now: number,
): Promise<RequestAuthResult> {
  if (request.authorization === null || request.authorization === '') return { ok: false, code: 'MISSING' }
  const parsed = parsePersonaSig(request.authorization)
  if (parsed === undefined) return { ok: false, code: 'MALFORMED' }
  if (Math.abs(now - parsed.ts) > REQUEST_SKEW_MS) return { ok: false, code: 'STALE' }
  const publicKey = signingPublicOf(parsed.actor)
  if (publicKey === undefined) return { ok: false, code: 'UNKNOWN_ACTOR' }
  const publicBytes = bytesOfBase64Url(publicKey)
  const signature = bytesOfBase64Url(parsed.sig)
  if (publicBytes === undefined || publicBytes.length !== 32 || signature === undefined || signature.length !== 64) return { ok: false, code: 'BAD_SIGNATURE' }
  const bodySha256 = await sha256Hex(request.body)
  const data = utf8.encode(canonicalRequest({ method: request.method, target: request.target, ts: parsed.ts, bodySha256 }))
  let valid = false
  try {
    const key = await crypto.subtle.importKey('raw', publicBytes as BufferSource, { name: 'Ed25519' }, false, ['verify'])
    valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, signature as BufferSource, data as BufferSource)
  }
  catch {
    valid = false
  }
  if (!valid) return { ok: false, code: 'BAD_SIGNATURE' }
  // Only a VALID signature is remembered (an attacker cannot fill the store with junk), and only until it could no longer pass the skew check.
  if (!replay.firstSight(parsed.sig, parsed.ts + REQUEST_SKEW_MS, now)) return { ok: false, code: 'REPLAYED' }
  return { ok: true, actor: parsed.actor }
}

export { base64UrlOfBytes }
