import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
    systemRoles: ['coordination', 'team_manager'],
  })
}

const spec = {
  name: 'Pipoca',
  title: 'Designer',
  description: 'Peças.',
  personality: 'Leve.',
  instructions: 'Desenhe.',
  runnerKind: 'dsh' as const,
  runnerCli: '',
  runnerModel: 'm',
  tools: {} as const,
  systemRoles: [] as const,
  canRecruit: false,
  tokensPerMonth: 0,
}

it('always_ask keeps the hire pending until approve; audit has a reason', () => {
  const h = host()
  seed(h)
  const mandate = h.getGestorMandate({ workspaceId: 'ws', personaId: 'atlas' })
  expect(mandate.approval).toBe('always_ask')
  expect(mandate.canGrantGestor).toBe(false)
  const plan = h.proposeGestorHire({
    workspaceId: 'ws',
    id: 'plan-1',
    gestorId: 'atlas',
    spec,
    reason: 'a fila de design estava com 6 tarefas',
    projectId: 'pp',
  })
  expect(plan.status).toBe('proposed')
  const channel = h.listChannels({ workspaceId: 'ws', projectId: 'pp' })[0]!
  expect(h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: channel.id,
    actorId: 'ana', afterSeq: 0, limit: 20,
  }).events.some(row => row.body.includes('[[gestor-plan:plan-1]]'))).toBe(true)
  expect(h.listTurnActivity({
    workspaceId: 'ws', projectId: 'pp', subjectId: channel.id,
  }).some(group => group.items.some(row => row.status === 'waiting' && row.kind === 'hire'))).toBe(true)
  const applied = h.approveGestorPlan({ workspaceId: 'ws', planId: 'plan-1' })
  expect(applied.status).toBe('applied')
  const audit = h.listGestorAudit({ workspaceId: 'ws' })
  expect(audit[0]?.summary).toContain('Pipoca')
  expect(audit[0]?.reason).toContain('6 tarefas')
  expect(h.getTeamHealth({ workspaceId: 'ws' }).gestorAudit[0]?.reason).toContain('6 tarefas')
  expect(h.getPersonaCard({ workspaceId: 'ws', projectId: 'pp', personaId: 'atlas' }).gestorAuditReason).toContain('6 tarefas')
})

it('second Gestor on the same scope comments instead of hiring (adversarial)', () => {
  const h = host()
  seed(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'iris', name: 'Iris', title: 'Gestor Ops',
    description: '', personality: '', instructions: '',
    avatarKind: 'gallery', avatarRef: 'luna', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
    systemRoles: ['team_manager'],
  })
  h.proposeGestorHire({
    workspaceId: 'ws', id: 'plan-a', gestorId: 'atlas', spec, reason: 'fila', projectId: 'pp',
  })
  const comment = h.proposeGestorHire({
    workspaceId: 'ws', id: 'plan-b', gestorId: 'iris', spec, reason: 'também vi a fila', projectId: 'pp',
  })
  expect(comment.status).toBe('commented')
  expect(comment.commentOnId).toBe('plan-a')
  const explicit = h.commentGestorPlan({
    workspaceId: 'ws', planId: 'plan-a', commenterId: 'iris', comment: 'prefiro o tamanduá',
  })
  expect(explicit.status).toBe('commented')
  expect(explicit.commentOnId).toBe('plan-a')
  const winner = h.resolveGestorTie({ workspaceId: 'ws', chosenId: 'plan-b' })
  expect(winner.status).toBe('proposed')
  expect(h.listGestorPlans({ workspaceId: 'ws' }).find(row => row.id === 'plan-a')?.status).toBe('rejected')
})

it('proposeGestorAllocate and proposeGestorReorganize stay pending under always_ask', () => {
  const h = host()
  seed(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'nina', name: 'Nina', title: 'Executora',
    description: '', personality: '', instructions: '',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    systemRoles: [],
  })
  const alloc = h.proposeGestorAllocate({
    workspaceId: 'ws', id: 'al-1', gestorId: 'atlas', personaId: 'nina',
    projectIds: ['pp'], reason: 'ela já conhece o site',
  })
  expect(alloc.status).toBe('proposed')
  const channel = h.listChannels({ workspaceId: 'ws', projectId: 'pp' })[0]!
  expect(h.listTurnActivity({
    workspaceId: 'ws', projectId: 'pp', subjectId: channel.id,
  }).some(group => group.items.some(row => row.id === 'act-al-1' && row.kind === 'command'))).toBe(true)
  expect(h.approveGestorPlan({ workspaceId: 'ws', planId: 'al-1' }).status).toBe('applied')
  const reorg = h.proposeGestorReorganize({
    workspaceId: 'ws', id: 're-1', gestorId: 'atlas', kind: 'pause_idle',
    targetPersonaId: 'nina', notice: 'fila vazia até segunda', reason: 'sem tarefa',
    projectId: 'pp',
  })
  expect(reorg.status).toBe('proposed')
  expect(h.approveGestorPlan({ workspaceId: 'ws', planId: 're-1' }).status).toBe('applied')
})

it('listGestorPlans returns open proposed plans', () => {
  const h = host()
  seed(h)
  h.proposeGestorHire({
    workspaceId: 'ws', id: 'plan-open', gestorId: 'atlas', spec, reason: 'fila', projectId: 'pp',
  })
  const plans = h.listGestorPlans({ workspaceId: 'ws' })
  expect(plans.some(row => row.id === 'plan-open' && row.status === 'proposed')).toBe(true)
})

it('rejectGestorPlan marks pending plan declined for chat card', () => {
  const h = host()
  seed(h)
  h.proposeGestorHire({
    workspaceId: 'ws', id: 'plan-no', gestorId: 'atlas', spec, reason: 'fila', projectId: 'pp',
  })
  const declined = h.rejectGestorPlan({ workspaceId: 'ws', planId: 'plan-no' })
  expect(declined.status).toBe('rejected')
  const plans = h.listGestorPlans({ workspaceId: 'ws' })
  expect(plans.find(row => row.id === 'plan-no')?.status).toBe('rejected')
})

it('setPersonaSystemRoles assigns team_manager and moves coordination exclusively', () => {
  const h = host()
  seed(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'bento', name: 'Bento', title: 'Eng',
    description: '', personality: '', instructions: '',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    systemRoles: [],
  })
  h.setPersonaSystemRoles({
    workspaceId: 'ws', projectId: 'pp', personaId: 'bento', systemRoles: ['coordination', 'team_manager'],
  })
  const atlas = h.listPersonas({ workspaceId: 'ws', projectId: 'pp' }).find(row => row.id === 'atlas')
  const bento = h.listPersonas({ workspaceId: 'ws', projectId: 'pp' }).find(row => row.id === 'bento')
  expect(atlas?.systemRoles.includes('coordination')).toBe(false)
  expect(bento?.systemRoles).toEqual(['coordination', 'team_manager'])
})

it('assembles a team, flow and sprint 1 from a goal sentence', () => {
  const h = host()
  seed(h)
  const pack = h.assembleTeamForGoal({
    workspaceId: 'ws',
    projectId: 'pp',
    sprintId: 'sp1',
    goal: 'Monte um time para o Site',
  })
  expect(pack.sprintName).toBe('Sprint 1')
  expect(pack.personaTitles.length).toBeGreaterThan(0)
})
