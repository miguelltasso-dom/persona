/**
 * D-116 (Bolt): what a persona carries when she is taken to another computer, and what happens to her data on each side — as pure functions over small ports (a SOURCE the host reads from, a SINK it writes to,
 * an ERASER), so the mapping is proved without a host and the host's `index.ts` only hands over its stores.
 *
 * What travels (Flint F4.1, Lumen L1/L3): the pages of her second brain (visibility = her), her own skills (scope persona), and — ONLY if the creator confirmed, because the operator of the new computer can read
 * what it holds — what was said to her in a DM: the facts to remember and the rules the owner asked her to keep (Cofre records whose visibility is HER). Never: team memory, team skills, the board, the thread, the
 * project's documents, any Cofre secret, any AI session. The destination treats every item as DATA, never as an instruction of the sheet (the sheet is only valid with the creator's signature, law 3).
 *
 * What leaves the source on release is the P0-09 procedure: the persona's own records are deleted one by one and then `scrub()` runs (`secure_delete` while deleting + `VACUUM` + checkpoint `TRUNCATE` + the backups,
 * the WAL, the drafts, the activity and the used-context of her). The screen does NOT say "cripto-apagada": there is no per-persona cipher today (Lumen L5).
 */

import { BUNDLE_SCHEMA, BUNDLE_TTL_MS, newBundleId, type BundleMemoryItem, type BundleSkill, type PersonaBundle } from '@deepseek-ai/dsh-persona-sync'
import type { PersonaPreview } from './computers-service.ts'

/** One memory record of the Cofre, as far as a bundle needs it. */
export interface SourceRecord {
  readonly id: string
  readonly kind: 'brief' | 'constraint' | 'decision' | 'memory'
  readonly body: string
  readonly status: 'active' | 'revoked'
  /** `persona` = said to HER (in her DM): private to who was in it. */
  readonly visibility: { readonly kind: string; readonly personaId?: string }
  readonly createdAt: string
}

/** One page of her second brain. */
export interface SourcePage {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly status: 'active' | 'superseded'
  readonly visibility: { readonly kind: string; readonly personaId?: string }
  readonly updatedAt: string
}

/** One skill. */
export interface SourceSkill {
  readonly id: string
  readonly name: string
  readonly body: string
  /** The persona a skill was made for (taught or learned); absent = the team's. */
  readonly personaId?: string
  readonly sharedWithTeam: boolean
}

/** The signed sheet, as stored. */
export interface SourceSheet {
  readonly json: string
  readonly signature: string
  readonly signerSigningPublic: string
}

/** What the source computer holds of a persona. */
export interface PersonaDataSource {
  /** `undefined` when the persona is not here. */
  persona(personaId: string): { readonly workspaceId: string; readonly projectId: string } | undefined
  records(projectId: string): readonly SourceRecord[]
  pages(projectId: string): readonly SourcePage[]
  skills(projectId: string): readonly SourceSkill[]
  sheet(personaId: string): SourceSheet | undefined
}

const hers = (visibility: { readonly kind: string; readonly personaId?: string }, personaId: string): boolean => visibility.kind === 'persona' && visibility.personaId === personaId

/** What of her travels, by default and with the creator's confirmation. */
interface Gathered {
  readonly memory: readonly BundleMemoryItem[]
  readonly skills: readonly BundleSkill[]
  /** Items of private DM memory (they travel only with the confirmation). */
  readonly privateItems: number
}

function gather(source: PersonaDataSource, personaId: string, includesPrivateDm: boolean): Gathered | undefined {
  const where = source.persona(personaId)
  if (where === undefined) return undefined
  const memory: BundleMemoryItem[] = []
  let privateItems = 0
  for (const page of source.pages(where.projectId)) {
    if (page.status !== 'active' || !hers(page.visibility, personaId)) continue
    memory.push({ id: page.id, kind: 'brain-page', title: page.title, body: page.body, updatedAt: page.updatedAt })
  }
  for (const record of source.records(where.projectId)) {
    if (record.status !== 'active' || !hers(record.visibility, personaId) || (record.kind !== 'memory' && record.kind !== 'constraint')) continue
    privateItems += 1 // said to HER in a DM: private to who was in it
    if (includesPrivateDm) memory.push({ id: record.id, kind: record.kind === 'constraint' ? 'dm-rule' : 'note', body: record.body, updatedAt: record.createdAt, privateDm: true })
  }
  const skills = source.skills(where.projectId).filter(skill => skill.personaId === personaId && !skill.sharedWithTeam).map((skill): BundleSkill => ({ name: skill.name, files: [{ path: 'SKILL.md', text: skill.body }] }))
  return { memory, skills, privateItems }
}

/**
 * What taking her would carry, as counts (never content).
 * @param source - What this computer holds.
 * @param personaId - The persona.
 * @param openTurn - Whether a turn of hers is open (the host knows; it is cancelled when she is taken).
 * @returns The counts, or `undefined` when she is not here.
 */
