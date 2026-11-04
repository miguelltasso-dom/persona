import { describe, expect, it } from 'vitest'
import { mapHostStructureRecommendation } from '../src/client/governance/map-host-structure-recommendation.ts'

describe('mapHostStructureRecommendation', () => {
  it('maps host personas into StructurePlan roles', () => {
    const plan = mapHostStructureRecommendation(
      {
        company: 'saas',
        explanation: 'Uma função contínua por persona.',
        personas: [
          { id: 'p-coord', title: 'Coordenação', sectorName: 'Produto' },
          { id: 'p-eng', title: 'Engenharia', sectorName: 'Engenharia' },
        ],
      },
      'saas',
      ['produto'],
    )
    expect(plan.personas).toHaveLength(2)
    expect(plan.personas[0]?.coordination).toBe(true)
    expect(plan.personas[1]?.sectorId).toBe('engenharia')
    expect(plan.explanation).toContain('função')
  })
})
