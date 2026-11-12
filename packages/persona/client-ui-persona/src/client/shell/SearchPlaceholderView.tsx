/**
 * Busca / Ctrl K (Muse, UX-06): big field + "Ir para" (every screen of the rail, even inside folded groups) +
 * "Equipe" (personas) — accent-insensitive, keyboard-first (↓ from the field, Enter opens the first result).
 * Content results (mensagens via host `search`) plug in through `contentResults` (Prism).
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Avatar, BrandIcon, EmptyState, Screen, ScreenHeader, Tabs, type BrandIconName } from '../primitives/index.ts'
import type { MainPanelId } from './create-shell-store.ts'
import { NAV_GROUPS, SEARCH_FOCUS_EVENT } from './nav-groups.ts'
import type { RailPersona } from './RailTeam.tsx'
import { useSearchPalette } from './SearchPalette.tsx'
import styles from './SearchView.module.css'

/** The most "Fazer agora" shortcuts the palette numbers (the keys 1–9). */
export const PALETTE_SHORTCUTS_MAX = 9

type SearchFilter = 'all' | 'messages' | 'tasks' | 'vault' | 'files'

const FILTERS: readonly SearchFilter[] = ['all', 'messages', 'tasks', 'vault', 'files']

const NO_TEAM: readonly RailPersona[] = []

export interface SearchContentResult {
  readonly id: string
  /** "Nina · #geral · 10:42" */
  readonly meta: string
  readonly text: string
  readonly onOpen: () => void
}

/** A thing Ctrl K can DO (T3-UX-HARVEST §2), not just find. */
export interface SearchAction {
  readonly id: string
  readonly label: string
  /** Extra words that should find it ("contratar", "nova persona"). */
  readonly keywords?: readonly string[]
  readonly icon?: BrandIconName | undefined
  readonly run: () => void
}

export interface SearchInjected {
  readonly hooks: { readonly team: HostObservable<readonly RailPersona[]> }
  navigate(panel: MainPanelId): void
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  /** Global actions ("Contratar persona", "Simular os 2 dias"). */
  readonly actions?: readonly SearchAction[] | undefined
  /** Actions on a persona found by the query ("Conversar com Nina", "Ensinar a Nina"). */
  readonly personaActions?: ((persona: RailPersona) => readonly SearchAction[]) | undefined
}

export type SearchViewProps = PropsLocale<'persona.shell'> & Partial<InjectFace<SearchInjected>> & {
  /** Host content hits for the current query (Prism wires `search`); undefined = not wired yet. */
  readonly contentResults?: readonly SearchContentResult[] | undefined
  readonly onQueryChange?: ((query: string) => void) | undefined
}

/** "Configurações" ~ "configuracoes": lower-case, no accents. */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

function useNoTeam<T>(selector: (team: readonly RailPersona[]) => T): T {
  return selector(NO_TEAM)
}

