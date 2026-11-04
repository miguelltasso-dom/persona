import type { PersonaDraft } from '../persona-editor/persona-draft.ts'
import { createEmptyHireDraft } from '../hire/empty-hire-draft.ts'
import type { RecommendedPersona } from './structure-types.ts'

const CAST = ['sol', 'luna', 'capivara', 'raposa', 'tucano', 'tamandua'] as const

/** Hire editor seed from a recommended role (governance defaults applied). */
export function structureRoleToDraft(
  role: RecommendedPersona,
  index: number,
  scope: { readonly responsibleMemberId: string; readonly substituteMemberId?: string },
): PersonaDraft {
  const base = createEmptyHireDraft(CAST[index % CAST.length] ?? 'capivara')
  return {
    ...base,
    name: role.name,
    jobTitle: role.jobTitle,
    jobDescription: role.jobTitle,
    coordination: role.coordination,
    watchdog: role.watchdog,
    sectorId: role.sectorId,
    responsibleMemberId: scope.responsibleMemberId,
    substituteMemberId: scope.substituteMemberId ?? '',
  }
}
