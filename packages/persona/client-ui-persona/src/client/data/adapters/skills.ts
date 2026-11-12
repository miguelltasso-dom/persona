import type { SkillView } from '@deepseek-ai/dsh-persona-host/types'
import type { SkillRecord } from '../../skills/mock-data.ts'

/**
 * P1-11: what a persona's profile may list. A skill made for ONE persona and not shared is private to her; shared ones and ones with no owner show everywhere.
 */
export function skillsOfPersona(views: readonly SkillView[], personaId: string): SkillView[] {
  return views.filter(view => view.sharedWithTeam || view.personaId === undefined || view.personaId === personaId)
}

/** Host skills → profile Skills tab. */
export function skillViewsToRecords(views: readonly SkillView[]): SkillRecord[] {
  return views.map(view => ({
    id: view.id,
    name: view.name,
    version: view.version,
    status: view.status,
    sharedWithTeam: view.sharedWithTeam,
    // The domain builds taught skills with the id `taught-<session>` (taughtDraftOf); the Playbook's offers are `learned-<note>` (makeOffer).
    ...(view.id.startsWith('taught-') ? { origin: 'taught' as const } : view.id.startsWith('learned-') ? { origin: 'learned' as const } : {}),
  }))
}
