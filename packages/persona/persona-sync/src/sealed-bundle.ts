/**
 * D-116 (Bolt): the PERSONA BUNDLE — what travels when a persona is taken to another computer ("Levar para outro computador"): her memory, her rules and her skills, sealed for ONE computer. It rides the
 * E2EE of item 23 and invents no cryptography: a random bundle key is WRAPPED for the destination's X25519 key (`wrapChannelKey`: ephemeral agreement + HKDF + AES-256-GCM, signed by the sender) and the
 * bundle is SEALED under it (`sealChannel`: AES-256-GCM, the header as AAD, signed by the sender). Persona, workspace, epoch, sender and recipient are bound into both, so a bundle moved to another
 * persona, epoch or computer fails its tag and its signature.
 *
 * What it refuses, at BOTH ends (the sender will not send it, the receiver will not accept it): an unknown field (the schema is a closed list); a credential-shaped string anywhere (a token, a private key,
 * a header with a bearer); a path that leaves its folder; anything over the size caps; a bundle past its deadline or already seen; and the PRIVATE memory of direct messages unless the creator said so (the
 * operator of the destination can read what it holds). The destination treats everything in it as DATA, never as an instruction of the sheet.
 */

import { createHash, randomBytes } from 'node:crypto'
import type { ChannelSealedPayload } from '@deepseek-ai/dsh-persona-core'
import { ChannelCryptoError, newChannelKey, openChannel, sealChannel, unwrapChannelKey, wrapChannelKey, type KeyWrap } from './channel-crypto.ts'

/** The only schema this version reads. */
export const BUNDLE_SCHEMA = 'persona-bundle/v1'
/** A bundle is worth this long from the moment it is made (Lumen: 24 h); after it the destination refuses it. */
export const BUNDLE_TTL_MS = 24 * 3_600_000
/** Caps (the whole JSON, the lists, one text, one skill). */
export const BUNDLE_MAX_BYTES = 8_000_000
export const BUNDLE_MAX_ITEMS = 5_000
export const BUNDLE_MAX_TEXT = 64_000
export const BUNDLE_MAX_SKILLS = 100
export const BUNDLE_MAX_SKILL_FILES = 200
export const BUNDLE_MAX_FILE_TEXT = 256_000

/** One thing the persona knows. */
export interface BundleMemoryItem {
  readonly id: string
  readonly kind: 'dm-rule' | 'note' | 'brain-page'
  readonly title?: string
  readonly body: string
  readonly updatedAt: string
  /** A record born in a PRIVATE direct message: it does not travel unless the creator confirmed ("levar tudo; quem cuida do PC novo pode ler"). */
  readonly privateDm?: boolean
}

/** One house rule of the persona. */
export interface BundleRule {
  readonly id: string
  readonly text: string
}

/** One file of a skill of the persona. */
export interface BundleSkillFile {
  readonly path: string
  readonly text: string
}

/** One skill of the persona. */
export interface BundleSkill {
  readonly name: string
  readonly files: readonly BundleSkillFile[]
}

/** What travels. A closed schema: nothing else is read, nothing else is sent. */
export interface PersonaBundle {
  readonly schema: typeof BUNDLE_SCHEMA
  /** Random id of this bundle (the destination remembers it: a repeat is refused). */
  readonly id: string
  readonly personaId: string
  readonly workspaceId: string
  readonly fromComputerId: string
  readonly toComputerId: string
  /** The persona's HOME epoch this bundle moves her to (must be the one the destination expects). */
  readonly epoch: number
  readonly createdAt: string
  readonly notAfter: string
  /** The creator confirmed that private DM memory may travel. */
  readonly includesPrivateDm: boolean
  /** The signed sheet, as the creator signed it (opaque here; the destination verifies it with its own rules). */
  readonly sheet: { readonly json: string; readonly signature: string; readonly signerSigningPublic: string }
  readonly memory: readonly BundleMemoryItem[]
  readonly rules: readonly BundleRule[]
  readonly skills: readonly BundleSkill[]
}

