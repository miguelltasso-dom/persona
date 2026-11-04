/** Sprint planning — backlog ↔ sprint (BOARDS-SPEC §3). */

import type { ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Input, Screen, ScreenHeader, Textarea } from '../primitives/index.ts'
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
  readonly onCancel: () => void
  readonly onStart: () => void
  readonly startPending?: boolean
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
  onCancel,
  onStart,
  startPending = false,
}: SprintPlanningViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const canStart = draft.objective.trim().length > 0
    && draft.name.trim().length > 0
    && sprintCards.length > 0
    && !startPending

  const capacityLabel = t('planSprint.capacity', { count: sprintCards.length })

  return (
    <Screen width="full" className={styles.boardShell} data-persona-kanban="sprint-planning">
      <ScreenHeader
        icon="kanban"
        eyebrow={t('header.eyebrowProject')}
        title={t('planSprint.title')}
        subtitle={projectName}
      />
      <div className={styles.planningGrid} role="region" aria-label={t('a11y.planningRegion')}>
        <section className={styles.planningColumn} aria-labelledby="plan-backlog-heading">
          <h2 id="plan-backlog-heading" className={styles.planningHeading}>{t('planSprint.backlog')}</h2>
          <ul className={styles.planningList}>
            {backlog.map(card => (
              <li key={card.id}>
                <Card
                  padding="s"
                  interactive
                  className={styles.planningCard}
                  data-selected={selectedBacklogId === card.id ? '' : undefined}
                  onClick={() => { onSelectBacklog(selectedBacklogId === card.id ? null : card.id) }}
                >
                  <span className={styles.planningCardTitle}>{card.title}</span>
                </Card>
              </li>
            ))}
            {backlog.length === 0 && (
              <li className={styles.planningEmpty}>{t('empty.column.todo')}</li>
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
        </section>
        <section className={styles.planningColumn} aria-labelledby="plan-sprint-heading">
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
          <p className={styles.stateHint}>{capacityLabel}</p>
          <ul className={styles.planningList}>
            {sprintCards.map(card => (
              <li key={card.id}>
                <Card
                  padding="s"
                  interactive
                  className={styles.planningCard}
                  data-selected={selectedSprintId === card.id ? '' : undefined}
                  onClick={() => { onSelectSprint(selectedSprintId === card.id ? null : card.id) }}
                >
                  <span className={styles.planningCardTitle}>{card.title}</span>
                </Card>
              </li>
            ))}
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
      <footer className={styles.planningFooter}>
        <Button variant="ghost" onClick={onCancel}>{t('planSprint.cancel')}</Button>
        <Button variant="primary" disabled={!canStart} onClick={onStart}>{t('planSprint.start')}</Button>
      </footer>
    </Screen>
  )
}
