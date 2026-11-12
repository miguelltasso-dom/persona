/** Persona memory tab (Retention is built — show what the team knows). */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Card, Chip } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './MemoryPanel.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { MOCK_MEMORY_ROWS, type MemoryRow } from './mock-data.ts'
import { pt as defaultDict } from '../locale/memory/locales.ts'
import { cutQuote, cutToFit, cutWithoutLayout, wholeQuote } from './quote-cut.ts'

export type MemorySurfaceState = 'loading' | 'error' | 'empty' | 'ready'

type T = (key: string, params?: Readonly<Record<string, string>>) => string

function visibilityKey(row: MemoryRow): string {
  // The same meaning, the same term (Muse 01:06): everything the whole team can read says "Toda a equipe", said by the owner in words or not.
  if (row.visibility.kind === 'workspace') return 'visibility.team'
  if (row.visibility.kind === 'project') return 'visibility.project'
  return 'visibility.persona'
}

/** The visibility chip: a memory said to one persona in a DM names her ("Só a Bia"). */
function visibilityText(row: MemoryRow, t: T): string {
  if (row.visibility.kind === 'persona' && row.ownerTo !== undefined) return t('visibility.personaNamed', { name: row.ownerTo.name })
  return t(visibilityKey(row))
}

/** "hoje", "ontem", "em 11/11", "em 11/11/2025" (the year only when it is not this one). An unreadable date says nothing rather than "Invalid Date". */
export function friendlyWhen(iso: string, t: T, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const day = (date: Date): number => Math.round(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000)
  const gap = day(now) - day(at)
  if (gap === 0) return t('date.today')
  if (gap === 1) return t('date.yesterday')
  const base = at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return t('date.on', { date: at.getFullYear() === now.getFullYear() ? base : `${base}/${String(at.getFullYear())}` })
}

/** "Você disse no #geral em 11/11:" — the name only when another member said it; "numa conversa direta com Bia" in a DM (no article: the product keeps no gender). */
function sourceLine(row: MemoryRow, t: T): string {
  const source = row.ownerSource
  if (source === undefined) return ''
  const who = source.mine ? t('who.you') : source.by
  const when = friendlyWhen(source.at, t)
  if (source.where === 'dm') {
    const line = row.ownerTo === undefined ? t('source.dmNoName', { who, when }) : t('source.dm', { who, name: row.ownerTo.name, when })
    return line.replace(/\s{2,}/gu, ' ').replace(/\s+:/u, ':')
  }
  return t(source.place === '' ? 'source.channelNoName' : 'source.channel', { who, place: source.place, when }).replace(/\s{2,}/gu, ' ').replace(/\s+:/u, ':')
}

const flatWords = (text: string): string => text.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^a-z0-9]+/gu, ' ').trim()

/** The memory is (almost) the quote itself — a long message that is all the fact: the quote opens on one line instead of repeating the paragraph. */
export function isMostlyTheMemory(body: string, quote: string): boolean {
  const fact = flatWords(body)
  return fact.length > 120 && flatWords(quote).includes(fact.slice(0, Math.min(fact.length, 160)))
}

/**
 * The owner's words, word for word, in curly quotes; four lines at most (one when the memory already says the same), the rest behind "Ver tudo".
 * A cut quote is cut by us, not by the line clamp: it ends "…”" (the closing mark is never lost, no doubled punctuation).
 */
function ProofQuote({ text, compact = false, t }: { readonly text: string; readonly compact?: boolean; readonly t: T }): ReactNode {
  const ref = useRef<HTMLQuoteElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [cutAt, setCutAt] = useState<number | null>(null)
  const [width, setWidth] = useState(0)
  const lines = compact ? 1 : 4
  useEffect(() => {
    const node = ref.current
    if (node === null || typeof ResizeObserver === 'undefined') return undefined
    // A new width (200% zoom, a resized window) moves the cut.
    const watcher = new ResizeObserver(() => { setWidth(Math.round(node.clientWidth)) })
    watcher.observe(node)
    return () => { watcher.disconnect() }
  }, [])
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null || expanded) return
    if (node.clientWidth === 0 || node.parentElement === null) {
      // No layout (a hidden panel, a test): by characters and line breaks.
      setCutAt(cutWithoutLayout(text, lines, compact ? 100 : 280))
      return
    }
    // Layout: measure in a hidden copy of the same box (same classes, same width) so React's own node is never touched.
    const style = getComputedStyle(node)
    const probe = node.cloneNode(false) as HTMLElement
    probe.setAttribute('data-measuring', '')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.width = style.width
    node.parentElement.insertBefore(probe, node)
    const box = (Number.parseFloat(style.lineHeight) || 20) * lines
    try {
      setCutAt(cutToFit(text, (candidate) => { probe.textContent = candidate; return probe.scrollHeight <= box + 1 }))
    } finally {
      probe.remove()
    }
  }, [text, expanded, compact, lines, width])
  const shown = expanded || cutAt === null ? wholeQuote(text) : cutQuote(text, cutAt)
  return (
    <>
      <blockquote ref={ref} className={styles.proofQuote} data-expanded={expanded ? '' : undefined} data-compact={compact && !expanded ? '' : undefined}>{shown}</blockquote>
      {(cutAt !== null || expanded) && (
        <button type="button" className={styles.proofMore} aria-expanded={expanded} onClick={() => { setExpanded(value => !value) }}>
          {expanded ? t('source.less') : t('source.more')}
        </button>
      )}
    </>
  )
}

