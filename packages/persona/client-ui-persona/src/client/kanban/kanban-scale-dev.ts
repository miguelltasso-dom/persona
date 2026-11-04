import type { KanbanScaleSeed } from './mock-large-kanban-cards.ts'

export const KANBAN_SCALE_SEED_KEY = 'persona.kanbanScaleSeed'

/** Read gallery kanban scale from localStorage (200 or 1000 cards). */
export function readKanbanScaleSeed(): KanbanScaleSeed | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(KANBAN_SCALE_SEED_KEY)?.trim()
  if (raw === '200') return 200
  if (raw === '1000') return 1000
  return null
}

export function writeKanbanScaleSeed(scale: KanbanScaleSeed): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KANBAN_SCALE_SEED_KEY, String(scale))
}
