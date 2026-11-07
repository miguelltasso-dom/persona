import { resolvePersonaFace } from '../approvals/approvals-ui-helpers.ts'
import type { KanbanCardModel, KanbanColumnId } from '../kanban/types.ts'
import { resolveProjectDisplayName } from '../kanban/resolve-project-name.ts'
import type { PersonaNowSnapshot } from '../team/persona-work-state.ts'
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

/**
 * Live host data → hub tiles. Exactly the projects the team really has — one ("Pessoal") on a fresh home, none while
 * loading. It never falls back to sample projects: invented "Contratação — Designer" tiles with counts would be
 * shown as the person's own work (those samples live in boards/mock-data.ts for tests and previews only).
 */
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
    .map((row) => {
      // D-069: the tile shows the persona's animal (its id is the gallery animal in the live data), never a letter.
      const avatarSrc = resolvePersonaFace({ id: row.member.id, name: row.member.name })
      return { name: row.member.name, state: row.member.state, ...(avatarSrc === undefined ? {} : { avatarSrc }) }
    })

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

  return fromLive
}
