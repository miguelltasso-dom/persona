import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { BrandIcon, EmptyState, Screen, ScreenHeader, Tabs } from '../primitives/index.ts'
import styles from './SearchView.module.css'

type SearchFilter = 'all' | 'messages' | 'tasks' | 'vault' | 'files'

const FILTERS: readonly SearchFilter[] = ['all', 'messages', 'tasks', 'vault', 'files']

/** Busca global (Muse): big field + filters + illustrated empty state; results wire later (Prism/host search). */
export function SearchPlaceholderView({ t }: PropsLocale<'persona.shell'>): ReactNode {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('all')
  return (
    <Screen width="reading">
      <ScreenHeader icon="busca" title={t('sidebar.search')} subtitle={t('search.subtitle')} />
      <label className={styles.field}>
        <span className="persona-sr-only">{t('search.label')}</span>
        <BrandIcon name="busca" size={22} className={styles.fieldIcon} />
        <input
          className={styles.input}
          type="search"
          value={query}
          placeholder={t('search.placeholder')}
          onChange={(event) => { setQuery(event.target.value) }}
        />
        <kbd className={styles.kbd}>{t('sidebar.searchShortcut')}</kbd>
      </label>
      <Tabs
        label={t('search.filtersLabel')}
        idPrefix="persona-search"
        value={filter}
        onChange={setFilter}
        items={FILTERS.map(id => ({ id, label: t(`search.filter.${id}`) }))}
      />
      <div id={`persona-search-panel-${filter}`} role="tabpanel" aria-labelledby={`persona-search-tab-${filter}`}>
        <EmptyState illustration={ILLUSTRATIONS['empty-search']} title={t('search.emptyTitle')} body={t('search.emptyBody')} />
      </div>
    </Screen>
  )
}
