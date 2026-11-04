import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

it('a hire after the structure recommendation inherits its real human, sector and initiative owner', () => {
  const h = seed()
  h.sessionMemberId = 'ana'
  h.applyStructure({ workspaceId: 'ws', company: 'agencia', sectorNames: [], recurring: [] })
  h.createPersona({ workspaceId: 'ws', projectId: 'team', id: 'service', name: 'Sol', title: 'Atendimento',
    description: '', personality: '', instructions: '', avatarKind: 'gallery', avatarRef: 'sol', runnerKind: 'dsh',
    runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ops', systemRoles: [] })
  const charge = h.cards.getCharge('service')
  expect(charge?.responsibleHumanId).toBe('ana')
  expect(h.governance.gov.getSector(charge?.sectorId ?? '')?.name).toBe('Atendimento')
  expect(h.governance.gov.listRoutineCharges('ws').find(row => row.routineId === 'initiative:service'))
    .toMatchObject({ executorPersonaId: 'service', responsibleHumanId: 'ana', title: 'Iniciativa de Sol' })
  expect(h.routines.get('initiative:service')?.name).toBe('Iniciativa de Sol')
  h.routines.rename('initiative:service', 'initiative:service')
  const persona = h.product.getPersona('service')
  if (persona === undefined) throw new Error('missing-hire')
  h.governance.registerPersona(persona)
  expect(h.routines.get('initiative:service')?.name).toBe('Iniciativa de Sol')
})

it('routes a real pending approval to the substitute, records the decision, and keeps an uncovered approval waiting', () => {
  const h = seed()
  h.sessionMemberId = 'ana'
  const scope = { workspaceId: 'ws', projectId: 'team' }
  h.createVaultRecord({ ...scope, id: 'decision', kind: 'brief', body: 'Antes.', authorId: 'ana' })
  h.proposeVault({ ...scope, id: 'approval', creatorPersonaId: 'ops', recordId: 'decision', nextBody: 'Depois.' })
  const at = h.orchestration.now()
  h.setAvailability({ workspaceId: 'ws', humanId: 'ana', kind: 'away', from: at, until: '2099-01-01T00:00:00.000Z' })
  expect(h.listApprovals(scope).find(row => row.id === 'approval')?.waitNotice).toContain('fora')
  expect(() => h.decideApproval({ ...scope, id: 'approval', kind: 'vault', accept: true })).toThrow()
  h.setSubstitute({ workspaceId: 'ws', personaId: 'ops', humanId: 'bia' })
  h.sessionMemberId = 'bia'
  expect(h.listApprovals(scope).find(row => row.id === 'approval')).toMatchObject({ routedToId: 'bia', onBehalfOfId: 'ana' })
  expect(h.decideApproval({ ...scope, id: 'approval', kind: 'vault', accept: true }).status).toBe('approved')
  expect(h.screens.screens.get(scope.projectId, 'approval_decision', 'vault:approval')).toMatchObject({ actorId: 'bia', onBehalfOfId: 'ana' })
})

function seed() {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createMember({
    id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member',
  })
  h.createProject({ id: 'team', workspaceId: 'ws', name: 'Time', description: 'compartilhado' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'team', id: 'dev', name: 'Bento', title: 'Engenharia',
    description: 'Código.', personality: 'Direto.', instructions: 'Entregue.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'team', id: 'ops', name: 'Nina', title: 'Operações',
    description: 'Ops.', personality: 'Calma.', instructions: 'Organize.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
  })
  return h
}

it('getOrgChart groups by person and updates live after setResponsible/setSector', () => {
  const h = seed()
  const byPerson = h.getOrgChart({ workspaceId: 'ws', groupBy: 'person' })
  expect(byPerson.rightHand?.id).toBe('dev')
  expect(byPerson.groups.find(row => row.id === 'ana')?.members.map(row => row.id).sort()).toEqual(['dev', 'ops'])
  expect(byPerson.personaCount).toBe(2)
  expect(byPerson.humanCount).toBe(2)

  h.governance.gov.putSector({
    id: 'eng', workspaceId: 'ws', name: 'Engenharia',
    policyJson: JSON.stringify({ autonomy: 'propose', requiredApprovals: [] }),
  })
  const moved = h.setSector({ workspaceId: 'ws', personaId: 'dev', sectorId: 'eng' })
  expect(moved.groups.find(row => row.id === 'eng')?.members.map(row => row.id)).toEqual(['dev'])
  expect(h.getPersonaCard({ workspaceId: 'ws', projectId: 'team', personaId: 'dev' }).sectorName).toBe('Engenharia')

  h.setResponsible({ workspaceId: 'ws', personaId: 'ops', humanId: 'bia' })
  const after = h.getOrgChart({ workspaceId: 'ws', groupBy: 'person' })
  expect(after.groups.find(row => row.id === 'bia')?.members.map(row => row.id)).toEqual(['ops'])
})

it('health, two-day, applyFix, and ACL: only owner mutates; member can mark own away', () => {
  const h = seed()
  const health = h.getTeamHealth({ workspaceId: 'ws' })
  expect(health.findings.some(row => row.fixKind === 'set_substitute')).toBe(true)
  const sub = health.findings.find(row => row.fixKind === 'set_substitute')
  const fixed = h.applyFix({
    workspaceId: 'ws',
    findingId: sub?.id ?? 'single_point_of_failure:ana',
    fixKind: 'set_substitute',
    ...(sub?.fixTargetId === undefined ? {} : { targetId: sub.fixTargetId }),
  })
  expect(fixed.findings.some(row => row.fixKind === 'set_substitute')).toBe(false)
  expect(['dev', 'ops'].map(id => h.getPersonaCard({
    workspaceId: 'ws', projectId: 'team', personaId: id,
  }).substituteName)).toContain('Bia')

  h.governance.gov.putRoutineCharge({
    routineId: 'rt-pay', workspaceId: 'ws', title: 'Contas a pagar',
    executorPersonaId: 'dev', responsibleHumanId: 'ana', requiresApproval: true, approvalKind: 'payment',
  })
  const two = h.runTwoDayTest({ workspaceId: 'ws' })
  expect(two.rows.some(row => row.label === 'Contas a pagar')).toBe(true)

  h.sessionMemberId = 'bia'
  expect(() => h.setResponsible({ workspaceId: 'ws', personaId: 'dev', humanId: 'bia' })).toThrow('forbidden')
  const away = h.setAvailability({
    workspaceId: 'ws', humanId: 'bia', kind: 'away',
    from: '2026-11-03T00:00:00.000Z', until: '2026-11-06T00:00:00.000Z',
  })
  expect(away.groups.find(row => row.id === 'bia')?.away).toBe(true)
})

it('recommendStructure + applyStructure persist sectors; listAudit records writes', () => {
  const h = seed()
  const rec = h.recommendStructure({
    workspaceId: 'ws', company: 'saas', sectorNames: ['Produto'], recurring: ['Triage de bugs'],
  })
  expect(rec.personas.length).toBeGreaterThanOrEqual(3)
  expect(rec.personas.length).toBeLessThanOrEqual(5)
  expect(rec.explanation).toMatch(/função contínua/)
  const applied = h.applyStructure({
    workspaceId: 'ws', company: 'saas', sectorNames: ['Produto'], recurring: ['Triage de bugs'],
  })
  expect(applied.company).toBe('saas')
  expect(h.governance.gov.listSectors('ws').some(row => row.name === 'Produto')).toBe(true)
  expect(h.listAudit({ workspaceId: 'ws' }).some(row => row.action === 'apply-structure')).toBe(true)
})
