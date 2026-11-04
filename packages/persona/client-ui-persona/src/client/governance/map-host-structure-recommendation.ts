import { DEFAULT_SECTORS } from './default-sectors.ts'
import type { StructureRecommendationHostDto } from './structure-recommendation-host-dto.ts'
import { sectorIdFromHostName } from './structure-sector-names.ts'
import type { CompanyModelId, RecommendedPersona, StructurePlan } from './structure-types.ts'

function isCoordinationTitle(title: string): boolean {
  return /coordena/i.test(title)
}

function isWatchdogTitle(title: string): boolean {
  return /vigia/i.test(title)
}

/** Host recommendation → {@link StructurePlan} for hire/onboarding UI. */
export function mapHostStructureRecommendation(
  view: StructureRecommendationHostDto,
  companyModel: CompanyModelId,
  activeSectorIds: readonly string[],
): StructurePlan {
  const sectorSet = new Set(activeSectorIds)
  for (const row of view.personas) {
    sectorSet.add(sectorIdFromHostName(row.sectorName))
  }
  const sectors = DEFAULT_SECTORS.filter(row => sectorSet.has(row.id))
  const personas: RecommendedPersona[] = view.personas.map(row => ({
    id: row.id,
    name: row.title,
    jobTitle: row.title,
    sectorId: sectorIdFromHostName(row.sectorName),
    coordination: isCoordinationTitle(row.title),
    watchdog: isWatchdogTitle(row.title),
  }))
  return {
    companyModel,
    sectors,
    personas,
    rationaleKeys: ['rationale.oneRole', 'rationale.tasksVsPersonas', 'rationale.routinesOwner', 'rationale.startSmall'],
    explanation: view.explanation,
  }
}
