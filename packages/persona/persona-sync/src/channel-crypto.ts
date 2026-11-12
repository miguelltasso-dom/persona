/**
 * E2EE per channel (Entrega 2, F1): the channel key, how it travels to a member (`key_wrap`) and how a message is sealed and opened.
 *
 *   - ONE random 32-byte key per channel and EPOCH (the epoch rises when a member leaves, so they cannot read what comes next).
 *   - The key reaches a member inside a {@link KeyWrap}: an ephemeral X25519 agreement with the member's public key, HKDF-SHA256 into a key-encryption key,
 *     AES-256-GCM over the channel key, signed by whoever wrapped it. The edge stores wraps but cannot open them.
 *   - A message is AES-256-GCM under the channel key (the AAD is the {@link sealHeader}: workspace, stream, epoch, author) and signed by its author.
 *     Moving a payload to another channel, epoch or author breaks both the tag and the signature.
 *
 * The edge verifies signatures (`signature-web.ts`); only members holding the channel key ever read a word.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { ChannelSealedPayload } from '@deepseek-ai/dsh-persona-core'
import { agree, generateAgreementPair, signBytes, verifyBytes } from './keys.ts'
import { bytesOfBase64, bytesOfBase64Url, sealHeader, signedBytesOf } from './signature-web.ts'

export type ChannelCryptoCode = 'BAD_SIGNATURE' | 'BAD_CIPHERTEXT' | 'WRONG_EPOCH' | 'BAD_WRAP' | 'BAD_KEY'

/** Anything that stops a payload or a wrap from being trusted. The message never carries a key or a plaintext. */
export class ChannelCryptoError extends Error {
  constructor(readonly code: ChannelCryptoCode, message?: string) {
    super(message ?? code)
    this.name = 'ChannelCryptoError'
  }
}

/** @returns A new channel key (32 random bytes). */
export function newChannelKey(): Buffer {
  return randomBytes(32)
}

function assertKey(key: Uint8Array): void {
  if (key.length !== 32) throw new ChannelCryptoError('BAD_KEY', 'a chave do canal tem 32 bytes')
}

function gcmSeal(key: Uint8Array, aad: string, plaintext: Uint8Array): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

function gcmOpen(key: Uint8Array, aad: string, sealed: Uint8Array, code: ChannelCryptoCode): Buffer {
  if (sealed.length < 28) throw new ChannelCryptoError(code)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12))
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(sealed.subarray(12, 28))
    return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()])
  }
  catch {
    throw new ChannelCryptoError(code)
  }
}

// ---- messages ------------------------------------------------------------------------------------------------------------------------------

/** Everything needed to seal one message. */
export interface SealInput {
  readonly workspaceId: string
  readonly streamId: string
  readonly epoch: number
  readonly authorId: string
  readonly key: Uint8Array
  /** The author's Ed25519 seed (base64url). */
  readonly signingSeed: string
  readonly plaintext: string
}

/**
 * @param input - The message and who sends it.
 * @returns The sealed, signed payload the edge carries.
 */
export function sealChannel(input: SealInput): ChannelSealedPayload {
  assertKey(input.key)
  const header = sealHeader(input)
  const body = gcmSeal(input.key, header, Buffer.from(input.plaintext, 'utf8'))
  const sealed: ChannelSealedPayload = { alg: 'channel', epoch: input.epoch, authorId: input.authorId, ciphertext: body.toString('base64'), sig: '' }
  const signed = signedBytesOf(sealed, input)
  if (signed === undefined) throw new ChannelCryptoError('BAD_CIPHERTEXT')
  return { ...sealed, sig: signBytes(input.signingSeed, signed) }
}

/** What opening needs: where it arrived, the key of ITS epoch and who is allowed to have written it. */
export interface OpenInput {
  readonly workspaceId: string
  readonly streamId: string
  readonly key: Uint8Array
  /** The author's Ed25519 public key (base64url), from the roster. */
  readonly authorSigningPublic: string
}

/**
 * Verify the signature FIRST, then decrypt.
 * @param sealed - The payload as it arrived.
 * @param input - Channel, key and the author's public key.
 * @throws {ChannelCryptoError} `BAD_SIGNATURE` or `BAD_CIPHERTEXT`.
 */
export function openChannel(sealed: ChannelSealedPayload, input: OpenInput): string {
  assertKey(input.key)
  const signed = signedBytesOf(sealed, input)
  if (signed === undefined) throw new ChannelCryptoError('BAD_CIPHERTEXT')
  if (!verifyBytes(input.authorSigningPublic, signed, sealed.sig)) throw new ChannelCryptoError('BAD_SIGNATURE')
  const body = bytesOfBase64(sealed.ciphertext)
  if (body === undefined) throw new ChannelCryptoError('BAD_CIPHERTEXT')
  return gcmOpen(input.key, sealHeader({ ...input, epoch: sealed.epoch, authorId: sealed.authorId }), body, 'BAD_CIPHERTEXT').toString('utf8')
}

// ---- key wrap ------------------------------------------------------------------------------------------------------------------------------

