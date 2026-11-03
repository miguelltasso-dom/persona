/** Shared Kanban grid: columns, drag-drop, surface states. */

import { useCallback, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Chip } from '../primitives/index.ts'
import { KanbanCard } from './KanbanCard.tsx'
import styles from './Kanban.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from './PersonaSurface.tsx'
import {
  KANBAN_COLUMN_ORDER,
  type KanbanCardModel,
  type KanbanColumnId,
  type KanbanSurfaceState,
} from './types.ts'

export interface KanbanBoardProps {
  readonly dict: LocaleDict
  readonly cards: readonly KanbanCardModel[]
  readonly surfaceState: KanbanSurfaceState
  readonly showProjectOnCard: boolean
  readonly columnLabels: Readonly<Record<KanbanColumnId, string>>
  readonly onMoveCard?: (cardId: string, toColumn: KanbanColumnId) => void
  readonly onOpenReview?: (cardId: string) => void
  readonly onRetry?: () => void
  readonly onEmptyPrimary?: () => void
}

function groupByColumn(cards: readonly KanbanCardModel[]): Record<KanbanColumnId, KanbanCardModel[]> {
  const grouped: Record<KanbanColumnId, KanbanCardModel[]> = {
    todo: [],
    in_progress: [],
    in_review: [],
    blocked: [],
    done: [],
  }
  for (const card of cards) grouped[card.column].push(card)
  return grouped
}

/** Five-column board with HTML5 drag and drop. */
export function KanbanBoard({
  dict,
  cards,
  surfaceState,
  showProjectOnCard,
  columnLabels,
  onMoveCard,
  onOpenReview,
  onRetry,
  onEmptyPrimary,
}: KanbanBoardProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropColumn, setDropColumn] = useState<KanbanColumnId | null>(null)

  const grouped = useMemo(() => groupByColumn(cards), [cards])

  const onDragStart = useCallback((cardId: string) => {
    setDraggingId(cardId)
  }, [])

  const onDragEnd = useCallback(() => {
    setDraggingId(null)
    setDropColumn(null)
  }, [])

  const onColumnDragOver = (event: DragEvent, column: KanbanColumnId): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropColumn(column)
  }

  const onColumnDrop = (event: DragEvent, column: KanbanColumnId): void => {
    event.preventDefault()
    const cardId = event.dataTransfer.getData('text/persona-kanban-card')
    if (cardId.length > 0) onMoveCard?.(cardId, column)
    onDragEnd()
  }

  if (surfaceState === 'loading') {
    return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={5} />
  }

  if (surfaceState === 'error') {
    return (
      <PersonaSurfaceError
        dict={dict}
        titleKey="error.title"
        retryKey="error.retry"
        onRetry={() => onRetry?.()}
      />
    )
  }

  if (surfaceState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationKey="empty-kanban"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
        onPrimary={() => onEmptyPrimary?.()}
      />
    )
  }

  return (
    <div className={styles.board} role="region" aria-label={t('drag.hint')}>
      {KANBAN_COLUMN_ORDER.map((columnId) => {
        const columnCards = grouped[columnId]
        const highlighted = dropColumn === columnId
        return (
          <section
            key={columnId}
            className={`${styles.column}${highlighted ? ` ${styles.columnDropTarget}` : ''}`}
            aria-labelledby={`col-${columnId}`}
            onDragOver={(e) => { onColumnDragOver(e, columnId) }}
            onDragLeave={() => { setDropColumn(null) }}
            onDrop={(e) => { onColumnDrop(e, columnId) }}
          >
            <header className={styles.columnHeader} id={`col-${columnId}`}>
              <span className={styles.columnTitle}>{columnLabels[columnId]}</span>
              <Chip size="s" tone="neutral" aria-label={`${columnCards.length}`}>
                {columnCards.length}
              </Chip>
            </header>
            <div className={styles.columnBody}>
              {columnCards.map(card => (
                <KanbanCard
                  key={card.id}
                  dict={dict}
                  card={card}
                  draggingId={draggingId}
                  showProject={showProjectOnCard}
                  onDragStart={(id) => { onDragStart(id) }}
                  onDragEnd={onDragEnd}
                  {...(onOpenReview !== undefined ? { onOpenReview } : {})}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
