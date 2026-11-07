/** C6b — Kanban global com filtros (equipe, projeto, persona, estado). */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Screen, ScreenHeader, UiIcon } from '../primitives/index.ts'
import { KanbanFilterSelect, KanbanStageFilter } from './KanbanFilterSelect.tsx'
import { KanbanBoard } from './KanbanBoard.tsx'
import styles from './Kanban.module.css'
import { deriveKanbanFilterOptions } from './derive-filter-options.ts'
import { DEFAULT_KANBAN_FILTERS } from './mock-data.ts'
import { pt as defaultDict } from '../locale/kanban/locales.ts'
import { NextStepBar } from '../next-step/NextStepBar.tsx'
import type { KanbanCardModel, KanbanColumnId, KanbanFilters, KanbanSurfaceState } from './types.ts'

export interface GlobalKanbanProps {
  readonly dict?: LocaleDict
  readonly initialCards?: readonly KanbanCardModel[]
  readonly initialState?: KanbanSurfaceState
  readonly onOpenReview?: (card: KanbanCardModel) => void
  readonly onRemoteRetry?: () => void
  /** Where a new task starts. Without it the button is not drawn. */
  readonly onNewTask?: (() => void) | undefined
  /** Quadros, regra 4: cards in review for more than 2 days, counted by the panel from the board (`BoardCardView.inReviewSince`). */
  readonly staleReviewCount?: number | undefined
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
  onRemoteRetry,
  onNewTask,
  staleReviewCount = 0,
}: GlobalKanbanProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [allCards, setAllCards] = useState<readonly KanbanCardModel[]>(initialCards)
  const [filters, setFilters] = useState<KanbanFilters>(DEFAULT_KANBAN_FILTERS)

  useEffect(() => {
    setAllCards(initialCards)
  }, [initialCards])

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
    visibleCards.length === 0 && initialState === 'ready' ? 'empty' : initialState

  return (
    <Screen width="full" className={styles.boardShell} data-persona-kanban="global">
      <ScreenHeader
        icon="kanban"
        eyebrow={t('header.eyebrow')}
        title={t('title.global')}
        subtitle={t('subtitle.global')}
        actions={onNewTask === undefined ? undefined : (
          <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={() => { onNewTask() }}>
            {t('action.newTask')}
          </Button>
        )}
      />
      <NextStepBar
        screen="boards"
        state={{
          isEmpty: boardSurface === 'empty',
          blockedWaitingCount: visibleCards.filter(card => card.blocked || card.waitingEvent).length,
          staleReviewCount,
        }}
        onAction={(step) => {
          if (step.actionId === 'view-blocked') updateFilter('column', 'blocked')
          else if (step.actionId === 'review-stale') updateFilter('column', 'in_review')
        }}
      />
      <Card padding="m" className={styles.filtersCard}>
        <div className={styles.filters} role="search">
          <KanbanFilterSelect
            id="kanban-filter-team"
            label={t('filter.team')}
            value={filters.teamId}
            onChange={(e) => { updateFilter('teamId', e.target.value) }}
          >
            <option value="all">{t('filter.all')}</option>
            {filterOptions.teams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </KanbanFilterSelect>
          <KanbanFilterSelect
            id="kanban-filter-project"
            label={t('filter.project')}
            value={filters.projectId}
            onChange={(e) => { updateFilter('projectId', e.target.value) }}
          >
            <option value="all">{t('filter.all')}</option>
            {filterOptions.projects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </KanbanFilterSelect>
          <KanbanFilterSelect
            id="kanban-filter-persona"
            label={t('filter.persona')}
            value={filters.personaId}
            onChange={(e) => { updateFilter('personaId', e.target.value) }}
          >
            <option value="all">{t('filter.all')}</option>
            {filterOptions.personas.map(persona => (
              <option key={persona.id} value={persona.id}>{persona.name}</option>
            ))}
          </KanbanFilterSelect>
          <KanbanStageFilter
            label={t('filter.stage')}
            allLabel={t('filter.all')}
            value={filters.column}
            options={(Object.keys(labels) as KanbanColumnId[]).map(col => ({ id: col, label: labels[col] }))}
            onChange={(column) => { updateFilter('column', column as KanbanFilters['column']) }}
          />
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
        onRetry={() => { onRemoteRetry?.() }}
        onEmptyPrimary={() => { setFilters(DEFAULT_KANBAN_FILTERS) }}
      />
    </Screen>
  )
}
