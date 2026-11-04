/** Persona memory tab (Retention is built — show what the team knows). */
import type { ReactNode } from 'react'
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

export interface MemoryPanelProps {
  readonly dict?: LocaleDict
  readonly rows?: readonly MemoryRow[]
  readonly initialState?: MemorySurfaceState
  readonly onEmptyPrimary?: (() => void) | undefined
}

export function MemoryPanel({ dict = defaultDict, rows = MOCK_MEMORY_ROWS, initialState = 'ready', onEmptyPrimary }: MemoryPanelProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)

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

  return (
    <section aria-labelledby="memory-heading">
      <h2 id="memory-heading" className={styles.sectionTitle}>{t('title')}</h2>
      <p className={styles.sectionSubtitle}>{t('subtitle')}</p>
      <ul className={styles.list}>
        {rows.map(row => (
          <li key={row.id}>
            <Card padding="m">
              <div className={styles.chipRow}>
                <Chip tone="neutral" size="s">{t(`origin.${row.uiOrigin}`)}</Chip>
                <Chip tone="accent" size="s">{t(visibilityKey(row))}</Chip>
              </div>
              <p className={styles.body}>{row.body}</p>
              <p className={styles.meta}>rev {row.revision}</p>
              <div className={styles.actions}>
                {row.pendingApproval && <Button variant="primary" size="s">{t('action.approve')}</Button>}
                <Button variant="secondary" size="s">{t('action.edit')}</Button>
                <Button variant="secondary" size="s">{t('action.forget')}</Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