/** Why a bundle was refused. Stable, never a sentence for a person and never carrying a value. */
export type BundleRefusal =
  | 'schema' | 'too-big' | 'secret-detected' | 'bad-path' | 'private-dm' | 'expired' | 'replayed'
  | 'not-for-me' | 'wrong-persona' | 'wrong-epoch' | 'wrong-sender' | 'bad-wrap' | 'bad-signature' | 'bad-ciphertext'

/** A bundle that cannot be sent or accepted. */
export class BundleError extends Error {
  /** @param code - The stable reason. */
  constructor(readonly code: BundleRefusal) {
    super(`persona bundle refused: ${code}`)
    this.name = 'BundleError'
  }
}

/** What travels next to the ciphertext: enough to pick the keys, nothing that is trusted until the bundle is opened and compared. */
export interface BundleHeader {
  readonly personaId: string
  readonly workspaceId: string
  readonly from: string
  readonly to: string
  readonly epoch: number
}

/** The bundle sealed for ONE computer. Safe to hand to any transport: only that computer can open it. */
export interface SealedBundle {
  readonly header: BundleHeader
  readonly wrap: KeyWrap
  readonly sealed: ChannelSealedPayload
}

/** Credential-shaped text. A heuristic, said so: it exists to stop the obvious (a token pasted into a memory), not to promise that no secret ever travels. */
const SECRET_SHAPES: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bBearer\s+[a-z0-9._~+/=-]{20,}/iu,
  /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*\S{8,}/iu,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/u,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u,
]

const PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u
const ID = /^[A-Za-z0-9._:@-]{1,200}$/u

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new BundleError('schema')
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new BundleError(typeof value === 'string' ? 'too-big' : 'schema')
  if (SECRET_SHAPES.some(shape => shape.test(value))) throw new BundleError('secret-detected')
  return value
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new BundleError('schema')
  return value
}

function list(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value)) throw new BundleError('schema')
  if (value.length > max) throw new BundleError('too-big')
  return value as unknown[]
}

/**
 * Check a bundle against the closed schema, the caps, the credential shapes and the paths; return it rebuilt from the allowed fields only (nothing else survives).
 * @param value - The bundle, as built by the sender or as parsed by the receiver.
 * @returns The clean bundle.
 * @throws {BundleError} The first thing wrong with it.
 */
