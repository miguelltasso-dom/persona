/**
 * Tab "Jeito de trabalhar" of a persona's profile (harvest item 16, Muse's spec §16b): what she learned about HOW she works, kept quietly.
 * One card per kind of work the owner applied, in the style of the Memória cards. Nothing here speaks in the chat: no sound, no toast.
 * The decision "Virar skill?" lives in Aprovações; here the card only says where it stands and links there.
 * Persona names never take an article ("Bia", never "a Bia"): the product keeps no gender.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PlaybookNoteView } from '@deepseek-ai/dsh-persona-host/types'
import { Button, Card, Chip } from '../primitives/index.ts'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import { friendlyWhen } from '../memory/MemoryPanel.tsx'
import { pt as defaultDict } from '../locale/memory/locales.ts'
import styles from './PlaybookPanel.module.css'

export type PlaybookSurfaceState = 'loading' | 'error' | 'ready'

/** What the owner can do here. A missing handler means no button (never one that does nothing). */
export interface PlaybookActions {
  readonly onForget?: ((row: PlaybookNoteView) => Promise<void>) | undefined
  /** Opens Aprovações, where "Virar skill?" is decided. */
  readonly onDecide?: (() => void) | undefined
}

export interface PlaybookPanelProps {
  readonly dict?: LocaleDict
  readonly personaName: string
  readonly rows: readonly PlaybookNoteView[]
  readonly initialState?: PlaybookSurfaceState
  readonly actions?: PlaybookActions | undefined
  /** Opens the DM (the empty state's one action). */
  readonly onMessage?: (() => void) | undefined
  readonly onRetry?: (() => void) | undefined
}

type T = (key: string, params?: Readonly<Record<string, string>>) => string

const ADJUSTMENTS_SHOWN = 3

/** "Usado 3 vezes · o último ontem": words, not "3×". */
function metaLine(row: PlaybookNoteView, t: T): string {
  if (row.uses === 0) return t('playbook.meta.none')
  const used = row.uses === 1 ? t('playbook.meta.once') : t('playbook.meta.times', { count: String(row.uses) })
  const when = friendlyWhen(row.lastAt, t)
  // "Quase pronto": enough uses, all on one day. The meta says what is missing, in words (Muse 01:10): "Usado 3 vezes hoje · falta usar em outro dia".
  if (row.stage === 'ready' && when !== '') return t('playbook.meta.sameDay', { used, when })
  return when === '' ? used : t('playbook.meta.last', { used, when })
}

function stageText(row: PlaybookNoteView, t: T): string {
  if (row.stage === 'skill') return t('playbook.stage.skill')
  if (row.stage === 'offered') return t('playbook.stage.ready')
  if (row.stage === 'ready') return t('playbook.stage.waiting')
  return t('playbook.stage.learning', { done: String(row.progress), goal: String(row.goal) })
}

/** What the owner asked to change: curly quotes, the Memória quote style; three, then "ver tudo". */
function Adjustments({ items, t }: { readonly items: readonly string[]; readonly t: T }): ReactNode {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, ADJUSTMENTS_SHOWN)
  return (
    <div className={styles.adjustments}>
      <p className={styles.adjustLabel}>{t('playbook.adjust.label')}</p>
      <ul className={styles.adjustList}>
        {shown.map(item => <li key={item} className={styles.adjustQuote}>{`“${item}”`}</li>)}
      </ul>
      {items.length > ADJUSTMENTS_SHOWN && (
        <button type="button" className={styles.more} aria-expanded={all} onClick={() => { setAll(value => !value) }}>
          {all ? t('source.less') : t('source.more')}
        </button>
      )}
    </div>
  )
}

