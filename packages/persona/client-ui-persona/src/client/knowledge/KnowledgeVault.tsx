/** Company vault: records, documents, visibility, update proposals. */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Chip, Input, Screen, ScreenHeader, Tabs, type ChipTone } from '../primitives/index.ts'
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
  readonly onRemoteRetry?: () => void
  /** UX-13: empty Cofre → "Descrever a empresa" (Lumen wires: open the company brief editor). */
  readonly onDescribeCompany?: (() => void) | undefined
  /** BRIEFING 18: open Conhecimento › Importar (BYC). */
  readonly onOpenImport?: (() => void) | undefined
  readonly onUploadDocument?: ((file: File) => Promise<void>) | undefined
  readonly onReplaceDocument?: ((documentId: string, file: File) => Promise<void>) | undefined
  readonly onDeleteDocument?: ((documentId: string) => Promise<void>) | undefined
}

function typeLabel(dict: LocaleDict, type: KnowledgeRecord['type']): string {
  return bindLocale(dict, `type.${type}`)
}

function typeChipTone(type: KnowledgeRecord['type']): ChipTone {
  if (type === 'constraint') return 'accent'
  if (type === 'decision') return 'brand'
  if (type === 'memory') return 'info'
  return 'neutral'
}

function visibilityLabel(dict: LocaleDict, visibility: KnowledgeRecord['visibility']): string {
  return bindLocale(dict, `visibility.${visibility}`)
}

function VisibilityChip({
  dict,
  visibility,
}: {
  readonly dict: LocaleDict
  readonly visibility: KnowledgeRecord['visibility']
}): ReactNode {
  const label = visibilityLabel(dict, visibility)
  if (visibility === 'private') {
    return (
      <Chip
        tone="neutral"
        size="s"
        className={styles.visibilityPrivate}
        aria-label={bindLocale(dict, 'visibility.privateAria', { label })}
      >
        {label}
      </Chip>
    )
  }
  return <Chip tone="neutral" size="s">{label}</Chip>
}

