import { expect, it } from 'vitest'
import {
  TEAM_TEMPLATES,
  assertProposalWithinCreatorAccess,
  assertUniqueCoordination,
  assignSystemRole,
  parsePersona,
  parsePersonaProposal,
  parsePersonaSpec,
  parseVaultRecord,
  personaPropose,
  proposalExceedsCreatorAccess,
  teamTemplateById,
} from '../src/index.ts'
import type { Persona, PersonaSpec } from '../src/index.ts'

const spec = (overrides: Partial<PersonaSpec> = {}): PersonaSpec => ({
  name: 'Bento',
  avatar: { kind: 'gallery', ref: 'bento' },
  title: 'Engenharia',
  description: 'Implementa.',
  personality: 'Direto.',
  instructions: 'Prove o trabalho.',
  runner: { kind: 'dsh', model: 'deepseek-chat' },
  tools: { files: 'read', shell: 'none' },
  skills: [],
  limits: { tokensPerMonth: 1000, concurrency: 1 },
  systemRoles: [],
  canRecruit: false,
  ...overrides,
})

const persona = (overrides: Partial<Persona> = {}): Persona => ({
  ...spec(),
  id: 'p1',
  workspaceId: 'ws',
  createdAt: '2026-11-03T13:00:00Z',
  updatedAt: '2026-11-03T13:00:00Z',
  createdBy: 'miguel',
  ...overrides,
})

it('parses a valid persona and rejects an empty name', () => {
  expect(parsePersona(persona()).name).toBe('Bento')
  expect(() => parsePersonaSpec({ ...spec(), name: '' })).toThrow('INVALID_PERSONA')
})

it('requires a CLI kind on a cli runner and a gallery ref', () => {
  expect(() => parsePersonaSpec({
    ...spec(),
    runner: { kind: 'cli', model: 'opus' },
  })).toThrow('INVALID_PERSONA')
  expect(() => parsePersonaSpec({
    ...spec(),
    avatar: { kind: 'gallery', ref: '' },
  })).toThrow('INVALID_PERSONA')
  expect(parsePersonaSpec({
    ...spec(),
    runner: { kind: 'cli', cli: 'claude', model: 'opus' },
  }).runner).toEqual({ kind: 'cli', cli: 'claude', model: 'opus' })
})

it('parses a vault record with provenance and visibility', () => {
  const record = parseVaultRecord({
    id: 'v1',
    workspaceId: 'ws',
    kind: 'decision',
    body: 'Publicar só com aprovação',
    factKey: 'publish',
    status: 'active',
    sourceIds: ['onboarding'],
    authorId: 'miguel',
    visibility: { kind: 'workspace' },
    createdAt: '2026-11-03T13:00:00Z',
    revision: 1,
  })
  expect(record.kind).toBe('decision')
  expect(record.visibility).toEqual({ kind: 'workspace' })
})

it('ships the five required templates, with Atlas coordinating and Luna watching', () => {
  expect(TEAM_TEMPLATES.map(template => template.id)).toEqual([
    'suggested-animals',
    'software-startup',
    'agency',
    'office',
    'blank',
  ])
  const suggested = teamTemplateById('suggested-animals')
  expect(suggested?.personas.map(item => item.name)).toEqual(['Atlas', 'Bento', 'Nina', 'Sol', 'Luna'])
  expect(suggested?.personas.find(item => item.name === 'Atlas')?.systemRoles).toEqual(['coordination'])
  expect(suggested?.personas.find(item => item.name === 'Luna')?.systemRoles).toEqual(['watchdog'])
  expect(teamTemplateById('software-startup')?.personas.some(item => item.systemRoles.includes('coordination'))).toBe(true)
  expect(teamTemplateById('blank')?.personas).toEqual([])
})

it('ships Agência and Escritório with one coordinator and one watchdog each', () => {
  const agency = teamTemplateById('agency')
  const office = teamTemplateById('office')
  expect(agency?.name).toBe('Agência')
  expect(office?.name).toBe('Escritório')
  expect(agency?.personas.filter(item => item.systemRoles.includes('coordination'))).toHaveLength(1)
  expect(agency?.personas.filter(item => item.systemRoles.includes('watchdog'))).toHaveLength(1)
  expect(office?.personas.filter(item => item.systemRoles.includes('coordination'))).toHaveLength(1)
  expect(office?.personas.filter(item => item.systemRoles.includes('watchdog'))).toHaveLength(1)
  expect(agency?.personas.some(item => item.canRecruit)).toBe(true)
  expect(office?.personas.some(item => item.canRecruit)).toBe(true)
})

