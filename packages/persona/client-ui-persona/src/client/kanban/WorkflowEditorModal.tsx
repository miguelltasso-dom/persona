/** Flow editor with live preview and save (BOARDS-SPEC §5). */

import { useMemo, useState, type ReactNode } from 'react'
import type { WorkflowColumnView, WorkflowFieldView } from '@deepseek-ai/dsh-persona-host/types'
import type { FlowModelId } from '../boards/types.ts'
import { columnCategoryHeaderLabel, columnEmptyLabel } from '../boards/board-locale.ts'
import { flowModelLabel } from '../boards/flow-models.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { BoardColumn, BoardColumns, Button, Chip, IconButton, Input, Modal, UiIcon } from '../primitives/index.ts'
import type { FlowColumnModel } from './flow-types.ts'
import { RemoveWorkflowColumnModal } from './RemoveWorkflowColumnModal.tsx'
import styles from './Kanban.module.css'
import {
  editorColumnsFromFlow,
  editorFieldsFromHost,
  EDITOR_FIELD_KINDS,
  moveEditorColumn,
  newEditorColumnId,
  newEditorFieldId,
  reorderEditorColumn,
  removedColumnIds,
  toWorkflowColumnViews,
  toWorkflowFieldViews,
  validateEditorColumns,
  type EditorColumnCategory,
  EDITOR_COLUMN_COLOR_PRESETS,
  type EditorColumnDraft,
  type EditorFieldDraft,
} from './workflow-editor-draft.ts'

const EDITOR_CATEGORIES: readonly EditorColumnCategory[] = ['todo', 'doing', 'review', 'needs_you', 'done']

export interface WorkflowEditorModalProps {
  readonly dict: LocaleDict
  readonly flowModel: FlowModelId
  readonly columns: readonly FlowColumnModel[]
  readonly ticketCountByColumn: Readonly<Record<string, number>>
  readonly fields: readonly WorkflowFieldView[]
  readonly onClose: () => void
  readonly onSave: (
    columns: readonly WorkflowColumnView[],
    destByRemoved: Readonly<Record<string, string>>,
    fields: readonly WorkflowFieldView[],
  ) => void | Promise<void>
}

