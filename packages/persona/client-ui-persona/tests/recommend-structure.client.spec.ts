import { describe, expect, it } from 'vitest'
import { recommendStructure } from '../src/client/governance/recommend-structure.ts'

describe('recommendStructure (GOV-8)', () => {
  it('returns 3–5 personas with exactly one coordination role for agency, ecommerce, and saas', () => {
    for (const companyModel of ['agency', 'ecommerce', 'saas'] as const) {
      const plan = recommendStructure({
        companyModel,
        activeSectorIds: [],
        weeklyWorkNotes: '',
      })
      expect(plan.personas.length).toBeGreaterThanOrEqual(3)
      expect(plan.personas.length).toBeLessThanOrEqual(5)
      expect(plan.personas.filter(row => row.coordination).length).toBe(1)
    }
  })

  it('adds support persona when weekly notes mention suporte', () => {
    const plan = recommendStructure({
      companyModel: 'creator',
      activeSectorIds: [],
      weeklyWorkNotes: 'Preciso de suporte diário aos fãs',
    })
    expect(plan.personas.some(row => row.sectorId === 'suporte')).toBe(true)
  })
})
