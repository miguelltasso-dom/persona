/**
 * Project boards: workflow, seats, sprints (PB-4). Domain math stays in core/engine.
 */

import {
  DomainError,
  WORKFLOW_TEMPLATES,
  boardCounts,
  openSprint,
  parseWorkflowProposal,
  planSprint,
  proposeWorkflow,
  sprintDaysLeft,
  workflowFromTemplate,
  workflowRefusalText,
  type ProjectWorkflow,
  type Sprint,
  type TicketBoardSeat,
  type WorkflowColumn,
  type WorkflowField,
  type WorkflowTemplateId,
} from '@deepseek-ai/dsh-persona-core'
import {
  bindSprintGoal,
  applyBoardWorkflowEdit,
  syncPlacementFromStage,
  closeSprint,
  MemoryGoalBoard,
  moveToColumn,
  projectBoardCard,
  WorkflowError,
  type Ticket,
} from '@deepseek-ai/dsh-persona-engine'
import type { EventRepos, ProductRepos, SqliteBoardRepos } from '@deepseek-ai/dsh-persona-store'
import type { Orchestration } from './orchestration.ts'
import type {
  BoardCardView,
  BoardSummaryView,
  CloseSprintView,
  CreateSprintRequest,
  CreateWorkflowRequest,
  MoveTicketView,
  PlanSprintRequest,
  ProjectBoardView,
  ProposeWorkflowRequest,
  SprintGoalView,
  SprintView,
  UpdateSprintRequest,
  UpdateWorkflowRequest,
  AcceptWorkflowProposalRequest,
  WorkflowProposalView,
  WorkflowTemplateView,
  WorkflowView,
} from './types.ts'

const TEMPLATES: readonly WorkflowTemplateId[] = [
  'contratacao', 'site', 'software', 'marketing', 'atendimento', 'simples', 'em_branco',
]

/**
 * Store-backed board operations. The Remote layer adds ACL.
 */
export class BoardsHost {
  readonly product: ProductRepos
  readonly events: EventRepos
  readonly board: SqliteBoardRepos
  readonly orchestration: Orchestration
  readonly goals: MemoryGoalBoard = new MemoryGoalBoard()

  /**
   * @param product - Projects.
   * @param events - Channel log (sprint milestone).
   * @param board - SQLite board.
   * @param orchestration - Engine tickets.
   */
  constructor(
    product: ProductRepos,
    events: EventRepos,
    board: SqliteBoardRepos,
    orchestration: Orchestration,
  ) {
    this.product = product
    this.events = events
    this.board = board
    this.orchestration = orchestration
  }

  /**
   * @param projectId - Tenant.
   */
  getProjectBoard(projectId: string): ProjectBoardView {
    const project = this.product.getProject(projectId)
    const stored = this.board.get(projectId)
    const workflow = stored ?? workflowFromTemplate(projectId, 'simples')
    const tickets = this.tickets(projectId)
    const seats = this.board.list(projectId)
    for (const ticket of tickets) {
      const previous = seats.find(seat => seat.ticketId === ticket.id)
      const category = projectBoardCard(workflow, ticket, previous).category
      if (previous?.workflowMove?.stageCategory === category) continue
      if (previous?.workflowMove === undefined
        && workflow.columns.find(column => column.id === previous?.columnId)?.category === category) continue
      const synced = syncPlacementFromStage(workflow, ticket, previous)
      if (JSON.stringify(previous) !== JSON.stringify(synced)) this.board.save(synced)
    }
    const cards = tickets.map(ticket => toCard(
      workflow, ticket, this.board.of(ticket.id), this.topicOf(projectId, ticket.id),
    ))
    const current = this.board.current(projectId)
    return {
      projectId,
      projectName: project?.name ?? projectId,
      workflow: toWorkflowView(workflow),
      persisted: stored !== undefined,
      cards,
      counts: boardCounts(workflow, seatsForCounts(workflow, tickets, seats)),
      ...(current === undefined ? {} : { currentSprint: toSprintView(current, this.orchestration.now()) }),
    }
  }

  /**
   * Built-in flow catalog (pt-BR names).
   */
  listWorkflowTemplates(): WorkflowTemplateView[] {
    return WORKFLOW_TEMPLATES.map(row => ({
      id: row.id,
      name: row.name,
      columns: row.columns.map(column => ({
        id: column.id,
        name: column.name,
        category: column.category,
        ...(column.color === undefined ? {} : { color: column.color }),
        ...(column.icon === undefined ? {} : { icon: column.icon }),
        ...(column.wip === undefined ? {} : { wip: column.wip }),
      })),
      fields: row.fields.map(field => ({
        id: field.id,
        name: field.name,
        kind: field.kind,
        ...(field.options === undefined ? {} : { options: field.options }),
      })),
    }))
  }

