/**
 * H23 / F2, host side: sign a request to the hub. Node only (`node:crypto` through `keys.ts`). The verifier is `request-auth.ts` (runs in the Worker).
 */

import { createHash } from 'node:crypto'
import { signBytes } from './keys.ts'
import { canonicalRequest } from './request-auth.ts'

/**
 * @param input - Who signs (`actor` + their Ed25519 seed), what is sent, and when.
 * @returns The value of the `Authorization` header.
 */
export function signRequest(input: {
  readonly actor: string
  readonly signingSeed: string
  readonly method: string
  /** Path plus query string, exactly as sent (`/w/ws/sync/after?streamId=…`). */
  readonly target: string
  readonly body?: Uint8Array | string
  readonly ts?: number
}): string {
  const ts = input.ts ?? Date.now()
  const body = typeof input.body === 'string' ? Buffer.from(input.body, 'utf8') : Buffer.from(input.body ?? new Uint8Array())
  const bodySha256 = createHash('sha256').update(body).digest('hex')
  const sig = signBytes(input.signingSeed, Buffer.from(canonicalRequest({ method: input.method, target: input.target, ts, bodySha256 }), 'utf8'))
  return `Persona-Sig actor=${input.actor},ts=${String(ts)},sig=${sig}`
}

/** What `HttpTransport` needs to sign a call: who the device is, and the `Authorization` value for each request. */
export interface RequestSigner {
  readonly actor: string
  /** @returns The `Authorization` header value for a request about to be sent. */
  authorize(request: { readonly method: string; readonly target: string; readonly body?: string | Uint8Array }): string
}

/**
 * @param actor - The member's id at the hub.
 * @param signingSeed - The device's Ed25519 seed (from the Cofre).
 * @param now - Clock (tests inject one).
 */
export function createRequestSigner(actor: string, signingSeed: string, now: () => number = Date.now): RequestSigner {
  // The timestamp only ever goes UP for one signer: two identical requests in the same millisecond (a poller and a push) would otherwise sign the same bytes, and the
  // hub would take the second for a replay.
  let last = 0
  return {
    actor,
    authorize: (request) => {
      last = Math.max(now(), last + 1)
      return signRequest({ actor, signingSeed, ...request, ts: last })
    },
  }
}
