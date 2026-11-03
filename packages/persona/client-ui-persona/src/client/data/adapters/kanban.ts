import type { TaskView } from '@deepseek-ai/dsh-persona-host/types'
import { resolveProjectDisplayName } from '../../kanban/resolve-project-name.ts'
import type { KanbanCardModel, KanbanColumnId } from '../../kanban/types.ts'

const STAGE_TO_COLUMN: Record<string, KanbanColumnId> = {
  todo: 'todo',
  doing: 'in_progress',
  review: 'in_review',
  blocked: 'blocked',
  done: 'done',
}

/** Map host {@link TaskView} rows to Lumen kanban cards. */
export function tasksToKanbanCards(
  tasks: readonly TaskView[],
  projectId: string,
  projects: readonly { readonly id: string; readonly name: string }[] = [],
): KanbanCardModel[] {
  return tasks.map((task) => {
    const column = STAGE_TO_COLUMN[task.stage] ?? 'todo'
    const waitingEvent = task.stageAction === 'waiting'
    const blocked = column === 'blocked'
    return {
      id: task.id,
      title: task.title,
      column,
      projectId: task.projectId,
      projectName: resolveProjectDisplayName(task.projectId, projects),
      teamId: 'team',
      teamName: 'Equipe',
      blocked,
      waitingEvent,
      reviewApproved: column === 'done',
    }
  }).filter(card => card.projectId === projectId || projectId === '')
}
