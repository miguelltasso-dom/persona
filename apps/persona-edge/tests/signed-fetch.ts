/**
 * H23 / F2, test helper: a `fetch` that signs every call as a real device, exactly as the host does (Ed25519 over METHOD, path + query, timestamp and the SHA-256 of
 * the body). The hub trusts nothing else, so the specs of the edge go through this and never send a bare `x-persona-actor`.
 */
import {
  createRequestSigner, generateIdentity, publicIdentity, type Identity,
} from '../../../packages/persona/persona-sync/src/index.ts'

/** One test person's device: an id at the hub and a real identity (the keys the hub is told about). */
export interface Device {
  readonly id: string
  readonly identity: Identity
  readonly keys: { readonly signing: string; readonly agreement: string }
}

/** @param id - The member id (`ana`). @returns A device with a freshly generated identity. */
export function newDevice(id: string): Device {
  const identity = generateIdentity()
  return { id, identity, keys: publicIdentity(identity) }
}

/** Signs one call as `device`. `now` lets a test sign in the past or the future. */
export function signedAs(base: typeof fetch, device: Device, now: () => number = Date.now): typeof fetch {
  const signer = createRequestSigner(device.id, device.identity.signing.seed, now)
  return (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const body = init?.body
    const signed = typeof body === 'string' || body instanceof Uint8Array ? body : undefined
    const headers = new Headers(init?.headers)
    headers.delete('x-persona-actor') // a bare claim is never what proves a call
    headers.set('authorization', signer.authorize({ method: (init?.method ?? 'GET').toUpperCase(), target: `${url.pathname}${url.search}`, ...(signed === undefined ? {} : { body: signed }) }))
    return base(input, { ...init, headers })
  }
}

/** A JSON POST body. */
export const json = (value: unknown): { headers: Record<string, string>; body: string } => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
