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
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
  }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

const scope = { workspaceId: 'ws', projectId: 'pp' }

it('creates a flow, lists Quadros, proposes without writing, and guest cannot write', () => {
  const h = host()
  seed(h)
  const virtual = h.getProjectBoard(scope)
  expect(virtual.persisted).toBe(false)
  expect(virtual.workflow.template).toBe('simples')
  const created = h.createWorkflowFromTemplate({ ...scope, template: 'site' })
  expect(created.template).toBe('site')
  expect(h.getProjectBoard(scope).persisted).toBe(true)
  expect(h.listBoards(scope).some(row => row.projectId === 'pp' && row.counts.todo >= 0)).toBe(true)
  const proposal = h.proposeWorkflow({ ...scope, description: 'vamos contratar um candidato para a vaga' })
  expect(proposal.template).toBe('contratacao')
  expect(proposal.card.question).toMatch(/Usar este fluxo/)
  expect(h.getProjectBoard(scope).workflow.template).toBe('site')
  const accepted = h.acceptWorkflowProposal({
    ...scope,
    columns: proposal.workflow.columns,
    fields: proposal.workflow.fields,
  })
  expect(accepted.template).toBe('contratacao')
  expect(h.getProjectBoard(scope).workflow.template).toBe('contratacao')
  const later = h.proposeWorkflow({ ...scope, description: 'landing page do site' })
  expect(later.template).toBe('site')
  expect(h.rejectWorkflowProposal(scope).template).toBe('contratacao')
  expect(h.getProjectBoard(scope).workflow.template).toBe('contratacao')
  h.createMember({
    id: 'guest', workspaceId: 'ws', projectId: 'pp', displayName: 'G', handle: 'g', role: 'guest',
  })
  h.sessionMemberId = 'guest'
  expect(() => h.createWorkflowFromTemplate({ ...scope, template: 'simples' })).toThrow('forbidden')
})

