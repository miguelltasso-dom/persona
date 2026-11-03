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
