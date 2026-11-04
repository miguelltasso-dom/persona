import { expect, it } from 'vitest'
import {
  afterAssignmentSettled,
  applyCategoryToTicket,
  applyWorkflowEdit,
  applyBoardWorkflowEdit,
  boardCounts,
  hasPendingDelivery,
  moveToColumn,
  projectBoardCard,
  proposeWorkflow,
  REVIEW_CONFLICT_QUESTION,
  stageCategory,
  syncPlacementFromStage,
  ticketStage,
  workflowFromTemplate,
  WorkflowError,
  type Ticket,
} from '../src/index.ts'

const NOW = '2026-11-03T15:00:00.000Z'

function ticket(id: string, extra: Partial<Ticket> = {}): Ticket {
  return {
    id,
    title: id,
    decisionId: 'd1',
    mandate: {
      strength: 'explicit',
      policyVersion: 'v1',
      basis: { via: 'listed' },
      actor: { source: 'chat', id: 'ana' },
      scope: 'small',
    },
    channels: [],
    assignments: [{ id: `asg-${id}`, state: 'pending', createdAt: NOW }],
    inputs: [],
    undelivered: [],
    createdAt: NOW,
    updatedAt: NOW,
    origin: { triggerId: 'm1', triggerIds: ['m1'] },
    ...extra,
  }
}

it('each template has ordered columns with a stage category', () => {
  const hiring = workflowFromTemplate('hire', 'contratacao')
  expect(hiring.columns.map(column => column.name)).toEqual([
    'Vaga definida', 'Busca de candidatos', 'Triagem', 'Entrevistas', 'Proposta', 'Contratado', 'Descartados',
  ])
  expect(hiring.fields.some(field => field.id === 'candidato' && field.kind === 'text')).toBe(true)
  expect(workflowFromTemplate('web', 'site').columns.at(-1)?.category).toBe('done')
  expect(workflowFromTemplate('code', 'software').columns.find(column => column.id === 'software-andamento')?.wip).toBe(3)
  expect(workflowFromTemplate('ops', 'atendimento').columns.some(column => column.category === 'needs_you')).toBe(true)
  expect(workflowFromTemplate('blank', 'em_branco').columns).toEqual([])
})

it('two projects keep their own columns and tickets', () => {
  const hire = workflowFromTemplate('p-hire', 'contratacao')
  const site = workflowFromTemplate('p-site', 'site')
  const a = ticket('t-hire')
  const b = ticket('t-site')
  const seatA = syncPlacementFromStage(hire, a)
  const seatB = syncPlacementFromStage(site, b)
  expect(seatA.columnId).toBe('contratacao-vaga')
  expect(seatB.columnId).toBe('site-descoberta')
  expect(hire.columns.some(column => column.id === seatB.columnId)).toBe(false)
  expect(site.columns.some(column => column.id === seatA.columnId)).toBe(false)
})

it('automatic stage change seats the ticket on the first column of the category', () => {
  const flow = workflowFromTemplate('p', 'software')
  const ready = ticket('t1', {
    assignments: [{
      id: 'asg-t1', state: 'ended', createdAt: NOW, endedAt: NOW,
      report: { state: 'ready', summary: 'ok', at: NOW },
    }],
  })
  expect(stageCategory(ticketStage(ready))).toBe('review')
  const seat = syncPlacementFromStage(flow, ready, { projectId: 'p', ticketId: 't1', columnId: 'software-andamento' })
  expect(seat.columnId).toBe('software-revisao')
  const done = ticket('t1', { ended: { at: NOW, by: 'executor', outcome: 'completed' } })
  expect(syncPlacementFromStage(flow, done).columnId).toBe('software-pronto')
  const ask = ticket('t1', { attention: { id: 'att', question: 'Qual pasta?' } })
  expect(syncPlacementFromStage(flow, ask).columnId).toBeUndefined()
  const support = workflowFromTemplate('ops', 'atendimento')
  expect(syncPlacementFromStage(support, ask).columnId).toBe('atd-aguarda')
})

it('manual move adjusts the ticket stage to the column category', () => {
  const flow = workflowFromTemplate('p', 'simples')
  const open = ticket('t1')
  const reviewed = moveToColumn(flow, open, 'simples-feito', [], NOW)
  expect(reviewed.ticket.ended?.outcome).toBe('completed')
  expect(stageCategory(ticketStage(reviewed.ticket))).toBe('done')
  expect(reviewed.placement.columnId).toBe('simples-feito')

  const ask = moveToColumn(flow, open, 'simples-fazendo', [], NOW)
  expect(stageCategory(ticketStage(ask.ticket))).toBe('doing')

  const site = workflowFromTemplate('web', 'site')
  const attention = moveToColumn(site, open, 'site-revisao', [], NOW)
  expect(stageCategory(ticketStage(attention.ticket))).toBe('review')
})