export function cleanBundle(value: unknown): PersonaBundle {
  if (!isObject(value)) throw new BundleError('schema')
  onlyKeys(value, ['schema', 'id', 'personaId', 'workspaceId', 'fromComputerId', 'toComputerId', 'epoch', 'createdAt', 'notAfter', 'includesPrivateDm', 'sheet', 'memory', 'rules', 'skills'])
  if (value.schema !== BUNDLE_SCHEMA) throw new BundleError('schema')
  if (typeof value.epoch !== 'number' || !Number.isSafeInteger(value.epoch) || value.epoch < 0) throw new BundleError('schema')
  if (typeof value.includesPrivateDm !== 'boolean') throw new BundleError('schema')
  const sheet = value.sheet
  if (!isObject(sheet)) throw new BundleError('schema')
  onlyKeys(sheet, ['json', 'signature', 'signerSigningPublic'])
  const memory = list(value.memory, BUNDLE_MAX_ITEMS).map((raw): BundleMemoryItem => {
    if (!isObject(raw)) throw new BundleError('schema')
    onlyKeys(raw, ['id', 'kind', 'title', 'body', 'updatedAt', 'privateDm'])
    if (raw.kind !== 'dm-rule' && raw.kind !== 'note' && raw.kind !== 'brain-page') throw new BundleError('schema')
    if (raw.privateDm !== undefined && typeof raw.privateDm !== 'boolean') throw new BundleError('schema')
    if (raw.privateDm === true && !value.includesPrivateDm) throw new BundleError('private-dm') // private DM memory does not travel unless the creator confirmed it
    return { id: id(raw.id), kind: raw.kind, ...(raw.title === undefined ? {} : { title: text(raw.title, 500) }), body: text(raw.body, BUNDLE_MAX_TEXT), updatedAt: text(raw.updatedAt, 40), ...(raw.privateDm === true ? { privateDm: true } : {}) }
  })
  const rules = list(value.rules, BUNDLE_MAX_ITEMS).map((raw): BundleRule => {
    if (!isObject(raw)) throw new BundleError('schema')
    onlyKeys(raw, ['id', 'text'])
    return { id: id(raw.id), text: text(raw.text, BUNDLE_MAX_TEXT) }
  })
  const skills = list(value.skills, BUNDLE_MAX_SKILLS).map((raw): BundleSkill => {
    if (!isObject(raw)) throw new BundleError('schema')
    onlyKeys(raw, ['name', 'files'])
    const files = list(raw.files, BUNDLE_MAX_SKILL_FILES).map((file): BundleSkillFile => {
      if (!isObject(file)) throw new BundleError('schema')
      onlyKeys(file, ['path', 'text'])
      if (typeof file.path !== 'string' || !PATH.test(file.path) || file.path.length > 200 || file.path.split('/').some(part => part === '.' || part === '..' || part.startsWith('.'))) throw new BundleError('bad-path')
      return { path: file.path, text: text(file.text, BUNDLE_MAX_FILE_TEXT) }
    })
    return { name: id(raw.name), files }
  })
  const clean: PersonaBundle = {
    schema: BUNDLE_SCHEMA, id: id(value.id), personaId: id(value.personaId), workspaceId: id(value.workspaceId), fromComputerId: id(value.fromComputerId), toComputerId: id(value.toComputerId), epoch: value.epoch,
    createdAt: text(value.createdAt, 40), notAfter: text(value.notAfter, 40), includesPrivateDm: value.includesPrivateDm,
    sheet: { json: text(sheet.json, BUNDLE_MAX_TEXT), signature: text(sheet.signature, 500), signerSigningPublic: text(sheet.signerSigningPublic, 200) },
    memory, rules, skills,
  }
  if (Buffer.byteLength(JSON.stringify(clean), 'utf8') > BUNDLE_MAX_BYTES) throw new BundleError('too-big')
  return clean
}

/** @returns A fresh random bundle id. */
export function newBundleId(): string {
  return randomBytes(16).toString('hex')
}

/** The stream a persona's bundles live on (bound into the seal and the wrap). */
const streamOf = (personaId: string): string => `persona-bundle:${personaId}`

/** @returns The SHA-256 (hex) of a bundle's canonical text: what the destination acknowledges ("recebido(e+1, digest)"). */
export function bundleDigest(bundle: PersonaBundle): string {
  return createHash('sha256').update(JSON.stringify(bundle)).digest('hex')
}

/** What the sender needs. */
export interface SealBundleInput {
  readonly bundle: PersonaBundle
  /** The sender computer's Ed25519 seed (base64url), from its Cofre. */
  readonly fromSigningSeed: string
  /** The destination's X25519 public key, read from ITS CERTIFICATE (never from the wire). */
  readonly toAgreementPublic: string
}

/**
 * Seal a bundle for ONE computer.
 * @param input - The bundle, the sender's seed and the destination's key from its certificate.
 * @returns The sealed bundle, and its digest.
 * @throws {BundleError} when the bundle may not be sent (schema, caps, a credential shape, a path, private DM without the creator's confirmation).
 */
export function sealPersonaBundle(input: SealBundleInput): { readonly sealed: SealedBundle; readonly digest: string } {
  const bundle = cleanBundle(input.bundle)
  const key = newChannelKey()
  const channelId = streamOf(bundle.personaId)
  const sealed = sealChannel({ workspaceId: bundle.workspaceId, streamId: channelId, epoch: bundle.epoch, authorId: bundle.fromComputerId, key, signingSeed: input.fromSigningSeed, plaintext: JSON.stringify(bundle) })
  const wrap = wrapChannelKey(
    { workspaceId: bundle.workspaceId, channelId, epoch: bundle.epoch, recipientId: bundle.toComputerId, by: bundle.fromComputerId },
    { key, recipientAgreementPublic: input.toAgreementPublic, signingSeed: input.fromSigningSeed },
  )
  return { sealed: { header: { personaId: bundle.personaId, workspaceId: bundle.workspaceId, from: bundle.fromComputerId, to: bundle.toComputerId, epoch: bundle.epoch }, wrap, sealed }, digest: bundleDigest(bundle) }
}