/** What the person can really do to a memory. A missing handler means no button (never one that does nothing). */
export interface MemoryActions {
  readonly onApprove?: ((row: MemoryRow) => Promise<void>) | undefined
  readonly onEdit?: ((row: MemoryRow, body: string) => Promise<void>) | undefined
  readonly onForget?: ((row: MemoryRow) => Promise<void>) | undefined
}

export interface MemoryPanelProps {
  readonly dict?: LocaleDict
  readonly rows?: readonly MemoryRow[]
  readonly initialState?: MemorySurfaceState
  readonly onEmptyPrimary?: (() => void) | undefined
  readonly actions?: MemoryActions | undefined
}

type RowMode = 'view' | 'edit' | 'confirm-forget'

export function MemoryPanel({ dict = defaultDict, rows = MOCK_MEMORY_ROWS, initialState = 'ready', onEmptyPrimary, actions }: MemoryPanelProps): ReactNode {
  const t: T = (key, params) => bindLocale(dict, key, params)
  const [mode, setMode] = useState<{ readonly id: string; readonly kind: RowMode } | null>(null)
  const [draft, setDraft] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)

  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
  if (initialState === 'error') {
    return <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => {}} />
  }
  if (initialState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationKey="empty-inbox"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
        {...(onEmptyPrimary === undefined ? {} : { onPrimary: onEmptyPrimary })}
      />
    )
  }

  /** Runs one host call: on a refusal the card stays as it was and says what to do (never silence, never a lost memory). */
  const run = async (row: MemoryRow, call: () => Promise<void>): Promise<void> => {
    setBusyId(row.id)
    setFailedId(null)
    try {
      await call()
      setMode(null)
    } catch {
      setFailedId(row.id)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section aria-labelledby="memory-heading">
      <h2 id="memory-heading" className={styles.sectionTitle}>{t('title')}</h2>
      <p className={styles.sectionSubtitle}>{t('subtitle')}</p>
      <ul className={styles.list}>
        {rows.map((row) => {
          const current = mode?.id === row.id ? mode.kind : 'view'
          const busy = busyId === row.id
          const canApprove = row.pendingApproval && actions?.onApprove !== undefined
          const onEdit = actions?.onEdit
          const onForget = actions?.onForget
          const hasActions = canApprove || onEdit !== undefined || onForget !== undefined
          return (
            <li key={row.id}>
              <Card padding="m">
                <div className={styles.chipRow}>
                  <Chip tone="neutral" size="s">{t(`origin.${row.uiOrigin}`)}</Chip>
                  {/* Amber is "waiting for you" in the product: who can read it, and a house rule, are neutral chips like "Conversa" (the neutral wash IS the brand lilac; a lilac-200 override would be light-on-light in the dark theme). */}
                  <Chip tone="neutral" size="s">{visibilityText(row, t)}</Chip>
                  {row.ownerRule === true && <Chip tone="neutral" size="s">{t('rule.badge')}</Chip>}
                </div>
                {current === 'edit' ? (
                  <textarea
                    className={styles.editor}
                    aria-label={t('action.edit')}
                    value={draft}
                    onChange={(event) => { setDraft(event.target.value) }}
                  />
                ) : (
                  <p className={styles.body}>{row.body}</p>
                )}
                {row.ownerSource !== undefined && (
                  <figure className={styles.proof} data-memory-proof="">
                    <figcaption className={styles.proofLine}>{sourceLine(row, t)}</figcaption>
                    <ProofQuote text={row.ownerSource.quote} compact={isMostlyTheMemory(row.body, row.ownerSource.quote)} t={t} />
                  </figure>
                )}
                {/* No "rev N" anywhere: it was the list position, not a real version the person can use. */}
                {current === 'confirm-forget' && (
                  <p className={styles.confirm} role="group" aria-label={t('forget.title')}>{t('forget.body')}</p>
                )}
                {failedId === row.id && (
                  <p className={styles.failed} role="alert">{t('error.action')}</p>
                )}
                {hasActions && (
                  <div className={styles.actions}>
                    {current === 'edit' && onEdit !== undefined && (
                      <>
                        <Button
                          variant="primary"
                          size="s"
                          loading={busy}
                          disabled={draft.trim() === '' || draft.trim() === row.body.trim()}
                          onClick={() => { void run(row, () => onEdit(row, draft.trim())) }}
                        >
                          {t('action.save')}
                        </Button>
                        <Button variant="secondary" size="s" disabled={busy} onClick={() => { setMode(null); setFailedId(null) }}>
                          {t('action.cancel')}
                        </Button>
                      </>
                    )}
                    {current === 'confirm-forget' && onForget !== undefined && (
                      <>
                        <Button variant="primary" size="s" loading={busy} onClick={() => { void run(row, () => onForget(row)) }}>
                          {t('forget.confirm')}
                        </Button>
                        <Button variant="secondary" size="s" disabled={busy} onClick={() => { setMode(null); setFailedId(null) }}>
                          {t('action.cancel')}
                        </Button>
                      </>
                    )}
                    {current === 'view' && (
                      <>
                        {canApprove && (
                          <Button variant="primary" size="s" loading={busy} onClick={() => { void run(row, () => actions!.onApprove!(row)) }}>
                            {t('action.approve')}
                          </Button>
                        )}
                        {onEdit !== undefined && (
                          <Button variant="secondary" size="s" disabled={busy} onClick={() => { setDraft(row.body); setFailedId(null); setMode({ id: row.id, kind: 'edit' }) }}>
                            {t('action.edit')}
                          </Button>
                        )}
                        {onForget !== undefined && (
                          <Button variant="secondary" size="s" disabled={busy} onClick={() => { setFailedId(null); setMode({ id: row.id, kind: 'confirm-forget' }) }}>
                            {t('action.forget')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
