/** Workflow columns board (BOARDS-SPEC §2.2) — Muse {@link BoardColumns} + {@link BoardColumn}. */

import { useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import {
  columnCategoryHeaderLabel,
  columnEmptyLabel,
  toPrimitiveCategory,
} from '../boards/board-locale.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { BoardColumn, BoardColumns, Button } from '../primitives/index.ts'
import { KanbanCard } from './KanbanCard.tsx'
import { useKanbanCarry } from './use-kanban-carry.ts'
import { useKanbanFlip } from './use-kanban-flip.ts'
import type { FlowCardModel, FlowColumnModel } from './flow-types.ts'
import type { KanbanColumnId, KanbanSurfaceState } from './types.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from './PersonaSurface.tsx'
import { PersonaCardPopoverHost, usePersonaCardController } from '../profile/PersonaCardPopoverHost.tsx'
import type { PersonaCardShellBridge } from '../remote/persona-card-shell-bridge.ts'
import styles from './Kanban.module.css'

export interface FlowKanbanBoardProps {
  readonly dict: LocaleDict
  readonly columns: readonly FlowColumnModel[]
  readonly cards: readonly FlowCardModel[]
  readonly surfaceState: KanbanSurfaceState
  readonly projectName: string
  readonly onMoveCard?: (ticketId: string, columnId: string) => void
  readonly onOpenReview?: (ticketId: string) => void
  readonly onRetry?: () => void
  readonly onAddTask?: () => void
  readonly freshApprovalStampIds?: ReadonlySet<string>
  readonly celebrationNode?: ReactNode
  readonly personaCard?: PersonaCardShellBridge | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
}

/** Horizontal flow columns with drag-drop onto column ids. */
export function FlowKanbanBoard({
  dict,
  columns,
  cards,
  surfaceState,
  onMoveCard,
  onOpenReview,
  onRetry,
  onAddTask,
  freshApprovalStampIds,
  celebrationNode,
  personaCard,
  openPersonaProfile,
}: FlowKanbanBoardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const cardController = usePersonaCardController()
  const cardData = cardController.personaId === null || personaCard === undefined
    ? undefined
    : personaCard.cardInfo(cardController.personaId)
  const assigneeCardTrigger = personaCard === undefined
    ? undefined
    : (personaId: string) => {
      const props = cardController.triggerProps(personaId)
      return {
        ...props,
        onPointerEnter: (event: MouseEvent<HTMLElement>) => {
          personaCard.prefetch(personaId)
          props.onPointerEnter(event)
        },
        onClick: (event: MouseEvent<HTMLElement>) => {
          personaCard.prefetch(personaId)
          props.onClick(event)
        },
      }
    }
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropColumnId, setDropColumnId] = useState<string | null>(null)
  const [liveMessage, setLiveMessage] = useState('')

  const { cards: carryCards, markLocalMove, isCarried } = useKanbanCarry(cards, card => card.columnId)

  const grouped = useMemo(() => {
    const map = new Map<string, FlowCardModel[]>()
    for (const column of columns) map.set(column.id, [])
    for (const card of carryCards) {
      const list = map.get(card.columnId) ?? []
      list.push(card)
      map.set(card.columnId, list)
    }
    return map
  }, [columns, carryCards])

  const boardRef = useRef<HTMLDivElement>(null)
  const cardsKey = useMemo(() => carryCards.map(c => `${c.id}:${c.columnId}`).join('|'), [carryCards])
  useKanbanFlip(boardRef, cardsKey, isCarried)

  const flowMoveTargets = useMemo(
    () => columns.map(column => ({ id: column.id, label: column.name })),
    [columns],
  )

  const columnLabels = useMemo((): Record<KanbanColumnId, string> => ({
    todo: t('column.todo'),
    in_progress: t('column.inProgress'),
    in_review: t('column.inReview'),
    blocked: t('column.blocked'),
    done: t('column.done'),
  }), [dict])

  const onDragStart = useCallback((cardId: string) => { setDraggingId(cardId) }, [])
  const onDragEnd = useCallback(() => {
    setDraggingId(null)
    setDropColumnId(null)
  }, [])

  const onColumnDragOver = (event: DragEvent, columnId: string): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropColumnId(columnId)
  }

  const onColumnDrop = (event: DragEvent, column: FlowColumnModel): void => {
    event.preventDefault()
    const cardId = event.dataTransfer.getData('text/persona-kanban-card')
    if (cardId.length > 0) {
      markLocalMove(cardId)
      onMoveCard?.(cardId, column.id)
      setLiveMessage(t('flow.movedTo', { column: column.name }))
    }
    onDragEnd()
  }

  if (surfaceState === 'loading') {
    return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={4} />
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
  if (surfaceState === 'empty' || columns.length === 0) {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationKey="empty-kanban"
        titleKey="empty.title"
        hintKey="empty.hint"
      />
    )
  }

  const firstTodoColumnId = columns.find(column => column.category === 'todo')?.id

  return (
    <>
      <p className={styles.stateHint}>{t('drag.hint')}</p>
      <div ref={boardRef} className={styles.flowBoardCelebrate}>
        {celebrationNode}
        <BoardColumns label={t('a11y.boardRegion')}>
          {columns.map((column) => {
            const columnCards = grouped.get(column.id) ?? []
            const count = columnCards.length
            const isFirstTodo = column.id === firstTodoColumnId
            return (
              <div
                key={column.id}
                onDragOver={(event) => { onColumnDragOver(event, column.id) }}
                onDragLeave={() => { setDropColumnId(null) }}
                onDrop={(event) => { onColumnDrop(event, column) }}
              >
                <BoardColumn
                  name={column.name}
                  category={toPrimitiveCategory(column.category)}
                  categoryLabel={columnCategoryHeaderLabel(dict, column.category)}
                  count={count}
                  {...(column.wip === undefined ? {} : { wipLimit: column.wip })}
                  emptyLabel={columnEmptyLabel(dict, column.category)}
                  dropTarget={dropColumnId === column.id}
                  {...(isFirstTodo && onAddTask !== undefined
                    ? {
                      emptyAction: (
                        <Button variant="ghost" size="s" onClick={() => { onAddTask() }}>
                          {t('empty.addTask')}
                        </Button>
                      ),
                    }
                    : {})}
                >
                  {columnCards.map(card => (
                    <KanbanCard
                      key={card.id}
                      dict={dict}
                      card={card}
                      draggingId={draggingId}
                      showProject={false}
                      columnLabels={columnLabels}
                      flowMoveTargets={flowMoveTargets}
                      currentFlowColumnId={card.columnId}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onMoveFlowColumn={(ticketId, columnId) => {
                        markLocalMove(ticketId)
                        onMoveCard?.(ticketId, columnId)
                        const target = columns.find(row => row.id === columnId)
                        if (target !== undefined) setLiveMessage(t('flow.movedTo', { column: target.name }))
                      }}
                      {...(onOpenReview !== undefined ? { onOpenReview } : {})}
                      approvalStampFresh={freshApprovalStampIds?.has(card.id) ?? false}
                      {...(assigneeCardTrigger === undefined ? {} : { assigneeCardTrigger })}
                    />
                  ))}
                </BoardColumn>
              </div>
            )
          })}
        </BoardColumns>
      </div>
      <div aria-live="polite" className={styles.srOnly}>{liveMessage}</div>
      {personaCard !== undefined && openPersonaProfile !== undefined && (
        <PersonaCardPopoverHost
          card={cardController}
          bridge={personaCard}
          openPersonaProfile={openPersonaProfile}
          cardData={cardData}
        />
      )}
    </>
  )
}
