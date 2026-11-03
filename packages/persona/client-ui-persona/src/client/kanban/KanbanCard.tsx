/** Single Kanban card with drag lift, chips, persona carry, and completion celebration. */

import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
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
}

/** Draggable ticket card. */
export function KanbanCard({
  dict,
  card,
  draggingId,
  showProject,
  onDragStart,
  onDragEnd,
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
    <article
      className={`${styles.card}${dragging ? ` ${styles.cardDragging}` : ''}`}
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
            <span className={styles.avatar} aria-hidden="true">{card.carry.persona.initials}</span>
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
          <span className={`${styles.chip} ${styles.chipWaiting}`}>
            <span aria-hidden="true">⏳</span>
            {t('chip.waitingEvent')}
          </span>
        )}
        {card.blocked && (
          <span className={`${styles.chip} ${styles.chipBlocked}`}>
            <span aria-hidden="true">✋</span>
            {t('chip.blocked')}
          </span>
        )}
        {card.column === 'done' && card.outcome !== undefined && (
          <span className={`${styles.chip} ${styles.chipOutcome}`}>
            <span aria-hidden="true">✓</span>
            {t(`outcome.${card.outcome}`)}
          </span>
        )}
      </div>
      <div className={styles.cardFooter}>
        {card.assignee !== undefined && (
          <span className={styles.avatar} aria-hidden="true">{card.assignee.initials}</span>
        )}
        {celebrate && (
          <span className={styles.celebrationPaws} role="img" aria-label={t('celebration.label')}>
            🐾
          </span>
        )}
      </div>
    </article>
  )
}
