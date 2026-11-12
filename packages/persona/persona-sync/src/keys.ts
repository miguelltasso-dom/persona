/**
 * E2EE per channel (Entrega 2, F1): a person's device identity and the primitives built on it. Host side (Node): `node:crypto`.
 *
 *   - {@link Identity}: an Ed25519 key (who wrote it) and an X25519 key (who may receive a channel key). Private halves are the raw 32-byte seeds,
 *     base64url, and live ONLY in the person's Cofre (DPAPI) behind an {@link IdentityStore}; the public halves go to the roster.
 *   - {@link fingerprint}: the short code the owner compares with the person at the approval ("código de segurança").
 *
 * Nothing here talks to the network and nothing here is a secret of the team: the edge never sees a private key or a channel key.
 */

import { createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto'
import { base64UrlOfBytes, bytesOfBase64Url } from './signature-web.ts'

const ED_SPKI = Buffer.from('302a300506032b6570032100', 'hex')
const X_SPKI = Buffer.from('302a300506032b656e032100', 'hex')
const ED_PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex')
const X_PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex')

/** A person's device identity. The private halves are secrets: only the Cofre stores them. */
export interface Identity {
  readonly signing: { readonly publicKey: string; readonly seed: string }
  readonly agreement: { readonly publicKey: string; readonly secret: string }
}

/** What the roster (and the edge) may know of a person. */
export interface PublicIdentity {
  /** Ed25519 public key, base64url (raw 32 bytes). */
  readonly signing: string
  /** X25519 public key, base64url (raw 32 bytes). */
  readonly agreement: string
}

/** A wrong key, a bad length or a malformed value (never a secret in the message). */
export class KeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KeyError'
  }
}

function raw32(value: string, what: string): Buffer {
  const bytes = bytesOfBase64Url(value)
  if (bytes === undefined || bytes.length !== 32) throw new KeyError(`${what}: precisa de 32 bytes em base64url`)
  return Buffer.from(bytes)
}

/** @param seed - Ed25519 seed, base64url. */
export function signingPrivateKey(seed: string): KeyObject {
  return createPrivateKey({ key: Buffer.concat([ED_PKCS8, raw32(seed, 'chave de assinatura')]), format: 'der', type: 'pkcs8' })
}

/** @param publicKey - Ed25519 public key, base64url. */
export function signingPublicKey(publicKey: string): KeyObject {
  return createPublicKey({ key: Buffer.concat([ED_SPKI, raw32(publicKey, 'chave pública de assinatura')]), format: 'der', type: 'spki' })
}

/** @param secret - X25519 private key, base64url. */
export function agreementPrivateKey(secret: string): KeyObject {
  return createPrivateKey({ key: Buffer.concat([X_PKCS8, raw32(secret, 'chave de acordo')]), format: 'der', type: 'pkcs8' })
}

/** @param publicKey - X25519 public key, base64url. */
export function agreementPublicKey(publicKey: string): KeyObject {
  return createPublicKey({ key: Buffer.concat([X_SPKI, raw32(publicKey, 'chave pública de acordo')]), format: 'der', type: 'spki' })
}

function rawOf(key: KeyObject, kind: 'public' | 'private'): string {
  const der = key.export(kind === 'public' ? { format: 'der', type: 'spki' } : { format: 'der', type: 'pkcs8' })
  return base64UrlOfBytes(der.subarray(der.length - 32))
}

/** A fresh X25519 pair (an identity's agreement key, or the ephemeral key of one key wrap). */
export function generateAgreementPair(): { readonly publicKey: string; readonly secret: string } {
  const pair = generateKeyPairSync('x25519')
  return { publicKey: rawOf(pair.publicKey, 'public'), secret: rawOf(pair.privateKey, 'private') }
}

/** @returns A brand-new identity (Ed25519 + X25519). Call once per person and device, then keep it in the Cofre. */
export function generateIdentity(): Identity {
  const signing = generateKeyPairSync('ed25519')
  return {
    signing: { publicKey: rawOf(signing.publicKey, 'public'), seed: rawOf(signing.privateKey, 'private') },
    agreement: generateAgreementPair(),
  }
}

/** @param identity - A full identity. @returns Only what may leave the device. */
export function publicIdentity(identity: Identity): PublicIdentity {
  return { signing: identity.signing.publicKey, agreement: identity.agreement.publicKey }
}

/**
 * Ed25519 signature.
 * @param seed - The signer's seed (base64url).
 * @param message - What is signed.
 * @returns base64url signature (64 bytes).
 */
export function signBytes(seed: string, message: Uint8Array): string {
  return base64UrlOfBytes(sign(null, message, signingPrivateKey(seed)))
}

/**
 * @param publicKey - The signer's public key (base64url).
 * @param message - What was signed.
 * @param signature - base64url signature.
 * @returns Whether the signature is valid (false, never a throw, for anything malformed).
 */
export function verifyBytes(publicKey: string, message: Uint8Array, signature: string): boolean {
  try {
    const bytes = bytesOfBase64Url(signature)
    if (bytes === undefined || bytes.length !== 64) return false
    return verify(null, message, signingPublicKey(publicKey), bytes)
  }
  catch {
    return false
  }
}

/** X25519: the 32-byte shared secret between my private key and their public key. */
export function agree(secret: string, theirPublicKey: string): Buffer {
  return diffieHellman({ privateKey: agreementPrivateKey(secret), publicKey: agreementPublicKey(theirPublicKey) })
}

/**
 * The code two people compare out loud ("o seu código de segurança é …") before the owner approves a new member: it is the SHA-256 of BOTH public keys.
 * @param identity - A public identity.
 * @returns Five groups of four hex digits, e.g. `3f2a 91bc 04de 77a1 c0d3`.
 */
export function fingerprint(identity: PublicIdentity): string {
  const hex = createHash('sha256').update(`persona/fingerprint/v1\n${identity.signing}\n${identity.agreement}`).digest('hex').slice(0, 20)
  return hex.match(/.{4}/gu)?.join(' ') ?? hex
}

/** Where a device's identity lives. The real one is the Cofre (DPAPI sealed slot); tests and the edge fixture use the memory one. */
export interface IdentityStore {
  load(): Promise<Identity | undefined>
  save(identity: Identity): Promise<void>
}

/** In-process store (tests, two-host fixtures). Never use it for a real person: it keeps the secret in memory only. */
export class MemoryIdentityStore implements IdentityStore {
  private identity: Identity | undefined

  constructor(initial?: Identity) {
    this.identity = initial
  }

  load(): Promise<Identity | undefined> {
    return Promise.resolve(this.identity)
  }

  save(identity: Identity): Promise<void> {
    this.identity = identity
    return Promise.resolve()
  }
}

/**
 * The identity of this device: the stored one, or a new one saved before it is returned (so a crash never leaves a key nobody kept).
 * @param store - Where it lives.
 */
export async function loadOrCreateIdentity(store: IdentityStore): Promise<Identity> {
  const existing = await store.load()
  if (existing !== undefined) return existing
  const created = generateIdentity()
  await store.save(created)
  return created
}
