/**
 * Per-project board workflow (BRIEFING 15 / D-053). Domain only — no engine Ticket.
 * `blocked` is a card marker, not a column category.
 */

import { DomainError } from '../domain/schemas.ts'

/** Stage category that binds a custom column to the engine ticket stage. */
export type StageCategory = 'todo' | 'doing' | 'review' | 'needs_you' | 'done'

/** Built-in flow templates. Machine ids — display names live on the template row. */
export type WorkflowTemplateId =
  | 'contratacao'
  | 'site'
  | 'software'
  | 'marketing'
  | 'atendimento'
  | 'simples'
  | 'em_branco'

/** Simple typed extra field on a ticket in this flow. */
export type WorkflowFieldKind = 'text' | 'link' | 'number' | 'date' | 'select'

/** One ordered column of a project flow. */
export interface WorkflowColumn {
  id: string
  name: string
  category: StageCategory
  color?: string
  icon?: string
  /** Optional work-in-progress hint. The engine does not refuse a move. */
  wip?: number
}

/** Extra field the flow suggests on each ticket. */
export interface WorkflowField {
  id: string
  name: string
  kind: WorkflowFieldKind
  options?: readonly string[]
}

/** Ordered columns + optional extra fields for one project. */
export interface ProjectWorkflow {
  projectId: string
  template: WorkflowTemplateId
  columns: WorkflowColumn[]
  fields: WorkflowField[]
}

/** Seat of a ticket on the board (Ticket.columnId / sprintId / campos). */
export interface TicketBoardSeat {
  projectId: string
  ticketId: string
  columnId?: string
  sprintId?: string
  blocked?: boolean
  campos?: Readonly<Record<string, string | number>>
}

/** Catalog row. Display names are data, not hardcoded persona names. */
export interface WorkflowTemplate {
  id: WorkflowTemplateId
  name: string
  columns: WorkflowColumn[]
  fields: WorkflowField[]
}

const HIRING_FIELDS: WorkflowField[] = [
  { id: 'candidato', name: 'Candidato', kind: 'text' },
  { id: 'cargo', name: 'Cargo', kind: 'text' },
  { id: 'curriculo', name: 'Currículo', kind: 'link' },
  { id: 'nota', name: 'Nota', kind: 'number' },
]

const SITE_FIELDS: WorkflowField[] = [
  { id: 'pagina', name: 'Página', kind: 'text' },
  { id: 'url', name: 'URL', kind: 'link' },
]

/**
 * @param id - Column id.
 * @param name - Display name (pt-BR).
 * @param category - Engine stage category.
 * @param extra - Color, icon, WIP hint.
 */
function col(
  id: string,
  name: string,
  category: StageCategory,
  extra: Pick<WorkflowColumn, 'color' | 'icon' | 'wip'> = {},
): WorkflowColumn {
  return { id, name, category, ...extra }
}

/** Built-in templates (pt-BR names). */
export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: 'contratacao',
    name: 'Contratação',
    fields: HIRING_FIELDS,
    columns: [
      col('contratacao-vaga', 'Vaga definida', 'todo', { icon: 'brief' }),
      col('contratacao-busca', 'Busca de candidatos', 'doing'),
      col('contratacao-triagem', 'Triagem', 'doing'),
      col('contratacao-entrevistas', 'Entrevistas', 'doing'),
      col('contratacao-proposta', 'Proposta', 'review'),
      col('contratacao-contratado', 'Contratado', 'done'),
      col('contratacao-descartados', 'Descartados', 'done'),
    ],
  },
  {
    id: 'site',
    name: 'Site / produto digital',
    fields: SITE_FIELDS,
    columns: [
      col('site-descoberta', 'Descoberta', 'todo'),
      col('site-conteudo', 'Conteúdo', 'doing'),
      col('site-design', 'Design', 'doing'),
      col('site-dev', 'Desenvolvimento', 'doing'),
      col('site-revisao', 'Revisão', 'review'),
      col('site-publicado', 'Publicado', 'done'),
    ],
  },
  {
    id: 'software',
    name: 'Software (sprints)',
    fields: [],
    columns: [
      col('software-backlog', 'Backlog', 'todo'),
      col('software-sprint', 'Sprint atual', 'todo'),
      col('software-andamento', 'Em andamento', 'doing', { wip: 3 }),
      col('software-revisao', 'Em revisão', 'review'),
      col('software-pronto', 'Pronto', 'done'),
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing / conteúdo',
    fields: [],
    columns: [
      col('mkt-ideias', 'Ideias', 'todo'),
      col('mkt-roteiro', 'Roteiro', 'doing'),
      col('mkt-producao', 'Produção', 'doing'),
      col('mkt-aprovacao', 'Aprovação', 'review'),
      col('mkt-publicado', 'Publicado', 'done'),
    ],
  },
  {
    id: 'atendimento',
    name: 'Atendimento / operações',
    fields: [],
    columns: [
      col('atd-entrada', 'Entrada', 'todo'),
      col('atd-atendimento', 'Em atendimento', 'doing'),
      col('atd-aguarda', 'Aguardando cliente', 'needs_you'),
      col('atd-resolvido', 'Resolvido', 'done'),
    ],
  },
  {
    id: 'simples',
    name: 'Simples',
    fields: [],
    columns: [
      col('simples-fazer', 'A fazer', 'todo'),
      col('simples-fazendo', 'Fazendo', 'doing'),
      col('simples-feito', 'Feito', 'done'),
    ],
  },
  {
    id: 'em_branco',
    name: 'Em branco',
    fields: [],
    columns: [],
  },
]

