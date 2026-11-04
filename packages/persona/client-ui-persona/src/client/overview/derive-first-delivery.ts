import type { KanbanCardModel } from '../kanban/types.ts'
import type { FirstDelivery } from './OverviewView.tsx'

/** PRO-4 peak-end: first card in `done` drives the milestone (host tasks via live refresh). */
export function deriveFirstDeliveryMilestone(
  cards: readonly KanbanCardModel[],
): FirstDelivery | undefined {
  const done = cards.filter(card => card.column === 'done')
  if (done.length === 0) return undefined
  const card = done[0]!
  return {
    taskId: card.id,
    title: card.title,
    personaName: card.assignee?.name ?? 'Equipe',
    ...(card.assignee === undefined ? {} : { characterId: card.assignee.id }),
  }
}