function PlaybookCard({ row, t, actions, personaName }: { readonly row: PlaybookNoteView; readonly t: T; readonly actions: PlaybookActions | undefined; readonly personaName: string }): ReactNode {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const keepRef = useRef<HTMLButtonElement>(null)
  // The confirmation takes the focus to "Manter": the safe answer first.
  useEffect(() => { if (asking) keepRef.current?.focus() }, [asking])
  const forget = actions?.onForget
  const confirmForget = async (): Promise<void> => {
    if (forget === undefined) return
    setBusy(true)
    setFailed(false)
    try {
      await forget(row)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }
  return (
    <li className={styles.item} data-stage={row.stage}>
      <Card padding="m">
        <h3 className={styles.title}>{row.title}</h3>
        <div className={styles.metaRow}>
          <span className={styles.meta}>{metaLine(row, t)}</span>
          <Chip tone="neutral" size="s">{stageText(row, t)}</Chip>
          {row.stage === 'offered' && actions?.onDecide !== undefined && (
            <button type="button" className={styles.link} onClick={actions.onDecide}>{t('playbook.decide')}</button>
          )}
        </div>
        {row.adjustments.length > 0 && <Adjustments items={row.adjustments} t={t} />}
        {failed && <p className={styles.failed} role="alert">{t('error.action')}</p>}
        {forget !== undefined && !asking && (
          <div className={styles.actions}>
            <Button variant="secondary" size="s" onClick={() => { setFailed(false); setAsking(true) }}>{t('action.forget')}</Button>
          </div>
        )}
        {asking && (
          <div className={styles.confirm} role="group" aria-label={t('playbook.forget.title')}>
            {/* "A skill que já saiu dele continua" only when it already IS a skill (Muse 12/11); otherwise it just stops being used, by name and with no article. */}
            <p className={styles.confirmText}>{row.stage === 'skill' ? t('playbook.forget.body') : t('playbook.forget.bodyPlain', { name: personaName })}</p>
            <div className={styles.actions}>
              {/* Amber is the product's "go ahead": forgetting is the danger button (same as "Remover" in the Cofre), and "Manter" is the quiet one that holds the focus. */}
              <Button variant="danger" size="s" loading={busy} onClick={() => { void confirmForget() }}>{t('forget.confirm')}</Button>
              <Button variant="secondary" size="s" disabled={busy} ref={keepRef} onClick={() => { setAsking(false) }}>{t('playbook.forget.keep')}</Button>
            </div>
          </div>
        )}
      </Card>
    </li>
  )
}

/** Two quiet blocks, no shimmer: the owner is told something is loading, nothing moves. */
function Skeleton(): ReactNode {
  return (
    <ul className={styles.list} aria-hidden="true" data-persona-playbook-skeleton="">
      {[0, 1].map(index => (
        <li key={index} className={styles.item}>
          <div className={styles.skeletonCard}>
            <span className={styles.skeletonLine} data-wide="" />
            <span className={styles.skeletonLine} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function PlaybookPanel({ dict = defaultDict, personaName, rows, initialState = 'ready', actions, onMessage, onRetry }: PlaybookPanelProps): ReactNode {
  const t: T = (key, params) => bindLocale(dict, key, params)
  const header = (
    <>
      <h2 id="playbook-heading" className={styles.sectionTitle}>{t('playbook.title')}</h2>
      <p className={styles.sectionSubtitle}>{t('playbook.subtitle', { name: personaName })}</p>
    </>
  )
  if (initialState === 'loading') {
    return <section aria-labelledby="playbook-heading" aria-busy="true" data-persona-playbook="">{header}<Skeleton /></section>
  }
  if (initialState === 'error') {
    return (
      <section aria-labelledby="playbook-heading" data-persona-playbook="">
        {header}
        <div className={styles.state} role="alert">
          <p className={styles.stateTitle}>{t('playbook.error.title')}</p>
          {onRetry !== undefined && <Button variant="secondary" onClick={onRetry}>{t('playbook.error.retry')}</Button>}
        </div>
      </section>
    )
  }
  if (rows.length === 0) {
    return (
      <section aria-labelledby="playbook-heading" data-persona-playbook="">
        {header}
        <div className={styles.state}>
          <p className={styles.stateTitle}>{t('playbook.empty.title')}</p>
          <p className={styles.stateBody}>{t('playbook.empty.body', { name: personaName })}</p>
          {onMessage !== undefined && <Button variant="secondary" onClick={onMessage}>{t('playbook.empty.action', { name: personaName })}</Button>}
        </div>
      </section>
    )
  }
  return (
    <section aria-labelledby="playbook-heading" data-persona-playbook="">
      {header}
      <ul className={styles.list}>
        {rows.map(row => <PlaybookCard key={row.id} row={row} t={t} actions={actions} personaName={personaName} />)}
      </ul>
    </section>
  )
}