  /**
   * Mini-summary per project in the workspace.
   * @param workspaceId - Workspace.
   */
  listBoards(workspaceId: string): BoardSummaryView[] {
    return this.product.listProjects(workspaceId).map((project) => {
      const board = this.getProjectBoard(project.id)
      return {
        projectId: project.id,
        projectName: project.name,
        counts: board.counts,
        workingNow: unique(board.cards
          .filter(card => card.category === 'doing')
          .map(card => this.tickets(project.id).find(ticket => ticket.id === card.ticketId)?.execution?.name ?? '')
          .filter(name => name !== '')),
        ...(board.currentSprint === undefined ? {} : { currentSprintName: board.currentSprint.name }),
      }
    })
  }

  /**
   * Persist a built-in template. Does not run from a proposal until the person accepts.
   * @param request - Tenant + template.
   */
  createWorkflowFromTemplate(request: CreateWorkflowRequest): WorkflowView {
    if (!isTemplate(request.template)) throw new Error('invalid-template')
    const workflow = workflowFromTemplate(request.projectId, request.template)
    this.board.save(workflow)
    return toWorkflowView(workflow)
  }

  /**
   * Replace columns. Tickets on a removed column need a remaining destination.
   * @param request - New columns and destination map.
   */
  updateWorkflow(request: UpdateWorkflowRequest): WorkflowView {
    const current = this.board.get(request.projectId) ?? workflowFromTemplate(request.projectId, 'simples')
    const currentSeats = this.board.list(request.projectId)
    try {
      const edited = applyBoardWorkflowEdit(
        current,
        request.columns.map(toColumn),
        request.fields.map(toField),
        currentSeats,
        this.tickets(request.projectId),
        request.destByRemoved ?? {},
      )
      this.board.store.tx(() => {
        this.board.save(edited.workflow)
        for (const seat of edited.seats) this.board.save(seat)
      })
      return toWorkflowView(edited.workflow)
    } catch (error: unknown) {
      throw mapBoardError(error)
    }
  }

