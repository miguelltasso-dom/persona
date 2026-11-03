/** C6b — Kanban global com filtros (equipe, projeto, persona, estado). */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Screen, ScreenHeader, UiIcon } from '../primitives/index.ts'
import { KanbanFilterField } from './KanbanFilterField.tsx'
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
  readonly onOpenReview?: (card: KanbanCardModel) => void
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
  onOpenReview,
}: GlobalKanbanProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
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

  const boardSurface: KanbanSurfaceState =
    visibleCards.length === 0 && surfaceState === 'ready' ? 'empty' : surfaceState

  return (
    <Screen width="full" className={styles.boardShell} data-persona-kanban="global">
      <ScreenHeader
        icon="kanban"
        eyebrow={t('header.eyebrow')}
        title={t('title.global')}
        subtitle={t('subtitle.global')}
        actions={(
          <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />}>
            {t('action.newTask')}
          </Button>
        )}
      />
      <Card padding="m" className={styles.filtersCard}>
        <div className={styles.filters} role="search">
          <KanbanFilterField
            id="kanban-filter-team"
            label={t('filter.team')}
            value={filters.teamId}
            onChange={(e) => { updateFilter('teamId', e.target.value) }}
          >
            <option value="all">{t('filter.all')}</option>
            {filterOptions.teams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </KanbanFilterField>
          <KanbanFilterField
            id="kanban-filter-project"
            label={t('filter.project')}
            value={filters.projectId}
            onChange={(e) => { updateFilter('projectId', e.target.value) }}
          >
            <option value="all">{t('filter.all')}</option>
            {filterOptions.projects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </KanbanFilterField>
          <KanbanFilterField
            id="kanban-filter-persona"
            label={t('filter.persona')}
            value={filters.personaId}
            onChange={(e) => { updateFilter('personaId', e.target.value) }}
          >
            <option value="all">{t('filter.all')}</option>
            {filterOptions.personas.map(persona => (
              <option key={persona.id} value={persona.id}>{persona.name}</option>
            ))}
          </KanbanFilterField>
          <KanbanFilterField
            id="kanban-filter-stage"
            label={t('filter.stage')}
            value={filters.column}
            onChange={(e) => { updateFilter('column', e.target.value as KanbanFilters['column']) }}
          >
            <option value="all">{t('filter.all')}</option>
            {(Object.keys(labels) as KanbanColumnId[]).map(col => (
              <option key={col} value={col}>{labels[col]}</option>
            ))}
          </KanbanFilterField>
        </div>
      </Card>
      <KanbanBoard
        dict={dict}
        cards={visibleCards}
        surfaceState={boardSurface}
        showProjectOnCard
        columnLabels={labels}
        onMoveCard={onMoveCard}
        {...(onOpenReview === undefined ? {} : {
          onOpenReview: (cardId: string) => {
            const card = visibleCards.find(item => item.id === cardId)
            if (card !== undefined) onOpenReview(card)
          },
        })}
        onRetry={() => {}}
        onEmptyPrimary={() => { setFilters(DEFAULT_KANBAN_FILTERS) }}
      />
    </Screen>
  )
}