/**
 * @param id - Template id.
 */
export function workflowTemplateById(id: WorkflowTemplateId): WorkflowTemplate {
  const found = WORKFLOW_TEMPLATES.find(row => row.id === id)
  if (found === undefined) throw new DomainError('INVALID_WORKFLOW', id)
  return found
}

/**
 * Instantiates a template onto a project.
 * @param projectId - Tenant.
 * @param template - Built-in flow.
 */
export function workflowFromTemplate(projectId: string, template: WorkflowTemplateId): ProjectWorkflow {
  const row = workflowTemplateById(template)
  return { projectId, template, columns: row.columns.map(column => ({ ...column })), fields: [...row.fields] }
}

/**
 * Invariants: blank may be empty; any other flow needs ≥1 todo and ≥1 done;
 * at most one `needs_you` column; unique column ids.
 * @param workflow - Candidate flow.
 */
export function assertWorkflow(workflow: ProjectWorkflow): void {
  const ids = new Set<string>()
  let todo = 0
  let done = 0
  let needsYou = 0
  for (const column of workflow.columns) {
    if (column.id === '' || ids.has(column.id)) throw new DomainError('INVALID_WORKFLOW', 'duplicate_column')
    ids.add(column.id)
    if (column.category === 'todo') todo += 1
    if (column.category === 'done') done += 1
    if (column.category === 'needs_you') needsYou += 1
  }
  if (needsYou > 1) throw new DomainError('INVALID_WORKFLOW', 'needs_you_unique')
  if (workflow.columns.length === 0) {
    if (workflow.template !== 'em_branco') throw new DomainError('INVALID_WORKFLOW', 'empty')
    return
  }
  if (todo < 1 || done < 1) throw new DomainError('INVALID_WORKFLOW', 'todo_done_required')
}

/**
 * First column of a category, in flow order.
 * @param workflow - Project flow.
 * @param category - Target category.
 */
export function firstColumnOf(
  workflow: ProjectWorkflow,
  category: StageCategory,
): WorkflowColumn | undefined {
  return workflow.columns.find(column => column.category === category)
}

/**
 * Occupancy of a column (WIP hint).
 * @param columnId - Column.
 * @param seats - Seats on this project.
 */
export function columnOccupancy(columnId: string, seats: readonly TicketBoardSeat[]): number {
  return seats.filter(row => row.columnId === columnId).length
}

/**
 * WIP is a warning: true when the destination is already at cap (other tickets).
 * @param workflow - Project flow.
 * @param columnId - Destination.
 * @param seats - Current seats.
 * @param ticketId - Ticket being moved (ignored in the count).
 */
export function wipWarning(
  workflow: ProjectWorkflow,
  columnId: string,
  seats: readonly TicketBoardSeat[],
  ticketId: string,
): boolean {
  const column = workflow.columns.find(row => row.id === columnId)
  if (column?.wip === undefined) return false
  return columnOccupancy(columnId, seats.filter(row => row.ticketId !== ticketId)) >= column.wip
}

/**
 * Apply a flow edit. Tickets on a removed column must name a remaining destination.
 * @param current - Stored flow.
 * @param columns - New ordered columns.
 * @param fields - New extra fields.
 * @param seats - Current seats.
 * @param destByRemoved - Removed column id → remaining column id.
 */
