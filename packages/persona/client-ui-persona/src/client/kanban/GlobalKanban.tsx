/** C6b — Kanban global com filtros (equipe, projeto, persona, estado). */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { KanbanBoard } from './KanbanBoard.tsx'
import styles from './Kanban.module.css'
import { deriveKanbanFilterOptions } from './derive-filter-options.ts'
import { DEFAULT_KANBAN_FILTERS } from './mock-data.ts'
import { pt as defaultDict } from '../locale/kanban/locales.ts'
import type { KanbanCardModel, KanbanColumnId, KanbanFilters, KanbanSurfaceState } from './types.ts'

export interface GlobalKanbanProps {
  readonly dict?: LocaleDict
  readonly initialCards?: readonly KanbanCardModel[]
  readonly initialState?: KanbanSurfaceState
}

function columnLabelsFromDict(dict: LocaleDict): Record<KanbanColumnId, string> {
  const t = (key: string) => bindLocale(dict, key)
  return {
    todo: t('column.todo'),
    in_progress: t('column.inProgress'),
    in_review: t('column.inReview'),
    blocked: t('column.blocked'),
    done: t('column.done'),
  }
}

function applyFilters(cards: readonly KanbanCardModel[], filters: KanbanFilters): KanbanCardModel[] {
  return cards.filter((card) => {
    if (filters.teamId !== 'all' && card.teamId !== filters.teamId) return false
    if (filters.projectId !== 'all' && card.projectId !== filters.projectId) return false
    if (filters.personaId !== 'all' && card.assignee?.id !== filters.personaId) return false
    if (filters.column !== 'all' && card.column !== filters.column) return false
    return true
  })
}

/** Global board with filter toolbar. */
export function GlobalKanban({
  dict = defaultDict,
  initialCards = [],
  initialState = 'ready',
}: GlobalKanbanProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const motion = usePersonaMotion({ preset: 'fast', fromOpacity: 0, fromTranslateY: 8 })
  const [surfaceState] = useState<KanbanSurfaceState>(initialState)
  const [allCards, setAllCards] = useState<readonly KanbanCardModel[]>(initialCards)
  const [filters, setFilters] = useState<KanbanFilters>(DEFAULT_KANBAN_FILTERS)

  const labels = useMemo(() => columnLabelsFromDict(dict), [dict])
  const filterOptions = useMemo(() => deriveKanbanFilterOptions(allCards), [allCards])
  const visibleCards = useMemo(() => applyFilters(allCards, filters), [allCards, filters])

  const onMoveCard = useCallback((cardId: string, toColumn: KanbanColumnId) => {
    setAllCards(prev => prev.map((card) => {
      if (card.id !== cardId) return card
      return { ...card, column: toColumn, blocked: toColumn === 'blocked' }
    }))
  }, [])

  const updateFilter = <K extends keyof KanbanFilters>(key: K, value: KanbanFilters[K]): void => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className={styles.boardShell} data-persona-kanban="global" ref={motion.ref} style={motion.style}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('title.global')}</h1>
        <p className={styles.subtitle}>{t('subtitle.global')}</p>
      </header>
      <div className={styles.filters} role="search">
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="kanban-filter-team">{t('filter.team')}</label>
          <select
            id="kanban-filter-team"
            className={styles.select}
            value={filters.teamId}
            onChange={(e) => { updateFilter('teamId', e.target.value) }}
          >
            <option value="all">{t('filter.all')}</option>
            {filterOptions.teams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="kanban-filter-project">{t('filter.project')}</label>
          <select
            id="kanban-filter-project"
            className={styles.select}
            value={filters.projectId}
            onChange={(e) => { updateFilter('projectId', e.target.value) }}
          >
            <option value="all">{t('filter.all')}</option>
            {filterOptions.projects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="kanban-filter-persona">{t('filter.persona')}</label>
          <select
            id="kanban-filter-persona"
            className={styles.select}
            value={filters.personaId}
            onChange={(e) => { updateFilter('personaId', e.target.value) }}
          >
            <option value="all">{t('filter.all')}</option>
            {filterOptions.personas.map(persona => (
              <option key={persona.id} value={persona.id}>{persona.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="kanban-filter-stage">{t('filter.stage')}</label>
          <select
            id="kanban-filter-stage"
            className={styles.select}
            value={filters.column}
            onChange={(e) => { updateFilter('column', e.target.value as KanbanFilters['column']) }}
          >
            <option value="all">{t('filter.all')}</option>
            {(Object.keys(labels) as KanbanColumnId[]).map(col => (
              <option key={col} value={col}>{labels[col]}</option>
            ))}
          </select>
        </div>
      </div>
      <KanbanBoard
        dict={dict}
        cards={visibleCards}
        surfaceState={visibleCards.length === 0 && surfaceState === 'ready' ? 'empty' : surfaceState}
        showProjectOnCard
        columnLabels={labels}
        onMoveCard={onMoveCard}
        onRetry={() => {}}
        onEmptyPrimary={() => { setFilters(DEFAULT_KANBAN_FILTERS) }}
      />
    </div>
  )
}