it('refuses removing a column without destination in pt-BR with a stable code', async () => {
  const h = host()
  seed(h)
  h.createWorkflowFromTemplate({ ...scope, template: 'software' })
  h.postMessage({
    id: 'm-refuse', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T18:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const task = h.listTasks(scope)[0]
  expect(task).toBeDefined()
  h.moveTicket({ ...scope, ticketId: task!.id, columnId: 'software-andamento' })
  const withoutDoing = h.getProjectBoard(scope).workflow.columns.filter(column => column.id !== 'software-andamento')
  try {
    h.updateWorkflow({ ...scope, columns: withoutDoing, fields: [] })
    expect.fail('removeu coluna sem destino')
  } catch (error) {
    expect(error).toMatchObject({ code: 'column-needs-destination' })
    expect(error instanceof Error ? error.message : '').toMatch(/destino/)
    expect(error instanceof Error ? error.message : '').not.toMatch(/INVALID_WORKFLOW/)
  }
})

it('moves a ticket without losing it when the flow is edited', async () => {
  const h = host()
  seed(h)
  h.createWorkflowFromTemplate({ ...scope, template: 'software' })
  h.postMessage({
    id: 'm-board', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T18:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const task = h.listTasks(scope)[0]
  expect(task).toBeDefined()
  const moved = h.moveTicket({ ...scope, ticketId: task!.id, columnId: 'software-andamento' })
  expect(moved.card.columnId).toBe('software-andamento')
  const kept = h.getProjectBoard(scope).workflow.columns.filter(column => column.id !== 'software-sprint')
  h.updateWorkflow({
    ...scope,
    columns: kept,
    fields: [],
    destByRemoved: { 'software-sprint': 'software-backlog' },
  })
  expect(h.getProjectBoard(scope).cards.some(card => card.ticketId === task!.id)).toBe(true)
  expect(h.getProjectBoard(scope).workflow.columns.some(column => column.id === 'software-sprint')).toBe(false)
})

it('FLOW-1 allows completing an answer-only task without a folder or draft', async () => {
  const h = host()
  seed(h)
  h.postMessage({ id: 'm-no-draft', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 'no-draft' })
  await h.orchestration.flush('pp')
  const task = h.listTasks(scope)[0]
  if (task === undefined) throw new Error('missing-answer-task')
  expect((await h.reviewSummary({ ...scope, ticketId: task.id })).hasWorktree).toBe(false)
  const done = h.getProjectBoard(scope).workflow.columns.find(column => column.category === 'done')
  if (done === undefined) throw new Error('missing-done-column')
  expect(h.getProjectBoard(scope).cards.find(card => card.ticketId === task.id)?.deliveryPending).toBeUndefined()
  const moved = h.moveTicket({ ...scope, ticketId: task.id, columnId: done.id })
  expect(moved.card.category).toBe('done')
  expect(moved.card.deliveryPending).toBeUndefined()
})

it('isolates Contratação and Site boards and lists Quadros summaries', () => {
  const h = host()
  seed(h)
  expect(h.listWorkflowTemplates(scope).map(row => row.id)).toEqual([
    'contratacao', 'site', 'software', 'marketing', 'atendimento', 'simples', 'em_branco',
  ])
  h.createProject({
    id: 'hire', workspaceId: 'ws', name: 'Contratação', description: 'vagas e candidatos',
    template: 'contratacao',
  })
  h.createProject({
    id: 'web', workspaceId: 'ws', name: 'Site', description: 'landing page',
    template: 'site',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'hire', id: 'coord-hire', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord-hire')!,
    systemRoles: ['coordination'],
  }, 'hire')
  const hireTalk = h.getProjectConversation({ workspaceId: 'ws', projectId: 'hire' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'web', id: 'coord-web', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord-web')!,
    systemRoles: ['coordination'],
  }, 'web')
  const webTalk = h.getProjectConversation({ workspaceId: 'ws', projectId: 'web' })
  h.postMessage({
    id: 'm-hire', workspaceId: 'ws', projectId: 'hire', streamKind: 'channel', ownerId: hireTalk.channelId,
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 'th',
    occurredAt: '2026-11-03T18:00:00.000Z',
  })
  h.postMessage({
    id: 'm-web', workspaceId: 'ws', projectId: 'web', streamKind: 'channel', ownerId: webTalk.channelId,
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 'tw',
    occurredAt: '2026-11-03T18:00:00.000Z',
  })
  const hire = h.getProjectBoard({ workspaceId: 'ws', projectId: 'hire' })
  const web = h.getProjectBoard({ workspaceId: 'ws', projectId: 'web' })
  expect(hire.workflow.columns.some(column => column.name === 'Vaga definida')).toBe(true)
  expect(web.workflow.columns.some(column => column.name === 'Descoberta')).toBe(true)
  expect(hire.workflow.columns.some(column => column.name === 'Descoberta')).toBe(false)
  expect(web.cards.some(card => hire.cards.some(other => other.ticketId === card.ticketId))).toBe(false)
  const summaries = h.listBoards(scope)
  expect(summaries.some(row => row.projectId === 'hire' && row.projectName === 'Contratação')).toBe(true)
  expect(summaries.some(row => row.projectId === 'web' && row.projectName === 'Site')).toBe(true)
})

it('creates, plans, starts, and closes a sprint with a channel milestone', () => {
  const h = host()
  seed(h)
  const sprint = h.createSprint({
    ...scope, id: 'sp-1', name: 'S1', objective: 'Quadro no ar', endsAt: '2026-11-10T00:00:00.000Z',
  })
  expect(sprint.status).toBe('planejado')
  expect(h.planSprint({ ...scope, sprintId: 'sp-1', ticketIds: ['tk-x'] }).ticketIds).toEqual(['tk-x'])
  expect(h.startSprint({ ...scope, sprintId: 'sp-1' }).status).toBe('ativo')
  expect(h.boards.goals.list('pp').some(goal => goal.objective === 'Quadro no ar' && goal.activation === 'armed')).toBe(true)
  expect(h.sprintSummary({ ...scope, sprintId: 'sp-1' })).toMatch(/Sprint S1/)
  const closed = h.closeSprint({
    ...scope, sprintId: 'sp-1', leftover: 'next', confirmed: true,
  })
  expect(closed.pending).toBeUndefined()
  expect(closed.closed.status).toBe('encerrado')
  expect(closed.next?.status).toBe('planejado')
  const page = h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 20,
  })
  expect(page.events.some(item => item.body.includes('Sprint S1'))).toBe(true)
  expect(h.updateSprint({ ...scope, sprintId: 'sp-1', name: 'S1b' }).name).toBe('S1b')
  expect(h.deleteSprint({ ...scope, sprintId: closed.next!.id })).toBe(true)
  expect(h.listSprints(scope).some(row => row.id === closed.next!.id)).toBe(false)
})

it('opens a project conversation channel for PB-5 Conversa', () => {
  const h = host()
  seed(h)
  h.createProject({
    id: 'web', workspaceId: 'ws', name: 'Site', description: 'landing', template: 'site',
  })
  const talk = h.getProjectConversation({ workspaceId: 'ws', projectId: 'web' })
  expect(talk.channelId).toBe('geral:web')
  expect(talk.name).toBe('geral')
  expect(h.getProjectConversation({ workspaceId: 'ws', projectId: 'web' }).channelId).toBe('geral:web')
  expect(h.getProjectConversation(scope).channelId).toBe('geral')
})
