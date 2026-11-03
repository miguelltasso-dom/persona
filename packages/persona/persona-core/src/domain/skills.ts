/**
 * Per-persona / project / team skills (E2). A skill derived from a DM
 * never becomes public.
 */

import { DomainError } from './schemas.ts'

export type SkillScope = 'persona' | 'project' | 'team'
export type SkillOrigin = 'library' | 'learned' | 'dm'

export interface SkillRecord {
  id: string
  name: string
  version: number
  scope: SkillScope
  origin: SkillOrigin
  body: string
  enabled: boolean
  personaId?: string
  projectId?: string
}

export type SkillEval = 'pass' | 'fail'

/**
 * Evaluation is not the recipe itself.
 * @param skill - Skill under review.
 * @param verdict - Independent evaluation.
 */
export function applySkillEval(skill: SkillRecord, verdict: SkillEval): SkillRecord {
  return { ...skill, enabled: verdict === 'pass' ? skill.enabled : false }
}

/**
 * @param skill - Current version.
 * @param body - Replacement body.
 */
export function nextSkillVersion(skill: SkillRecord, body: string): SkillRecord {
  return { ...skill, body, version: skill.version + 1, enabled: false }
}

/**
 * Roll back to a previous version body. Version number still increases.
 * @param skill - Current skill.
 * @param previousBody - Body to restore.
 */
export function rollbackSkill(skill: SkillRecord, previousBody: string): SkillRecord {
  return { ...skill, body: previousBody, version: skill.version + 1 }
}

/**
 * A DM-derived skill cannot be published to project or team scope.
 * @param skill - Skill to publish.
 * @param scope - Requested scope.
 */
export function publishSkill(skill: SkillRecord, scope: SkillScope): SkillRecord {
  if (skill.origin === 'dm' && scope !== 'persona') {
    throw new DomainError('ACCESS_ESCALATION', 'DM_SKILL_NOT_PUBLIC')
  }
  return { ...skill, scope }
}

export type SkillRuntime = 'dsh' | 'cli'

export interface SkillAudience {
  kind: 'channel' | 'dm'
  personaId?: string
  projectId?: string
}

export interface MaterializedSkills {
  runtime: SkillRuntime
  manifesto: { id: string; version: number }[]
  promptSection?: string
  promptPrefix?: string
  mcpResource?: { uri: string; mimeType: string; text: string }
}

/**
 * Skills that may enter a run for this audience. Candidate (`enabled: false`)
 * and DM-origin skills never leak into another audience.
 * @param skill - Skill record.
 * @param audience - Channel or DM of this run.
 */
export function skillAdmitted(skill: SkillRecord, audience: SkillAudience): boolean {
  if (!skill.enabled) return false
  if (skill.origin === 'dm') {
    return audience.kind === 'dm' && (skill.personaId === undefined || skill.personaId === audience.personaId)
  }
  if (skill.scope === 'persona') {
    return skill.personaId === undefined || skill.personaId === audience.personaId
  }
  if (skill.scope === 'project') {
    return skill.projectId === undefined || skill.projectId === audience.projectId
  }
  return true
}

/**
 * Materialize enabled, audience-safe skills for a runner.
 * `dsh` → prompt/skills section. CLI → stable prefix + MCP resource.
 * Active versions are recorded on the run manifesto.
 * @param skills - Active skill records (caller already selected the set).
 * @param runtime - Runner kind.
 * @param audience - Destination of this run.
 */
export function materializeSkills(
  skills: readonly SkillRecord[],
  runtime: SkillRuntime,
  audience: SkillAudience,
): MaterializedSkills {
  const admitted = skills.filter(skill => skillAdmitted(skill, audience))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version)
  const manifesto = admitted.map(skill => ({ id: skill.id, version: skill.version }))
  const body = admitted.map(skill => `### ${skill.name} (v${skill.version})\n${skill.body}`).join('\n\n')
  if (runtime === 'dsh') {
    const result: MaterializedSkills = { runtime, manifesto }
    if (body !== '') result.promptSection = `# Skills\n\n${body}`
    return result
  }
  const result: MaterializedSkills = { runtime, manifesto }
  if (body !== '') {
    result.promptPrefix = body
    result.mcpResource = { uri: 'persona://skills', mimeType: 'text/markdown', text: body }
  }
  return result
}
