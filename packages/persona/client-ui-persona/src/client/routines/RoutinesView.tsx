/** C7b — Rotinas: calendário semanal, resultados, silêncio, pausar equipe. */

import { useEffect, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Chip, Screen, ScreenHeader } from '../primitives/index.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Routines.module.css'
import { WEEK_DAYS, type QuietWindow, type RoutineRun } from './mock-data.ts'
import { ProjectWorkspaceScopeChip } from '../data/ProjectWorkspaceScopeChip.tsx'
import { pt as defaultDict } from '../locale/routines/locales.ts'

export type RoutinesSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

const DAY_LABELS: Record<(typeof WEEK_DAYS)[number], string> = {
  mon: 'Seg',
  tue: 'Ter',
  wed: 'Qua',
  thu: 'Qui',
  fri: 'Sex',
  sat: 'Sáb',
  sun: 'Dom',
}

function resultChipTone(result: RoutineRun['result']): 'success' | 'accent' | 'danger' | 'neutral' {
  if (result === 'ok') return 'success'
  if (result === 'partial') return 'accent'
  if (result === 'failed') return 'danger'
  return 'neutral'
}

export interface RoutinesViewProps {
  readonly dict?: LocaleDict
  readonly routineRuns?: readonly RoutineRun[]
  readonly quietWindows?: readonly QuietWindow[]
  readonly initialState?: RoutinesSurfaceState
  readonly onRemoteRetry?: () => void
  readonly scopeProjectId?: string | null
  /** UX-14: empty → "Pedir sugestões à coordenação" (opens the coordinator DM with a ready request). */
  readonly onAskSuggestions?: (() => void) | undefined
}

/** Weekly routine calendar preview. */
export function RoutinesView({
  dict = defaultDict,
  routineRuns = [],
  quietWindows = [],
  initialState = 'ready',
  onRemoteRetry,
  scopeProjectId = null,
  onAskSuggestions,
}: RoutinesViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [surfaceState, setSurfaceState] = useState(initialState)
  const [teamPaused, setTeamPaused] = useState(false)

  useEffect(() => {
    setSurfaceState(initialState)
  }, [initialState])

  const header = (
    <ScreenHeader
      icon="rotinas"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )
  const scopeChip = <ProjectWorkspaceScopeChip dict={dict} projectId={scopeProjectId} />

  if (surfaceState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="routines">
        {header}
        {scopeChip}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={7} />
      </Screen>
    )
  }
  if (surfaceState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="routines">
        {header}
        {scopeChip}
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={() => { onRemoteRetry?.() }}
        />
      </Screen>
    )
  }
  if (surfaceState === 'empty') {
    return (
      <Screen className={styles.shell} data-persona-surface="routines">
        {header}
        {scopeChip}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-routines"
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
          {...(onAskSuggestions === undefined ? {} : { onPrimary: onAskSuggestions })}
        />
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="routines">
      {header}
      {scopeChip}
      <p className={styles.hint}>{t('week.label', { start: '03/11', end: '09/11' })}</p>
      <div className={styles.toolbar}>
        <Button
          variant="secondary"
          aria-pressed={teamPaused}
          onClick={() => { setTeamPaused(p => !p) }}
        >
          {teamPaused ? t('resumeTeam') : t('pauseTeam')}
        </Button>
        <p className={styles.hint}>{t('pauseTeam.hint')}</p>
      </div>
      <div className={styles.weekGrid} role="grid" aria-label={t('title')}>
        {WEEK_DAYS.map(day => (
          <div key={day} className={styles.dayCol} role="gridcell">
            <div className={styles.dayLabel}>{DAY_LABELS[day]}</div>
            {routineRuns.filter(run => run.day === day).map(run => (
              <Card
                key={run.id}
                padding="s"
                className={`${styles.runCard}${teamPaused ? ` ${styles.runPaused}` : ''}`}
              >
                <h3 className={styles.runTitle}>{run.routineName}</h3>
                <p className={styles.runTime}>{run.time}</p>
                <Chip tone={resultChipTone(run.result)} size="s">{t(`run.result.${run.result}`)}</Chip>
                <p className={styles.runSummary}>{run.summary}</p>
              </Card>
            ))}
          </div>
        ))}
      </div>
      <Card padding="m" as="section" aria-labelledby="quiet-heading">
        <h2 id="quiet-heading" className={styles.sectionTitle}>{t('quietHours')}</h2>
        <p className={styles.hint}>{t('quietHours.hint')}</p>
        <ul className={styles.quietList}>
          {quietWindows.map(window => (
            <li key={window.id}>
              <Chip tone="neutral" size="s">{window.label} · {window.range}</Chip>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="s">{t('quiet.add')}</Button>
      </Card>
    </Screen>
  )
}
