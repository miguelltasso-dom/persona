import { useEffect, useState, type ReactNode } from 'react'
import { Button, Card, ChoiceCards, Chip, Input, Screen, ScreenHeader } from '../primitives/index.ts'
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
  readonly onRemoteRetry?: () => void
  readonly onEmptyPrimary?: (() => void) | undefined
  /**
   * What the host really obeys (HONEST-1). Whatever is not listed stays out of the screen: the saved data is kept, but no window,
   * no "create rule" and no recipe is offered for something the team would not follow.
   */
  readonly obeyed?: { readonly quietWindows?: boolean; readonly newRules?: boolean } | undefined
}

/** UX-05: budgets as plain-language presets; raw numbers only under "Personalizar". */
type BudgetPreset = 'economico' | 'normal' | 'generoso' | 'custom'

export const BUDGET_PRESETS: Readonly<Record<Exclude<BudgetPreset, 'custom'>, ProactivityLimits>> = {
  economico: { maxProposalsPerDay: 1, tokensPerPersonaMonth: 150_000, tokensPerProjectMonth: 400_000 },
  normal: { maxProposalsPerDay: 3, tokensPerPersonaMonth: 500_000, tokensPerProjectMonth: 1_000_000 },
  generoso: { maxProposalsPerDay: 6, tokensPerPersonaMonth: 1_500_000, tokensPerProjectMonth: 3_000_000 },
}

/** Rough size of a "tarefa média" for the plain-language estimate (Rivet calibrates from UsageStore). */
export const TOKENS_PER_MEDIUM_TASK = 10_000

export function presetOf(limits: ProactivityLimits): BudgetPreset {
  for (const [id, preset] of Object.entries(BUDGET_PRESETS) as [Exclude<BudgetPreset, 'custom'>, ProactivityLimits][]) {
    if (preset.maxProposalsPerDay === limits.maxProposalsPerDay
      && preset.tokensPerPersonaMonth === limits.tokensPerPersonaMonth
      && preset.tokensPerProjectMonth === limits.tokensPerProjectMonth) return id
  }
  return 'custom'
}

