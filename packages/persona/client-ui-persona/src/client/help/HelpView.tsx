/**
 * HelpView (Muse): Ajuda + Novidades. Guides from docs/persona (generated-help.ts), search with highlight,
 * index, "Nesta página", previous/next. Pure view: the panel wrapper (register-help.tsx) gives it `t` and navigation.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Button, EmptyState, HelpArticle, Input, Screen, ScreenHeader, Tabs } from '../primitives/index.ts'
import { HELP_DOCS, RELEASE_NOTES } from './generated-help.ts'
import type { HelpDoc } from './help-types.ts'
import styles from './HelpView.module.css'

export type HelpTab = 'guias' | 'novidades'
type T = (key: string, params?: Readonly<Record<string, string | number>>) => string

export interface HelpViewProps {
  readonly t: T
  readonly docs?: readonly HelpDoc[]
  readonly notes?: HelpDoc | null
  readonly initialDocId?: string | undefined
  readonly initialTab?: HelpTab | undefined
  /** true when the interface language is not pt (guides are pt-only for now). */
  readonly showPtOnlyNote?: boolean
  readonly onAskTeam?: (() => void) | undefined
  readonly onOpenExternal?: ((url: string) => void) | undefined
}

const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/gu, '')

/** Docs matching every query word; title hits first. Exported for tests. */
export function searchHelp(docs: readonly HelpDoc[], query: string): HelpDoc[] {
  const words = fold(query).split(/\s+/u).filter(w => w.length >= 2)
  if (words.length === 0) return [...docs]
  const scored = docs
    .map((doc) => {
      const title = fold(doc.title)
      if (!words.every(w => doc.text.includes(w) || title.includes(w))) return null
      const score = words.reduce((s, w) => s + (title.includes(w) ? 10 : 0) + (doc.text.split(w).length - 1), 0)
      return { doc, score }
    })
    .filter((x): x is { doc: HelpDoc; score: number } => x !== null)
  return scored.sort((a, b) => b.score - a.score).map(x => x.doc)
}

