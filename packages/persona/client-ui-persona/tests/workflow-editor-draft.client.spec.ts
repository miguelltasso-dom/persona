import { describe, expect, it } from 'vitest'
import {
  editorColumnsFromFlow,
  moveEditorColumn,
  reorderEditorColumn,
  removedColumnIds,
  toWorkflowColumnViews,
  toWorkflowFieldViews,
  validateEditorColumns,
} from '../src/client/kanban/workflow-editor-draft.ts'
import type { FlowColumnModel } from '../src/client/kanban/flow-types.ts'

const BASE: readonly FlowColumnModel[] = [
  { id: 'a', name: 'Backlog', category: 'todo' },
  { id: 'b', name: 'Doing', category: 'doing' },
  { id: 'c', name: 'Done', category: 'done' },
]

describe('workflow-editor-draft', () => {
  it('requires todo and done categories', () => {
    const onlyDoing = editorColumnsFromFlow([{ id: 'x', name: 'X', category: 'doing' }])
    expect(validateEditorColumns(onlyDoing)).toBe('missing_todo')
    const withoutDone = editorColumnsFromFlow(BASE.filter(column => column.category !== 'done'))
    expect(validateEditorColumns(withoutDone)).toBe('missing_done')
    expect(validateEditorColumns(editorColumnsFromFlow(BASE))).toBe('ok')
  })

  it('reorders and detects removed column ids', () => {
    const draft = editorColumnsFromFlow(BASE)
    const moved = reorderEditorColumn(draft, 2, 'up')
    expect(moved.map(column => column.id)).toEqual(['a', 'c', 'b'])
    const trimmed = draft.filter(column => column.id !== 'b')
    expect(removedColumnIds(BASE, trimmed)).toEqual(['b'])
  })

  it('round-trips optional column color to host views', () => {
    const draft = editorColumnsFromFlow([{ id: 'a', name: 'Backlog', category: 'todo', color: '#6366F1' }])
    expect(toWorkflowColumnViews(draft)[0]?.color).toBe('#6366F1')
  })

  it('moves columns for drag reorder', () => {
    const draft = editorColumnsFromFlow(BASE)
    expect(moveEditorColumn(draft, 0, 2).map(column => column.id)).toEqual(['b', 'c', 'a'])
  })

  it('serializes extra fields including select options', () => {
    const views = toWorkflowFieldViews([
      { id: 'f1', name: 'Prazo', kind: 'date' },
      { id: 'f2', name: 'Prioridade', kind: 'select', options: ['Alta', 'Baixa'] },
    ])
    expect(views[1]?.options).toEqual(['Alta', 'Baixa'])
  })
})
