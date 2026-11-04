import type { KanbanCardModel, KanbanColumnId } from '../kanban/types.ts'
import type { StageCategory } from './types.ts'

const COLUMN_TO_CATEGORY: Record<KanbanColumnId, StageCategory> = {
  todo: 'todo',
  in_progress: 'doing',
  in_review: 'review',
  blocked: 'needs_you',
  done: 'done',
}

/** Up to `limit` card titles per stage category for one project (BOARDS-SPEC §1 visão global). */
export function previewTitlesByCategory(
  projectId: string,
  cards: readonly KanbanCardModel[],
  limit = 3,
): Readonly<Partial<Record<StageCategory, readonly string[]>>> {
  const buckets = new Map<StageCategory, string[]>()
  for (const card of cards) {
    if (card.projectId !== projectId) continue
    const category = COLUMN_TO_CATEGORY[card.column]
    const list = buckets.get(category) ?? []
    if (list.length < limit) list.push(card.title)
    buckets.set(category, list)
  }
  return Object.fromEntries(buckets) as Partial<Record<StageCategory, readonly string[]>>
}
