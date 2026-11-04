import type { ReactNode } from 'react'
import type { ActivationFunnelView } from '@deepseek-ai/dsh-persona-host/types'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Card, Chip, UiIcon } from '../primitives/index.ts'
import {
  activationFunnelToUi,
  activationStageLabel,
  type PersonaImpactUi,
} from '../data/adapters/insights.ts'
import styles from './Usage.module.css'

export interface LocalInsightsProps {
  readonly dict: LocaleDict
  readonly funnel: ActivationFunnelView
  readonly impacts: readonly PersonaImpactUi[]
}

/** Local-only activation funnel + persona impact (insights.md). */
export function LocalInsights({ dict, funnel, impacts }: LocalInsightsProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const steps = activationFunnelToUi(dict, funnel)
  return (
    <>
      <Card padding="m" as="section" aria-labelledby="usage-insights-funnel">
        <p id="usage-insights-funnel" className={styles.sectionEyebrow}>{t('section.insights')}</p>
        <p className={styles.insightsLead}>{t('insights.lead')}</p>
        <div className={styles.insightsStage} role="status">
          <Chip tone="brand" size="s">{activationStageLabel(dict, funnel.stage)}</Chip>
        </div>
        <ol className={styles.funnelList} aria-label={t('a11y.insightsFunnel')}>
          {steps.map(step => (
            <li key={step.id} className={styles.funnelStep} data-done={step.done ? '' : undefined}>
              <span className={styles.funnelIcon} aria-hidden="true">
                {step.done ? <UiIcon name="check" size={16} /> : <UiIcon name="more" size={16} />}
              </span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      </Card>
      {impacts.length > 0 && (
        <Card padding="m" as="section" aria-labelledby="usage-insights-impact">
          <p id="usage-insights-impact" className={styles.sectionEyebrow}>{t('section.personas')}</p>
          <ul className={styles.impactList}>
            {impacts.map(row => (
              <li key={row.personaId} className={styles.impactRow}>
                <span className={styles.impactName}>{row.displayName}</span>
                <span className={styles.impactMeta}>
                  {t('insights.impact.tasks', { count: row.tasksCompleted })}
                  {' · '}
                  {row.hoursSavedLabel}
                  {' · '}
                  {t('insights.impact.ready', { duration: row.timeToReadyLabel })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