export function tasksPerMonth(tokens: number): number {
  return Math.max(1, Math.round(tokens / TOKENS_PER_MEDIUM_TASK / 5) * 5)
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
  onRemoteRetry,
  onEmptyPrimary,
  obeyed,
}: TriageRulesViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const canCreateRules = obeyed?.newRules === true
  const [limits, setLimits] = useState<ProactivityLimits>(limitsProp ?? {
    maxProposalsPerDay: 3,
    tokensPerPersonaMonth: 500_000,
    tokensPerProjectMonth: 1_000_000,
  })

  useEffect(() => {
    if (limitsProp !== undefined) setLimits(limitsProp)
  }, [limitsProp])
  const [customOpen, setCustomOpen] = useState(false)
  const preset = customOpen ? 'custom' : presetOf(limits)
  const saved = limitsProp ?? null
  const dirty = saved === null
    || saved.maxProposalsPerDay !== limits.maxProposalsPerDay
    || saved.tokensPerPersonaMonth !== limits.tokensPerPersonaMonth
    || saved.tokensPerProjectMonth !== limits.tokensPerProjectMonth

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
          illustrationKey="empty-regras-da-casa"
          nightPair={{ day: 'empty-regras-da-casa', night: 'empty-regras-da-casa-noite' }}
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
          {...(onEmptyPrimary === undefined || !canCreateRules ? {} : { onPrimary: onEmptyPrimary })}
        />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="rules">
        {header}
        <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => { onRemoteRetry?.() }} />
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="rules">
      {header}
      <Card padding="m" as="section" aria-labelledby="persona-rules-limits" eyebrow={t('limits.title')} title={t('limits.subtitle')}>
        <ChoiceCards<BudgetPreset>
          legend={t('preset.legend')}
          hideLegend
          name="persona-rules-budget"
          value={preset}
          onChange={(id) => {
            if (id === 'custom') {
              setCustomOpen(true)
              return
            }
            setCustomOpen(false)
            setLimits(BUDGET_PRESETS[id])
          }}
          options={[
            ...(['economico', 'normal', 'generoso'] as const).map(id => ({
              id,
              title: t(`preset.${id}`),
              // Real plural: "1 proposta" / "3 propostas" (never "proposta(s)").
              body: t(BUDGET_PRESETS[id].maxProposalsPerDay === 1 ? 'preset.estimate.one' : 'preset.estimate', {
                proposals: BUDGET_PRESETS[id].maxProposalsPerDay,
                tasks: tasksPerMonth(BUDGET_PRESETS[id].tokensPerPersonaMonth),
              }),
              ...(id === 'normal' ? { badge: t('preset.recommended') } : {}),
            })),
            { id: 'custom' as const, title: t('preset.custom'), body: t('preset.customBody') },
          ]}
        />
        {preset === 'custom' && (
          <div className={styles.fieldGrid}>
            <Input
              type="number"
              min={0}
              label={t('limits.maxProposals')}
              hint={t('limits.maxProposalsHint')}
              value={String(limits.maxProposalsPerDay)}
              onChange={(e) => {
                setLimits({ ...limits, maxProposalsPerDay: Number(e.target.value) || 0 })
              }}
            />
            <Input
              type="number"
              min={0}
              step={10_000}
              label={t('limits.tokensPersona')}
              hint={t('preset.tasksHint', { tasks: tasksPerMonth(limits.tokensPerPersonaMonth) })}
              value={String(limits.tokensPerPersonaMonth)}
              onChange={(e) => {
                setLimits({ ...limits, tokensPerPersonaMonth: Number(e.target.value) || 0 })
              }}
            />
            <Input
              type="number"
              min={0}
              step={10_000}
              label={t('limits.tokensProject')}
              hint={t('preset.tasksHint', { tasks: tasksPerMonth(limits.tokensPerProjectMonth) })}
              value={String(limits.tokensPerProjectMonth)}
              onChange={(e) => {
                setLimits({ ...limits, tokensPerProjectMonth: Number(e.target.value) || 0 })
              }}
            />
          </div>
        )}
        <div className={styles.saveRow}>
          <Button variant={dirty ? 'primary' : 'secondary'} onClick={() => { onSaveLimits?.(limits) }} disabled={onSaveLimits === undefined || !dirty}>
            {t('action.save')}
          </Button>
          {!dirty && <span className={styles.savedNote}>{t('preset.saved')}</span>}
        </div>
      </Card>

      {obeyed?.quietWindows === true && (
        <Card padding="m" as="section" aria-labelledby="persona-rules-quiet" title={t('quiet.title')} eyebrow={t('quiet.subtitle')}>
          <ul className={styles.quietList}>
            {quietWindows.map(window => (
              <li key={window.id}>
                <Chip tone="neutral" size="s">{quietWindowLabel(dict, window)}</Chip>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="m" as="section" aria-labelledby="persona-rules-triage" title={t('triage.title')}>
        <ul className={styles.ruleList}>
          {rules.map(rule => (
            <li key={rule.id} className={styles.ruleRow}>
              <p className={styles.ruleText}>{rule.gateText}</p>
              <p className={styles.ruleMeta}>{rule.assessmentText}</p>
              {/* "Última aplicação": a line only when the host said it (never an invented count). */}
              {rule.lastApplied !== undefined && rule.lastApplied.trim() !== '' && (
                <p className={styles.ruleMeta} data-rule-last-applied="">{rule.lastApplied}</p>
              )}
              <Chip tone={rule.logOnly ? 'neutral' : 'accent'} size="s">
                {rule.logOnly ? t('mode.logOnly') : t('mode.executeOptIn')}
              </Chip>
            </li>
          ))}
        </ul>
        {rules.length === 0 && <p className={styles.ruleMeta}>{t('empty.title')}</p>}
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
