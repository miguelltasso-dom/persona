/**
 * Shareable persona / team files (.persona.json / .team.json).
 * Gallery avatar only; no credentials; no private memory; provenance + version.
 */

import { DomainError, parsePersonaSpec, type PersonaAvatar, type PersonaSpec, type TeamTemplate } from './schemas.ts'

/** File format version. Bump when existing readers cannot ignore new fields. */
export const PERSONA_SHARE_VERSION = 1

export const PERSONA_SHARE_KIND = 'persona.share' as const
export const TEAM_SHARE_KIND = 'team.share' as const

const SECRET = /(?:sk-[A-Za-z0-9_\-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._\-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|xai-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/

export interface ShareProvenance {
  source: 'persona-export' | 'team-export' | 'file-import'
  authorId: string
  exportedAt: string
}

export interface PersonaShareFile {
  version: number
  kind: typeof PERSONA_SHARE_KIND
  provenance: ShareProvenance
  spec: PersonaSpec
}

export interface TeamShareFile {
  version: number
  kind: typeof TEAM_SHARE_KIND
  provenance: ShareProvenance
  id: string
  name: string
  description: string
  personas: PersonaSpec[]
}

/**
 * @param text - Any exported string field.
 */
export function shareLooksLikeSecret(text: string): boolean {
  return SECRET.test(text)
}

function scanStrings(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (shareLooksLikeSecret(value)) throw new DomainError('SECRET_REFUSED', path)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanStrings(item, `${path}[${String(index)}]`)
    })
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) scanStrings(child, `${path}.${key}`)
  }
}

/**
 * Gallery only. Upload is stripped — private files do not travel.
 * @param avatar - Stored avatar.
 */
export function shareableAvatar(avatar: PersonaAvatar): PersonaAvatar {
  if (avatar.kind === 'gallery') return { kind: 'gallery', ref: avatar.ref }
  return { kind: 'silhouette', ref: avatar.kind === 'silhouette' ? avatar.ref : 'default' }
}

/**
 * Drop private memory and non-gallery art. Skills stay as name ids.
 * @param spec - Live persona spec.
 */
export function sanitizePersonaSpec(spec: PersonaSpec): PersonaSpec {
  const next: PersonaSpec = {
    name: spec.name,
    avatar: shareableAvatar(spec.avatar),
    title: spec.title,
    description: spec.description,
    personality: spec.personality,
    instructions: spec.instructions,
    runner: spec.runner,
    tools: { ...spec.tools },
    skills: [...spec.skills],
    limits: { ...spec.limits },
    systemRoles: [...spec.systemRoles],
    canRecruit: spec.canRecruit,
  }
  if (spec.schedule !== undefined) next.schedule = spec.schedule
  if (spec.reportsTo !== undefined) next.reportsTo = spec.reportsTo
  scanStrings(next, 'spec')
  return parsePersonaSpec(next)
}

/**
 * @param spec - Persona fields.
 * @param authorId - Exporter (never a secret).
 * @param now - ISO time.
 */
export function exportPersonaFile(spec: PersonaSpec, authorId: string, now: string): PersonaShareFile {
  const file: PersonaShareFile = {
    version: PERSONA_SHARE_VERSION,
    kind: PERSONA_SHARE_KIND,
    provenance: { source: 'persona-export', authorId, exportedAt: now },
    spec: sanitizePersonaSpec(spec),
  }
  scanStrings(file, 'persona')
  return file
}

/**
 * @param input - Team id/name/description + persona specs.
 * @param authorId - Exporter.
 * @param now - ISO time.
 */
export function exportTeamFile(
  input: Pick<TeamTemplate, 'id' | 'name' | 'description' | 'personas'> | {
    id: string
    name: string
    description: string
    personas: readonly PersonaSpec[]
  },
  authorId: string,
  now: string,
): TeamShareFile {
  const file: TeamShareFile = {
    version: PERSONA_SHARE_VERSION,
    kind: TEAM_SHARE_KIND,
    provenance: { source: 'team-export', authorId, exportedAt: now },
    id: input.id,
    name: input.name,
    description: input.description,
    personas: input.personas.map(spec => sanitizePersonaSpec(spec)),
  }
  scanStrings(file, 'team')
  return file
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new DomainError('IMPORT_REFUSED', 'not-object')
  }
  return input as Record<string, unknown>
}

/**
 * Parse a `.persona.json` document. Rejects secrets and private memory keys.
 * @param input - Unknown JSON.
 */
export function importPersonaFile(input: unknown): PersonaShareFile {
  const raw = asRecord(input)
  if (raw.version !== PERSONA_SHARE_VERSION) throw new DomainError('IMPORT_REFUSED', 'version')
  if (raw.kind !== PERSONA_SHARE_KIND) throw new DomainError('IMPORT_REFUSED', 'kind')
  if (raw.memory !== undefined || raw.vault !== undefined || raw.credentials !== undefined) {
    throw new DomainError('IMPORT_REFUSED', 'private')
  }
  scanStrings(raw, 'persona')
  const provenance = asRecord(raw.provenance)
  const authorId = provenance.authorId
  const exportedAt = provenance.exportedAt
  if (typeof authorId !== 'string' || typeof exportedAt !== 'string') {
    throw new DomainError('IMPORT_REFUSED', 'provenance')
  }
  const spec = sanitizePersonaSpec(parsePersonaSpec(raw.spec))
  return {
    version: PERSONA_SHARE_VERSION,
    kind: PERSONA_SHARE_KIND,
    provenance: { source: 'file-import', authorId, exportedAt },
    spec,
  }
}

/**
 * Parse a `.team.json` document.
 * @param input - Unknown JSON.
 */
export function importTeamFile(input: unknown): TeamShareFile {
  const raw = asRecord(input)
  if (raw.version !== PERSONA_SHARE_VERSION) throw new DomainError('IMPORT_REFUSED', 'version')
  if (raw.kind !== TEAM_SHARE_KIND) throw new DomainError('IMPORT_REFUSED', 'kind')
  if (raw.memory !== undefined || raw.vault !== undefined || raw.credentials !== undefined) {
    throw new DomainError('IMPORT_REFUSED', 'private')
  }
  scanStrings(raw, 'team')
  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 64) {
    throw new DomainError('IMPORT_REFUSED', 'id')
  }
  if (typeof raw.name !== 'string' || typeof raw.description !== 'string') {
    throw new DomainError('IMPORT_REFUSED', 'name')
  }
  const provenance = asRecord(raw.provenance)
  const authorId = provenance.authorId
  const exportedAt = provenance.exportedAt
  if (typeof authorId !== 'string' || typeof exportedAt !== 'string') {
    throw new DomainError('IMPORT_REFUSED', 'provenance')
  }
  if (!Array.isArray(raw.personas)) throw new DomainError('IMPORT_REFUSED', 'personas')
  return {
    version: PERSONA_SHARE_VERSION,
    kind: TEAM_SHARE_KIND,
    provenance: { source: 'file-import', authorId, exportedAt },
    id: raw.id,
    name: raw.name,
    description: raw.description,
    personas: raw.personas.map(row => sanitizePersonaSpec(parsePersonaSpec(row))),
  }
}

/**
 * @param file - Share document.
 */
export function personaShareJson(file: PersonaShareFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * @param file - Team share document.
 */
export function teamShareJson(file: TeamShareFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}
