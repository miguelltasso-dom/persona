/** Proactivity metrics on persona profile (PROACTIVITY.md §7–8). */

import type { ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import page from './LumenPage.module.css'
import styles from './ProactivityMetrics.module.css'
import type { PersonaProactivityMetrics } from './mock-data.ts'

export interface ProactivityMetricsPanelProps {
  readonly dict: LocaleDict
  readonly metrics: PersonaProactivityMetrics
}

export function ProactivityMetricsPanel({ dict, metrics }: ProactivityMetricsPanelProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const bench = metrics.lazinessBench

  return (
    <section aria-labelledby="persona-proactivity-metrics" data-persona-surface="proactivity-metrics">
      <h2 id="persona-proactivity-metrics" className={page.title}>{t('proactivity.title')}</h2>
      <p className={page.subtitle}>{t('proactivity.subtitle')}</p>
      <dl className={styles.grid}>
        <div className={styles.metric}>
          <dt>{t('proactivity.proposalsToday')}</dt>
          <dd>{metrics.proposalsToday}</dd>
        </div>
        <div className={styles.metric}>
          <dt>{t('proactivity.accepted7d')}</dt>
          <dd>{metrics.proposalsAccepted7d}</dd>
        </div>
        <div className={styles.metric}>
          <dt>{t('proactivity.acceptanceRate')}</dt>
          <dd>{t('proactivity.acceptanceRateValue', { pct: metrics.acceptanceRatePct })}</dd>
        </div>
        <div className={styles.metric}>
          <dt>{t('proactivity.idleToday')}</dt>
          <dd>{t('proactivity.idleMinutesValue', { minutes: metrics.idleMinutesToday })}</dd>
        </div>
      </dl>
      <div className={styles.benchCard}>
        <h3 className={styles.benchTitle}>{t('proactivity.lazinessTitle')}</h3>
        <p className={page.meta}>
          {t('proactivity.lazinessRunner', { runner: bench.runner, model: bench.model })}
        </p>
        <p className={styles.benchGrade}>{t(`proactivity.lazinessGrade.${bench.grade}`)}</p>
        <p className={page.meta}>{t('proactivity.lazinessUpdated', { at: bench.lastRunAt.slice(0, 10) })}</p>
      </div>
    </section>
  )
}