export function previewOfPersona(source: PersonaDataSource, personaId: string, openTurn: boolean): PersonaPreview | undefined {
  const all = gather(source, personaId, true)
  if (all === undefined) return undefined
  const bytes = all.memory.reduce((sum, item) => sum + item.body.length + (item.title?.length ?? 0), 0) + all.skills.reduce((sum, skill) => sum + skill.files.reduce((inner, file) => inner + file.text.length, 0), 0)
  return { memoryItems: all.memory.length, rules: 0, skills: all.skills.length, bytes, openTurn, hasPrivateDm: all.privateItems > 0 }
}

/**
 * The bundle of one persona for one computer.
 * @param source - What this computer holds.
 * @param input - Who she is, where she goes, at which epoch, and whether the creator confirmed that private DM memory may travel.
 * @returns The bundle (not yet sealed), or `undefined` when she is not here or has no sheet (a persona with no signed sheet cannot be taken: the destination would refuse it).
 */
export function bundleOfPersona(
  source: PersonaDataSource,
  input: { readonly personaId: string; readonly fromComputerId: string; readonly toComputerId: string; readonly epoch: number; readonly includesPrivateDm: boolean; readonly now: number },
): PersonaBundle | undefined {
  const where = source.persona(input.personaId)
  const sheet = source.sheet(input.personaId)
  const gathered = gather(source, input.personaId, input.includesPrivateDm)
  if (where === undefined || sheet === undefined || gathered === undefined) return undefined
  return {
    schema: BUNDLE_SCHEMA, id: newBundleId(), personaId: input.personaId, workspaceId: where.workspaceId, fromComputerId: input.fromComputerId, toComputerId: input.toComputerId, epoch: input.epoch,
    createdAt: new Date(input.now).toISOString(), notAfter: new Date(input.now + BUNDLE_TTL_MS).toISOString(), includesPrivateDm: input.includesPrivateDm,
    sheet: { json: sheet.json, signature: sheet.signature, signerSigningPublic: sheet.signerSigningPublic }, memory: gathered.memory, rules: [], skills: gathered.skills,
  }
}

/** Where the destination writes what it received. Everything is keyed by ids that come from the bundle, so a repeat overwrites and never duplicates. */
export interface PersonaDataSink {
  /** Whether the persona exists here (the destination needs her row and her project before it can hold her data). */
  hasPersona(personaId: string): boolean
  putMemory(personaId: string, item: BundleMemoryItem): void
  putSkill(personaId: string, skill: BundleSkill): void
  putSheet(personaId: string, sheet: PersonaBundle['sheet']): void
}

/** Why a bundle could not be put in place. */
export class ApplyError extends Error {
  /** @param code - `no-persona-here`: the destination does not hold her row yet. */
  constructor(readonly code: 'no-persona-here') {
    super(`persona bundle not applied: ${code}`)
    this.name = 'ApplyError'
  }
}

/**
 * Put a received bundle in place on the destination. Idempotent (the same bundle twice is the same state). Nothing is active until the home book says so.
 * @param sink - Where the destination writes.
 * @param bundle - What was received, already verified.
 * @throws {ApplyError} `no-persona-here`.
 */
export function applyPersonaBundle(sink: PersonaDataSink, bundle: PersonaBundle): void {
  if (!sink.hasPersona(bundle.personaId)) throw new ApplyError('no-persona-here')
  for (const item of bundle.memory) sink.putMemory(bundle.personaId, item)
  for (const skill of bundle.skills) sink.putSkill(bundle.personaId, skill)
  sink.putSheet(bundle.personaId, bundle.sheet)
}

/** What the source erases when she is released (the host's own repositories; each call is one record). */
export interface PersonaEraser {
  eraseRecord(projectId: string, recordId: string): void
  erasePage(projectId: string, pageId: string): void
  eraseSkill(projectId: string, skillId: string): void
  /** The P0-09 procedure on the whole store: `VACUUM`, checkpoint `TRUNCATE`, the backups, the WAL, the drafts, the activity and the used-context of her. */
  scrub(personaId: string): void
}

/**
 * Release her on the source: delete what is hers, then scrub. Called ONLY after the destination holds the bundle.
 * @param source - What this computer holds.
 * @param eraser - How it deletes.
 * @param personaId - The persona.
 * @returns How many things were deleted.
 */
export function erasePersonaData(source: PersonaDataSource, eraser: PersonaEraser, personaId: string): number {
  const where = source.persona(personaId)
  if (where === undefined) return 0
  let count = 0
  for (const record of source.records(where.projectId)) if (hers(record.visibility, personaId)) { eraser.eraseRecord(where.projectId, record.id); count += 1 }
  for (const page of source.pages(where.projectId)) if (hers(page.visibility, personaId)) { eraser.erasePage(where.projectId, page.id); count += 1 }
  for (const skill of source.skills(where.projectId)) if (skill.personaId === personaId && !skill.sharedWithTeam) { eraser.eraseSkill(where.projectId, skill.id); count += 1 }
  eraser.scrub(personaId) // also when nothing was found: the scrub is what clears the drafts, the activity and the used-context
  return count
}
