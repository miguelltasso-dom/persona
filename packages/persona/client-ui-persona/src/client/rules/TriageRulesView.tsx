import { useEffect, useState, type ReactNode } from 'react'
import { Button, Card, Chip, Input, Screen, ScreenHeader } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './RulesProactivity.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { ProactivityLimits, QuietWindow, TriageRule, TriageSimulationLog } from './mock-data.ts'
import { pt as defaultDict } from '../locale/rules/locales.ts'

export type RulesSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface TriageRulesViewProps {
  readonly dict?: LocaleDict
  readonly rules?: readonly TriageRule[]
  readonly quietWindows?: readonly QuietWindow[]
  readonly limits?: ProactivityLimits
  readonly triageLog?: readonly TriageSimulationLog[]
  readonly initialState?: RulesSurfaceState
  readonly onSaveLimits?: (limits: ProactivityLimits) => void
}

function quietWindowLabel(dict: LocaleDict, window: QuietWindow): string {
  return bindLocale(dict, 'quiet.windowLine', {
    label: window.label,
    start: window.start,
    end: window.end,
  })
}

export function TriageRulesView({
  dict = defaultDict,
  rules = [],
  quietWindows = [],
  limits: limitsProp,
  triageLog = [],
  initialState = 'ready',
  onSaveLimits,
}: TriageRulesViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [limits, setLimits] = useState<ProactivityLimits>(limitsProp ?? {
    maxProposalsPerDay: 3,
    tokensPerPersonaMonth: 500_000,
    tokensPerProjectMonth: 1_000_000,
  })

  useEffect(() => {
    if (limitsProp !== undefined) setLimits(limitsProp)
  }, [limitsProp])

  const header = (
    <ScreenHeader
      icon="quadro"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="rules">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={1} />
      </Screen>
    )
  }
  if (initialState === 'empty') {
    return (
      <Screen className={styles.shell} data-persona-surface="rules">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-inbox"
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
        />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="rules">
        {header}
        <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => {}} />
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="rules">
      {header}
      <Card padding="m" as="section" aria-labelledby="persona-rules-limits" eyebrow={t('limits.title')} title={t('limits.subtitle')}>
        <div className={styles.fieldGrid}>
          <Input
            type="number"
            label={t('limits.maxProposals')}
            value={String(limits.maxProposalsPerDay)}
            onChange={(e) => {
              setLimits({ ...limits, maxProposalsPerDay: Number(e.target.value) || 0 })
            }}
          />
          <Input
            type="number"
            label={t('limits.tokensPersona')}
            value={String(limits.tokensPerPersonaMonth)}
            onChange={(e) => {
              setLimits({ ...limits, tokensPerPersonaMonth: Number(e.target.value) || 0 })
            }}
          />
          <Input
            type="number"
            label={t('limits.tokensProject')}
            value={String(limits.tokensPerProjectMonth)}
            onChange={(e) => {
              setLimits({ ...limits, tokensPerProjectMonth: Number(e.target.value) || 0 })
            }}
          />
        </div>
        <Button onClick={() => { onSaveLimits?.(limits) }} disabled={onSaveLimits === undefined}>
          {t('action.save')}
        </Button>
      </Card>

      <Card padding="m" as="section" aria-labelledby="persona-rules-quiet" title={t('quiet.title')} eyebrow={t('quiet.subtitle')}>
        <ul className={styles.quietList}>
          {quietWindows.map(window => (
            <li key={window.id}>
              <Chip tone="neutral" size="s">{quietWindowLabel(dict, window)}</Chip>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="m" as="section" aria-labelledby="persona-rules-triage" title={t('triage.title')}>
        <ul className={styles.ruleList}>
          {rules.map(rule => (
            <li key={rule.id} className={styles.ruleRow}>
              <p className={styles.ruleText}>{rule.gateText}</p>
              <p className={styles.ruleMeta}>{rule.assessmentText}</p>
              <Chip tone={rule.logOnly ? 'neutral' : 'accent'} size="s">
                {rule.logOnly ? t('mode.logOnly') : t('mode.executeOptIn')}
              </Chip>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="m" as="section" aria-labelledby="persona-rules-log" title={t('log.title')} eyebrow={t('log.subtitle')}>
        {triageLog.length === 0
          ? <p className={styles.ruleMeta}>{t('log.empty')}</p>
          : (
            <ul className={styles.ruleList}>
              {triageLog.map(entry => (
                <li key={entry.id} className={styles.ruleRow}>
                  <Chip tone="neutral" size="s">
                    {entry.mode === 'logOnly' ? t('mode.logOnly') : t('mode.executeOptIn')}
                  </Chip>
                  <p className={styles.ruleMeta}>{entry.at}</p>
                  <p className={styles.ruleText}>{entry.summary}</p>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </Screen>
  )
}