  /**
   * Move a ticket onto a column. WIP is a warning.
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   * @param columnId - Destination.
   */
  moveTicket(projectId: string, ticketId: string, columnId: string): MoveTicketView {
    const ticket = this.orchestration.runtime(projectId).repo.tickets.get(ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    const workflow = this.board.get(projectId) ?? workflowFromTemplate(projectId, 'simples')
    try {
      const moved = moveToColumn(
        workflow, ticket, columnId, this.board.list(projectId), this.orchestration.now(),
      )
      this.orchestration.runtime(projectId).repo.tickets.save(moved.ticket)
      this.board.save(moved.placement)
      return {
        card: toCard(workflow, moved.ticket, moved.placement, this.topicOf(projectId, moved.ticket.id)),
        wipWarning: moved.wipWarning,
      }
    } catch (error: unknown) {
      throw mapBoardError(error)
    }
  }

  /**
   * @param projectId - Tenant.
   */
  listSprints(projectId: string): SprintView[] {
    this.hydrateGoals(projectId)
    const now = this.orchestration.now()
    return this.board.listSprints(projectId).map(row => toSprintView(row, now))
  }

  /**
   * Goals bound from SQLite sprints (survives host remount).
   * @param projectId - Tenant.
   */
  listSprintGoals(projectId: string): SprintGoalView[] {
    this.hydrateGoals(projectId)
    return this.goals.list(projectId).map(goal => ({
      id: goal.id,
      projectId: goal.projectId,
      objective: goal.objective,
      phase: goal.phase,
      activation: goal.activation,
    }))
  }

  /**
   * @param request - Identity and copy.
   */
  createSprint(request: CreateSprintRequest): SprintView {
    const sprint = openSprint({
      id: request.id,
      projectId: request.projectId,
      name: request.name,
      objective: request.objective,
      ...(request.startsAt === undefined ? {} : { startsAt: request.startsAt }),
      ...(request.endsAt === undefined ? {} : { endsAt: request.endsAt }),
    })
    this.board.saveSprint(sprint)
    return toSprintView(sprint, this.orchestration.now())
  }

  /**
   * @param request - Sprint + ticket ids.
   */
  planSprint(request: PlanSprintRequest): SprintView {
    const current = this.board.listSprints(request.projectId).find(row => row.id === request.sprintId)
    if (current === undefined) throw new Error('sprint-not-found')
    const next = planSprint(current, request.ticketIds)
    this.board.saveSprint(next)
    return toSprintView(next, this.orchestration.now())
  }

  /**
   * Mark the sprint active.
   * @param projectId - Tenant.
   * @param sprintId - Sprint.
   */
  startSprint(projectId: string, sprintId: string): SprintView {
    const current = this.board.listSprints(projectId).find(row => row.id === sprintId)
    if (current === undefined) throw new Error('sprint-not-found')
    const next: Sprint = { ...current, status: 'ativo' }
    this.board.saveSprint(next)
    this.hydrateGoals(projectId)
    bindSprintGoal(this.goals, next)
    return toSprintView(next, this.orchestration.now())
  }

  /**
   * Rename or redate a sprint.
   * @param request - Fields to replace.
   */
  updateSprint(request: UpdateSprintRequest): SprintView {
    const current = this.board.listSprints(request.projectId).find(row => row.id === request.sprintId)
    if (current === undefined) throw new Error('sprint-not-found')
    const next: Sprint = {
      ...current,
      name: request.name ?? current.name,
      objective: request.objective ?? current.objective,
    }
    if (request.startsAt !== undefined) next.startsAt = request.startsAt
    if (request.endsAt !== undefined) next.endsAt = request.endsAt
    this.board.saveSprint(next)
    return toSprintView(next, this.orchestration.now())
  }

  /**
   * @param projectId - Tenant.
   * @param sprintId - Sprint.
   */
  deleteSprint(projectId: string, sprintId: string): boolean {
    const current = this.board.listSprints(projectId).find(row => row.id === sprintId)
    if (current === undefined) throw new Error('sprint-not-found')
    this.board.deleteSprint(sprintId)
    return true
  }

  /**
   * Close after the person confirms leftover destination. Posts the summary on the first channel.
   * @param request - Sprint + leftover + confirm.
   */
  closeSprint(request: {
    projectId: string
    sprintId: string
    leftover: 'next' | 'backlog'
    confirmed: boolean
    workspaceId: string
  }): CloseSprintView {
    const current = this.board.listSprints(request.projectId).find(row => row.id === request.sprintId)
    if (current === undefined) throw new Error('sprint-not-found')
    const result = closeSprint(
      current,
      this.tickets(request.projectId),
      request.leftover,
      this.orchestration.now(),
      request.confirmed,
    )
    if (result.pending === true) {
      return {
        summary: result.summary,
        closed: toSprintView(result.closed, this.orchestration.now()),
        rolledIds: result.rolledIds,
        pending: true,
      }
    }
    this.board.saveSprint(result.closed)
    if (result.next !== undefined) this.board.saveSprint(result.next)
    this.postMilestone(request.workspaceId, request.projectId, result.summary)
    return {
      summary: result.summary,
      closed: toSprintView(result.closed, this.orchestration.now()),
      rolledIds: result.rolledIds,
      ...(result.next === undefined ? {} : { next: toSprintView(result.next, this.orchestration.now()) }),
    }
  }

  /**
   * Peak-end digest for an existing sprint.
   * @param projectId - Tenant.
   * @param sprintId - Sprint.
   */
  sprintSummary(projectId: string, sprintId: string): string {
    const current = this.board.listSprints(projectId).find(row => row.id === sprintId)
    if (current === undefined) throw new Error('sprint-not-found')
    return closeSprint(current, this.tickets(projectId), 'backlog', this.orchestration.now(), false).summary
  }

  /**
   * Propose a flow from the project description. Never writes.
   * @param request - Description or Coordination JSON blob.
   */
  proposeWorkflow(request: ProposeWorkflowRequest): WorkflowProposalView {
    const parsed = parseWorkflowProposal(request.projectId, request.description)
    if (!('degraded' in parsed)) return toProposalView(parsed)
    const fallback = proposeWorkflow(request.projectId, request.description)
    if (request.description.trim().startsWith('{') || request.description.includes('```')) {
      return { ...toProposalView(fallback), reason: parsed.reason, degraded: true }
    }
    return toProposalView(fallback)
  }

  /**
   * Apply the accepted card. The only write on the proposal path.
   * @param request - Columns from the card + dest map.
   */
  acceptWorkflowProposal(request: AcceptWorkflowProposalRequest): WorkflowView {
    const current = this.board.get(request.projectId) ?? workflowFromTemplate(request.projectId, 'simples')
    try {
      const edited = applyBoardWorkflowEdit(
        current,
        request.columns.map(toColumn),
        request.fields.map(toField),
        this.board.list(request.projectId),
        this.tickets(request.projectId),
        request.destByRemoved ?? {},
      )
      const inferred = inferTemplate(request.columns)
      const chosen = request.template !== undefined && isTemplate(request.template)
        ? request.template
        : inferred ?? edited.workflow.template
      const workflow = { ...edited.workflow, template: chosen }
      this.board.store.tx(() => {
        this.board.save(workflow)
        for (const seat of edited.seats) this.board.save(seat)
      })
      return toWorkflowView(workflow)
    } catch (error: unknown) {
      throw mapBoardError(error)
    }
  }

  /**
   * Leave the stored flow untouched.
   * @param projectId - Tenant.
   */
  rejectWorkflowProposal(projectId: string): WorkflowView {
    return toWorkflowView(this.board.get(projectId) ?? workflowFromTemplate(projectId, 'simples'))
  }

  private topicOf(projectId: string, ticketId: string): string | undefined {
    return this.orchestration.screens?.get<{ subjectId: string }>(projectId, 'ticket_subject', ticketId)?.subjectId
  }

  private tickets(projectId: string): Ticket[] {
    return this.orchestration.runtime(projectId).repo.tickets.list()
  }

  private postMilestone(workspaceId: string, projectId: string, summary: string): void {
    const channel = this.product.listChannels(projectId)[0]
    if (channel === undefined) return
    const coord = this.product.listPersonas(projectId).find(row => row.systemRoles.includes('coordination'))
    const id = `sprint-close-${projectId}-${this.orchestration.now()}`
    if (this.events.has(id)) return
    this.events.append({
      id,
      workspaceId,
      projectId,
      streamKind: 'channel',
      ownerId: channel.id,
      type: 'message',
      body: summary,
      actorId: coord?.id ?? 'coordination',
      subjectId: id,
      occurredAt: this.orchestration.now(),
    })
  }

  /**
   * Rebuild in-memory goals from persisted sprints (empty after remount).
   * @param projectId - Tenant.
   */
  private hydrateGoals(projectId: string): void {
    const have = new Set(this.goals.list(projectId).map(goal => goal.id))
    for (const sprint of this.board.listSprints(projectId)) {
      if (sprint.status === 'planejado' || have.has(sprint.goalId)) continue
      bindSprintGoal(this.goals, sprint)
    }
  }
}

function ticketsToSeats(
  workflow: ProjectWorkflow,
  tickets: readonly Ticket[],
  seats: readonly TicketBoardSeat[],
): TicketBoardSeat[] {
  const byId = new Map(seats.map(seat => [seat.ticketId, seat]))
  return tickets.map((ticket) => {
    const stored = byId.get(ticket.id)
    if (stored !== undefined) return stored
    return { projectId: workflow.projectId, ticketId: ticket.id }
  })
}

function seatsForCounts(
  workflow: ProjectWorkflow,
  tickets: readonly Ticket[],
  seats: readonly TicketBoardSeat[],
): TicketBoardSeat[] {
  return ticketsToSeats(workflow, tickets, seats).map((seat) => {
    const ticket = tickets.find(item => item.id === seat.ticketId)
    if (ticket === undefined) return seat
    const card = projectBoardCard(workflow, ticket, seat)
    return card.columnId === undefined ? seat : { ...seat, columnId: card.columnId }
  })
}

function toCard(
  workflow: ProjectWorkflow,
  ticket: Ticket,
  seat?: TicketBoardSeat,
  topicId?: string,
): BoardCardView {
  const card = projectBoardCard(workflow, ticket, seat)
  return {
    ticketId: ticket.id,
    title: ticket.title,
    category: card.category,
    blocked: card.blocked,
    ...(card.columnId === undefined ? {} : { columnId: card.columnId }),
    ...(card.columnName === undefined ? {} : { columnName: card.columnName }),
    ...(card.chip === undefined ? {} : { chip: card.chip }),
    ...(topicId === undefined || topicId === '' ? {} : { topicId }),
  }
}

function toWorkflowView(workflow: ProjectWorkflow): WorkflowView {
  return {
    projectId: workflow.projectId,
    template: workflow.template,
    columns: workflow.columns.map((column) => {
      const view: WorkflowView['columns'][number] = {
        id: column.id, name: column.name, category: column.category,
      }
      return {
        ...view,
        ...(column.color === undefined ? {} : { color: column.color }),
        ...(column.icon === undefined ? {} : { icon: column.icon }),
        ...(column.wip === undefined ? {} : { wip: column.wip }),
      }
    }),
    fields: workflow.fields.map(field => ({
      id: field.id,
      name: field.name,
      kind: field.kind,
      ...(field.options === undefined ? {} : { options: field.options }),
    })),
  }
}

function toSprintView(sprint: Sprint, now: string): SprintView {
  const daysLeft = sprintDaysLeft(sprint, now)
  return {
    id: sprint.id,
    projectId: sprint.projectId,
    name: sprint.name,
    objective: sprint.objective,
    status: sprint.status,
    ticketIds: sprint.ticketIds,
    goalId: sprint.goalId,
    ...(sprint.startsAt === undefined ? {} : { startsAt: sprint.startsAt }),
    ...(sprint.endsAt === undefined ? {} : { endsAt: sprint.endsAt }),
    ...(daysLeft === undefined ? {} : { daysLeft }),
  }
}

function toProposalView(row: ReturnType<typeof proposeWorkflow>): WorkflowProposalView {
  return {
    template: row.template,
    reason: row.reason,
    workflow: toWorkflowView(row.workflow),
    card: row.card,
  }
}

function toColumn(row: WorkflowColumn): WorkflowColumn {
  return row
}

function toField(row: WorkflowField): WorkflowField {
  return row
}

function isTemplate(value: string): value is WorkflowTemplateId {
  return (TEMPLATES as readonly string[]).includes(value)
}

function inferTemplate(columns: readonly { id: string }[]): WorkflowTemplateId | undefined {
  const prefix = columns[0]?.id.split('-')[0]
  return prefix !== undefined && isTemplate(prefix) ? prefix : undefined
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function mapBoardError(error: unknown): Error {
  if (error instanceof WorkflowError) {
    const code = stableWorkflowCode(error.code)
    return new BoardRemoteError(code, boardMessage(code, error))
  }
  if (error instanceof DomainError) {
    const code = stableWorkflowCode(error.detail ?? error.code)
    return new BoardRemoteError(code, boardMessage(code, error))
  }
  if (error instanceof Error) return error
  return new BoardRemoteError('invalid-workflow', 'Este fluxo não é válido.')
}

function boardMessage(code: string, error: unknown): string {
  const text = workflowRefusalText(error)
  if (text.includes(' ') || /[áàãéêíóôúç]/iu.test(text)) return text
  return WORKFLOW_FALLBACK[code] ?? text
}

/** Remote refusal: `code` is stable; `message` is pt-BR for the UI. */
export class BoardRemoteError extends Error {
  /**
   * @param code - Stable machine code (`column-needs-destination`, …).
   * @param message - pt-BR line.
   */
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'BoardRemoteError'
  }
}

const WORKFLOW_CODES: Readonly<Record<string, string>> = {
  missing_destination: 'column-needs-destination',
  duplicate_column: 'duplicate-column',
  needs_you_unique: 'needs-you-unique',
  empty: 'empty-workflow',
  todo_done_required: 'todo-done-required',
  unknown_column: 'unknown-column',
  no_category_column: 'no-category-column',
  INVALID_WORKFLOW: 'invalid-workflow',
}

const WORKFLOW_FALLBACK: Readonly<Record<string, string>> = {
  'column-needs-destination': 'Essa coluna ainda tem Tarefas. Escolha um destino antes de removê-la.',
  'duplicate-column': 'Há colunas com o mesmo id. Cada coluna precisa de um id único.',
  'needs-you-unique': 'Só pode haver uma coluna Precisa de você.',
  'empty-workflow': 'Este fluxo não pode ficar sem colunas.',
  'todo-done-required': 'O fluxo precisa de pelo menos uma coluna A fazer e uma Feito.',
  'unknown-column': 'Essa coluna não existe neste fluxo.',
  'no-category-column': 'Não há coluna para essa categoria.',
  'invalid-workflow': 'Este fluxo não é válido.',
}

function stableWorkflowCode(detail: string): string {
  if (detail in WORKFLOW_CODES) return WORKFLOW_CODES[detail]!
  if (detail.includes('destino') || detail.includes('missing_destination')) return 'column-needs-destination'
  return 'invalid-workflow'
}