it('WIP warns but still moves (does not lock the machine)', () => {
  const flow = workflowFromTemplate('p', 'software')
  const t1 = ticket('t1')
  const seats = [
    { projectId: 'p', ticketId: 'a', columnId: 'software-andamento' },
    { projectId: 'p', ticketId: 'b', columnId: 'software-andamento' },
    { projectId: 'p', ticketId: 'c', columnId: 'software-andamento' },
  ]
  const moved = moveToColumn(flow, t1, 'software-andamento', seats, NOW)
  expect(moved.wipWarning).toBe(true)
  expect(moved.placement.columnId).toBe('software-andamento')
  expect(stageCategory(ticketStage(moved.ticket))).toBe('doing')
})

it('editing the flow migrates tickets off a removed column', () => {
  const flow = workflowFromTemplate('p', 'simples')
  const seats = [
    { projectId: 'p', ticketId: 't1', columnId: 'simples-fazer' },
    { projectId: 'p', ticketId: 't2', columnId: 'simples-fazendo' },
  ]
  const withoutDoing = flow.columns.filter(column => column.id !== 'simples-fazendo')
  const migrated = applyWorkflowEdit(flow, withoutDoing, flow.fields, seats, {
    'simples-fazendo': 'simples-fazer',
  })
  expect(migrated.seats.find(row => row.ticketId === 't2')?.columnId).toBe('simples-fazer')
  expect(migrated.workflow.columns.map(column => column.id)).not.toContain('simples-fazendo')
})

it('keeps a removed-column destination without changing the ticket and resumes automatic mapping on review', () => {
  const flow = workflowFromTemplate('p', 'software')
  const moving = moveToColumn(flow, ticket('t1'), 'software-andamento', [], NOW)
  const unchanged = structuredClone(moving.ticket)
  const columns = flow.columns.filter(column => column.id !== 'software-andamento')
  const other = { projectId: 'p', ticketId: 't2', columnId: 'software-backlog' }
  const edited = applyBoardWorkflowEdit(flow, columns, flow.fields, [moving.placement, other], [moving.ticket], {
    'software-andamento': 'software-backlog',
  })
  const placement = edited.seats.find(seat => seat.ticketId === 't1')
  expect(placement).toMatchObject({ columnId: 'software-backlog', workflowMove: { stageCategory: 'doing' } })
  expect(edited.seats.find(seat => seat.ticketId === 't2')).toEqual(other)
  expect(moving.ticket).toEqual(unchanged)
  expect(projectBoardCard(edited.workflow, moving.ticket, placement)).toMatchObject({ category: 'doing', columnId: 'software-backlog' })
  expect(applyBoardWorkflowEdit(edited.workflow, columns, flow.fields, edited.seats, [moving.ticket])).toEqual(edited)
  const ready = ticket('t1', { assignments: [{ id: 'a', state: 'ended', createdAt: NOW,
    endedAt: NOW, report: { state: 'ready', summary: 'feito', at: NOW } }] })
  expect(projectBoardCard(edited.workflow, ready, placement).columnId).toBe('software-revisao')
  expect(syncPlacementFromStage(edited.workflow, ready, placement).workflowMove).toBeUndefined()
  const done = ticket('t1', { ended: { at: NOW, by: 'executor', outcome: 'completed' } })
  expect(projectBoardCard(edited.workflow, done, placement).columnId).toBe('software-pronto')
  expect(moveToColumn(edited.workflow, moving.ticket, 'software-revisao', edited.seats, NOW).placement.workflowMove).toBeUndefined()
})

it('migrates an automatically projected card even when its seat has never been persisted', () => {
  const flow = workflowFromTemplate('p', 'software')
  const moving = moveToColumn(flow, ticket('t1'), 'software-andamento', [], NOW).ticket
  const columns = flow.columns.filter(column => column.id !== 'software-andamento')
  expect(() => applyBoardWorkflowEdit(flow, columns, flow.fields, [], [moving])).toThrow('INVALID_WORKFLOW')
  const edited = applyBoardWorkflowEdit(flow, columns, flow.fields, [], [moving], { 'software-andamento': 'software-backlog' })
  expect(projectBoardCard(edited.workflow, moving, edited.seats[0]).columnId).toBe('software-backlog')
  expect(moving.columnId).toBe('software-andamento')
})

