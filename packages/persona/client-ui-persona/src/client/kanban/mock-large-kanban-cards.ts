/** Gallery-scale kanban cards (Probe/Muse — never production default). */

import type { KanbanCardModel, KanbanColumnId } from './types.ts'

const COLUMN_CYCLE: readonly KanbanColumnId[] = ['todo', 'in_progress', 'in_review', 'blocked', 'done']

export type KanbanScaleSeed = 200 | 1000

/** Deterministic cards spread across five columns for perf captures. */
export function mockLargeKanbanCards(count: KanbanScaleSeed): readonly KanbanCardModel[] {
  return Array.from({ length: count }, (_, index): KanbanCardModel => {
    const column = COLUMN_CYCLE[index % COLUMN_CYCLE.length]!
    return {
      id: `scale-ticket-${index}`,
      title: `Tarefa de escala ${index + 1}`,
      projectId: index % 3 === 0 ? 'proj-site' : 'proj-hire',
      projectName: index % 3 === 0 ? 'Site da agência' : 'Contratação',
      teamId: 'default',
      teamName: 'Equipe',
      column,
      waitingEvent: column === 'in_review' && index % 11 === 0,
      blocked: column === 'blocked',
      reviewApproved: column === 'done' && index % 5 !== 0,
      ...(index % 17 === 0
        ? { conversationSubject: { name: 'UI', colorIndex: 2 as const } }
        : {}),
    }
  })
}