it('refuses a proposal that escalates tools, CLI, limits, or coordination', () => {
  const creator = persona({
    systemRoles: [],
    canRecruit: true,
    tools: { files: 'read' },
    runner: { kind: 'dsh', model: 'deepseek-chat' },
    limits: { tokensPerMonth: 1000, concurrency: 1 },
  })
  expect(proposalExceedsCreatorAccess(creator, spec({ tools: { files: 'read' } }))).toBe(false)
  expect(() => { assertProposalWithinCreatorAccess(creator, spec({ tools: { files: 'write' } })) })
    .toThrow('ACCESS_ESCALATION')
  expect(proposalExceedsCreatorAccess(creator, spec({
    runner: { kind: 'cli', cli: 'claude', model: 'opus' },
  }))).toBe(true)
  expect(proposalExceedsCreatorAccess(creator, spec({ limits: { tokensPerMonth: 5000 } }))).toBe(true)
  expect(proposalExceedsCreatorAccess(creator, spec({ systemRoles: ['coordination'] }))).toBe(true)
  expect(proposalExceedsCreatorAccess(creator, spec({ canRecruit: true }))).toBe(false)
  expect(proposalExceedsCreatorAccess(creator, spec({ canRecruit: true, systemRoles: [] }))).toBe(false)
  const worker = persona({ canRecruit: false })
  expect(proposalExceedsCreatorAccess(worker, spec({ canRecruit: true }))).toBe(true)
})

it('parses a proposal that stays within the creator access', () => {
  const proposal = parsePersonaProposal({
    id: 'prop1',
    workspaceId: 'ws',
    creatorPersonaId: 'p1',
    spec: spec({ tools: { files: 'read' } }),
    policy: 'approval',
    status: 'pending',
    createdAt: '2026-11-03T13:00:00Z',
  })
  assertProposalWithinCreatorAccess(persona({ canRecruit: true }), proposal.spec)
  expect(proposal.policy).toBe('approval')
})

it('persona_propose never grants more access than the creator and auto-approves only inside limits', () => {
  const creator = persona({ canRecruit: true, tools: { files: 'read' } })
  const pending = personaPropose({
    id: 'prop1',
    workspaceId: 'ws',
    creator,
    spec: spec({ tools: { files: 'read' } }),
    policy: 'approval',
    createdAt: '2026-11-03T13:00:00Z',
  })
  expect(pending.status).toBe('pending')
  const hired = personaPropose({
    id: 'prop2',
    workspaceId: 'ws',
    creator,
    spec: spec({ tools: { files: 'read' } }),
    policy: 'auto',
    createdAt: '2026-11-03T13:00:00Z',
  })
  expect(hired.status).toBe('approved')
  expect(() => personaPropose({
    id: 'prop3',
    workspaceId: 'ws',
    creator,
    spec: spec({ tools: { files: 'write' } }),
    policy: 'auto',
    createdAt: '2026-11-03T13:00:00Z',
  })).toThrow('ACCESS_ESCALATION')
  expect(() => personaPropose({
    id: 'prop4',
    workspaceId: 'ws',
    creator: persona({ canRecruit: false }),
    spec: spec(),
    policy: 'approval',
    createdAt: '2026-11-03T13:00:00Z',
  })).toThrow('ACL_DENIED')
})

it('allows only one coordination assignment per workspace', () => {
  const atlas = persona({ id: 'atlas', systemRoles: ['coordination'] })
  const bento = persona({ id: 'bento', name: 'Bento' })
  expect(() => { assertUniqueCoordination([atlas, { ...bento, systemRoles: ['coordination'] }]) })
    .toThrow('COORDINATION_NOT_UNIQUE')
  assertUniqueCoordination([atlas, bento])
  const moved = assignSystemRole([atlas, bento], 'bento', 'coordination')
  expect(moved.find(item => item.id === 'bento')?.systemRoles).toEqual(['coordination'])
  expect(moved.find(item => item.id === 'atlas')?.systemRoles).toEqual([])
  assertUniqueCoordination(moved)
})
