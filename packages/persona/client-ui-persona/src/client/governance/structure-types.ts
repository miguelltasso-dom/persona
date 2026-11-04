/** Client-side structure assistant models (GOVERNANCE.md §2; host GOV-5 later). */

export type CompanyModelId =
  | 'agency'
  | 'ecommerce'
  | 'saas'
  | 'consulting'
  | 'creator'
  | 'office'

export interface SectorOption {
  readonly id: string
  readonly labelKey: string
}

export interface StructureAssistantInput {
  readonly companyModel: CompanyModelId
  /** Sector ids the user confirmed exist today. */
  readonly activeSectorIds: readonly string[]
  /** Free text: recurring weekly work (feeds heuristics only). */
  readonly weeklyWorkNotes: string
}

export interface RecommendedPersona {
  readonly id: string
  readonly name: string
  readonly jobTitle: string
  readonly sectorId: string
  readonly coordination: boolean
  readonly watchdog: boolean
}

export interface StructurePlan {
  readonly companyModel: CompanyModelId
  readonly sectors: readonly SectorOption[]
  readonly personas: readonly RecommendedPersona[]
  /** Plain-language bullets (locale keys) explaining the recommendation. */
  readonly rationaleKeys: readonly string[]
  /** Host explanation when {@link resolveStructurePlan} used Anvil GOV-5. */
  readonly explanation?: string
}
