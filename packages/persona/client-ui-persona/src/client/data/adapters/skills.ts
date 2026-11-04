import type { SkillView } from '@deepseek-ai/dsh-persona-host/types'
import type { SkillRecord } from '../../skills/mock-data.ts'

/** Host skills → profile Skills tab. */
export function skillViewsToRecords(views: readonly SkillView[]): SkillRecord[] {
  return views.map(view => ({
    id: view.id,
    name: view.name,
    version: view.version,
    status: view.status,
    sharedWithTeam: view.sharedWithTeam,
    // The domain builds taught skills with the id `taught-<session>` (taughtDraftOf).
    ...(view.id.startsWith('taught-') ? { origin: 'taught' as const } : {}),
  }))
}
