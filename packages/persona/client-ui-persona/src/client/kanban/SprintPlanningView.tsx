/** Sprint planning — backlog ↔ sprint (BOARDS-SPEC §3). */

import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Button, Input, Screen, ScreenHeader, Textarea } from '../primitives/index.ts'
import type { FlowCardModel } from './flow-types.ts'
import styles from './Kanban.module.css'

export interface SprintPlanningDraft {
  readonly name: string
  readonly objective: string
  readonly startsAt: string
  readonly endsAt: string
}

export interface SprintPlanningViewProps {
  readonly dict: LocaleDict
  readonly projectName: string
  readonly backlog: readonly FlowCardModel[]
  readonly sprintCards: readonly FlowCardModel[]
  readonly draft: SprintPlanningDraft
  readonly selectedBacklogId: string | null
  readonly selectedSprintId: string | null
  readonly onDraftChange: (patch: Partial<SprintPlanningDraft>) => void
  readonly onSelectBacklog: (ticketId: string | null) => void
  readonly onSelectSprint: (ticketId: string | null) => void
  readonly onAddToSprint: () => void
  readonly onRemoveFromSprint: () => void
  /** Arrastar (ou soltar) uma tarefa direto na sprint; sem isso o arrastar não existe e fica "selecionar + botão". */
  readonly onMoveToSprint?: ((ticketId: string) => void) | undefined
  readonly onMoveToBacklog?: ((ticketId: string) => void) | undefined
  readonly onCancel: () => void
  readonly onStart: () => void
  readonly startPending?: boolean
}

type DropTarget = 'sprint' | 'backlog'

function portraitOf(characterId: string | undefined): string | undefined {
  return characterId === undefined ? undefined : (AVATAR_96 as Readonly<Record<string, string>>)[characterId]
}

export interface CapacityRow {
  readonly key: string
  readonly name: string | null
  readonly characterId?: string
  readonly count: number
}

/** Carga por persona na sprint (a barra é tarefas / a persona mais carregada). */
export function sprintCapacity(cards: readonly FlowCardModel[]): readonly CapacityRow[] {
  const rows = new Map<string, { key: string; name: string | null; characterId?: string; count: number }>()
  for (const card of cards) {
    const key = card.assignee?.id ?? '__none__'
    const row = rows.get(key) ?? { key, name: card.assignee?.name ?? null, ...(card.assignee?.id === undefined ? {} : { characterId: card.assignee.id }), count: 0 }
    row.count += 1
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => b.count - a.count)
}

