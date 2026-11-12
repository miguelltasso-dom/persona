/**
 * H23 / F4, law 3: a persona's SHEET is signed by its OWNER, and a persona only acts on a sheet that carries the owner's signature. The sheet is what decides what a persona
 * does with the owner's PC and subscription — her instructions, her tools, her engine, her limits, her roles — so a colleague (an admin, a replicated edit, a tampered
 * database row) who changes any of it without the owner's key makes the sheet stop verifying, and the owner's host refuses to run her until the owner reviews and signs again.
 *
 * Pure: the digest is a SHA-256 over a canonical form (sorted keys, set-like lists sorted, a domain tag and the persona and workspace ids, so a signature cannot be moved to
 * another persona or another team), and the signature is the owner's Ed25519 over a framed message. Cosmetic fields (name, avatar, title, description) are NOT part of the
 * sheet: renaming a persona does not need the owner's key, changing what she may do does.
 */
import { createHash } from 'node:crypto'
import { signBytes, verifyBytes } from './keys.ts'
import { frameFields } from './signature-web.ts'

/** Everything that decides what the persona may do. The caller builds it from the persona document (the host's `sheetFieldsOf`). */
export interface SheetFields {
  readonly personaId: string
  readonly workspaceId: string
  /** Her prompt. */
  readonly instructions: string
  readonly personality: string
  /** Her engine (kind, cli, model…): "the machine" she runs on. */
  readonly runner: unknown
  /** Her tools and the level of each. */
  readonly tools: Readonly<Record<string, string>>
  readonly skills: readonly string[]
  readonly limits: unknown
  readonly systemRoles: readonly string[]
  readonly canRecruit: boolean
  readonly reportsTo?: string
  readonly schedule?: unknown
}

/** What the owner's device stores next to the sheet. */
export interface SignedSheet {
  readonly v: 1
  /** The owner's member id. */
  readonly ownerId: string
  /** SHA-256 (hex) of the canonical sheet. */
  readonly digest: string
  /** Ed25519 (base64url) over the framed `ownerId`, `personaId`, `workspaceId` and `digest`. */
  readonly sig: string
}

/** `ok`: signed by the owner and unchanged. `unsigned`: never signed. `tampered`: the sheet is not what was signed. `foreign`: the signature is not the owner's. */
export type SheetVerdict = 'ok' | 'unsigned' | 'tampered' | 'foreign'

const DOMAIN = 'persona/sheet/v1'
const utf8 = new TextEncoder()

/**
 * Canonical JSON: object keys sorted at every depth, `undefined` dropped, arrays in the order given. Only what JSON can hold goes in (anything else throws: a sheet must not
 * hold a value that two machines could write differently).
 * @param value - Any JSON value.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('SHEET_NOT_JSON')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  throw new Error('SHEET_NOT_JSON')
}

/**
 * @param fields - The sheet.
 * @returns Its digest (SHA-256, hex). Set-like lists (skills, system roles) are sorted first, so their order never matters.
 */
export function sheetDigest(fields: SheetFields): string {
  const body = canonicalJson({
    instructions: fields.instructions, personality: fields.personality, runner: fields.runner, tools: fields.tools, skills: [...fields.skills].sort(), limits: fields.limits,
    systemRoles: [...fields.systemRoles].sort(), canRecruit: fields.canRecruit, reportsTo: fields.reportsTo ?? null, schedule: fields.schedule ?? null,
  })
  return createHash('sha256').update(`${DOMAIN}|${frameFields([fields.personaId, fields.workspaceId, body])}`).digest('hex')
}

function signedBytes(ownerId: string, fields: Pick<SheetFields, 'personaId' | 'workspaceId'>, digest: string): Uint8Array {
  return utf8.encode(`${DOMAIN}|${frameFields([ownerId, fields.personaId, fields.workspaceId, digest])}`)
}

/**
 * The owner signs a sheet (their device does it when they create or change the persona).
 * @param fields - The sheet.
 * @param owner - The owner's member id and the seed of their device's Ed25519 key.
 */
export function signSheet(fields: SheetFields, owner: { readonly ownerId: string; readonly signingSeed: string }): SignedSheet {
  const digest = sheetDigest(fields)
  return { v: 1, ownerId: owner.ownerId, digest, sig: signBytes(owner.signingSeed, signedBytes(owner.ownerId, fields, digest)) }
}

/**
 * Whether this sheet is the one the owner signed. Never throws: anything malformed is `foreign`.
 * @param fields - The sheet as it is NOW.
 * @param signed - What was stored when it was signed (`undefined` = never).
 * @param owner - Who must have signed it: their member id and the PUBLIC key of their device.
 */
export function checkSheet(fields: SheetFields, signed: SignedSheet | undefined, owner: { readonly ownerId: string; readonly signingPublic: string }): SheetVerdict {
  if (signed === undefined || signed === null) return 'unsigned'
  if (typeof signed !== 'object' || signed.v !== 1 || signed.ownerId !== owner.ownerId || typeof signed.digest !== 'string' || typeof signed.sig !== 'string') return 'foreign'
  // The signature first: what the owner's key did NOT sign is foreign, whatever the digest says (an attacker can write any digest, not the owner's signature).
  if (!verifyBytes(owner.signingPublic, signedBytes(signed.ownerId, fields, signed.digest), signed.sig)) return 'foreign'
  return sheetDigest(fields) === signed.digest ? 'ok' : 'tampered'
}
