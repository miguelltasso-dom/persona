/** Active sprint strip — wraps Muse {@link SprintStrip}. */

import type { SprintView } from '@deepseek-ai/dsh-persona-host/types'
import type { ReactNode } from 'react'
import { Button, SprintStrip } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Kanban.module.css'

export interface SprintBandProps {
  readonly dict: LocaleDict
  readonly sprint?: SprintView
  readonly sprintsEnabled?: boolean
  readonly doneCount?: number
  readonly totalCount?: number
  readonly onPlan?: () => void
  readonly onCloseSprint?: () => void
}

export function SprintBand({
  dict,
  sprint,
  sprintsEnabled = true,
  doneCount = 0,
  totalCount = 0,
  onPlan,
  onCloseSprint,
}: SprintBandProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)

  if (!sprintsEnabled) return null

  if (sprint === undefined || sprint.status !== 'ativo') {
    return (
      <div className={styles.sprintBand} data-persona-sprint="idle">
        <div className={styles.sprintIdle}>
          <span>{t('sprint.idle')}</span>
          <Button variant="secondary" size="s" onClick={() => onPlan?.()}>{t('sprint.plan')}</Button>
        </div>
      </div>
    )
  }

  const daysLeft = sprint.daysLeft
  const remainingTone = daysLeft !== undefined && daysLeft <= 0
    ? 'danger'
    : daysLeft !== undefined && daysLeft <= 1
      ? 'warning'
      : 'neutral'

  return (
    <div className={styles.sprintBand} data-persona-sprint="active">
      <SprintStrip
        name={sprint.name}
        goal={sprint.objective}
        dateLabel={sprint.startsAt !== undefined && sprint.endsAt !== undefined
          ? t('sprint.dates', { start: sprint.startsAt, end: sprint.endsAt })
          : ''}
        remainingLabel={daysLeft === undefined
          ? ''
          : daysLeft <= 0
            ? t('sprint.overdue')
            : daysLeft === 1
              ? t('sprint.daysLeft.one')
              : t('sprint.daysLeft', { count: daysLeft })}
        remainingTone={remainingTone}
        done={doneCount}
        total={totalCount}
        progressLabel={t('sprint.progress', { done: doneCount, total: totalCount })}
        actions={(
          <>
            <Button variant="secondary" size="s" onClick={() => onPlan?.()}>{t('sprint.plan')}</Button>
            <Button variant="ghost" size="s" onClick={() => onCloseSprint?.()}>{t('sprint.close')}</Button>
          </>
        )}
      />
    </div>
  )
}
