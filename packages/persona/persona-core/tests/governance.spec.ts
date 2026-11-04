import { expect, it } from 'vitest'
import {
  DomainError,
  applyGovernanceFix,
  assessTeamHealth,
  assignPersonaCharge,
  companyModelById,
  confirmPersonaCharge,
  defaultSectorPolicy,
  escalationChain,
  inheritPersonaCharge,
  orgChart,
  parseStructureAsk,
  recommendStructure,
  resolveApproval,
  runTwoDayTest,
  type GovernanceSnapshot,
} from '../src/index.ts'

const FROM = '2026-11-03T09:00:00.000Z'

function snap(overrides: Partial<GovernanceSnapshot> = {}): GovernanceSnapshot {
  return {
    workspaceId: 'ws',
    humans: [
      { id: 'ana', name: 'Ana' },
      { id: 'bia', name: 'Bia' },
    ],
    personas: [
      { id: 'coord', title: 'Coordenação', systemRoles: ['coordination'] },
      { id: 'ops', title: 'Operações', systemRoles: [] },
    ],
    sectors: [
      { id: 'ops', workspaceId: 'ws', name: 'Operações', policy: defaultSectorPolicy() },
      { id: 'fin', workspaceId: 'ws', name: 'Contas', policy: { autonomy: 'propose', requiredApprovals: ['payment'] } },
    ],
    charges: [
      assignPersonaCharge({ personaId: 'coord', responsibleHumanId: 'ana', sectorId: 'ops' }),
      assignPersonaCharge({ personaId: 'ops', responsibleHumanId: 'ana', sectorId: 'ops', substituteHumanId: 'bia' }),
    ],
    away: [],
    routines: [
      {
        routineId: 'stand', title: 'Standup', executorPersonaId: 'ops', responsibleHumanId: 'ana',
        sectorId: 'ops', requiresApproval: false, cadence: 'daily', autonomy: 'act',
      },
    ],
    ...overrides,
  }
}

it('refuses a charge without responsável and a substituto equal to the responsável', () => {
  expect(() => assignPersonaCharge({ personaId: 'p', responsibleHumanId: '' })).toThrow(DomainError)
  try {
    assignPersonaCharge({ personaId: 'p', responsibleHumanId: 'ana', substituteHumanId: 'ana' })
    expect.unreachable()
  }
  catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).detail).toBe('substitute_is_responsible')
  }
})

it('inherits the creator charge unconfirmed until a human accepts', () => {
  const creator = assignPersonaCharge({ personaId: 'coord', responsibleHumanId: 'ana', substituteHumanId: 'bia' })
  const inherited = inheritPersonaCharge(creator, 'new')
  expect(inherited.confirmed).toBe(false)
  expect(inherited.responsibleHumanId).toBe('ana')
  expect(confirmPersonaCharge(inherited).confirmed).toBe(true)
})

it('escalates persona → Coordenação → responsável → substituto', () => {
  const hops = escalationChain(snap(), 'ops')
  expect(hops.map(row => row.kind)).toEqual(['persona', 'coordination', 'human', 'human'])
  expect(hops[1]).toMatchObject({ kind: 'coordination', personaId: 'coord' })
})

it('routes approval to the substituto when the responsável is away; waits with notice otherwise', () => {
  const away = snap({
    away: [{ humanId: 'ana', kind: 'away', from: FROM, until: '2026-11-06T09:00:00.000Z' }],
  })
  const covered = resolveApproval(away, 'ops', FROM)
  expect(covered).toMatchObject({ kind: 'human', role: 'substitute', humanId: 'bia', onBehalfOf: 'ana' })
  const lonely = resolveApproval(snap({
    charges: [assignPersonaCharge({ personaId: 'ops', responsibleHumanId: 'ana' })],
    away: [{ humanId: 'ana', kind: 'absent', from: FROM, until: '2026-11-06T09:00:00.000Z' }],
  }), 'ops', FROM)
  expect(lonely.kind).toBe('wait')
  if (lonely.kind === 'wait') expect(lonely.notice).toMatch(/espera/)
})

it('health flags missing responsável, uncovered sector, ownerless routine, single point, overload, idle', () => {
  const report = assessTeamHealth(snap({
    charges: [assignPersonaCharge({ personaId: 'coord', responsibleHumanId: 'ana', sectorId: 'ops' })],
    sectors: [
      { id: 'ops', workspaceId: 'ws', name: 'Operações', policy: defaultSectorPolicy() },
      { id: 'empty', workspaceId: 'ws', name: 'Vazio', policy: defaultSectorPolicy() },
    ],
    routines: [{ routineId: 'x', title: 'Folha', requiresApproval: true }],
    idleSince: { ops: '2026-10-20T09:00:00.000Z' },
    queueByPersona: { ops: 9 },
  }), FROM)
  const kinds = report.items.map(row => row.kind)
  expect(kinds).toContain('persona_without_responsible')
  expect(kinds).toContain('sector_without_coverage')
  expect(kinds).toContain('routine_without_owner')
  expect(kinds).toContain('single_point_of_failure')
  expect(kinds).toContain('persona_idle_long')
  expect(kinds).toContain('persona_queue_full')
  expect(report.score).toBeLessThan(100)
})