export function SearchPlaceholderView({ t, useTeam, navigate, openPersonaProfile, actions = [], personaActions, contentResults, onQueryChange }: SearchViewProps): ReactNode {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const team = (useTeam ?? useNoTeam)(rows => rows)
  // Inside the Ctrl K modal (DESIGN-01-MUSE §5.2 #11) the view is a palette: no page header, every result closes it, 1–9 run the first actions.
  const palette = useSearchPalette()
  const inPalette = palette !== null
  /** Closes the palette (if any) and then does what the result does. */
  const choose = <A extends unknown[]>(fn: ((...args: A) => void) | undefined) => (...args: A): void => {
    palette?.close()
    fn?.(...args)
  }

  useEffect(() => {
    inputRef.current?.focus()
    const onFocus = (): void => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener(SEARCH_FOCUS_EVENT, onFocus)
    return () => { window.removeEventListener(SEARCH_FOCUS_EVENT, onFocus) }
  }, [])

  const folded = foldForSearch(query)
  const screens = useMemo(() => NAV_GROUPS.flatMap(group => group.items)
    .filter(item => item.panel !== 'profile')
    .map(item => ({ ...item, label: t(item.labelKey) }))
    .filter(item => folded.length === 0 || foldForSearch(item.label).includes(folded)), [folded, t])
  const people = team.filter(persona => folded.length === 0
    || foldForSearch(persona.name).includes(folded)
    || foldForSearch(persona.role).includes(folded))

  const showGoTo = filter === 'all' && navigate !== undefined
  // "Fazer": matching global actions, plus the actions of the personas the query found (only while typing).
  // In the palette the empty query already lists the global actions ("Fazer agora"), numbered 1–9.
  const doing = filter !== 'all' ? [] : folded.length === 0 ? (inPalette ? actions.slice(0, PALETTE_SHORTCUTS_MAX) : []) : [
    ...actions.filter(a => [a.label, ...(a.keywords ?? [])].some(w => foldForSearch(w).includes(folded))),
    ...(personaActions === undefined ? [] : people.slice(0, 2).flatMap(p => personaActions(p))),
  ].slice(0, 6)
  // 1–9 exist only in the open palette and only while the field is empty (otherwise a digit is just text).
  const shortcutsOn = inPalette && folded.length === 0
  const runShortcut = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (!shortcutsOn || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !/^[1-9]$/u.test(event.key)) return false
    const action = doing[Number(event.key) - 1]
    if (action === undefined) return false
    event.preventDefault()
    choose(action.run)()
    return true
  }
  const hasLocal = (showGoTo && (screens.length > 0 || people.length > 0)) || doing.length > 0
  const hasContent = contentResults !== undefined && contentResults.length > 0

  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' && palette !== null) {
      event.preventDefault()
      palette.close()
      return
    }
    if (event.key === 'Escape' && navigate !== undefined) {
      event.preventDefault()
      navigate('channels')
      return
    }
    if (runShortcut(event)) return
    const first = resultsRef.current?.querySelector<HTMLButtonElement>('button[data-result]:not(:disabled)')
    if (first == null) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      first.focus()
    } else if (event.key === 'Enter' && folded.length > 0) {
      event.preventDefault()
      first.click()
    }
  }

  const onResultsKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (runShortcut(event)) return
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = [...(resultsRef.current?.querySelectorAll<HTMLButtonElement>('button[data-result]:not(:disabled)') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    if (event.key === 'ArrowUp' && index === 0) {
      inputRef.current?.focus()
      return
    }
    buttons[Math.min(buttons.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  // The personas, with a 24 px portrait in the palette (a 32 px one on the page). In the palette they come BEFORE "Ir para" (Carbon #11 order).
  const peopleSection = showGoTo && people.length > 0 ? (
    <section aria-labelledby="persona-search-team">
      <h2 id="persona-search-team" className={styles.sectionTitle}>{t('search.team')}</h2>
      <ul className={styles.people}>
        {people.map(persona => (
          <li key={persona.id}>
            <button
              type="button"
              data-result=""
              className={styles.person}
              disabled={openPersonaProfile === undefined}
              onClick={choose(() => { openPersonaProfile?.(persona.id) })}
            >
              <Avatar name={persona.name} src={PORTRAITS[persona.characterId]} size={inPalette ? 24 : 32} shape="portrait" decorative />
              <span className={styles.personText}>
                <span className={styles.personName}>{persona.name}</span>
                <span className={styles.personRole}>{persona.role}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  ) : null

  const content = (
    <>
      <label className={styles.field}>
        <span className="persona-sr-only">{t('search.label')}</span>
        <BrandIcon name="busca" size={22} className={styles.fieldIcon} />
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          value={query}
          placeholder={t('search.placeholder')}
          aria-keyshortcuts="Control+K Meta+K"
          onKeyDown={onFieldKeyDown}
          onChange={(event) => {
            setQuery(event.target.value)
            onQueryChange?.(event.target.value)
          }}
        />
        <kbd className={styles.kbd}>{t('sidebar.searchShortcut')}</kbd>
      </label>
      {!inPalette && (
        <Tabs
          label={t('search.filtersLabel')}
          idPrefix="persona-search"
          value={filter}
          onChange={setFilter}
          items={FILTERS.map(id => ({ id, label: t(`search.filter.${id}`) }))}
        />
      )}
      <div
        id={`persona-search-panel-${filter}`}
        role="tabpanel"
        aria-labelledby={`persona-search-tab-${filter}`}
        ref={resultsRef}
        className={styles.results}
        onKeyDown={onResultsKeyDown}
      >
        {doing.length > 0 && (
          <section aria-labelledby="persona-search-do">
            <h2 id="persona-search-do" className={styles.sectionTitle}>{t('search.do')}</h2>
            <ul className={styles.screenGrid}>
              {doing.map((action, index) => (
                <li key={action.id}>
                  <button type="button" data-result="" className={`${styles.screen} ${styles.action}`} onClick={choose(action.run)} aria-keyshortcuts={shortcutsOn ? String(index + 1) : undefined}>
                    <BrandIcon name={action.icon ?? 'equipe'} size={20} />
                    {action.label}
                    {shortcutsOn && <kbd className={styles.shortcut} aria-hidden="true">{index + 1}</kbd>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {inPalette && peopleSection}
        {showGoTo && screens.length > 0 && (
          <section aria-labelledby="persona-search-goto">
            <h2 id="persona-search-goto" className={styles.sectionTitle}>{t('search.goTo')}</h2>
            <ul className={styles.screenGrid}>
              {screens.map(item => (
                <li key={item.panel}>
                  <button type="button" data-result="" className={styles.screen} onClick={choose(() => { navigate(item.panel) })}>
                    <BrandIcon name={item.icon} size={20} />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!inPalette && peopleSection}
        {hasContent && (
          <section aria-labelledby="persona-search-content">
            <h2 id="persona-search-content" className={styles.sectionTitle}>{t('search.inConversations')}</h2>
            <ul className={styles.hits}>
              {contentResults.map(hit => (
                <li key={hit.id}>
                  <button type="button" data-result="" className={styles.hit} onClick={choose(hit.onOpen)}>
                    <span className={styles.hitMeta}>{hit.meta}</span>
                    <span className={styles.hitText}>{hit.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!hasLocal && !hasContent && (
          <EmptyState
            illustration={ILLUSTRATIONS['empty-search']}
            title={folded.length > 0 ? t('search.noMatchTitle', { query: query.trim() }) : t('search.emptyTitle')}
            body={folded.length > 0 ? t('search.noMatchBody') : t('search.emptyBody')}
          />
        )}
      </div>
    </>
  )

  if (inPalette) return <div className={styles.palette} data-persona-search-view="palette">{content}</div>
  return (
    <Screen width="reading">
      <ScreenHeader icon="busca" title={t('sidebar.search')} subtitle={t('search.subtitle')} />
      {content}
    </Screen>
  )
}

export { SearchPlaceholderView as SearchView }