export function WorkflowEditorModal({
  dict,
  flowModel,
  columns,
  ticketCountByColumn,
  fields,
  onClose,
  onSave,
}: WorkflowEditorModalProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [draft, setDraft] = useState<EditorColumnDraft[]>(() => editorColumnsFromFlow(columns))
  const [fieldDraft, setFieldDraft] = useState<EditorFieldDraft[]>(() => editorFieldsFromHost(fields))
  const [dragColumnIndex, setDragColumnIndex] = useState<number | null>(null)
  const [destByRemoved, setDestByRemoved] = useState<Record<string, string>>({})
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string; count: number } | null>(null)
  const [savePending, setSavePending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const validation = validateEditorColumns(draft)
  const removed = useMemo(() => removedColumnIds(columns, draft), [columns, draft])
  const missingDest = removed.some(id => destByRemoved[id] === undefined && (ticketCountByColumn[id] ?? 0) > 0)

  const updateColumn = (index: number, patch: Partial<EditorColumnDraft>): void => {
    setDraft(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  /**
   * Tarefas que já foram mandadas PARA esta coluna por colunas removidas antes: se ela também for removida,
   * essas tarefas precisam de um novo destino (senão o destino escolhido antes deixa de existir e o cartão fica sem coluna).
   */
  const inboundCount = (columnId: string): number => Object.entries(destByRemoved)
    .reduce((sum, [removedId, destId]) => (destId === columnId ? sum + (ticketCountByColumn[removedId] ?? 0) : sum), 0)

  const tryRemoveColumn = (index: number): void => {
    const row = draft[index]
    if (row === undefined) return
    const count = (ticketCountByColumn[row.id] ?? 0) + inboundCount(row.id)
    if (count > 0) {
      setPendingRemove({ id: row.id, name: row.name, count })
      return
    }
    setDraft(prev => prev.filter((_, i) => i !== index))
  }

  const confirmRemove = (destinationId: string): void => {
    if (pendingRemove === null) return
    // As colunas já removidas que apontavam para esta passam a apontar para o novo destino.
    setDestByRemoved((prev) => {
      const next: Record<string, string> = {}
      for (const [removedId, destId] of Object.entries(prev)) next[removedId] = destId === pendingRemove.id ? destinationId : destId
      next[pendingRemove.id] = destinationId
      return next
    })
    setDraft(prev => prev.filter(column => column.id !== pendingRemove.id))
    setPendingRemove(null)
  }

  const addColumn = (): void => {
    const ids = new Set(draft.map(column => column.id))
    const id = newEditorColumnId(ids)
    setDraft(prev => [...prev, { id, name: t('editor.newColumn'), category: 'todo' }])
  }

  const updateField = (index: number, patch: Partial<EditorFieldDraft>): void => {
    setFieldDraft(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addField = (): void => {
    const ids = new Set(fieldDraft.map(field => field.id))
    const id = newEditorFieldId(ids)
    setFieldDraft(prev => [...prev, { id, name: t('editor.newField'), kind: 'text' }])
  }

  const dropColumnAt = (targetIndex: number): void => {
    if (dragColumnIndex === null || dragColumnIndex === targetIndex) return
    setDraft(prev => moveEditorColumn(prev, dragColumnIndex, targetIndex))
    setDragColumnIndex(null)
  }

  const onSubmit = (): void => {
    if (validation !== 'ok' || missingDest) return
    setSavePending(true)
    setSaveError(null)
    void Promise.resolve(onSave(toWorkflowColumnViews(draft), destByRemoved, toWorkflowFieldViews(fieldDraft)))
      .then(() => { onClose() })
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : t('error.title'))
      })
      .finally(() => { setSavePending(false) })
  }

  const validationMessage = validation === 'missing_todo'
    ? t('editor.validation.todo')
    : validation === 'missing_done'
      ? t('editor.validation.done')
      : missingDest
        ? t('editor.validation.destination')
        : null

  return (
    <>
      <Modal
        open={true}
        size="l"
        title={t('editor.title')}
        closeLabel={t('editor.discard')}
        onClose={onClose}
        footer={(
          <>
            <Button variant="ghost" onClick={onClose}>{t('editor.discard')}</Button>
            <Button
              variant="primary"
              disabled={validation !== 'ok' || missingDest || savePending}
              onClick={onSubmit}
            >
              {t('editor.save')}
            </Button>
          </>
        )}
      >
        <p className={styles.stateHint}>{flowModelLabel(dict, flowModel)}</p>
        {validationMessage !== null && (
          <p className={styles.editorValidation} role="status">
            <UiIcon name="alert" size={16} />
            {validationMessage}
          </p>
        )}
        {saveError !== null && (
          <p className={styles.editorValidation} role="alert">{saveError}</p>
        )}
        <div className={styles.editorSplit}>
          <div className={styles.editorPane}>
            <h3 className={styles.planningHeading}>{t('editor.columns')}</h3>
            <ul className={styles.editorList}>
              {draft.map((column, index) => (
                <li
                  key={column.id}
                  className={styles.editorRowStack}
                  data-dragging={dragColumnIndex === index ? '' : undefined}
                  onDragOver={(event) => { event.preventDefault() }}
                  onDrop={() => { dropColumnAt(index) }}
                >
                  <div className={styles.editorRow}>
                    <button
                      type="button"
                      className={styles.editorDragHandle}
                      draggable
                      aria-label={t('editor.dragColumn')}
                      onDragStart={() => { setDragColumnIndex(index) }}
                      onDragEnd={() => { setDragColumnIndex(null) }}
                    >
                      <UiIcon name="more" size={16} />
                    </button>
                    <span
                      className={styles.flowColumnDot}
                      data-persona-cat={column.color === undefined ? column.category : undefined}
                      style={column.color === undefined ? undefined : { background: column.color }}
                    />
                    <Input
                      label={t('editor.columnName')}
                      hideLabel
                      value={column.name}
                      onChange={(event) => { updateColumn(index, { name: event.target.value }) }}
                    />
                    <div className={styles.editorRowActions}>
                      <IconButton
                        label={t('editor.moveUp')}
                        icon={<UiIcon name="chevronRight" size={16} className={styles.editorChevronUp} />}
                        onClick={() => { setDraft(reorderEditorColumn(draft, index, 'up')) }}
                      />
                      <IconButton
                        label={t('editor.moveDown')}
                        icon={<UiIcon name="chevronDown" size={16} />}
                        onClick={() => { setDraft(reorderEditorColumn(draft, index, 'down')) }}
                      />
                      <IconButton
                        label={t('editor.removeColumn')}
                        icon={<UiIcon name="close" size={16} />}
                        onClick={() => { tryRemoveColumn(index) }}
                      />
                    </div>
                  </div>
                  <div className={styles.editorCategoryRow} role="group" aria-label={t('editor.categoryGroup')}>
                    {EDITOR_CATEGORIES.map(category => (
                      <Button
                        key={category}
                        variant="ghost"
                        size="s"
                        aria-pressed={column.category === category}
                        onClick={() => { updateColumn(index, { category }) }}
                      >
                        {t(`category.${category}`)}
                      </Button>
                    ))}
                  </div>
                  <div className={styles.editorColorRow} role="group" aria-label={t('editor.colorGroup')}>
                    <Button
                      variant="ghost"
                      size="s"
                      aria-pressed={column.color === undefined}
                      onClick={() => {
                        setDraft(prev => prev.map((row, i) => {
                          if (i !== index) return row
                          const { color, ...rest } = row
                          return rest
                        }))
                      }}
                    >
                      {t('editor.colorReset')}
                    </Button>
                    {EDITOR_COLUMN_COLOR_PRESETS.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={styles.editorColorSwatch}
                        aria-label={t('editor.colorPick', { color })}
                        aria-pressed={column.color === color}
                        style={{ background: color }}
                        onClick={() => { updateColumn(index, { color }) }}
                      />
                    ))}
                  </div>
                  <Input
                    label={t('editor.wip')}
                    type="number"
                    min={0}
                    value={column.wip ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value
                      if (raw === '') {
                        setDraft(prev => prev.map((row, i) => {
                          if (i !== index) return row
                          const { wip, ...rest } = row
                          return rest
                        }))
                      } else {
                        updateColumn(index, { wip: Number(raw) })
                      }
                    }}
                  />
                  {(ticketCountByColumn[column.id] ?? 0) > 0 && (
                    <Chip size="s" tone="neutral">{t('editor.ticketCount', { count: ticketCountByColumn[column.id] ?? 0 })}</Chip>
                  )}
                </li>
              ))}
            </ul>
            <Button variant="secondary" onClick={addColumn}>{t('editor.addColumn')}</Button>
            <h3 className={styles.planningHeading}>{t('editor.fields')}</h3>
            <ul className={styles.editorList}>
              {fieldDraft.map((field, index) => (
                <li key={field.id} className={styles.editorRowStack}>
                  <div className={styles.editorRow}>
                    <Input
                      label={t('editor.fieldName')}
                      hideLabel
                      value={field.name}
                      onChange={(event) => { updateField(index, { name: event.target.value }) }}
                    />
                    <IconButton
                      label={t('editor.removeField')}
                      icon={<UiIcon name="close" size={16} />}
                      onClick={() => { setFieldDraft(prev => prev.filter((_, i) => i !== index)) }}
                    />
                  </div>
                  <div className={styles.editorCategoryRow} role="group" aria-label={t('editor.fieldKind')}>
                    {EDITOR_FIELD_KINDS.map(kind => (
                      <Button
                        key={kind}
                        variant="ghost"
                        size="s"
                        aria-pressed={field.kind === kind}
                        onClick={() => { updateField(index, { kind }) }}
                      >
                        {t(`editor.fieldKind.${kind}`)}
                      </Button>
                    ))}
                  </div>
                  {field.kind === 'select' && (
                    <Input
                      label={t('editor.fieldOptions')}
                      value={field.options?.join(', ') ?? ''}
                      onChange={(event) => {
                        const options = event.target.value.split(',').map(part => part.trim()).filter(part => part.length > 0)
                        setFieldDraft(prev => prev.map((row, i) => {
                          if (i !== index) return row
                          if (options.length === 0) {
                            const { options: _removed, ...rest } = row
                            return rest
                          }
                          return { ...row, options }
                        }))
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
            <Button variant="secondary" onClick={addField}>{t('editor.addField')}</Button>
          </div>
          <div className={styles.editorPane}>
            <h3 className={styles.planningHeading}>{t('editor.preview')}</h3>
            <div className={styles.editorPreviewWrap}>
              <BoardColumns label={t('a11y.editorPreview')}>
                {draft.map((column) => {
                  const count = ticketCountByColumn[column.id] ?? 0
                  return (
                    <BoardColumn
                      key={column.id}
                      name={column.name}
                      category={column.category}
                      categoryLabel={columnCategoryHeaderLabel(dict, column.category)}
                      count={count}
                      {...(column.wip === undefined ? {} : { wipLimit: column.wip })}
                      emptyLabel={columnEmptyLabel(dict, column.category)}
                    />
                  )
                })}
              </BoardColumns>
            </div>
          </div>
        </div>
      </Modal>
      {pendingRemove !== null && (
        <RemoveWorkflowColumnModal
          dict={dict}
          columnName={pendingRemove.name}
          ticketCount={pendingRemove.count}
          destinations={draft.filter(column => column.id !== pendingRemove.id)}
          onClose={() => { setPendingRemove(null) }}
          onConfirm={confirmRemove}
        />
      )}
    </>
  )
}