export function applyWorkflowEdit(
  current: ProjectWorkflow,
  columns: readonly WorkflowColumn[],
  fields: readonly WorkflowField[],
  seats: readonly TicketBoardSeat[],
  destByRemoved: Readonly<Record<string, string>> = {},
): { workflow: ProjectWorkflow; seats: TicketBoardSeat[] } {
  const kept = new Set(columns.map(column => column.id))
  const nextSeats: TicketBoardSeat[] = []
  for (const seat of seats) {
    if (seat.columnId === undefined || kept.has(seat.columnId)) {
      nextSeats.push(seat)
      continue
    }
    const dest = destByRemoved[seat.columnId]
    if (dest === undefined || !kept.has(dest)) {
      throw new DomainError('INVALID_WORKFLOW', 'Essa coluna ainda tem Tarefas. Escolha um destino antes de removê-la.')
    }
    nextSeats.push({ ...seat, columnId: dest })
  }
  const workflow = { ...current, columns: [...columns], fields: [...fields] }
  assertWorkflow(workflow)
  return { workflow, seats: nextSeats }
}

/** Counts by category for the Quadros mini-summary. */
export interface BoardCounts {
  todo: number
  doing: number
  review: number
  needs_you: number
  done: number
  blocked: number
}

/**
 * @param workflow - Project flow.
 * @param seats - Seats.
 */
export function boardCounts(workflow: ProjectWorkflow, seats: readonly TicketBoardSeat[]): BoardCounts {
  const counts: BoardCounts = { todo: 0, doing: 0, review: 0, needs_you: 0, done: 0, blocked: 0 }
  const byId = new Map(workflow.columns.map(column => [column.id, column]))
  for (const seat of seats) {
    if (seat.blocked === true) counts.blocked += 1
    const column = seat.columnId === undefined ? undefined : byId.get(seat.columnId)
    if (column === undefined) continue
    counts[column.category] += 1
  }
  return counts
}

/** Coordination prompt: choose a template, never apply it. */
export const PROPOSE_WORKFLOW_PROMPT = `Leia a descrição do projeto e escolha UM modelo: contratacao, site, software, marketing, atendimento, simples, em_branco.
Responda só JSON: {"template":"...","reason":"uma frase"}.
Não aplique o fluxo — a pessoa confirma no cartão "Usar este fluxo?".`

const HINTS: Readonly<Record<WorkflowTemplateId, readonly string[]>> = {
  contratacao: ['vaga', 'candidato', 'contratar', 'entrevista', 'recrut', 'rh', 'currículo', 'curriculo'],
  site: ['site', 'página', 'pagina', 'landing', 'web', 'publicado', 'produto digital'],
  software: ['sprint', 'backlog', 'código', 'codigo', 'software', 'app', 'repositório', 'repositorio'],
  marketing: ['conteúdo', 'conteudo', 'campanha', 'marketing', 'roteiro', 'post'],
  atendimento: ['atendimento', 'suporte', 'cliente', 'chamado', 'operação', 'operacao'],
  simples: ['simples', 'kanban curto'],
  em_branco: ['em branco', 'do zero', 'sem colunas', 'vazio'],
}

/** Coordination proposal. Host must not apply until the person accepts. */
export interface WorkflowProposal {
  projectId: string
  template: WorkflowTemplateId
  reason: string
  workflow: ProjectWorkflow
  card: { question: string; primary: string; impact: string }
}

/**
 * Keyword proposal from the project description. Never writes the workflow.
 * @param projectId - Tenant.
 * @param description - Free text the person wrote about the project.
 */
export function proposeWorkflow(projectId: string, description: string): WorkflowProposal {
  const text = description.toLowerCase()
  let best: WorkflowTemplateId = 'simples'
  let hits = 0
  for (const [template, words] of Object.entries(HINTS) as [WorkflowTemplateId, readonly string[]][]) {
    const score = words.reduce((n, word) => n + (text.includes(word) ? 1 : 0), 0)
    if (score > hits) {
      hits = score
      best = template
    }
  }
  const row = workflowTemplateById(best)
  const reason = hits === 0
    ? 'Nenhuma pista forte; fluxo Simples.'
    : `Descrição combina com ${row.name} (${hits}).`
  const workflow = workflowFromTemplate(projectId, best)
  assertWorkflow(workflow)
  return {
    projectId,
    template: best,
    reason,
    workflow,
    card: {
      question: `Usar este fluxo: ${row.name}?`,
      primary: 'Usar este fluxo',
      impact: reason,
    },
  }
}

/**
 * pt-BR copy for a refused flow edit (host should surface this, not the code).
 * @param error - Domain or wrapped Error.
 */
