/** Shared Kanban grid: columns, drag-drop, surface states. */

import { useCallback, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useKanbanCarry } from './use-kanban-carry.ts'
import { useKanbanFlip } from './use-kanban-flip.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Chip, EmptyState, FixedRowVirtualScroller } from '../primitives/index.ts'
import { KANBAN_CARD_ROW_PX, KANBAN_COLUMN_VIRTUAL_MIN } from './kanban-virtual.ts'
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
  readonly onRequestStatus?: (cardId: string) => void
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
  onRequestStatus,
  onRetry,
  onEmptyPrimary,
}: KanbanBoardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropColumn, setDropColumn] = useState<KanbanColumnId | null>(null)

  const { cards: carryCards, markLocalMove, isCarried } = useKanbanCarry(cards)
  const grouped = useMemo(() => groupByColumn(carryCards), [carryCards])
  const boardRef = useRef<HTMLDivElement>(null)
  const cardsKey = useMemo(() => carryCards.map(c => `${c.id}:${c.column}`).join('|'), [carryCards])
  useKanbanFlip(boardRef, cardsKey, isCarried)

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
    if (cardId.length > 0) {
      markLocalMove(cardId)
      onMoveCard?.(cardId, column)
    }
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
    <div ref={boardRef} className={styles.board} role="region" aria-label={t('a11y.boardRegion')}>
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
              <Chip
                size="s"
                tone="neutral"
                aria-label={t('a11y.columnCount', { column: columnLabels[columnId], count: columnCards.length })}
              >
                {columnCards.length}
              </Chip>
            </header>
            <div className={styles.columnBody}>
              {columnCards.length === 0 && (
                <EmptyState
                  compact
                  illustration={ILLUSTRATIONS['empty-kanban']}
                  title={t('empty.column')}
                />
              )}
              {columnCards.length >= KANBAN_COLUMN_VIRTUAL_MIN ? (
                <FixedRowVirtualScroller
                  {...(styles.columnVirtual === undefined ? {} : { className: styles.columnVirtual })}
                  rowCount={columnCards.length}
                  rowHeight={KANBAN_CARD_ROW_PX}
                  getRowKey={index => columnCards[index]?.id ?? `col-${columnId}-row-${index}`}
                  renderRow={(index) => {
                    const card = columnCards[index]
                    if (card === undefined) return null
                    return (
                      <div className={styles.columnVirtualSlot}>
                        <KanbanCard
                          dict={dict}
                          card={card}
                          draggingId={draggingId}
                          showProject={showProjectOnCard}
                          columnLabels={columnLabels}
                          onDragStart={(id) => { onDragStart(id) }}
                          onDragEnd={onDragEnd}
                          {...(onMoveCard !== undefined
                            ? { onMoveCard: (id: string, toColumn: KanbanColumnId) => { markLocalMove(id); onMoveCard(id, toColumn) } }
                            : {})}
                          {...(onOpenReview !== undefined ? { onOpenReview } : {})}
                          {...(onRequestStatus !== undefined ? { onRequestStatus } : {})}
                        />
                      </div>
                    )
                  }}
                />
              ) : columnCards.map(card => (
                <KanbanCard
                  key={card.id}
                  dict={dict}
                  card={card}
                  draggingId={draggingId}
                  showProject={showProjectOnCard}
                  columnLabels={columnLabels}
                  onDragStart={(id) => { onDragStart(id) }}
                  onDragEnd={onDragEnd}
                  {...(onMoveCard !== undefined
                    ? { onMoveCard: (id: string, toColumn: KanbanColumnId) => { markLocalMove(id); onMoveCard(id, toColumn) } }
                    : {})}
                  {...(onOpenReview !== undefined ? { onOpenReview } : {})}
                  {...(onRequestStatus !== undefined ? { onRequestStatus } : {})}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
