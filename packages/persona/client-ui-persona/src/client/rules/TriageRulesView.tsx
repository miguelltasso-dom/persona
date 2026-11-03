import { useState, type ReactNode } from 'react'
import { PersonaButton } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import page from '../profile/LumenPage.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { MOCK_TRIAGE_LOG, MOCK_TRIAGE_RULES } from './mock-data.ts'
import { pt as defaultDict } from '../locale/rules/locales.ts'

export type RulesSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface TriageRulesViewProps {
  readonly dict?: LocaleDict
  readonly initialState?: RulesSurfaceState
}

export function TriageRulesView({ dict = defaultDict, initialState = 'ready' }: TriageRulesViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [rules, setRules] = useState(MOCK_TRIAGE_RULES)

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
      <section>
        <h2 className={page.title}>{t('log.title')}</h2>
        {MOCK_TRIAGE_LOG.length === 0
          ? <p className={page.meta}>{t('log.empty')}</p>
          : (
            <ul className={page.list}>
              {MOCK_TRIAGE_LOG.map(entry => (
                <li key={entry.id} className={page.card}>{entry.at} — {entry.summary}</li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}