/** What the receiver needs. */
export interface OpenBundleInput {
  /** This computer's id (the bundle must be for it). */
  readonly myComputerId: string
  readonly myAgreement: { readonly secret: string; readonly publicKey: string }
  /** The sender's Ed25519 public key, from ITS CERTIFICATE (never from the bundle). */
  readonly senderSigningPublic: string
  /** What the destination expects: this persona, this workspace, this home epoch. */
  readonly expected: { readonly personaId: string; readonly workspaceId: string; readonly epoch: number; readonly from: string }
  /** Clock (tests replace it). */
  readonly now?: () => number
  /** Whether this bundle id was already accepted (a repeat is refused). */
  readonly alreadySeen?: (bundleId: string) => boolean
}

/**
 * Open a bundle meant for this computer. The order is: who it is for, what it is about, the wrap, the signature and the tag, then the schema and the comparison of the header with what was sealed.
 * @param input - Who I am, the sender's key from its certificate and what I expect.
 * @param sealedBundle - As it arrived.
 * @returns The clean bundle and its digest (the acknowledgement).
 * @throws {BundleError} with a stable reason.
 */
export function openPersonaBundle(input: OpenBundleInput, sealedBundle: SealedBundle): { readonly bundle: PersonaBundle; readonly digest: string } {
  const header = sealedBundle.header
  if (header.to !== input.myComputerId) throw new BundleError('not-for-me')
  if (header.personaId !== input.expected.personaId || header.workspaceId !== input.expected.workspaceId) throw new BundleError('wrong-persona')
  if (header.epoch !== input.expected.epoch) throw new BundleError('wrong-epoch')
  if (header.from !== input.expected.from) throw new BundleError('wrong-sender')
  const channelId = streamOf(header.personaId)
  let key: Buffer
  try {
    key = unwrapChannelKey(sealedBundle.wrap, { workspaceId: header.workspaceId, channelId, epoch: header.epoch, recipientId: input.myComputerId, by: header.from }, {
      agreementSecret: input.myAgreement.secret, agreementPublic: input.myAgreement.publicKey, wrapperSigningPublic: input.senderSigningPublic,
    })
  } catch (error) {
    throw new BundleError(error instanceof ChannelCryptoError && error.code === 'WRONG_EPOCH' ? 'wrong-epoch' : 'bad-wrap')
  }
  let plaintext: string
  try {
    plaintext = openChannel(sealedBundle.sealed, { workspaceId: header.workspaceId, streamId: channelId, key, authorSigningPublic: input.senderSigningPublic })
  } catch (error) {
    throw new BundleError(error instanceof ChannelCryptoError && error.code === 'BAD_SIGNATURE' ? 'bad-signature' : 'bad-ciphertext')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(plaintext)
  } catch (error) {
    void error
    throw new BundleError('schema')
  }
  const bundle = cleanBundle(parsed)
  // The header is a hint that nobody signed: what was SEALED must say the same.
  if (bundle.personaId !== header.personaId || bundle.workspaceId !== header.workspaceId || bundle.fromComputerId !== header.from || bundle.toComputerId !== header.to || bundle.epoch !== header.epoch) throw new BundleError('schema')
  if (bundle.toComputerId !== input.myComputerId) throw new BundleError('not-for-me')
  const now = (input.now ?? Date.now)()
  const until = Date.parse(bundle.notAfter)
  if (!Number.isFinite(until) || now >= until) throw new BundleError('expired')
  if (input.alreadySeen?.(bundle.id) === true) throw new BundleError('replayed')
  return { bundle, digest: bundleDigest(bundle) }
}
