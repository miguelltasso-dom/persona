/** Memória da empresa › Páginas: every page of the company in one list (search, one chip per type that has pages), and the uploaded documents below. */

import type { BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { useMemo, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, FixedRowVirtualScroller, Input, Screen, ScreenHeader } from '../primitives/index.ts'
import { BRAIN_KINDS, brainKindLabel, brainPageTitle, countPagesByKind } from './brain-ui-adapters.ts'
import { BRAIN_LIST_VIRTUAL_MIN, BRAIN_PAGE_ROW_PX, BrainPageListRow } from './SecondBrainKindListView.tsx'
import { pt as defaultDict } from '../locale/second-brain/locales.ts'
import styles from './SecondBrain.module.css'

export interface SecondBrainPagesViewProps {
  readonly dict?: LocaleDict
  readonly pages: readonly BrainPageView[]
  readonly personaNames?: Readonly<Record<string, string>>
  readonly memberNames?: Readonly<Record<string, string>>
  readonly onOpenPage: (pageId: string) => void
  /** "+ Nova página". Absent = the button is not drawn (the host cannot write pages here). */
  readonly onWritePage?: (() => void) | undefined
  /** The documents of the company (the old Cofre), drawn below the list. */
  readonly children?: ReactNode
}

export function SecondBrainPagesView({
  dict = defaultDict,
  pages,
  personaNames = {},
  memberNames = {},
  onOpenPage,
  onWritePage,
  children,
}: SecondBrainPagesViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<string>('all')
  const counts = useMemo(() => countPagesByKind(pages), [pages])
  const kindsWithPages = BRAIN_KINDS.filter(row => (counts[row] ?? 0) > 0)
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return pages.filter((page) => {
      if (kind !== 'all' && page.kind !== kind) return false
      if (needle === '') return true
      return brainPageTitle(dict, page).toLowerCase().includes(needle)
        || page.title.toLowerCase().includes(needle)
        || page.body.toLowerCase().includes(needle)
    })
  }, [dict, kind, pages, query])

  return (
    <Screen className={styles.shell} data-persona-surface="knowledge">
      <ScreenHeader
        icon="conhecimento-memoria"
        eyebrow={t('header.eyebrow')}
        title={t('pages.title')}
        subtitle={t('pages.subtitle')}
        {...(onWritePage === undefined
          ? {}
          : { actions: <Button variant="primary" size="m" onClick={() => { onWritePage() }}>{t('page.new')}</Button> })}
      />
      {pages.length === 0 ? (
        <Card padding="m" eyebrow={t('pages.listTitle')}>
          <p className={styles.muted}>{t('pages.empty')}</p>
        </Card>
      ) : (
        <>
          <Input
            type="search"
            hideLabel
            label={t('pages.search')}
            placeholder={t('pages.search')}
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
          />
          <div className={styles.filterChips} role="group" aria-label={t('pages.filterLabel')}>
            <button type="button" className={styles.filterChip} aria-pressed={kind === 'all'} onClick={() => { setKind('all') }}>
              {t('pages.all')}
              {' '}
              <span className={styles.filterCount}>{pages.length}</span>
            </button>
            {kindsWithPages.map(row => (
              <button key={row} type="button" className={styles.filterChip} aria-pressed={kind === row} onClick={() => { setKind(row) }}>
                {brainKindLabel(dict, row)}
                {' '}
                <span className={styles.filterCount}>{counts[row]}</span>
              </button>
            ))}
          </div>
          <Card padding="m" eyebrow={t('pages.listTitle')}>
            {rows.length === 0 ? (
              <p className={styles.muted}>{t('pages.none')}</p>
            ) : rows.length >= BRAIN_LIST_VIRTUAL_MIN ? (
              <FixedRowVirtualScroller
                {...(styles.pageListVirtual === undefined ? {} : { className: styles.pageListVirtual })}
                rowCount={rows.length}
                rowHeight={BRAIN_PAGE_ROW_PX}
                getRowKey={index => rows[index]?.id ?? `brain-row-${index}`}
                renderRow={(index) => {
                  const page = rows[index]
                  if (page === undefined) return null
                  return <BrainPageListRow dict={dict} page={page} personaNames={personaNames} memberNames={memberNames} onOpenPage={onOpenPage} />
                }}
              />
            ) : (
              <ul className={styles.pageList}>
                {rows.map(page => (
                  <li key={page.id}>
                    <BrainPageListRow dict={dict} page={page} personaNames={personaNames} memberNames={memberNames} onOpenPage={onOpenPage} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
      {children !== undefined && (
        <section className={styles.docsSection} aria-label={t('docs.title')} data-persona-memory-docs="">
          {children}
        </section>
      )}
    </Screen>
  )
}
