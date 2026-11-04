import { sectorNamesForIds } from './structure-sector-names.ts'
import type { StructureAssistantInput } from './structure-types.ts'

/** Wire args shared by Anvil `recommendStructure` / `applyStructure` (GOV-5). */
export function structureRecommendRpcAsk(
  workspaceId: string,
  input: StructureAssistantInput,
): {
  readonly workspaceId: string
  readonly company: StructureAssistantInput['companyModel']
  readonly sectorNames: readonly string[]
  readonly recurring: readonly string[]
} {
  const recurring = input.weeklyWorkNotes.trim().length === 0
    ? []
    : input.weeklyWorkNotes.split(/[\n;,]+/u).map(part => part.trim()).filter(part => part.length > 0)
  return {
    workspaceId,
    company: input.companyModel,
    sectorNames: [...sectorNamesForIds(input.activeSectorIds)],
    recurring,
  }
}
