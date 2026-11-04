import { expect, it } from 'vitest'
import {
  DomainError,
  completeOnboardingWire,
  parseCompleteOnboardingWire,
  personaSpecToOnboardingWire,
  teamTemplateById,
} from '../src/index.ts'

const template = teamTemplateById('software-dev')
if (template === undefined) throw new Error('software-dev')
const team = template.personas

it('builds the host CompleteOnboardingRequest keys (no roster/projectId)', () => {
  const wire = completeOnboardingWire({
    workspaceId: 'ws',
    personalProjectId: 'proj-pessoal',
    displayName: ' Clara ',
    team,
    cofreSeed: 'Padaria Lua',
  })
  expect(wire).toEqual({
    workspaceId: 'ws',
    personalProjectId: 'proj-pessoal',
    displayName: 'Clara',
    team: team.map(personaSpecToOnboardingWire),
    templateIds: [],
    runnerChoices: ['dsh'],
    cofreSeed: 'Padaria Lua',
  })
  expect(wire).not.toHaveProperty('roster')
  expect(wire).not.toHaveProperty('projectId')
  expect(wire).not.toHaveProperty('memberId')
  expect(parseCompleteOnboardingWire(wire)).toEqual(wire)
})

it('refuses the live-store body that remounts the overlay (DF-002)', () => {
  expect(() => parseCompleteOnboardingWire({
    workspaceId: 'ws',
    projectId: 'proj-pessoal',
    memberId: 'owner',
    displayName: 'Clara',
    roster: [{ name: 'Coordenação' }],
  })).toThrow(DomainError)
  try {
    parseCompleteOnboardingWire({
      workspaceId: 'ws',
      projectId: 'proj-pessoal',
      displayName: 'Clara',
      roster: [],
    })
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).detail).toBe('ONBOARDING_WIRE_ROSTER')
  }
  expect(() => parseCompleteOnboardingWire({
    workspaceId: 'ws',
    projectId: 'proj-pessoal',
    displayName: 'Clara',
    team: [],
  })).toThrow(/INVALID_PERSONA/)
})

it('maps a domain spec onto avatar/runner wire fields', () => {
  const coord = team.find(row => row.systemRoles.includes('coordination'))
  expect(coord).toBeDefined()
  const row = personaSpecToOnboardingWire(coord!)
  expect(row.runnerKind).toBe('dsh')
  expect(row.runnerCli).toBe('')
  expect(row.canRecruit).toBe(true)
  expect(row.systemRoles).toEqual(['coordination', 'team_manager'])
  expect(row.avatarKind).toBe('silhouette')
})
