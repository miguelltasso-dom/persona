import type { KanbanCardModel, KanbanColumnId } from '../kanban/types.ts'
import { resolveProjectDisplayName } from '../kanban/resolve-project-name.ts'
import type { PersonaNowSnapshot } from '../team/persona-work-state.ts'
import { MOCK_PROJECT_BOARD_SUMMARIES } from './mock-data.ts'
import type { FlowModelId, ProjectBoardSummary, StageCategoryCounts } from './types.ts'

const COLUMN_TO_CATEGORY: Record<KanbanColumnId, keyof StageCategoryCounts> = {
  todo: 'todo',
  in_progress: 'doing',
  in_review: 'review',
  blocked: 'needs_you',
  done: 'done',
}

function emptyCounts(): StageCategoryCounts {
  return { todo: 0, doing: 0, review: 0, needs_you: 0, done: 0, blocked: 0 }
}

export function inferFlowModel(projectId: string, kind: string | undefined): FlowModelId {
  if (kind === 'personal' || projectId.includes('pessoal')) return 'simples'
  if (projectId.includes('contrat')) return 'contratacao'
  if (projectId.includes('site')) return 'site'
  return 'software'
}

/** Live host data → hub tiles; falls back to Muse preview mocks when empty. */
export function deriveBoardSummaries(input: {
  readonly projects: readonly { readonly id: string; readonly name: string; readonly kind?: string }[]
  readonly kanbanCards: readonly KanbanCardModel[]
  readonly nowRows: readonly PersonaNowSnapshot[]
}): readonly ProjectBoardSummary[] {
  const cardsByProject = new Map<string, KanbanCardModel[]>()
  for (const card of input.kanbanCards) {
    const list = cardsByProject.get(card.projectId) ?? []
    list.push(card)
    cardsByProject.set(card.projectId, list)
  }

  const workers = input.nowRows
    .filter(row => row.member.state === 'working' || row.member.state === 'waiting')
    .map(row => ({ name: row.member.name, state: row.member.state }))

  const fromLive = input.projects.map((project) => {
    const cards = cardsByProject.get(project.id) ?? []
    let counts = emptyCounts()
    for (const card of cards) {
      const key = COLUMN_TO_CATEGORY[card.column]
      counts = { ...counts, [key]: counts[key] + 1 }
    }
    return {
      id: project.id,
      name: resolveProjectDisplayName(project.id, input.projects),
      flowModel: inferFlowModel(project.id, project.kind),
      counts,
      needsYouCount: counts.needs_you,
      activeWorkers: workers.slice(0, 5),
    }
  })

  if (fromLive.length >= 2) return fromLive
  return mergeLiveCardsIntoMockSummaries(MOCK_PROJECT_BOARD_SUMMARIES, input.kanbanCards)
}

/** When the hub falls back to Muse mocks, overlay counts from live kanban cards (PB-5). */
function mergeLiveCardsIntoMockSummaries(
  summaries: readonly ProjectBoardSummary[],
  kanbanCards: readonly KanbanCardModel[],
): readonly ProjectBoardSummary[] {
  if (kanbanCards.length === 0) return summaries
  return summaries.map((summary) => {
    const cards = kanbanCards.filter(card => card.projectId === summary.id)
    if (cards.length === 0) return summary
    let counts = emptyCounts()
    for (const card of cards) {
      const key = COLUMN_TO_CATEGORY[card.column]
      counts = { ...counts, [key]: counts[key] + 1 }
    }
    return {
      ...summary,
      counts,
      needsYouCount: counts.needs_you,
    }
  })
}