export function HelpView({ t, docs = HELP_DOCS, notes = RELEASE_NOTES, initialDocId, initialTab = 'guias', showPtOnlyNote = false, onAskTeam, onOpenExternal }: HelpViewProps): ReactNode {
  const [tab, setTab] = useState<HelpTab>(initialTab)
  const [query, setQuery] = useState('')
  const [docId, setDocId] = useState<string>(() => (docs.some(d => d.id === initialDocId) ? initialDocId! : docs[0]?.id ?? ''))
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null)
  const articleRef = useRef<HTMLElement>(null)

  useEffect(() => { setTab(initialTab) }, [initialTab])
  useEffect(() => { if (initialDocId !== undefined && docs.some(d => d.id === initialDocId)) setDocId(initialDocId) }, [initialDocId, docs])

  const results = useMemo(() => searchHelp(docs, query), [docs, query])
  const words = useMemo(() => fold(query).split(/\s+/u).filter(w => w.length >= 2), [query])
  const doc = docs.find(d => d.id === docId) ?? docs[0]
  const order = query.trim().length > 0 ? results : docs
  const index = doc === undefined ? -1 : order.findIndex(d => d.id === doc.id)
  const prev = index > 0 ? order[index - 1] : undefined
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : undefined

  const open = (id: string, anchor?: string): void => {
    setDocId(id)
    setPendingAnchor(anchor ?? null)
    setTab('guias')
  }

  // After switching guide (not on first open): focus the article title or the anchor, so keyboard and screen readers follow.
  const mounted = useRef(false)
  useEffect(() => {
    const root = articleRef.current
    if (!mounted.current) { mounted.current = true; return }
    if (root === null) return
    const target = pendingAnchor !== null ? root.querySelector<HTMLElement>(`#help-${CSS.escape(pendingAnchor)}`) : root.querySelector<HTMLElement>('h2')
    target?.focus({ preventScroll: true })
    if (target !== null && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'start' })
  }, [docId, pendingAnchor])

  const resultsLine = query.trim().length === 0
    ? null
    : results.length === 1 ? t('search.oneResult', { query: query.trim() }) : t('search.results', { count: results.length, query: query.trim() })

  return (
    <Screen width="full" className={styles.screen}>
      <ScreenHeader icon="conhecimento-memoria" eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />
      <Tabs
        label={t('tabs.label')}
        idPrefix="persona-help"
        value={tab}
        onChange={setTab}
        items={[{ id: 'guias', label: t('tabs.guides') }, ...(notes !== null ? [{ id: 'novidades' as const, label: t('tabs.news') }] : [])]}
      />

      {tab === 'guias' && (
        <div className={styles.layout} role="tabpanel" id="persona-help-panel-guias" aria-labelledby="persona-help-tab-guias">
          <aside className={styles.side}>
            <div role="search">
              <Input
                label={t('search.label')}
                hideLabel
                type="search"
                placeholder={t('search.placeholder')}
                value={query}
                onChange={(e) => { setQuery(e.currentTarget.value) }}
              />
            </div>
            <p className={styles.resultsLine} aria-live="polite">{resultsLine}</p>
            <nav aria-label={t('index.label')}>
              <ul className={styles.index}>
                {results.map(d => (
                  <li key={d.id}>
                    <button type="button" className={styles.indexItem} aria-current={d.id === doc?.id ? 'page' : undefined} onClick={() => { open(d.id) }}>
                      <span className={styles.indexTitle}>{d.title}</span>
                      <span className={styles.indexSummary}>{d.summary}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article ref={articleRef} className={styles.article} aria-labelledby="help-doc-title">
            {results.length === 0 ? (
              <EmptyState
                compact
                illustration={ILLUSTRATIONS['empty-search']}
                title={t('search.emptyTitle', { query: query.trim() })}
                body={t('search.emptyBody')}
                action={onAskTeam !== undefined ? <Button variant="primary" onClick={onAskTeam}>{t('search.askTeam')}</Button> : undefined}
              />
            ) : doc !== undefined && (
              <>
                {showPtOnlyNote && <p className={styles.ptOnly} lang="en">{t('lang.ptOnly')}</p>}
                <h2 id="help-doc-title" className={styles.docTitle} tabIndex={-1} lang="pt-BR">{doc.title}</h2>
                {doc.headings.filter(h => h.level === 2).length > 1 && (
                  <nav className={styles.toc} aria-label={t('toc.label')}>
                    <p className={styles.tocLabel}>{t('toc.label')}</p>
                    <ul>
                      {doc.headings.filter(h => h.level === 2).map(h => (
                        <li key={h.id}><button type="button" className={styles.tocLink} onClick={() => { open(doc.id, h.id) }}>{h.text}</button></li>
                      ))}
                    </ul>
                  </nav>
                )}
                <div lang="pt-BR">
                  <HelpArticle blocks={doc.blocks} idPrefix="help" highlight={words} onOpenDoc={open} onOpenExternal={onOpenExternal} externalHint={t('external.opens')} />
                </div>
                <nav className={styles.pager} aria-label={t('index.label')}>
                  {prev !== undefined ? <Button variant="ghost" onClick={() => { open(prev.id) }}>← {t('nav.prev', { title: prev.title })}</Button> : <span />}
                  {next !== undefined && <Button variant="secondary" onClick={() => { open(next.id) }}>{t('nav.next', { title: next.title })} →</Button>}
                </nav>
              </>
            )}
          </article>
        </div>
      )}

      {tab === 'novidades' && notes !== null && (
        <div className={styles.news} role="tabpanel" id="persona-help-panel-novidades" aria-labelledby="persona-help-tab-novidades">
          <article className={styles.newsCard} aria-labelledby="help-news-title">
            {ILLUSTRATIONS['release-notes-badge'] !== undefined && <img className={styles.newsBadge} src={ILLUSTRATIONS['release-notes-badge']} alt="" width={112} height={112} />}
            <h2 id="help-news-title" className={styles.docTitle} lang="pt-BR">{notes.title}</h2>
            {showPtOnlyNote && <p className={styles.ptOnly} lang="en">{t('lang.ptOnly')}</p>}
            <div lang="pt-BR">
              <HelpArticle blocks={notes.blocks} idPrefix="news" onOpenDoc={open} onOpenExternal={onOpenExternal} externalHint={t('external.opens')} />
            </div>
          </article>
        </div>
      )}
    </Screen>
  )
}
