/**
 * Share remotes: .persona.json / .team.json and CLI skill candidates.
 */

import {
  DomainError,
  defaultSkillDirIo,
  exportPersonaFile,
  exportTeamFile,
  importCliSkillCandidates,
  importPersonaFile,
  importTeamFile,
  personaShareJson,
  teamShareJson,
  TEAM_TEMPLATES,
  type PersonaSpec,
  type SkillDirIo,
} from '@deepseek-ai/dsh-persona-core'
import type { StoredPersona } from '@deepseek-ai/dsh-persona-store'
import type { ScreensHost } from './screens.ts'
import type {
  CliSkillCandidateView,
  ImportPersonaView,
  ImportTeamView,
  PersonaSpecView,
  ShareFileView,
  SkillView,
} from './types.ts'

/**
 * Map a stored persona to the shareable spec.
 * @param persona - Stored row.
 */
export function specOfPersona(persona: StoredPersona): PersonaSpec {
  const spec: PersonaSpec = {
    name: persona.name,
    avatar: persona.avatar,
    title: persona.title,
    description: persona.description,
    personality: persona.personality,
    instructions: persona.instructions,
    runner: persona.runner,
    tools: { ...persona.tools },
    skills: [...persona.skills],
    limits: { ...persona.limits },
    systemRoles: [...persona.systemRoles],
    canRecruit: persona.canRecruit,
  }
  if (persona.schedule !== undefined) spec.schedule = persona.schedule
  if (persona.reportsTo !== undefined) spec.reportsTo = persona.reportsTo
  return spec
}

/**
 * @param spec - Domain spec.
 */
export function toSpecView(spec: PersonaSpec): PersonaSpecView {
  const limits: {
    tokensPerMonth?: number
    tokensPerResponse?: number
    concurrency?: number
  } = {}
  if (spec.limits.tokensPerMonth !== undefined) limits.tokensPerMonth = spec.limits.tokensPerMonth
  if (spec.limits.tokensPerResponse !== undefined) limits.tokensPerResponse = spec.limits.tokensPerResponse
  if (spec.limits.concurrency !== undefined) limits.concurrency = spec.limits.concurrency
  return {
    name: spec.name,
    avatar: spec.avatar,
    title: spec.title,
    description: spec.description,
    personality: spec.personality,
    instructions: spec.instructions,
    runner: spec.runner,
    tools: spec.tools,
    skills: spec.skills,
    limits,
    systemRoles: spec.systemRoles,
    canRecruit: spec.canRecruit,
  }
}

/**
 * @param name - Display name.
 * @param ext - File suffix including the leading dot.
 */
export function shareFilename(name: string, ext: '.persona.json' | '.team.json'): string {
  const slug = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/g, '')
  return `${slug === '' ? 'persona' : slug}${ext}`
}

/**
 * @param persona - Stored persona.
 * @param authorId - Exporter.
 * @param now - ISO time.
 */
export function exportPersonaShare(persona: StoredPersona, authorId: string, now: string): ShareFileView {
  const file = exportPersonaFile(specOfPersona(persona), authorId, now)
  return { filename: shareFilename(persona.name, '.persona.json'), json: personaShareJson(file) }
}

/**
 * @param input - Team id/name/description + specs.
 * @param authorId - Exporter.
 * @param now - ISO time.
 */
export function exportTeamShare(
  input: { id: string; name: string; description: string; personas: readonly PersonaSpec[] },
  authorId: string,
  now: string,
): ShareFileView {
  const file = exportTeamFile(input, authorId, now)
  return { filename: shareFilename(input.name, '.team.json'), json: teamShareJson(file) }
}

/**
 * @param json - Wire JSON text.
 */
export function parseShareJson(json: string): unknown {
  try {
    return JSON.parse(json) as unknown
  } catch (error: unknown) {
    void error
    throw new DomainError('IMPORT_REFUSED', 'json')
  }
}

/**
 * Import a persona file as a pending hire proposal. Never applies it.
 * @param screens - Approval book.
 * @param input - Tenant + JSON + creator.
 */
export function importPersonaShare(
  screens: ScreensHost,
  input: { workspaceId: string; projectId: string; json: string; creatorPersonaId: string; now: string },
): ImportPersonaView {
  const file = importPersonaFile(parseShareJson(input.json))
  const id = `import:${slugId(file.spec.name)}:${input.now}`
  screens.proposeImportedPersona({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    id,
    creatorPersonaId: input.creatorPersonaId,
    spec: file.spec,
  })
  return { spec: toSpecView(file.spec) }
}

/**
 * Import a team file as pending hire proposals. Never applies them.
 * @param screens - Approval book.
 * @param input - Tenant + JSON + creator.
 */
export function importTeamShare(
  screens: ScreensHost,
  input: { workspaceId: string; projectId: string; json: string; creatorPersonaId: string; now: string },
): ImportTeamView {
  const file = importTeamFile(parseShareJson(input.json))
  const personas = file.personas.map((spec, index) => {
    const id = `import-team:${slugId(file.id)}:${String(index)}:${input.now}`
    screens.proposeImportedPersona({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      id,
      creatorPersonaId: input.creatorPersonaId,
      spec,
    })
    return toSpecView(spec)
  })
  return { personas }
}

/**
 * @param io - Skill dir IO.
 */
export function previewCliSkillViews(io: SkillDirIo = defaultSkillDirIo()): CliSkillCandidateView[] {
  return importCliSkillCandidates(io).map(row => ({
    name: row.name,
    body: row.body,
    origin: 'learned',
    enabled: false,
    source: row.source,
    skillKey: row.skillKey,
  }))
}

/**
 * Persist selected CLI skills as disabled candidates. Never enables them.
 * @param screens - Skill book.
 * @param input - Tenant, persona, keys, IO.
 */
export function proposeCliSkillViews(
  screens: ScreensHost,
  input: {
    projectId: string
    personaId: string
    skillKeys: readonly string[]
    io?: SkillDirIo
  },
): SkillView[] {
  const wanted = new Set(input.skillKeys)
  const out: SkillView[] = []
  for (const row of importCliSkillCandidates(input.io ?? defaultSkillDirIo())) {
    if (!wanted.has(row.skillKey)) continue
    const id = `cli:${row.source}:${row.skillKey}`
    out.push(screens.putCandidateSkill({
      projectId: input.projectId,
      personaId: input.personaId,
      id,
      name: row.name,
      body: row.body,
    }))
  }
  return out
}

/**
 * @param id - Built-in template id.
 */
export function specsFromTemplate(id: string): { id: string; name: string; description: string; personas: PersonaSpec[] } | undefined {
  const template = TEAM_TEMPLATES.find(item => item.id === id)
  if (template === undefined) return undefined
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    personas: [...template.personas],
  }
}

function slugId(name: string): string {
  const slug = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/g, '')
  return slug === '' ? 'persona' : slug.slice(0, 40)
}

/**
 * @param error - Domain or other.
 */
export function rethrowShare(error: unknown): never {
  if (error instanceof DomainError) throw new Error(error.code)
  throw error
}
