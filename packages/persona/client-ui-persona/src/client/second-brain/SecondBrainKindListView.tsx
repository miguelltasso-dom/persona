import type { BrainKindView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Avatar, BrandIcon, Card, Chip, FixedRowVirtualScroller, Screen, ScreenHeader, Tabs } from '../primitives/index.ts'
import { brainKindBrandIcon, brainKindLabel, brainPageTitle, feedEditorDisplay, pageExcerpt } from './brain-ui-adapters.ts'
import { SecondBrainGraphView } from './SecondBrainGraphView.tsx'
import { pt as defaultDict } from '../locale/second-brain/locales.ts'
import styles from './SecondBrain.module.css'

type KindFilterTab = 'all' | 'private' | 'contradiction'
type KindViewMode = 'list' | 'graph'

const VIEW_MODE_KEY = 'persona.secondBrain.kindViewMode'
export const BRAIN_PAGE_ROW_PX = 88
export const BRAIN_LIST_VIRTUAL_MIN = 40

export function BrainPageListRow({
  dict,
  page,
  personaNames,
  memberNames,
  onOpenPage,
}: {
  readonly dict: LocaleDict
  readonly page: BrainPageView
  readonly personaNames: Readonly<Record<string, string>>
  readonly memberNames: Readonly<Record<string, string>>
  readonly onOpenPage: (pageId: string) => void
}): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const editor = feedEditorDisplay(dict, page, personaNames, memberNames)
  return (
    <button type="button" className={styles.pageRowButton} onClick={() => { onOpenPage(page.id) }}>
      <span className={styles.brainPageLink}>{brainPageTitle(dict, page)}</span>
      <span className={styles.muted}>{pageExcerpt(page.body)}</span>
      <span className={styles.pageRowMeta}>
        {page.restricted && <Chip tone="neutral" size="s">{t('page.visibilityPrivate')}</Chip>}
        <span className={styles.pageRowEditor}>
          <Avatar
            name={editor.who}
            src={editor.whoAvatar}
            size={24}
            shape={editor.whoAvatar === undefined ? 'person' : 'portrait'}
            decorative
          />
          <span className={styles.muted}>{editor.who}</span>
        </span>
      </span>
    </button>
  )
}

export interface SecondBrainKindListViewProps {
  readonly dict?: LocaleDict
  readonly kind: BrainKindView
  readonly pages: readonly BrainPageView[]
  readonly contradictionIds?: ReadonlySet<string> | undefined
  readonly personaNames?: Readonly<Record<string, string>>
  readonly memberNames?: Readonly<Record<string, string>>
  readonly onBack: () => void
  readonly onOpenPage: (pageId: string) => void
}

export function SecondBrainKindListView({
  dict = defaultDict,
  kind,
  pages,
  contradictionIds,
  personaNames = {},
  memberNames = {},
  onBack,
  onOpenPage,
}: SecondBrainKindListViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [filter, setFilter] = useState<KindFilterTab>('all')
  const [viewMode, setViewMode] = useState<KindViewMode>('list')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(VIEW_MODE_KEY)
    if (saved === 'list' || saved === 'graph') setViewMode(saved)
  }, [])

  const setMode = (mode: KindViewMode): void => {
    setViewMode(mode)
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_MODE_KEY, mode)
  }

  const filtered = useMemo(() => {
    let rows = pages.filter(page => page.kind === kind)
    if (filter === 'private') rows = rows.filter(page => page.restricted)
    if (filter === 'contradiction' && contradictionIds !== undefined) {
      rows = rows.filter(page => contradictionIds.has(page.id))
    }
    return rows
  }, [pages, kind, filter, contradictionIds])

  return (
    <Screen className={styles.shell} data-persona-surface="second-brain-list">
      <ScreenHeader
        icon="conhecimento-memoria"
        eyebrow={(
          <span className={styles.kindEyebrow}>
            <BrandIcon name={brainKindBrandIcon(kind)} size={18} />
            {t('header.eyebrow')}
          </span>
        )}
        title={brainKindLabel(dict, kind)}
        subtitle={t('kindList.subtitle', { count: filtered.length })}
        actions={(
          <div className={styles.kindHeaderActions}>
            <Tabs
              idPrefix="brain-kind-view"
              label={t('kindList.view.list')}
              value={viewMode}
              onChange={setMode}
              items={[
                { id: 'list', label: t('kindList.view.list') },
                { id: 'graph', label: t('kindList.view.graph') },
              ]}
            />
            <button type="button" className={styles.backLink} onClick={onBack}>
              {t('page.backHome')}
            </button>
          </div>
        )}
      />
      <Tabs
        idPrefix="brain-kind-filter"
        label={t('kindList.tab.all')}
        value={filter}
        onChange={setFilter}
        items={[
          { id: 'all', label: t('kindList.tab.all') },
          { id: 'private', label: t('kindList.tab.private') },
          { id: 'contradiction', label: t('kindList.tab.contradiction') },
        ]}
      />
      {viewMode === 'graph' ? (
        <SecondBrainGraphView pages={filtered} onOpenPage={onOpenPage} onShowList={() => { setMode('list') }} />
      ) : filtered.length === 0 ? (
        <Card padding="m" eyebrow={brainKindLabel(dict, kind)}>
          <p className={styles.muted}>{t('kindList.empty')}</p>
        </Card>
      ) : (
        <Card padding="m" eyebrow={brainKindLabel(dict, kind)}>
          {filtered.length >= BRAIN_LIST_VIRTUAL_MIN ? (
            <FixedRowVirtualScroller
              {...(styles.pageListVirtual === undefined ? {} : { className: styles.pageListVirtual })}
              rowCount={filtered.length}
              rowHeight={BRAIN_PAGE_ROW_PX}
              getRowKey={index => filtered[index]?.id ?? `brain-row-${index}`}
              renderRow={(index) => {
                const page = filtered[index]
                if (page === undefined) return null
                return (
                  <BrainPageListRow
                    dict={dict}
                    page={page}
                    personaNames={personaNames}
                    memberNames={memberNames}
                    onOpenPage={onOpenPage}
                  />
                )
              }}
            />
          ) : (
            <ul className={styles.pageList}>
              {filtered.map(page => (
                <li key={page.id}>
                  <BrainPageListRow
                    dict={dict}
                    page={page}
                    personaNames={personaNames}
                    memberNames={memberNames}
                    onOpenPage={onOpenPage}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </Screen>
  )
}
