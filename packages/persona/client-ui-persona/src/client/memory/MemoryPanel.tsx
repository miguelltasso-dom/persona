/** Persona memory tab (Retention is built — show what the team knows). */
import { useState, type ReactNode } from 'react'
import { Button, Card, Chip } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './MemoryPanel.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { MOCK_MEMORY_ROWS, type MemoryRow } from './mock-data.ts'
import { pt as defaultDict } from '../locale/memory/locales.ts'

export type MemorySurfaceState = 'loading' | 'error' | 'empty' | 'ready'

function visibilityKey(row: MemoryRow): string {
  if (row.visibility.kind === 'workspace') return 'visibility.workspace'
  if (row.visibility.kind === 'project') return 'visibility.project'
  return 'visibility.persona'
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
  const t = (key: string) => bindLocale(dict, key)
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
                  <Chip tone="accent" size="s">{t(visibilityKey(row))}</Chip>
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
                <p className={styles.meta}>rev {row.revision}</p>
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
