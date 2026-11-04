import { describe, expect, it } from 'vitest'
import { mockLargeOrgChart } from '../src/client/governance/mock-governance.ts'

describe('mockLargeOrgChart', () => {
  it('builds 60 and 150 persona rosters', () => {
    const sixty = mockLargeOrgChart('ws', 'person', 60)
    expect(sixty.personaCount).toBe(61)
    expect(sixty.groups.reduce((n, g) => n + g.members.length, 0)).toBe(60)
    expect(sixty.rightHand?.role).toBe('Gestor de equipe')

    const large = mockLargeOrgChart('ws', 'sector', 150)
    expect(large.groups.reduce((n, g) => n + g.members.length, 0)).toBe(150)
    const names = large.groups.flatMap(g => g.members.map(m => m.name))
    expect(names.some(n => n.includes('Persona 1'))).toBe(false)
    expect(names).toContain('Luna')
  })
})
