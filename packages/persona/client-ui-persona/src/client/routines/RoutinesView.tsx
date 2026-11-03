/** C7b — Rotinas: calendário semanal, resultados, silêncio, pausar equipe. */

import { useState, type ReactNode } from 'react'
import { PersonaButton } from '../primitives/PersonaButton.tsx'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Routines.module.css'
import { WEEK_DAYS, type QuietWindow, type RoutineRun } from './mock-data.ts'
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

function resultClass(result: RoutineRun['result']): string {
  switch (result) {
    case 'ok': return styles.runOk ?? ''
    case 'partial': return styles.runPartial ?? ''
    case 'failed': return styles.runFailed ?? ''
    case 'skipped': return styles.runSkipped ?? ''
    default: return styles.runSkipped ?? ''
  }
}

export interface RoutinesViewProps {
  readonly dict?: LocaleDict
  readonly routineRuns?: readonly RoutineRun[]
  readonly quietWindows?: readonly QuietWindow[]
  readonly initialState?: RoutinesSurfaceState
}

/** Weekly routine calendar preview. */
export function RoutinesView({
  dict = defaultDict,
  routineRuns = [],
  quietWindows = [],
  initialState = 'ready',
}: RoutinesViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 6 })
  const [surfaceState, setSurfaceState] = useState(initialState)
  const [teamPaused, setTeamPaused] = useState(false)

  if (surfaceState === 'loading') {
    return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={7} />
  }
  if (surfaceState === 'error') {
    return (
      <PersonaSurfaceError
        dict={dict}
        titleKey="error.title"
        retryKey="error.retry"
        onRetry={() => { setSurfaceState('ready') }}
      />
    )
  }
  if (surfaceState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="empty.illustration"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
      />
    )
  }

  return (
    <div className={styles.shell} ref={motion.ref} style={motion.style}>
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
        <p className={styles.hint}>{t('week.label', { start: '03/11', end: '09/11' })}</p>
      </header>
      <div className={styles.toolbar}>
        <PersonaButton aria-pressed={teamPaused} onClick={() => { setTeamPaused(p => !p) }}>
          {teamPaused ? t('resumeTeam') : t('pauseTeam')}
        </PersonaButton>
        <p className={styles.hint}>{t('pauseTeam.hint')}</p>
      </div>
      <div className={styles.weekGrid} role="grid" aria-label={t('title')}>
        {WEEK_DAYS.map(day => (
          <div key={day} className={styles.dayCol} role="gridcell">
            <div className={styles.dayLabel}>{DAY_LABELS[day]}</div>
            {routineRuns.filter(run => run.day === day).map(run => (
              <div key={run.id} className={`${styles.runCard} ${resultClass(run.result)}`}>
                <strong>{run.time}</strong> {run.routineName}
                <div>{t(`run.result.${run.result}`)}</div>
                <div>{run.summary}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <section aria-labelledby="quiet-heading">
        <h2 id="quiet-heading" className={styles.title}>{t('quietHours')}</h2>
        <p className={styles.hint}>{t('quietHours.hint')}</p>
        <ul className={styles.quietList}>
          {quietWindows.map(window => (
            <li key={window.id} className={styles.quietItem}>
              <span>{window.label}</span>
              <span>{window.range}</span>
            </li>
          ))}
        </ul>
        <PersonaButton variant="secondary">{t('quiet.add')}</PersonaButton>
      </section>
    </div>
  )
}
