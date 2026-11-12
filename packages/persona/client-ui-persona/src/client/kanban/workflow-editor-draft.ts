/** Pure helpers for the workflow editor (BOARDS-SPEC §5). */

import { randomUuid } from '../remote/random-id.ts'
import type { WorkflowColumnView, WorkflowFieldView } from '@deepseek-ai/dsh-persona-host/types'
import type { FlowColumnModel, FlowCardModel } from './flow-types.ts'

export type EditorColumnCategory = WorkflowColumnView['category']

export interface EditorColumnDraft {
  readonly id: string
  readonly name: string
  readonly category: EditorColumnCategory
  readonly wip?: number
  readonly color?: string
}

/** Optional column accent colors (BOARDS-SPEC §5). */
export const EDITOR_COLUMN_COLOR_PRESETS: readonly string[] = [
  '#9B87F5',
  '#6366F1',
  '#38BDF8',
  '#F97316',
  '#22C55E',
  '#A855F7',
  '#64748B',
]

export type EditorValidation = 'ok' | 'missing_todo' | 'missing_done'

export function editorColumnsFromFlow(columns: readonly FlowColumnModel[]): EditorColumnDraft[] {
  return columns.map(column => ({
    id: column.id,
    name: column.name,
    category: column.category === 'blocked' ? 'needs_you' : column.category,
    ...(column.wip === undefined ? {} : { wip: column.wip }),
    ...(column.color === undefined ? {} : { color: column.color }),
  }))
}

export function validateEditorColumns(columns: readonly EditorColumnDraft[]): EditorValidation {
  const hasTodo = columns.some(column => column.category === 'todo')
  const hasDone = columns.some(column => column.category === 'done')
  if (!hasTodo) return 'missing_todo'
  if (!hasDone) return 'missing_done'
  return 'ok'
}

export function ticketCountByColumnId(cards: readonly FlowCardModel[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const card of cards) {
    counts[card.columnId] = (counts[card.columnId] ?? 0) + 1
  }
  return counts
}

export function removedColumnIds(
  original: readonly Pick<FlowColumnModel, 'id'>[],
  draft: readonly EditorColumnDraft[],
): readonly string[] {
  const keep = new Set(draft.map(column => column.id))
  return original.filter(column => !keep.has(column.id)).map(column => column.id)
}

/** Move one column to a new index (drag-and-drop). */
export function moveEditorColumn(
  columns: readonly EditorColumnDraft[],
  fromIndex: number,
  toIndex: number,
): EditorColumnDraft[] {
  if (fromIndex === toIndex) return [...columns]
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= columns.length || toIndex >= columns.length) return [...columns]
  const next = [...columns]
  const row = next[fromIndex]
  if (row === undefined) return [...columns]
  next.splice(fromIndex, 1)
  next.splice(toIndex, 0, row)
  return next
}

export function reorderEditorColumn(
  columns: readonly EditorColumnDraft[],
  index: number,
  direction: 'up' | 'down',
): EditorColumnDraft[] {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= columns.length) return [...columns]
  const next = [...columns]
  const row = next[index]
  const swap = next[target]
  if (row === undefined || swap === undefined) return [...columns]
  next[index] = swap
  next[target] = row
  return next
}

export function newEditorColumnId(existing: ReadonlySet<string>): string {
  let attempt = 0
  while (attempt < 8) {
    const id = `col-${randomUuid()}`
    if (!existing.has(id)) return id
    attempt += 1
  }
  return `col-${Date.now()}`
}

export function toWorkflowColumnViews(columns: readonly EditorColumnDraft[]): WorkflowColumnView[] {
  return columns.map(column => ({
    id: column.id,
    name: column.name.trim(),
    category: column.category,
    ...(column.wip === undefined || Number.isNaN(column.wip) ? {} : { wip: column.wip }),
    ...(column.color === undefined || column.color.length === 0 ? {} : { color: column.color }),
  }))
}

export type EditorFieldKind = WorkflowFieldView['kind']

export interface EditorFieldDraft {
  readonly id: string
  readonly name: string
  readonly kind: EditorFieldKind
  readonly options?: readonly string[]
}

export const EDITOR_FIELD_KINDS: readonly EditorFieldKind[] = ['text', 'link', 'number', 'date', 'select']

export function editorFieldsFromHost(fields: readonly WorkflowFieldView[]): EditorFieldDraft[] {
  return fields.map(field => ({
    id: field.id,
    name: field.name,
    kind: field.kind,
    ...(field.options === undefined || field.options.length === 0 ? {} : { options: [...field.options] }),
  }))
}

export function newEditorFieldId(existing: ReadonlySet<string>): string {
  let attempt = 0
  while (attempt < 8) {
    const id = `field-${randomUuid()}`
    if (!existing.has(id)) return id
    attempt += 1
  }
  return `field-${Date.now()}`
}

export function toWorkflowFieldViews(fields: readonly EditorFieldDraft[]): WorkflowFieldView[] {
  return fields
    .filter(field => field.name.trim().length > 0)
    .map(field => ({
      id: field.id,
      name: field.name.trim(),
      kind: field.kind,
      ...(field.kind === 'select' && field.options !== undefined && field.options.length > 0
        ? { options: field.options.map(option => option.trim()).filter(option => option.length > 0) }
        : {}),
    }))
}
