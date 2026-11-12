/**
 * COLHEITA 18 (Muse §18) — the card of the board and its conversation: a read-only seal with a balloon and the number of unread messages
 * (22 px, never a control), and the way the card itself opens the panel (a click on the card or Enter/Space on it; the buttons and the menu
 * inside the card keep their own meaning).
 */

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import { unreadBadgeText, type TaskThreadUi } from './task-conversation.ts'
import styles from './TaskThreadBadge.module.css'

export interface TaskThreadBadgeProps {
  readonly dict: LocaleDict
  readonly thread: TaskThreadUi | undefined
}

/** The seal with the unread count; nothing when there is nothing unread (a quiet card stays quiet). */
export function TaskThreadBadge({ dict, thread }: TaskThreadBadgeProps): ReactNode {
  if (thread === undefined || thread.unread <= 0) return null
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return (
    <span
      className={styles.badge}
      role="img"
      aria-label={t(thread.unread === 1 ? 'thread.unread.one' : 'thread.unread.other', { n: thread.unread })}
      data-task-thread-unread={thread.unread}
    >
      <svg className={styles.balloon} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
        <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7.2L8 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" />
      </svg>
      <span aria-hidden="true">{unreadBadgeText(thread.unread)}</span>
    </span>
  )
}

/** Something inside the card that has a meaning of its own: a click on it must not also open the conversation. */
const OWN_MEANING = 'button, a, input, select, textarea, label, [role="button"], [role="menu"], [role="menuitem"], [role="tab"]'

/**
 * @param onOpen - Opens the conversation of a card; without it the card is as it was (no handlers).
 * @param cardId - The card.
 * @returns The props for the card element.
 */
export function cardOpenHandlers(onOpen: ((cardId: string) => void) | undefined, cardId: string): {
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
} {
  if (onOpen === undefined) return {}
  return {
    onClick: (event) => {
      const target = event.target instanceof Element ? event.target : null
      const inner = target?.closest(OWN_MEANING)
      if (inner !== null && inner !== undefined && event.currentTarget.contains(inner) && inner !== event.currentTarget) return
      onOpen(cardId)
    },
    onKeyDown: (event) => {
      // Only the card itself: a key pressed on a button inside it belongs to that button.
      if (event.target !== event.currentTarget) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      onOpen(cardId)
    },
  }
}
