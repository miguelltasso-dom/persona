/**
 * COLHEITA 18 (Muse §18) — the side panel of "a conversa da tarefa", 440 px, opened by the card of the board. NOT a modal: the board stays
 * visible and clickable (no scrim). The content of the conversation is a slot (the connected view fills it with the same message list and
 * composer as the DM); this file owns the frame:
 *
 *  - header: the title of the card (17 px, display font), the column seal, the faces of who looks after the task (24 px) and the close button (32 px);
 *  - tabs "Conversa · Detalhes" (40 px, arrows move, one tab panel visible at a time);
 *  - Esc closes it (unless a control inside already used the key); focus goes into the panel when it opens and back to the card when it closes;
 *  - enters with the `panel` motion (a 24 px slide plus opacity) and leaves with the panel time and the exit curve; under reduced motion both are a fade.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { resolvePersonaFace } from '../approvals/approvals-ui-helpers.ts'
import { Avatar, Chip, IconButton, UiIcon } from '../primitives/index.ts'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import { caringNames, type TaskCaringUi } from './task-conversation.ts'
import styles from './TaskConversationPanel.module.css'

export type TaskConversationTab = 'conversation' | 'details'
const TABS: readonly TaskConversationTab[] = ['conversation', 'details']

/** The longest the exit can take before the panel is closed anyway (the animation normally ends first). */
const EXIT_FALLBACK_MS = 400

export interface TaskConversationPanelProps {
  readonly dict: LocaleDict
  /** The title of the task. */
  readonly title: string
  /** The column of the card ("Fazendo"), as a seal. */
  readonly columnLabel?: string | undefined
  /** Who looks after the task (faces are the gallery animals of each persona). */
  readonly caring: readonly TaskCaringUi[]
  readonly tab: TaskConversationTab
  readonly onTab: (tab: TaskConversationTab) => void
  /** Called once the panel has finished leaving. */
  readonly onClose: () => void
  /** The conversation: message list and composer (the same components as the DM). */
  readonly conversation: ReactNode
  /** What the task is: the card's own details. */
  readonly details: ReactNode
  /** Where the focus goes back to when the panel closes (the card that opened it). */
  readonly returnFocusTo?: (() => HTMLElement | null) | undefined
}

export function TaskConversationPanel({ dict, title, columnLabel, caring, tab, onTab, onClose, conversation, details, returnFocusTo }: TaskConversationPanelProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const idBase = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const closedRef = useRef(false)
  const [closing, setClosing] = useState(false)

  // Focus goes into the panel when it opens (the title is the landing place) and back to the card when it is gone.
  useEffect(() => {
    titleRef.current?.focus()
    return () => { returnFocusTo?.()?.focus() }
    // Only on mount and unmount: the focus must not jump back when the parent re-renders.
  }, [])

  const finish = (): void => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }
  const close = (): void => { setClosing(true) }
  useEffect(() => {
    if (!closing) return undefined
    const node = panelRef.current
    // The animation of the panel itself ends the exit (a native listener: the children's animations bubble up and must not count).
    const onEnd = (event: Event): void => { if (event.target === node) finish() }
    node?.addEventListener('animationend', onEnd)
    const timer = window.setTimeout(finish, EXIT_FALLBACK_MS)
    return () => {
      node?.removeEventListener('animationend', onEnd)
      window.clearTimeout(timer)
    }
    // `finish` only reads refs and the latest onClose, so the effect restarts only when the panel starts closing.
  }, [closing])

  const onPanelKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      close()
    }
  }
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const index = TABS.indexOf(tab)
    const next = event.key === 'ArrowRight' ? TABS[(index + 1) % TABS.length]
      : event.key === 'ArrowLeft' ? TABS[(index + TABS.length - 1) % TABS.length]
        : event.key === 'Home' ? TABS[0] : event.key === 'End' ? TABS[TABS.length - 1] : undefined
    if (next === undefined) return
    event.preventDefault()
    onTab(next)
    document.getElementById(`${idBase}-tab-${next}`)?.focus()
  }

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      data-task-conversation-panel=""
      data-state={closing ? 'closing' : 'open'}
      aria-label={t('thread.panel', { title })}
      onKeyDown={onPanelKeyDown}
    >
      <header className={styles.header}>
        <div className={styles.headline}>
          <h2 ref={titleRef} className={styles.title} tabIndex={-1}>{title}</h2>
          <IconButton
            size="s"
            variant="ghost"
            label={t('thread.close')}
            icon={<UiIcon name="close" size={18} />}
            onClick={close}
          />
        </div>
        <div className={styles.meta}>
          {columnLabel !== undefined && columnLabel !== '' && <Chip tone="neutral" size="s">{columnLabel}</Chip>}
          {caring.length > 0 && (
            <span className={styles.caring}>
              <span className={styles.faces} aria-hidden="true">
                {caring.map((who) => {
                  const face = resolvePersonaFace({ id: who.personaId, name: who.name })
                  return <Avatar key={who.personaId} name={who.name} size={24} shape="portrait" decorative {...(face === undefined ? {} : { src: face })} />
                })}
              </span>
              <span className={styles.srOnly}>{t('thread.caring', { names: caringNames(caring) })}</span>
            </span>
          )}
        </div>
        <div className={styles.tabs} role="tablist" aria-label={t('thread.tabs')}>
          {TABS.map(name => (
            <button
              key={name}
              id={`${idBase}-tab-${name}`}
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={tab === name}
              aria-controls={`${idBase}-panel-${name}`}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => { onTab(name) }}
              onKeyDown={onTabKeyDown}
            >
              {t(`thread.tab.${name}`)}
            </button>
          ))}
        </div>
      </header>
      <div
        id={`${idBase}-panel-conversation`}
        role="tabpanel"
        aria-labelledby={`${idBase}-tab-conversation`}
        className={styles.body}
        hidden={tab !== 'conversation'}
      >
        {conversation}
      </div>
      <div
        id={`${idBase}-panel-details`}
        role="tabpanel"
        aria-labelledby={`${idBase}-tab-details`}
        className={styles.body}
        hidden={tab !== 'details'}
      >
        {details}
      </div>
    </aside>
  )
}

export interface TaskConversationEmptyProps {
  readonly dict: LocaleDict
}

/** The empty conversation: the animal with the card in hand (one art for light and dark), and what to do next. */
export function TaskConversationEmpty({ dict }: TaskConversationEmptyProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const art = ILLUSTRATIONS['empty-conversa-tarefa']
  return (
    <div className={styles.empty} data-task-conversation-empty="">
      {art !== undefined && <img className={styles.emptyArt} src={art} alt="" width={240} height={160} draggable={false} />}
      <p className={styles.emptyTitle}>{t('thread.empty.title')}</p>
      <p className={styles.emptyHint}>{t('thread.empty.hint')}</p>
    </div>
  )
}