it('keeps unmarked placements on the existing stage mapping', () => {
  const flow = workflowFromTemplate('p', 'software')
  const moving = moveToColumn(flow, ticket('t1'), 'software-andamento', [], NOW).ticket
  const columns = flow.columns.filter(column => column.id !== 'software-andamento')
  expect(projectBoardCard({ ...flow, columns }, moving, { projectId: 'p', ticketId: 't1', columnId: 'software-backlog' }).columnId).toBeUndefined()
})

it('coordination proposes a flow from the project description', () => {
  expect(proposeWorkflow('p', 'Vamos contratar um designer e marcar entrevistas').template).toBe('contratacao')
  expect(proposeWorkflow('p', 'Landing page do produto digital').template).toBe('site')
  expect(proposeWorkflow('p', 'App com sprints e backlog').template).toBe('software')
  expect(proposeWorkflow('p', 'Coisa nenhuma').template).toBe('simples')
})

it('Vigia/puxada classify by category on three custom flows', () => {
  for (const id of ['contratacao', 'site', 'software'] as const) {
    const flow = workflowFromTemplate(`p-${id}`, id)
    const ask = ticket('t-ask', { attention: { id: 'att', question: '?' } })
    const done = ticket('t-done', { ended: { at: NOW, by: 'executor', outcome: 'completed' } })
    expect(projectBoardCard(flow, ask).category).toBe('needs_you')
    expect(syncPlacementFromStage(flow, done).columnId).toBe(flow.columns.find(column => column.category === 'done')?.id)
  }
})

it('pull and Attention still classify tickets on a custom flow', () => {
  const flow = workflowFromTemplate('ops', 'atendimento')
  const waiting = ticket('t-ask', { attention: { id: 'att', question: '?' } })
  const card = projectBoardCard(flow, waiting)
  expect(card.category).toBe('needs_you')
  expect(card.columnId).toBe('atd-aguarda')
  const pulled = afterAssignmentSettled('blocked', undefined, [{
    id: 't-next', personaId: 'bento', priority: 1, deps: [], tools: [], estimatedTokens: 10,
  }], {
    now: 0, personaId: 'bento', running: 1, maxConcurrent: 1, remainingTokens: 100, remainingRuns: 2,
    allowedTools: [], canAssign: () => true, completedIds: new Set(),
  })
  expect(pulled.next?.id).toBe('t-next')
  const counts = boardCounts(flow, [
    { projectId: 'ops', ticketId: 't-ask', columnId: 'atd-aguarda' },
    { projectId: 'ops', ticketId: 't-in', columnId: 'atd-atendimento' },
  ])
  expect(counts.needs_you).toBe(1)
  expect(counts.doing).toBe(1)
})

// FLOW-1: dragging a card whose result waits for review onto Concluído used to erase delivery/attention and orphan the draft.
function reviewReady(id: string, extra: Partial<Ticket> = {}): Ticket {
  return ticket(id, {
    assignments: [{
      id: `asg-${id}`, state: 'ended', createdAt: NOW, endedAt: NOW,
      report: { state: 'ready', summary: 'Cardápio novo pronto', at: NOW },
    }],
    ...extra,
  })
}

function refusal(run: () => unknown): WorkflowError {
  try {
    run()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(WorkflowError)
    return error as WorkflowError
  }
  throw new Error('expected a delivery_pending refusal')
}

it('FLOW-1: a card with a result waiting for review cannot enter Concluído, and nothing is erased', () => {
  const flow = workflowFromTemplate('p', 'software')
  const waiting = reviewReady('t1')
  const before = structuredClone(waiting)
  const failure = refusal(() => moveToColumn(flow, waiting, 'software-pronto', [], NOW))
  expect(failure.code).toBe('delivery_pending')
  expect(failure.columnId).toBe('software-pronto')
  expect(failure.ticketId).toBe('t1')
  expect(waiting).toEqual(before) // input untouched: still open, report ready, same assignments
  expect(stageCategory(ticketStage(waiting))).toBe('review')
})

it('FLOW-1: the guard also covers a failed hand-over and an open question on a ready card', () => {
  const flow = workflowFromTemplate('p', 'software')
  const conflicted = reviewReady('t2', {
    delivery: { error: 'conflict', at: NOW },
    attention: { id: 'att-t2', question: 'Qual versão fica?' },
  })
  const before = structuredClone(conflicted)
  expect(refusal(() => moveToColumn(flow, conflicted, 'software-pronto', [], NOW)).code).toBe('delivery_pending')
  expect(refusal(() => applyCategoryToTicket(conflicted, 'done', NOW)).code).toBe('delivery_pending')
  expect(conflicted).toEqual(before)
  expect(conflicted.delivery?.error).toBe('conflict')
  expect(conflicted.attention?.question).toBe('Qual versão fica?')
})

