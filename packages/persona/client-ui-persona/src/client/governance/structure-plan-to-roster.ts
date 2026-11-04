import type { MockPersonaDraft } from '../onboarding/mock-data.ts'
import type { StructurePlan } from './structure-types.ts'

/** Onboarding step 4 roster cards from a structure recommendation. */
export function structurePlanToRoster(plan: StructurePlan): readonly MockPersonaDraft[] {
  return plan.personas.map(row => ({
    name: row.name,
    role: row.jobTitle,
    ...(row.coordination ? { systemRoles: ['coordination'] as const } : row.watchdog ? { systemRoles: ['watchdog'] as const } : {}),
  }))
}