export function SprintPlanningView({
  dict,
  projectName,
  backlog,
  sprintCards,
  draft,
  selectedBacklogId,
  selectedSprintId,
  onDraftChange,
  onSelectBacklog,
  onSelectSprint,
  onAddToSprint,
  onRemoveFromSprint,
  onMoveToSprint,
  onMoveToBacklog,
  onCancel,
  onStart,
  startPending = false,
}: SprintPlanningViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [query, setQuery] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [announce, setAnnounce] = useState('')

  const canStart = draft.objective.trim().length > 0
    && draft.name.trim().length > 0
    && sprintCards.length > 0
    && !startPending

  const assignees = useMemo(() => {
    const seen = new Map<string, string>()
    for (const card of backlog) if (card.assignee !== undefined) seen.set(card.assignee.id, card.assignee.name)
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [backlog])

  const visibleBacklog = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return backlog.filter((card) => {
      if (assigneeFilter !== null && card.assignee?.id !== assigneeFilter) return false
      return needle.length === 0 || card.title.toLowerCase().includes(needle)
    })
  }, [backlog, query, assigneeFilter])

  const capacity = useMemo(() => sprintCapacity(sprintCards), [sprintCards])
  const maxLoad = capacity.reduce((max, entry) => Math.max(max, entry.count), 0)
  const dragEnabled = onMoveToSprint !== undefined && onMoveToBacklog !== undefined

  const moveTo = (target: DropTarget, ticketId: string): void => {
    const card = (target === 'sprint' ? backlog : sprintCards).find(item => item.id === ticketId)
    if (card === undefined) return
    if (target === 'sprint') onMoveToSprint?.(ticketId)
    else onMoveToBacklog?.(ticketId)
    setAnnounce(t(target === 'sprint' ? 'planSprint.movedToSprint' : 'planSprint.movedToBacklog', { title: card.title }))
  }

  const dragProps = (ticketId: string) => (dragEnabled
    ? {
      draggable: true,
      onDragStart: (event: DragEvent) => {
        event.dataTransfer.setData('text/plain', ticketId)
        event.dataTransfer.effectAllowed = 'move'
        setDragId(ticketId)
      },
      onDragEnd: () => { setDragId(null); setDropTarget(null) },
    }
    : {})

  const dropProps = (target: DropTarget) => (dragEnabled
    ? {
      onDragOver: (event: DragEvent) => {
        if (dragId === null) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        if (dropTarget !== target) setDropTarget(target)
      },
      onDragLeave: () => { setDropTarget(current => (current === target ? null : current)) },
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        const id = event.dataTransfer.getData('text/plain') || dragId
        setDragId(null)
        setDropTarget(null)
        if (id !== null && id !== '') moveTo(target, id)
      },
    }
    : {})

  const planRow = (card: FlowCardModel, selected: boolean, onToggle: () => void): ReactNode => (
    <li
      key={card.id}
      className={styles.planningRow}
      data-selected={selected ? '' : undefined}
      data-dragging={dragId === card.id ? '' : undefined}
      {...dragProps(card.id)}
    >
      <label className={styles.planningRowLabel}>
        <input type="checkbox" className={styles.planningCheck} checked={selected} onChange={onToggle} />
        <span className={styles.planningCardTitle}>{card.title}</span>
        {card.assignee !== undefined && (
          <span className={styles.planningAssignee}>
            <Avatar name={card.assignee.name} src={portraitOf(card.assignee.id)} size={24} shape="portrait" decorative />
            {card.assignee.name}
          </span>
        )}
      </label>
    </li>
  )

  return (
    <Screen width="full" className={styles.boardShell} data-persona-kanban="sprint-planning">
      <ScreenHeader
        icon="kanban"
        eyebrow={t('header.eyebrowProject')}
        title={t('planSprint.title')}
        subtitle={projectName}
      />
      <div className={styles.planningGrid} role="region" aria-label={t('a11y.planningRegion')}>
        <section
          className={styles.planningColumn}
          aria-labelledby="plan-backlog-heading"
          data-drop-target={dropTarget === 'backlog' ? '' : undefined}
          {...dropProps('backlog')}
        >
          <h2 id="plan-backlog-heading" className={styles.planningHeading}>{t('planSprint.backlog')}</h2>
          <Input
            label={t('planSprint.search')}
            hideLabel
            type="search"
            placeholder={t('planSprint.search')}
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
          />
          {assignees.length > 0 && (
            <div className={styles.planningFilters} role="group" aria-label={t('planSprint.filterAssignee')}>
              <button type="button" className={styles.planFilterChip} aria-pressed={assigneeFilter === null} onClick={() => { setAssigneeFilter(null) }}>
                {t('planSprint.filterAll')}
              </button>
              {assignees.map(person => (
                <button
                  key={person.id}
                  type="button"
                  className={styles.planFilterChip}
                  aria-pressed={assigneeFilter === person.id}
                  onClick={() => { setAssigneeFilter(current => (current === person.id ? null : person.id)) }}
                >
                  {person.name}
                </button>
              ))}
            </div>
          )}
          <ul className={styles.planningList} aria-label={t('planSprint.backlog')}>
            {visibleBacklog.map(card => planRow(card, selectedBacklogId === card.id, () => { onSelectBacklog(selectedBacklogId === card.id ? null : card.id) }))}
            {visibleBacklog.length === 0 && (
              <li className={styles.planningEmpty}>{backlog.length === 0 ? t('empty.column.todo') : t('planSprint.noMatch')}</li>
            )}
          </ul>
          <Button
            variant="secondary"
            size="s"
            disabled={selectedBacklogId === null}
            onClick={onAddToSprint}
          >
            {t('planSprint.addToSprint')}
          </Button>
          {dragEnabled && <p className={styles.stateHint}>{t('planSprint.dragHint')}</p>}
        </section>
        <section
          className={styles.planningColumn}
          aria-labelledby="plan-sprint-heading"
          data-drop-target={dropTarget === 'sprint' ? '' : undefined}
          {...dropProps('sprint')}
        >
          <h2 id="plan-sprint-heading" className={styles.planningHeading}>{t('planSprint.sprintColumn')}</h2>
          <Input
            label={t('planSprint.name')}
            value={draft.name}
            onChange={(event) => { onDraftChange({ name: event.target.value }) }}
          />
          <Textarea
            label={t('planSprint.objective')}
            hint={t('planSprint.objectiveHint')}
            value={draft.objective}
            rows={3}
            onChange={(event) => { onDraftChange({ objective: event.target.value }) }}
          />
          <div className={styles.planningDates}>
            <Input
              label={t('planSprint.startsAt')}
              type="date"
              value={draft.startsAt}
              onChange={(event) => { onDraftChange({ startsAt: event.target.value }) }}
            />
            <Input
              label={t('planSprint.endsAt')}
              type="date"
              value={draft.endsAt}
              onChange={(event) => { onDraftChange({ endsAt: event.target.value }) }}
            />
          </div>
          <p className={styles.stateHint}>{t('planSprint.capacity', { count: sprintCards.length })}</p>
          {capacity.length > 0 && (
            <ul className={styles.capacityList} aria-label={t('planSprint.capacityTitle')}>
              {capacity.map(person => (
                <li key={person.key} className={styles.capacityRow}>
                  {person.name === null
                    ? <span className={styles.capacityName}>{t('planSprint.unassigned')}</span>
                    : (
                      <>
                        <Avatar name={person.name} src={portraitOf(person.characterId)} size={24} shape="portrait" decorative />
                        <span className={styles.capacityName}>{person.name}</span>
                      </>
                    )}
                  <span className={styles.capacityBar} aria-hidden="true">
                    <span style={{ width: `${String(Math.round((person.count / Math.max(1, maxLoad)) * 100))}%` }} />
                  </span>
                  <span className={styles.capacityCount}>{t(person.count === 1 ? 'planSprint.capacityCount.one' : 'planSprint.capacityCount', { count: person.count })}</span>
                </li>
              ))}
            </ul>
          )}
          <ul className={styles.planningList} aria-label={t('planSprint.sprintColumn')}>
            {sprintCards.map(card => planRow(card, selectedSprintId === card.id, () => { onSelectSprint(selectedSprintId === card.id ? null : card.id) }))}
            {sprintCards.length === 0 && (
              <li className={styles.planningEmpty}>{t('planSprint.emptySprint')}</li>
            )}
          </ul>
          <Button
            variant="ghost"
            size="s"
            disabled={selectedSprintId === null}
            onClick={onRemoveFromSprint}
          >
            {t('planSprint.removeFromSprint')}
          </Button>
        </section>
      </div>
      <p className={styles.srOnly} role="status">{announce}</p>
      <footer className={styles.planningFooter}>
        <Button variant="ghost" onClick={onCancel}>{t('planSprint.cancel')}</Button>
        <Button variant="primary" disabled={!canStart} onClick={onStart}>{t('planSprint.start')}</Button>
      </footer>
    </Screen>
  )
}
