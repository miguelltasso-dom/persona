/** Company vault: records, documents, visibility, update proposals. */

import { useMemo, useState, type ReactNode } from 'react'
import { PersonaButton } from '../primitives/PersonaButton.tsx'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Knowledge.module.css'
import type { KnowledgeDocument, KnowledgeProposal, KnowledgeRecord } from './mock-data.ts'
import { pt as defaultDict } from '../locale/knowledge/locales.ts'

export type KnowledgeSurfaceState = 'loading' | 'error' | 'empty' | 'ready'
type KnowledgeTab = 'records' | 'documents' | 'proposals'

export interface KnowledgeVaultProps {
  readonly dict?: LocaleDict
  readonly records?: readonly KnowledgeRecord[]
  readonly documents?: readonly KnowledgeDocument[]
  readonly proposals?: readonly KnowledgeProposal[]
  readonly initialState?: KnowledgeSurfaceState
}

function typeLabel(dict: LocaleDict, type: KnowledgeRecord['type']): string {
  return bindLocale(dict, `type.${type}`)
}

function visibilityLabel(dict: LocaleDict, visibility: KnowledgeRecord['visibility']): string {
  return bindLocale(dict, `visibility.${visibility}`)
}

/** Cofre da empresa preview surface. */
export function KnowledgeVault({
  dict = defaultDict,
  records: sourceRecords = [],
  documents = [],
  proposals = [],
  initialState = 'ready',
}: KnowledgeVaultProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 6 })
  const [tab, setTab] = useState<KnowledgeTab>('records')
  const [query, setQuery] = useState('')
  const [surfaceState, setSurfaceState] = useState(initialState)

  const records = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) return sourceRecords
    return sourceRecords.filter(r =>
      r.title.toLowerCase().includes(q) || r.excerpt.toLowerCase().includes(q))
  }, [query, sourceRecords])

  if (surfaceState === 'loading') {
    return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={3} />
  }

  if (surfaceState === 'error') {
    return (
      <PersonaSurfaceError
        dict={dict}
        titleKey="error.title"
        retryKey="error.retry"
        onRetry={() => { setSurfaceState('ready') }}
      />
    )
  }

  if (surfaceState === 'empty') {
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
    <div className={styles.shell} ref={motion.ref} style={motion.style} data-persona-surface="knowledge">
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>
      <div className={styles.tabs} role="tablist" aria-label={t('title')}>
        {(['records', 'documents', 'proposals'] as const).map(id => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.tab}${tab === id ? ` ${styles.tabActive}` : ''}`}
            onClick={() => { setTab(id) }}
          >
            {t(`tab.${id}`)}
          </button>
        ))}
      </div>
      {tab === 'records' && (
        <input
          className={styles.search}
          type="search"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => { setQuery(e.target.value) }}
          aria-label={t('search.placeholder')}
        />
      )}
      {tab === 'records' && (
        <ul className={styles.list}>
          {records.map(record => (
            <li key={record.id} className={styles.item}>
              <div className={styles.itemHeader}>
                <span className={styles.badge}>{typeLabel(dict, record.type)}</span>
                <span className={styles.badge}>{visibilityLabel(dict, record.visibility)}</span>
              </div>
              <h2 className={styles.itemTitle}>{record.title}</h2>
              <p className={styles.excerpt}>{record.excerpt}</p>
              <p className={styles.meta}>
                {t('field.version', { version: record.version })}
                {' · '}
                {t('field.updated', { date: record.updatedAt })}
                {' · '}
                {t('field.author', { name: record.author })}
              </p>
            </li>
          ))}
        </ul>
      )}
      {tab === 'documents' && (
        <ul className={styles.list}>
          {documents.map(doc => (
            <li key={doc.id} className={styles.item}>
              <h2 className={styles.itemTitle}>{doc.name}</h2>
              <p className={styles.meta}>
                {t('field.version', { version: doc.version })}
                {' · '}
                {t('field.updated', { date: doc.updatedAt })}
                {' · '}
                {visibilityLabel(dict, doc.visibility)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {tab === 'proposals' && (
        <ul className={styles.list}>
          {proposals.map(proposal => (
            <li key={proposal.id} className={styles.item}>
              <div className={styles.itemHeader}>
                <span className={styles.badge}>{t('proposal.pending')}</span>
              </div>
              <h2 className={styles.itemTitle}>{proposal.recordTitle}</h2>
              <p className={styles.excerpt}>{proposal.summary}</p>
              <p className={styles.meta}>{t('field.author', { name: proposal.proposer })}</p>
              <div className={styles.actions}>
                <PersonaButton>{t('proposal.approve')}</PersonaButton>
                <PersonaButton variant="secondary">{t('proposal.dismiss')}</PersonaButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
