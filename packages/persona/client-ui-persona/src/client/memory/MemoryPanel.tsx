/** Persona memory tab (Retention is built — show what the team knows). */
import type { ReactNode } from 'react'
import { PersonaButton } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import page from '../profile/LumenPage.module.css'
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
  readonly initialState?: MemorySurfaceState
}

export function MemoryPanel({ dict = defaultDict, initialState = 'ready' }: MemoryPanelProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)

  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
  if (initialState === 'error') {
    return <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => {}} />
  }
  if (initialState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="empty.illustration"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
      />
    )
  }

  return (
    <section aria-labelledby="memory-heading">
      <h2 id="memory-heading" className={page.title}>{t('title')}</h2>
      <p className={page.subtitle}>{t('subtitle')}</p>
      <ul className={page.list}>
        {MOCK_MEMORY_ROWS.map(row => (
          <li key={row.id} className={page.card}>
            <span className={page.chip}>{t(`origin.${row.uiOrigin}`)}</span>
            {' '}
            <span className={page.chip}>{t(visibilityKey(row))}</span>
            <p>{row.body}</p>
            <p className={page.meta}>rev {row.revision}</p>
            <div className={page.actions}>
              {row.pendingApproval && <PersonaButton>{t('action.approve')}</PersonaButton>}
              <PersonaButton variant="secondary">{t('action.edit')}</PersonaButton>
              <PersonaButton variant="secondary">{t('action.forget')}</PersonaButton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