export function workflowRefusalText(error: unknown): string {
  const detail = error instanceof DomainError ? error.detail : undefined
  if (detail !== undefined && detail.length > 0) return detail
  const text = error instanceof Error ? error.message : String(error)
  if (text.includes('missing_destination') || text === 'INVALID_WORKFLOW') {
    return 'Essa coluna ainda tem Tarefas. Escolha um destino antes de removê-la.'
  }
  return text
}

/**
 * Persist only after the person accepts. Propose never writes.
 * @param store - Workflow store.
 * @param proposal - Card the person saw.
 * @param accepted - True applies; false leaves the store unchanged.
 */
export function decideWorkflowProposal(
  store: WorkflowStore,
  proposal: WorkflowProposal,
  accepted: boolean,
): ProjectWorkflow | undefined {
  if (!accepted) return undefined
  assertWorkflow(proposal.workflow)
  store.save(proposal.workflow)
  return store.get(proposal.projectId) ?? proposal.workflow
}

/**
 * Dirty parser for a Coordination model blob. Extra prose around JSON is ignored.
 * @param projectId - Tenant.
 * @param text - Model output (may be wrapped in fences or chatter).
 */
export function parseWorkflowProposal(projectId: string, text: string): WorkflowProposal | { degraded: true; reason: string } {
  const match = /\{[\s\S]*\}/u.exec(text)
  if (match === null) return { degraded: true, reason: 'Resposta sem JSON de fluxo.' }
  try {
    const parsed = JSON.parse(match[0]) as { template?: string; reason?: string }
    const id = WORKFLOW_TEMPLATES.some(row => row.id === parsed.template)
      ? parsed.template as WorkflowTemplateId
      : undefined
    if (id === undefined) return { degraded: true, reason: 'Modelo de fluxo desconhecido.' }
    const workflow = workflowFromTemplate(projectId, id)
    assertWorkflow(workflow)
    const row = workflowTemplateById(id)
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim() !== ''
      ? parsed.reason.trim()
      : `Modelo ${row.name}.`
    return {
      projectId,
      template: id,
      reason,
      workflow,
      card: {
        question: `Usar este fluxo: ${row.name}?`,
        primary: 'Usar este fluxo',
        impact: reason,
      },
    }
  } catch {
    return { degraded: true, reason: 'JSON de fluxo ilegível.' }
  }
}

/** In-memory workflow store (Anvil persists). */
export interface WorkflowStore {
  /**
   * @param projectId - Tenant.
   */
  get(projectId: string): ProjectWorkflow | undefined
  /**
   * @param workflow - New or replacement snapshot.
   */
  save(workflow: ProjectWorkflow): void
}

/** In-memory seats (Anvil persists). */
export interface PlacementStore {
  /**
   * @param projectId - Tenant.
   */
  list(projectId: string): TicketBoardSeat[]
  /**
   * @param ticketId - Ticket.
   */
  of(ticketId: string): TicketBoardSeat | undefined
  /**
   * @param seat - New or replacement seat.
   */
  save(seat: TicketBoardSeat): void
}

/** Test / ephemeral host store. */
export class MemoryWorkflowStore implements WorkflowStore {
  private readonly rows = new Map<string, ProjectWorkflow>()

  /**
   * @param projectId - Tenant.
   */
  get(projectId: string): ProjectWorkflow | undefined {
    const row = this.rows.get(projectId)
    return row === undefined ? undefined : { ...row, columns: [...row.columns], fields: [...row.fields] }
  }

  /**
   * @param workflow - Snapshot.
   */
  save(workflow: ProjectWorkflow): void {
    assertWorkflow(workflow)
    this.rows.set(workflow.projectId, {
      ...workflow,
      columns: workflow.columns.map(column => ({ ...column })),
      fields: [...workflow.fields],
    })
  }
}

/** Test / ephemeral seats. */
export class MemoryPlacementStore implements PlacementStore {
  private readonly rows = new Map<string, TicketBoardSeat>()

  /**
   * @param projectId - Tenant.
   */
  list(projectId: string): TicketBoardSeat[] {
    return [...this.rows.values()].filter(row => row.projectId === projectId)
  }

  /**
   * @param ticketId - Ticket.
   */
  of(ticketId: string): TicketBoardSeat | undefined {
    const row = this.rows.get(ticketId)
    return row === undefined ? undefined : { ...row }
  }

  /**
   * @param seat - Seat.
   */
  save(seat: TicketBoardSeat): void {
    this.rows.set(seat.ticketId, { ...seat })
  }
}
