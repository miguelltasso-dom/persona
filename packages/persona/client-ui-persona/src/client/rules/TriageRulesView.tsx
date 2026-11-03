import { useState, type ReactNode } from 'react'
import { PersonaButton } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import page from '../profile/LumenPage.module.css'
import styles from './RulesProactivity.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import {
  MOCK_PROACTIVITY_LIMITS,
  MOCK_QUIET_WINDOWS,
  MOCK_TRIAGE_LOG,
  MOCK_TRIAGE_RULES,
  type ProactivityLimits,
  type QuietWindow,
} from './mock-data.ts'
import { pt as defaultDict } from '../locale/rules/locales.ts'

export type RulesSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface TriageRulesViewProps {
  readonly dict?: LocaleDict
  readonly initialState?: RulesSurfaceState
}

function quietWindowLabel(dict: LocaleDict, window: QuietWindow): string {
  return bindLocale(dict, 'quiet.windowLine', {
    label: window.label,
    start: window.start,
    end: window.end,
  })
}

export function TriageRulesView({ dict = defaultDict, initialState = 'ready' }: TriageRulesViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [rules, setRules] = useState(MOCK_TRIAGE_RULES)
  const [limits, setLimits] = useState<ProactivityLimits>(MOCK_PROACTIVITY_LIMITS)
  const [quietWindows] = useState(MOCK_QUIET_WINDOWS)

  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={1} />
  if (initialState === 'empty' || rules.length === 0) {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="empty.illustration"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
        onPrimary={() => { setRules(MOCK_TRIAGE_RULES) }}
      />
    )
  }

  return (
    <div className={page.shell} data-persona-surface="rules">
      <header>
        <h1 className={page.title}>{t('title')}</h1>
        <p className={page.subtitle}>{t('subtitle')}</p>
      </header>

      <section aria-labelledby="persona-rules-limits" className={styles.section}>
        <h2 id="persona-rules-limits" className={page.title}>{t('limits.title')}</h2>
        <p className={page.subtitle}>{t('limits.subtitle')}</p>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('limits.maxProposals')}</span>
            <input
              type="number"
              className={styles.input}
              value={limits.maxProposalsPerDay}
              onChange={(e) => {
                setLimits({ ...limits, maxProposalsPerDay: Number(e.target.value) || 0 })
              }}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('limits.tokensPersona')}</span>
            <input
              type="number"
              className={styles.input}
              value={limits.tokensPerPersonaMonth}
              onChange={(e) => {
                setLimits({ ...limits, tokensPerPersonaMonth: Number(e.target.value) || 0 })
              }}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('limits.tokensProject')}</span>
            <input
              type="number"
              className={styles.input}
              value={limits.tokensPerProjectMonth}
              onChange={(e) => {
                setLimits({ ...limits, tokensPerProjectMonth: Number(e.target.value) || 0 })
              }}
            />
          </label>
        </div>
      </section>

      <section aria-labelledby="persona-rules-quiet" className={styles.section}>
        <h2 id="persona-rules-quiet" className={page.title}>{t('quiet.title')}</h2>
        <p className={page.subtitle}>{t('quiet.subtitle')}</p>
        <ul className={page.list}>
          {quietWindows.map(window => (
            <li key={window.id} className={page.card}>{quietWindowLabel(dict, window)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="persona-rules-triage" className={styles.section}>
        <h2 id="persona-rules-triage" className={page.title}>{t('triage.title')}</h2>
        <ul className={page.list}>
          {rules.map(rule => (
            <li key={rule.id} className={page.card}>
              <label className={page.meta}>{t('field.gate')}</label>
              <p>{rule.gateText}</p>
              <label className={page.meta}>{t('field.assessment')}</label>
              <p>{rule.assessmentText}</p>
              <p className={page.meta}>{rule.logOnly ? t('mode.logOnly') : t('mode.executeOptIn')}</p>
            </li>
          ))}
        </ul>
        <PersonaButton>{t('action.save')}</PersonaButton>
      </section>

      <section aria-labelledby="persona-rules-log" className={styles.section}>
        <h2 id="persona-rules-log" className={page.title}>{t('log.title')}</h2>
        <p className={page.subtitle}>{t('log.subtitle')}</p>
        {MOCK_TRIAGE_LOG.length === 0
          ? <p className={page.meta}>{t('log.empty')}</p>
          : (
            <ul className={page.list}>
              {MOCK_TRIAGE_LOG.map(entry => (
                <li key={entry.id} className={page.card}>
                  <span className={page.chip}>
                    {entry.mode === 'logOnly' ? t('mode.logOnly') : t('mode.executeOptIn')}
                  </span>
                  <p className={page.meta}>{entry.at}</p>
                  <p>{entry.summary}</p>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}