/** The channel key sealed for ONE member (what the edge stores in `key_wrap`). Safe to hand to anyone: only that member can open it. */
export interface KeyWrap {
  readonly epoch: number
  /** The admin who wrapped it. */
  readonly by: string
  /** Ephemeral X25519 public key, base64url. */
  readonly epk: string
  /** base64(iv || tag || wrapped key). */
  readonly ct: string
  /** Ed25519 signature of the wrapper over (header || epk || ct), base64url. */
  readonly sig: string
}

/** Where a wrap lives: it is bound to this channel, this epoch and this recipient. */
export interface WrapContext {
  readonly workspaceId: string
  readonly channelId: string
  readonly epoch: number
  readonly recipientId: string
  readonly by: string
}

function wrapHeader(context: WrapContext): string {
  return `persona/key_wrap/v1\n${context.workspaceId}\n${context.channelId}\n${String(context.epoch)}\n${context.recipientId}\n${context.by}\n`
}

function wrapSigned(header: string, epk: string, ct: string): Buffer {
  return Buffer.concat([Buffer.from(header, 'utf8'), Buffer.from(epk, 'utf8'), Buffer.from(ct, 'utf8')])
}

function kekOf(shared: Buffer, epk: string, recipientPublic: string, header: string): Buffer {
  const salt = Buffer.concat([Buffer.from(bytesOfBase64Url(epk) ?? []), Buffer.from(bytesOfBase64Url(recipientPublic) ?? [])])
  return Buffer.from(hkdfSync('sha256', shared, salt, Buffer.from(header, 'utf8'), 32))
}

/**
 * Seal a channel key for one member.
 * @param context - Workspace, channel, epoch, recipient and wrapper (all bound into the wrap).
 * @param input - The key, the recipient's X25519 public key and the wrapper's Ed25519 seed.
 */
export function wrapChannelKey(context: WrapContext, input: { readonly key: Uint8Array; readonly recipientAgreementPublic: string; readonly signingSeed: string }): KeyWrap {
  assertKey(input.key)
  const header = wrapHeader(context)
  const ephemeral = generateAgreementPair()
  const kek = kekOf(agree(ephemeral.secret, input.recipientAgreementPublic), ephemeral.publicKey, input.recipientAgreementPublic, header)
  const ct = gcmSeal(kek, header, input.key).toString('base64')
  return { epoch: context.epoch, by: context.by, epk: ephemeral.publicKey, ct, sig: signBytes(input.signingSeed, wrapSigned(header, ephemeral.publicKey, ct)) }
}

/**
 * Open the wrap meant for me: check who wrapped it, then get the channel key back.
 * @param wrap - As stored at the edge.
 * @param context - Where it should live (a wrap moved to another channel or recipient fails).
 * @param input - My X25519 pair and the wrapper's Ed25519 public key (from the roster).
 * @throws {ChannelCryptoError} `BAD_WRAP`.
 */
export function unwrapChannelKey(
  wrap: KeyWrap,
  context: WrapContext,
  input: { readonly agreementSecret: string; readonly agreementPublic: string; readonly wrapperSigningPublic: string },
): Buffer {
  if (wrap.epoch !== context.epoch || wrap.by !== context.by) throw new ChannelCryptoError('WRONG_EPOCH')
  const header = wrapHeader(context)
  if (!verifyBytes(input.wrapperSigningPublic, wrapSigned(header, wrap.epk, wrap.ct), wrap.sig)) throw new ChannelCryptoError('BAD_WRAP')
  const body = bytesOfBase64(wrap.ct)
  if (body === undefined) throw new ChannelCryptoError('BAD_WRAP')
  try {
    const kek = kekOf(agree(input.agreementSecret, wrap.epk), wrap.epk, input.agreementPublic, header)
    return gcmOpen(kek, header, body, 'BAD_WRAP')
  }
  catch (error: unknown) {
    if (error instanceof ChannelCryptoError) throw error
    throw new ChannelCryptoError('BAD_WRAP')
  }
}

// ---- the keys a device holds ---------------------------------------------------------------------------------------------------------------

/** The channel keys THIS device holds, by channel and epoch. In memory only: they are rebuilt from the wraps at the edge after a restart. */
export class ChannelKeyring {
  private readonly keys = new Map<string, Buffer>()

  put(channelId: string, epoch: number, key: Uint8Array): void {
    assertKey(key)
    this.keys.set(`${channelId}\n${String(epoch)}`, Buffer.from(key))
  }

  get(channelId: string, epoch: number): Buffer | undefined {
    return this.keys.get(`${channelId}\n${String(epoch)}`)
  }

  /** @returns The newest epoch this device holds for the channel (`undefined` when it holds none: it is not a member, or was removed). */
  latest(channelId: string): { readonly epoch: number; readonly key: Buffer } | undefined {
    let best: { epoch: number; key: Buffer } | undefined
    for (const [id, key] of this.keys) {
      const [channel, epoch] = id.split('\n')
      if (channel === channelId && (best === undefined || Number(epoch) > best.epoch)) best = { epoch: Number(epoch), key }
    }
    return best
  }

  /** Forget a channel (the person left it). */
  drop(channelId: string): void {
    for (const id of [...this.keys.keys()]) if (id.startsWith(`${channelId}\n`)) this.keys.delete(id)
  }
}
