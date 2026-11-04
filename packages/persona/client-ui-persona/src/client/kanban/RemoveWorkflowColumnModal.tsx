/** Pick a destination when removing a column that still has tickets. */

import type { ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Modal } from '../primitives/index.ts'
import type { EditorColumnDraft } from './workflow-editor-draft.ts'
import styles from './Kanban.module.css'

export interface RemoveWorkflowColumnModalProps {
  readonly dict: LocaleDict
  readonly columnName: string
  readonly ticketCount: number
  readonly destinations: readonly EditorColumnDraft[]
  readonly onClose: () => void
  readonly onConfirm: (destinationColumnId: string) => void
}

export function RemoveWorkflowColumnModal({
  dict,
  columnName,
  ticketCount,
  destinations,
  onClose,
  onConfirm,
}: RemoveWorkflowColumnModalProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return (
    <Modal
      open={true}
      size="m"
      title={t('editor.remove.title', { name: columnName, count: ticketCount })}
      description={t('editor.remove.hint')}
      closeLabel={t('editor.discard')}
      onClose={onClose}
      footer={(
        <Button variant="ghost" onClick={onClose}>{t('editor.discard')}</Button>
      )}
    >
      <div className={styles.removeDestGrid} role="group" aria-label={t('editor.remove.pick')}>
        {destinations.map(column => (
          <Button
            key={column.id}
            variant="secondary"
            onClick={() => { onConfirm(column.id) }}
          >
            {column.name}
          </Button>
        ))}
      </div>
    </Modal>
  )
}
