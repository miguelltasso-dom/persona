/**
 * P1-10 — "Desfazer" after a card is moved. The undo is only offered when moving back puts everything back exactly as it
 * was. The host rewrites the card's stage on every move (`applyCategoryToTicket`):
 *  - into "Concluído" it closes the task and drops the question and the pending delivery;
 *  - into "A fazer" it drops the report of the last run;
 *  - out of "Precisa de você" it drops the real question (moving back only brings a generic one);
 *  - "blocked" columns keep their own reason.
 * So the person only gets "Desfazer" for a move that starts in A fazer / Em andamento / Em revisão and ends in
 * Em andamento / Em revisão. Everything else is a deliberate step: no promise we cannot keep.
 */

import type { StageCategory } from '../boards/types.ts'
import type { FlowColumnModel } from './flow-types.ts'

/** How long the "Desfazer" notice stays (the same 6 s as the decisions' one). */
export { DECISION_UNDO_MS as MOVE_UNDO_MS } from '../decisions/decision-types.ts'

const FROM_CATEGORIES: ReadonlySet<StageCategory> = new Set<StageCategory>(['todo', 'doing', 'review'])
const TO_CATEGORIES: ReadonlySet<StageCategory> = new Set<StageCategory>(['doing', 'review'])

export interface UndoableMove {
  /** Where the card was: the undo moves it back here. */
  readonly fromColumnId: string
  readonly fromName: string
  /** Where the person put it: the notice says "Movido para {toName}". */
  readonly toName: string
}

/**
 * @param columns - The board's columns (with their categories).
 * @param fromColumnId - The column the card was in before the move.
 * @param toColumnId - The column the person moved it to.
 * @returns The data for the "Desfazer" notice, or `null` when the move cannot be undone without losing something.
 */
export function undoableMove(
  columns: readonly FlowColumnModel[],
  fromColumnId: string,
  toColumnId: string,
): UndoableMove | null {
  if (fromColumnId === toColumnId) return null
  const from = columns.find(column => column.id === fromColumnId)
  const to = columns.find(column => column.id === toColumnId)
  if (from === undefined || to === undefined) return null
  if (!FROM_CATEGORIES.has(from.category) || !TO_CATEGORIES.has(to.category)) return null
  return { fromColumnId: from.id, fromName: from.name, toName: to.name }
}
