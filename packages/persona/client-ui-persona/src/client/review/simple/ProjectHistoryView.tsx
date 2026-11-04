/**
 * Projeto › Histórico (SIMPLE-WORKSPACE-SPEC §5): what was applied to the folder, by day, with Desfazer for 30 days.
 * "Bia aplicou 3 mudanças · hoje 14:20", the files, and a confirmed Desfazer. Nothing technical on this screen.
 */

import { useState, type ReactNode } from 'react'
import { Button, Chip, Modal } from '../../primitives/index.ts'
import type { LocaleDict } from '../../preview/locale-bind.ts'
import { bindLocale } from '../../preview/locale-bind.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../../kanban/PersonaSurface.tsx'
import { pt as defaultDict } from '../../locale/review/locales.ts'
import styles from './ProjectHistoryView.module.css'

/** The earlier versions are kept this long; older entries leave the list. */
export const HISTORY_KEEP_DAYS = 30
const MAX_FILES_SHOWN = 3
const DAY_MS = 24 * 60 * 60 * 1000

export interface HistoryFileUi {
  readonly name: string
}

export interface HistoryEntryUi {
  readonly id: string
  /** "Bia", or "Você". */
  readonly who: string
  /** ISO time of the apply. */
  readonly at: string
  readonly files: readonly HistoryFileUi[]
  /** The Tarefa that produced it (the host sends only its id; the board knows the name). */
  readonly taskTitle?: string | undefined
  /** Already undone: shown as "Desfeito", no second Desfazer. */
  readonly undone?: boolean | undefined
}

export type HistorySurfaceState = 'loading' | 'error' | 'ready'

export interface ProjectHistoryViewProps {
  readonly dict?: LocaleDict
  readonly entries: readonly HistoryEntryUi[]
  readonly state?: HistorySurfaceState
  /** The host cannot undo yet: the list is read-only. */
  readonly canUndo?: boolean
  /** This project keeps no private history (it already uses git, or the host has none): say so, never "Nada aplicado". */
  readonly unavailable?: boolean
  /** Entry being undone right now ("Desfazendo…"). */
  readonly undoingId?: string | null
  readonly onUndo?: (entryId: string) => void
  readonly onRetry?: () => void
  /** Injectable clock and locale (tests, 200 % zoom captures). */
  readonly now?: Date
  readonly locale?: string
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function ProjectHistoryView({
  dict = defaultDict,
  entries,
  state = 'ready',
  canUndo = true,
  unavailable = false,
  undoingId = null,
  onUndo,
  onRetry,
  now = new Date(),
  locale = 'pt-BR',
}: ProjectHistoryViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (state === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="history.loading" skeletonColumns={1} />
  if (state === 'error') {
    return <PersonaSurfaceError dict={dict} titleKey="history.error" retryKey="history.retry" onRetry={() => { onRetry?.() }} />
  }

  const today = startOfDay(now)
  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const dayLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })
  const timeOf = (at: string): string => clock.format(new Date(at))
  // The group title already says the day: inside it the line only says the time.
  const whenOf = (at: string): string => timeOf(at)
  const dayHeading = (at: string): string => {
    const diff = Math.round((today - startOfDay(new Date(at))) / DAY_MS)
    if (diff <= 0) return t('history.day.today')
    if (diff === 1) return t('history.day.yesterday')
    return dayLabel.format(new Date(at))
  }

  const keep = entries
    .filter(entry => now.getTime() - new Date(entry.at).getTime() <= HISTORY_KEEP_DAYS * DAY_MS)
    .toSorted((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  if (unavailable) {
    return (
      <div className={styles.root} data-persona-surface="project-history">
        <PersonaSurfaceEmpty dict={dict} illustrationKey="empty-inbox" titleKey="history.title" hintKey="history.unavailable" />
      </div>
    )
  }

  if (keep.length === 0) {
    return (
      <div className={styles.root} data-persona-surface="project-history">
        <PersonaSurfaceEmpty dict={dict} illustrationKey="empty-inbox" titleKey="history.empty.title" hintKey="history.empty.hint" />
      </div>
    )
  }

  const groups: { readonly heading: string; readonly items: readonly HistoryEntryUi[] }[] = []
  for (const entry of keep) {
    const heading = dayHeading(entry.at)
    const last = groups.at(-1)
    if (last !== undefined && last.heading === heading) groups[groups.length - 1] = { heading, items: [...last.items, entry] }
    else groups.push({ heading, items: [entry] })
  }
  const confirming = keep.find(entry => entry.id === confirmId)

  return (
    <div className={styles.root} data-persona-surface="project-history">
      <header>
        <h2 className={styles.title}>{t('history.title')}</h2>
        <p className={styles.subtitle}>{t('history.subtitle')}</p>
      </header>

      {groups.map(group => (
        <section key={group.heading} aria-label={group.heading}>
          <h3 className={styles.day}>{group.heading}</h3>
          <ul className={styles.list} aria-label={t('history.listLabel')}>
            {group.items.map((entry) => {
              const lineId = `persona-history-${entry.id}`
              const shown = entry.files.slice(0, MAX_FILES_SHOWN)
              const extra = entry.files.length - shown.length
              const line = entry.files.length === 1
                ? t('history.entry.one', { who: entry.who, when: whenOf(entry.at) })
                : t('history.entry.many', { who: entry.who, count: entry.files.length, when: whenOf(entry.at) })
              return (
                <li key={entry.id} className={styles.item}>
                  <div className={styles.text}>
                    <p id={lineId} className={styles.line}>{line}</p>
                    {entry.taskTitle !== undefined && <p className={styles.task}>{entry.taskTitle}</p>}
                    <p className={styles.files}>
                      {shown.map(file => file.name).join(', ')}
                      {extra > 0 ? ` ${t('history.moreFiles', { count: extra })}` : ''}
                    </p>
                  </div>
                  {entry.undone === true
                    ? <Chip size="s" tone="neutral">{t('history.undone')}</Chip>
                    : (
                      <Button
                        size="s"
                        variant="secondary"
                        aria-describedby={lineId}
                        loading={undoingId === entry.id}
                        disabled={!canUndo || onUndo === undefined || undoingId !== null}
                        onClick={() => { setConfirmId(entry.id) }}
                      >
                        {undoingId === entry.id ? t('history.undoing') : t('undo.action')}
                      </Button>
                    )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <p className={styles.footer}>{t('history.footer')}</p>

      <Modal
        open={confirming !== undefined}
        title={confirming === undefined
          ? ''
          : confirming.files.length === 1
            ? t('undo.confirm.one', { time: timeOf(confirming.at) })
            : t('undo.confirm.many', { count: confirming.files.length, time: timeOf(confirming.at) })}
        onClose={() => { setConfirmId(null) }}
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setConfirmId(null) }}>{t('undo.confirm.no')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                const id = confirmId
                setConfirmId(null)
                if (id !== null) onUndo?.(id)
              }}
            >
              {t('undo.confirm.yes')}
            </Button>
          </>
        )}
      />
    </div>
  )
}