it('FLOW-1: without a result waiting, Concluído works as before', () => {
  const flow = workflowFromTemplate('p', 'software')
  const running = ticket('t3', {
    assignments: [{ id: 'asg-t3', state: 'running', createdAt: NOW, startedAt: NOW, report: { state: 'progress', summary: '', at: NOW } }],
    attention: { id: 'att-t3', question: 'Pode seguir?' },
    delivery: { error: 'offline', at: NOW },
  })
  const done = moveToColumn(flow, running, 'software-pronto', [], NOW)
  expect(done.ticket.ended).toEqual({ at: NOW, by: 'human', outcome: 'completed' })
  expect(done.ticket.attention).toBeUndefined()
  expect(done.ticket.delivery).toBeUndefined()
  expect(done.placement.columnId).toBe('software-pronto')
  const fresh = moveToColumn(flow, ticket('t4'), 'software-pronto', [], NOW)
  expect(fresh.ticket.ended?.outcome).toBe('completed')
  // an ended card dragged back onto Concluído is not a loss
  const ended = ticket('t5', { ended: { at: NOW, by: 'executor', outcome: 'completed' } })
  expect(moveToColumn(flow, ended, 'software-pronto', [], NOW).ticket.ended?.outcome).toBe('completed')
})

it('FLOW-1: moving a waiting card to any other column never touches its delivery or ends it', () => {
  const flow = workflowFromTemplate('p', 'atendimento')
  for (const column of flow.columns.filter(item => item.category !== 'done')) {
    const waiting = reviewReady('t6', { delivery: { error: 'conflict', at: NOW } })
    const moved = moveToColumn(flow, waiting, column.id, [], NOW)
    expect(moved.ticket.ended, column.id).toBeUndefined()
    expect(moved.ticket.delivery, column.id).toEqual({ error: 'conflict', at: NOW })
    expect(waiting.delivery?.error).toBe('conflict')
  }
})

it('FLOW-1b: a draft whose Aplicar hit a conflict is still pending; a worker that is merely blocked is not', () => {
  const flow = workflowFromTemplate('p', 'software')
  const blockedBy = (question: string): Ticket => ticket('t12', {
    assignments: [{ id: 'asg-t12', state: 'running', createdAt: NOW, report: { state: 'blocked', summary: 'x', at: NOW } }],
    attention: { id: 'att-t12', question },
  })
  const conflicted = blockedBy(`${REVIEW_CONFLICT_QUESTION} CONFLICT (content): Merge conflict in README`)
  const before = structuredClone(conflicted)
  expect(hasPendingDelivery(conflicted)).toBe(true)
  expect(refusal(() => moveToColumn(flow, conflicted, 'software-pronto', [], NOW)).code).toBe('delivery_pending')
  expect(conflicted).toEqual(before)
  // a worker asking a question has no result waiting: the card can still be closed
  expect(hasPendingDelivery(blockedBy('Qual pasta uso?'))).toBe(false)
  expect(moveToColumn(flow, blockedBy('Qual pasta uso?'), 'software-pronto', [], NOW).ticket.ended?.outcome).toBe('completed')
  // the conflict question on a newer assignment that is working again no longer counts
  const retried = blockedBy(`${REVIEW_CONFLICT_QUESTION} x`)
  retried.assignments = [...retried.assignments, { id: 'asg-t12-2', state: 'running', createdAt: NOW, startedAt: NOW }]
  expect(hasPendingDelivery(retried)).toBe(false)
})

it('FLOW-1: the host may say no draft exists (task without a folder); hasPendingDelivery is the default', () => {
  const flow = workflowFromTemplate('p', 'software')
  const waiting = reviewReady('t7')
  expect(hasPendingDelivery(waiting)).toBe(true)
  expect(moveToColumn(flow, waiting, 'software-pronto', [], NOW, { deliveryPending: false }).ticket.ended?.outcome).toBe('completed')
  expect(refusal(() => moveToColumn(flow, ticket('t8'), 'software-pronto', [], NOW, { deliveryPending: true })).code).toBe('delivery_pending')
  expect(hasPendingDelivery(ticket('t9'))).toBe(false)
  expect(hasPendingDelivery(reviewReady('t10', { ended: { at: NOW, by: 'human', outcome: 'completed' } }))).toBe(false)
  const followUp = reviewReady('t11')
  followUp.assignments = [...followUp.assignments, { id: 'asg-t11-2', state: 'running', createdAt: NOW, startedAt: NOW }]
  expect(hasPendingDelivery(followUp)).toBe(false) // a newer assignment is working: nothing waits on the person
})