it('2-day test: with substituto the routine continues; without, it lists what waits or stops', () => {
  const covered = runTwoDayTest(snap({
    away: [{ humanId: 'ana', kind: 'away', from: FROM, until: '2026-11-06T09:00:00.000Z' }],
    routines: [{
      routineId: 'stand', title: 'Standup', executorPersonaId: 'ops', responsibleHumanId: 'ana',
      sectorId: 'ops', requiresApproval: true, cadence: 'daily',
    }],
  }), FROM)
  expect(covered.continues).toBeGreaterThan(0)
  expect(covered.stops).toBe(0)

  const broken = runTwoDayTest(snap({
    charges: [assignPersonaCharge({ personaId: 'ops', responsibleHumanId: 'ana' })],
    away: [{ humanId: 'ana', kind: 'away', from: FROM, until: '2026-11-06T09:00:00.000Z' }],
    routines: [
      {
        routineId: 'pay', title: 'Pagamento', executorPersonaId: 'ops', responsibleHumanId: 'ana',
        sectorId: 'fin', requiresApproval: true, approvalKind: 'payment', cadence: 'daily',
      },
      { routineId: 'ghost', title: 'Sem dono', requiresApproval: false, cadence: 'weekly' },
    ],
  }), FROM)
  expect(broken.stops).toBeGreaterThan(0)
  expect(broken.waits).toBeGreaterThan(0)
  expect(broken.events.some(row => row.fate === 'stops' && row.title === 'Sem dono')).toBe(true)
})

it('1-click substituto then autonomy ceiling: fix applies; raise above sector is refused', () => {
  const base = snap({
    charges: [assignPersonaCharge({ personaId: 'ops', responsibleHumanId: 'ana', sectorId: 'ops' })],
    away: [{ humanId: 'ana', kind: 'away', from: FROM, until: '2026-11-06T09:00:00.000Z' }],
    routines: [{
      routineId: 'stand', title: 'Standup', executorPersonaId: 'ops', responsibleHumanId: 'ana',
      sectorId: 'ops', requiresApproval: true, cadence: 'daily',
    }],
  })
  const waiting = runTwoDayTest(base, FROM)
  expect(waiting.waits).toBeGreaterThan(0)
  const fixed = applyGovernanceFix(base, { kind: 'set_substitute', personaId: 'ops', humanId: 'bia' })
  expect(runTwoDayTest(fixed, FROM).waits).toBe(0)
  try {
    applyGovernanceFix(base, { kind: 'raise_autonomy', routineId: 'stand', to: 'act' })
    expect.unreachable()
  }
  catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).detail).toBe('autonomy_ceiling')
  }
})

it('organogram by person and by sector keeps the coordination function at the top', () => {
  const people = orgChart(snap(), 'person')
  expect(people.rightHand?.personaId).toBe('coord')
  expect(people.groups.find(row => row.id === 'ana')?.personas.map(row => row.personaId)).toEqual(['coord', 'ops'])
  const sectors = orgChart(snap(), 'sector')
  expect(sectors.groups.find(row => row.id === 'ops')?.personas.length).toBe(2)
})

it('recommender: one persona per continuous function for three company types; never one per task', () => {
  for (const company of ['agencia', 'saas', 'escritorio'] as const) {
    const rec = recommendStructure({
      company,
      sectorNames: companyModelById(company).functions.map(row => row.sectorName),
      recurring: ['fazer banner hoje', 'Status semanal'],
    })
    expect(rec.personas.length).toBeGreaterThanOrEqual(3)
    expect(rec.personas.length).toBeLessThanOrEqual(5)
    expect(rec.personas.every(row => row.continuous)).toBe(true)
    expect(rec.tasks).toContain('fazer banner hoje')
    expect(new Set(rec.personas.map(row => row.title)).size).toBe(rec.personas.length)
    expect(rec.twoDay.events.length).toBeGreaterThan(0)
    expect(rec.org.rightHand).toBeDefined()
  }
})

it('dirty parser reads company, sectors and recurring work', () => {
  const ask = parseStructureAsk('Somos um SaaS. Setores: Produto, Suporte. Toda semana: triage, nota de versão')
  expect(ask.company).toBe('saas')
  expect(ask.sectorNames).toEqual(['Produto', 'Suporte'])
  expect(ask.recurring).toEqual(['triage', 'nota de versão'])
})
