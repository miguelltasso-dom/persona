/** Single Kanban card with drag lift, chips, persona carry, and completion celebration. */

import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { Avatar, Button, Card, Chip, PawTrail } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Kanban.module.css'
import type { KanbanCardModel } from './types.ts'

export interface KanbanCardProps {
  readonly dict: LocaleDict
  readonly card: KanbanCardModel
  readonly draggingId: string | null
  readonly showProject: boolean
  readonly onDragStart: (cardId: string) => void
  readonly onDragEnd: () => void
  readonly onOpenReview?: (cardId: string) => void
}

/** Draggable ticket card. */
export function KanbanCard({
  dict,
  card,
  draggingId,
  showProject,
  onDragStart,
  onDragEnd,
  onOpenReview,
}: KanbanCardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [celebrate, setCelebrate] = useState(false)
  const dragging = draggingId === card.id

  useEffect(() => {
    if (!card.reviewApproved || card.column !== 'done') return
    setCelebrate(true)
    const timer = window.setTimeout(() => { setCelebrate(false) }, 900)
    return () => { window.clearTimeout(timer) }
  }, [card.column, card.id, card.reviewApproved])

  const onDragStartCard = (event: DragEvent<HTMLElement>): void => {
    event.dataTransfer.setData('text/persona-kanban-card', card.id)
    event.dataTransfer.effectAllowed = 'move'
    onDragStart(card.id)
  }

  return (
    <Card
      as="article"
      padding="s"
      interactive
      className={`${styles.ticket}${dragging ? ` ${styles.ticketDragging}` : ''}`}
      draggable
      onDragStart={onDragStartCard}
      onDragEnd={onDragEnd}
      aria-grabbed={dragging}
      tabIndex={0}
      aria-label={card.title}
    >
      {card.carry !== undefined && (
        <div className={styles.carryLayer} aria-live="polite">
          <span className={styles.carryAvatar} title={t('personaMove.label', { name: card.carry.persona.name })}>
            <Avatar name={card.carry.persona.name} size={24} shape="portrait" decorative />
            <span className={styles.srOnly}>{t('personaMove.label', { name: card.carry.persona.name })}</span>
          </span>
        </div>
      )}
      <h3 className={styles.cardTitle}>{card.title}</h3>
      {showProject && (
        <p className={styles.cardMeta}>{t('card.project', { name: card.projectName })}</p>
      )}
      {card.assignee !== undefined && (
        <p className={styles.cardMeta}>{t('card.assignee', { name: card.assignee.name })}</p>
      )}
      <div className={styles.chips}>
        {card.waitingEvent && (
          <Chip tone="accent" size="s">{t('chip.waitingEvent')}</Chip>
        )}
        {card.blocked && (
          <Chip tone="danger" size="s">{t('chip.blocked')}</Chip>
        )}
        {card.column === 'done' && card.outcome !== undefined && (
          <Chip tone="success" size="s">{t(`outcome.${card.outcome}`)}</Chip>
        )}
      </div>
      <div className={styles.cardFooter}>
        {(card.column === 'in_review' || card.blocked) && onOpenReview !== undefined && (
          <Button
            size="s"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation()
              onOpenReview(card.id)
            }}
          >
            {t('action.review')}
          </Button>
        )}
        {card.assignee !== undefined && (
          <Avatar name={card.assignee.name} size={24} shape="portrait" decorative />
        )}
        {celebrate && (
          <span className={styles.celebrationPaws} role="img" aria-label={t('celebration.label')}>
            <PawTrail />
          </span>
        )}
      </div>
    </Card>
  )
}
