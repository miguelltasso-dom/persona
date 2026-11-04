/** Subset of Anvil `StructureRecommendationView` for GOV-8 client mapping. */

export interface StructurePersonaHostDto {
  readonly id: string
  readonly title: string
  readonly sectorName: string
}

export interface StructureRecommendationHostDto {
  readonly company: string
  readonly explanation: string
  readonly personas: readonly StructurePersonaHostDto[]
}
