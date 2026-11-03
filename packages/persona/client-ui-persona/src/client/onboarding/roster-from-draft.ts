import type { OnboardingRosterPerson } from '../remote/seed-default-team.ts'
import type { MockPersonaDraft } from './mock-data.ts'

/** Maps wizard roster rows to host onboarding payload (explicit gallery + system roles). */
export function rosterFromDrafts(drafts: readonly MockPersonaDraft[]): readonly OnboardingRosterPerson[] {
  return drafts.map((draft) => {
    const row: OnboardingRosterPerson = {
      name: draft.name,
      role: draft.role,
    }
    const galleryRef = draft.galleryRef !== undefined && draft.galleryRef.length > 0 ? draft.galleryRef : undefined
    const systemRoles = draft.systemRoles !== undefined && draft.systemRoles.length > 0 ? draft.systemRoles : undefined
    if (galleryRef !== undefined && systemRoles !== undefined) {
      return { ...row, galleryRef, systemRoles }
    }
    if (galleryRef !== undefined) {
      return { ...row, galleryRef }
    }
    if (systemRoles !== undefined) {
      return { ...row, systemRoles }
    }
    return row
  })
}
