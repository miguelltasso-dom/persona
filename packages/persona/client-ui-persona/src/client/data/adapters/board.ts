import type {
  BoardCardView,
  BoardSummaryView,
  ProjectBoardView,
  WorkflowColumnView,
} from '@deepseek-ai/dsh-persona-host/types'
import { readCardHandoff, readHandoffNote, readReviewing, readWorkPath } from '../../teamwork/teamwork-wire.ts'
import type { FlowModelId, ProjectBoardSummary, StageCategoryCounts } from '../../boards/types.ts'
import type { ConversationSubjectUi } from '../../chat/conversation-subjects.ts'
import { conversationSubjectChipForId } from '../../remote/map-host-ui.ts'
import type { FlowCardModel, FlowColumnModel, ProjectFlowSnapshot } from '../../kanban/flow-types.ts'
import type { KanbanColumnId } from '../../kanban/types.ts'

export interface ProjectBoardToFlowOptions {
  readonly conversationSubjects?: readonly ConversationSubjectUi[]
}

const CATEGORY_TO_COLUMN: Record<string, KanbanColumnId> = {
  todo: 'todo',
  doing: 'in_progress',
  review: 'in_review',
  needs_you: 'blocked',
  done: 'done',
}

function templateToFlowModel(template: string): FlowModelId {
  if (template === 'em_branco') return 'branco'
  if (template === 'contratacao' || template === 'site' || template === 'software'
    || template === 'marketing' || template === 'atendimento' || template === 'simples') {
    return template
  }
  return 'simples'
}

function toFlowColumn(column: WorkflowColumnView): FlowColumnModel {
  return {
    id: column.id,
    name: column.name,
    category: column.category,
    ...(column.wip === undefined ? {} : { wip: column.wip }),
    ...(column.color === undefined || column.color.length === 0 ? {} : { color: column.color }),
  }
}

function resolveColumnId(
  card: BoardCardView,
  columns: readonly FlowColumnModel[],
): string {
  if (card.columnId !== undefined && card.columnId.length > 0) return card.columnId
  const match = columns.find(column => column.category === card.category)
  return match?.id ?? columns[0]?.id ?? 'todo'
}

function toFlowCard(
  card: BoardCardView,
  projectId: string,
  projectName: string,
  columns: readonly FlowColumnModel[],
  conversationSubjects: readonly ConversationSubjectUi[],
): FlowCardModel {
  const columnId = resolveColumnId(card, columns)
  const category = columns.find(column => column.id === columnId)?.category ?? card.category
  const column = CATEGORY_TO_COLUMN[category] ?? 'todo'
  const waitingEvent = card.chip === 'waiting'
  const subjectId = (card as { readonly conversationSubjectId?: string; readonly topicId?: string }).conversationSubjectId ?? card.topicId
  const conversationSubject = conversationSubjectChipForId(subjectId, conversationSubjects)
  // EQUIPE REAL (D-090; contracts/team-real.md): not in the host types yet, so read as data and never trusted.
  const wire = card as { readonly handoff?: unknown; readonly note?: unknown; readonly path?: unknown; readonly reviewing?: unknown }
  const handoff = readCardHandoff(wire.handoff)
  const note = readHandoffNote(wire.note)
  const path = readWorkPath(wire.path)
  const reviewing = readReviewing(wire.reviewing)
  const collaborators = (card.collaborators ?? []).filter(row => typeof row.name === 'string' && row.name.trim() !== '').map(row => ({ personaId: row.personaId, name: row.name.trim() }))
  return {
    id: card.ticketId,
    title: card.title,
    columnId,
    column,
    projectId,
    projectName,
    teamId: 'team',
    teamName: 'Equipe',
    blocked: card.blocked,
    waitingEvent,
    reviewApproved: category === 'done',
    ...(conversationSubject === undefined ? {} : { conversationSubject }),
    ...(handoff === undefined ? {} : { handoff }),
    ...(note === undefined ? {} : { note }),
    ...(path.length === 0 ? {} : { path }),
    ...(reviewing === undefined ? {} : { reviewing }),
    ...(collaborators.length === 0 ? {} : { collaborators }),
    ...(typeof card.deliveryPending === 'boolean' ? { deliveryPending: card.deliveryPending } : {}),
  }
}

/** Host {@link ProjectBoardView} → Lumen flow board snapshot. */
export function projectBoardToFlow(
  board: ProjectBoardView,
  options: ProjectBoardToFlowOptions = {},
): ProjectFlowSnapshot {
  const conversationSubjects = options.conversationSubjects ?? []
  const columns = board.workflow.columns.map(toFlowColumn)
  return {
    projectId: board.projectId,
    projectName: board.projectName,
    template: board.workflow.template,
    columns,
    cards: board.cards.map(card => toFlowCard(
      card,
      board.projectId,
      board.projectName,
      columns,
      conversationSubjects,
    )),
  }
}

/** {@link BoardSummaryView} rows → hub tiles (counts + sprint from host). */
export function hostBoardSummariesToHub(
  rows: readonly BoardSummaryView[],
  flowModelByProject: Readonly<Record<string, FlowModelId>>,
  inferModel: (projectId: string, kind?: string) => FlowModelId,
): readonly ProjectBoardSummary[] {
  return rows.map((row) => {
    const counts: StageCategoryCounts = { ...row.counts }
    return {
      id: row.projectId,
      name: row.projectName,
      flowModel: flowModelByProject[row.projectId] ?? inferModel(row.projectId),
      counts,
      needsYouCount: counts.needs_you,
      activeWorkers: row.workingNow.map(name => ({ name, state: 'working' as const })),
      ...(row.currentSprintName === undefined
        ? {}
        : { sprintLabel: row.currentSprintName }),
    }
  })
}

export { templateToFlowModel }
