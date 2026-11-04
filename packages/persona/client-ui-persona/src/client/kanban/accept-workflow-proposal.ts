/** Map tickets off removed columns when applying a Coordination proposal (PB-3). */

import type { WorkflowColumnView } from '@deepseek-ai/dsh-persona-host/types'

/**
 * @param currentColumns - Columns before accept.
 * @param nextColumns - Proposed columns.
 * @param ticketCountByColumn - Ticket counts keyed by column id.
 * @returns `destByRemoved` for `updateWorkflow`.
 */
export function destByRemovedForProposal(
  currentColumns: readonly Pick<WorkflowColumnView, 'id'>[],
  nextColumns: readonly WorkflowColumnView[],
  ticketCountByColumn: Readonly<Record<string, number>>,
): Record<string, string> {
  const nextIds = new Set(nextColumns.map(column => column.id))
  const fallback = nextColumns.find(column => column.category === 'todo')?.id ?? nextColumns[0]?.id
  if (fallback === undefined) return {}
  const dest: Record<string, string> = {}
  for (const column of currentColumns) {
    if (!nextIds.has(column.id) && (ticketCountByColumn[column.id] ?? 0) > 0) {
      dest[column.id] = fallback
    }
  }
  return dest
}