/** Cofre da empresa preview surface. */
export function KnowledgeVault({
  dict = defaultDict,
  records: sourceRecords = [],
  documents = [],
  proposals = [],
  initialState = 'ready',
  onRemoteRetry,
  onDescribeCompany,
  onOpenImport,
  onUploadDocument,
  onReplaceDocument,
  onDeleteDocument,
}: KnowledgeVaultProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [tab, setTab] = useState<KnowledgeTab>('records')
  const [query, setQuery] = useState('')
  const [surfaceState, setSurfaceState] = useState(initialState)

  useEffect(() => {
    setSurfaceState(initialState)
  }, [initialState])

  const records = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) return sourceRecords
    return sourceRecords.filter(r =>
      r.title.toLowerCase().includes(q) || r.excerpt.toLowerCase().includes(q))
  }, [query, sourceRecords])

  const header = (
    <ScreenHeader
      icon="conhecimento-memoria"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      {...(onOpenImport === undefined
        ? {}
        : {
          actions: (
            <Button variant="secondary" size="m" onClick={() => { onOpenImport() }}>
              {t('action.import')}
            </Button>
          ),
        })}
    />
  )

  if (surfaceState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="knowledge">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={3} />
      </Screen>
    )
  }

  if (surfaceState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="knowledge">
        {header}
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={() => { onRemoteRetry?.() }}
        />
      </Screen>
    )
  }

  if (surfaceState === 'empty') {
    return (
      <Screen className={styles.shell} data-persona-surface="knowledge">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-vault"
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
          {...(onDescribeCompany === undefined ? {} : { onPrimary: onDescribeCompany })}
        />
      </Screen>
    )
  }

  const tabItems = [
    { id: 'records' as const, label: t('tab.records') },
    { id: 'documents' as const, label: t('tab.documents') },
    ...(proposals.length > 0
      ? [{ id: 'proposals' as const, label: t('tab.proposals'), count: proposals.length }]
      : [{ id: 'proposals' as const, label: t('tab.proposals') }]),
  ]

  return (
    <Screen className={styles.shell} data-persona-surface="knowledge">
      {header}
      <Tabs
        items={tabItems}
        value={tab}
        onChange={setTab}
        label={t('title')}
        idPrefix="knowledge"
      />
      {tab === 'records' && (
        <Input
          className={styles.search}
          type="search"
          hideLabel
          label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => { setQuery(e.target.value) }}
        />
      )}
      {tab === 'records' && (
        <ul className={styles.list}>
          {records.map(record => (
            <li key={record.id}>
              <Card
                padding="m"
                className={`${styles.item}${record.type === 'constraint' ? ` ${styles.itemPinned}` : ''}`}
                {...(record.type === 'constraint' ? { tone: 'accent' as const } : {})}
              >
                <div className={styles.itemHeader}>
                  <Chip tone={typeChipTone(record.type)} size="s">{typeLabel(dict, record.type)}</Chip>
                  <VisibilityChip dict={dict} visibility={record.visibility} />
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
                <Button variant="ghost" size="s">{t('action.edit')}</Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {tab === 'documents' && (
        <>
          {onUploadDocument !== undefined && (
            <p className={styles.uploadRow}>
              <label className={styles.uploadLabel}>
                <input
                  type="file"
                  className={styles.uploadInput}
                  accept=".pdf,.docx,.md,.txt,.csv,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file === undefined) return
                    void onUploadDocument(file)
                  }}
                />
                <Button variant="secondary" size="s" type="button">{t('action.uploadDocument')}</Button>
              </label>
              <span className={styles.uploadHint}>{t('documents.uploadHint')}</span>
            </p>
          )}
          <ul className={styles.list}>
            {documents.map(doc => (
              <li key={doc.id}>
                <Card padding="m" className={styles.item}>
                  <h2 className={styles.itemTitle}>{doc.name}</h2>
                  <p className={styles.meta}>
                    {t('field.version', { version: doc.version })}
                    {doc.chunks !== undefined && (
                      <>
                        {' · '}
                        {t('field.chunks', { count: doc.chunks })}
                      </>
                    )}
                    {doc.updatedAt !== '' && (
                      <>
                        {' · '}
                        {t('field.updated', { date: doc.updatedAt })}
                      </>
                    )}
                    {' · '}
                    <span className={doc.visibility === 'private' ? styles.visibilityPrivateInline : undefined}>
                      {visibilityLabel(dict, doc.visibility)}
                    </span>
                  </p>
                  <div className={styles.actions}>
                    {onReplaceDocument !== undefined && (
                      <label>
                        <input
                          type="file"
                          className={styles.uploadInput}
                          accept=".pdf,.docx,.md,.txt,.csv,application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file === undefined) return
                            void onReplaceDocument(doc.id, file)
                          }}
                        />
                        <Button variant="ghost" size="s" type="button">{t('action.replaceDocument')}</Button>
                      </label>
                    )}
                    {onDeleteDocument !== undefined && (
                      <Button variant="ghost" size="s" onClick={() => { void onDeleteDocument(doc.id) }}>
                        {t('action.deleteDocument')}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === 'proposals' && (
        <ul className={styles.list}>
          {proposals.map(proposal => (
            <li key={proposal.id}>
              <Card padding="m" className={styles.item}>
                <Chip tone="accent" size="s">{t('proposal.pending')}</Chip>
                <h2 className={styles.itemTitle}>{proposal.recordTitle}</h2>
                <p className={styles.excerpt}>{proposal.summary}</p>
                <p className={styles.meta}>{t('field.author', { name: proposal.proposer })}</p>
                <div className={styles.actions}>
                  <Button variant="primary" size="s">{t('proposal.approve')}</Button>
                  <Button variant="secondary" size="s">{t('proposal.dismiss')}</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
