/**
 * E2EE per channel, the part that runs ANYWHERE (Node host, Cloudflare Worker, Miniflare): only WebCrypto and plain bytes, no `node:` import.
 * The Durable Object imports this file to check who signed a sealed payload without ever holding a channel key.
 *
 * Wire format (documented in `persona-spec/contracts/e2ee-channel.md`):
 *   header = "persona/seal/v1\n<workspaceId>\n<streamId>\n<epoch>\n<authorId>\n"
 *   signed bytes = utf8(header) || ciphertext bytes            (ciphertext = iv(12) || tag(16) || body)
 *   signature    = Ed25519 over the signed bytes, base64url
 */

import type { ChannelSealedPayload } from '@deepseek-ai/dsh-persona-core'

/** What the signature and the encryption are bound to: a payload cannot be moved to another channel, epoch or author. */
export interface SealContext {
  readonly workspaceId: string
  readonly streamId: string
  readonly epoch: number
  readonly authorId: string
}

/** @param context - Where the payload lives. @returns The header both the AAD of the encryption and the signature carry. */
export function sealHeader(context: SealContext): string {
  return `persona/seal/v1\n${context.workspaceId}\n${context.streamId}\n${String(context.epoch)}\n${context.authorId}\n`
}

const utf8 = new TextEncoder()

/** @param text - base64url. @returns Its bytes (`undefined` when it is not valid base64url). */
export function bytesOfBase64Url(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/u.test(text)) return undefined
  const padded = text.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  try {
    const binary = atob(padded)
    const out = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index)
    return out
  }
  catch {
    return undefined
  }
}

/** @param bytes - Any bytes. @returns base64url without padding. */
export function base64UrlOfBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

/** @param sealed - A sealed payload. @returns The bytes that are signed (header || ciphertext), or undefined when the ciphertext is not base64. */
export function signedBytesOf(sealed: ChannelSealedPayload, context: { readonly workspaceId: string; readonly streamId: string }): Uint8Array | undefined {
  const body = bytesOfBase64(sealed.ciphertext)
  if (body === undefined) return undefined
  const header = utf8.encode(sealHeader({ ...context, epoch: sealed.epoch, authorId: sealed.authorId }))
  const out = new Uint8Array(header.length + body.length)
  out.set(header, 0)
  out.set(body, header.length)
  return out
}

/** Standard base64 (the ciphertext field), tolerant of nothing: a bad character is a bad payload. */
export function bytesOfBase64(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(text) || text.length % 4 !== 0) return undefined
  try {
    const binary = atob(text)
    const out = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index)
    return out
  }
  catch {
    return undefined
  }
}

/**
 * Check the author's Ed25519 signature of a sealed payload. Never throws: anything malformed is `false`.
 * @param sealed - The payload as it arrived.
 * @param context - Workspace and stream it arrived on (the header binds them).
 * @param authorSigningPublic - The author's Ed25519 public key (base64url, raw 32 bytes), from the roster.
 */
export async function verifySealedSignature(
  sealed: ChannelSealedPayload,
  context: { readonly workspaceId: string; readonly streamId: string },
  authorSigningPublic: string,
): Promise<boolean> {
  try {
    const publicBytes = bytesOfBase64Url(authorSigningPublic)
    const signature = bytesOfBase64Url(sealed.sig)
    const data = signedBytesOf(sealed, context)
    if (publicBytes === undefined || publicBytes.length !== 32 || signature === undefined || signature.length !== 64 || data === undefined) return false
    const key = await crypto.subtle.importKey('raw', publicBytes as BufferSource, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature as BufferSource, data as BufferSource)
  }
  catch {
    return false
  }
}
