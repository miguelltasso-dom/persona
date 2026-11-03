import type { OnboardingRosterPerson } from '../remote/seed-default-team.ts'
import type { MockPersonaDraft } from './mock-data.ts'

/** Maps wizard roster rows to host onboarding payload (explicit gallery + system roles). */
export function rosterFromDrafts(drafts: readonly MockPersonaDraft[]): readonly OnboardingRosterPerson[] {
  return drafts.map((draft) => {
    const row: OnboardingRosterPerson = {
      name: draft.name,
      role: draft.role,
    }
    if (draft.galleryRef !== undefined && draft.galleryRef.length > 0) {
      return { ...row, galleryRef: draft.galleryRef, systemRoles: draft.systemRoles }
    }
    if (draft.systemRoles !== undefined && draft.systemRoles.length > 0) {
      return { ...row, systemRoles: draft.systemRoles }
    }
    return row
  })
}
