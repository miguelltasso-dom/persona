import { useId, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Avatar, Button, ChoiceCards, Input, Notice, Switch, type ChoiceCardOption } from '../primitives/index.ts'
import styles from './UserAwayControl.module.css'

export type AwayUntilChoice = 'today18' | 'tomorrow' | 'custom'

export interface UserAwayState {
  readonly isAway: boolean
  readonly untilChoice: AwayUntilChoice
  readonly untilDate?: string | undefined
  /** Quando "Estou fora" termina (ms, hora local). Sem isso o estado nunca expira (estados antigos). */
  readonly untilAt?: number | undefined
}

/** Hora em que "Amanhã de manhã" termina. */
const TOMORROW_MORNING_HOUR = 8

/**
 * Quando "Estou fora" termina, em ms (hora local): "Hoje às 18h" = o próximo 18h; "Amanhã de manhã" = 8h do dia
 * seguinte; "Escolher dia…" = o fim desse dia. Sem data válida, `undefined` (não expira sozinho).
 */
export function awayUntilAt(state: Pick<UserAwayState, 'untilChoice' | 'untilDate'>, now: number): number | undefined {
  const base = new Date(now)
  if (state.untilChoice === 'today18') {
    const target = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 18, 0, 0, 0)
    if (target.getTime() <= now) target.setDate(target.getDate() + 1)
    return target.getTime()
  }
  if (state.untilChoice === 'tomorrow') {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, TOMORROW_MORNING_HOUR, 0, 0, 0).getTime()
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(state.untilDate ?? '')
  if (match === null) return undefined
  const end = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999).getTime()
  return Number.isNaN(end) ? undefined : end
}

/** Passou o prazo: a pessoa voltou (a pílula volta a "Conectado" e a Visão geral mostra o resumo uma vez). */
export function isAwayExpired(state: UserAwayState, now: number): boolean {
  return state.isAway && state.untilAt !== undefined && now >= state.untilAt
}

export interface UserAwayControlProps extends PropsLocale<'persona.shell'> {
  readonly awayState: UserAwayState
  readonly substitute?: { readonly id: string; readonly name: string; readonly avatarUrl?: string } | null | undefined
  readonly onChange: (next: UserAwayState) => void
  readonly onDefineSubstitute?: (() => void) | undefined
  /** Linha no topo do cartão, acima do interruptor (o rail põe aqui o estado da IA, A-5). */
  readonly header?: ReactNode
}

export function formatAwayUntilWhen(t: PropsLocale<'persona.shell'>['t'], state: UserAwayState): string {
  if (state.untilChoice === 'today18') return t('away.when.today18')
  if (state.untilChoice === 'tomorrow') return t('away.when.tomorrow')
  if (state.untilDate !== undefined && state.untilDate.length > 0) return state.untilDate
  return t('away.when.tomorrow')
}

export function UserAwayControl({
  t,
  awayState,
  substitute,
  onChange,
  onDefineSubstitute,
  header,
}: UserAwayControlProps): ReactNode {
  const switchId = useId()
  const emit = (next: UserAwayState): void => {
    onChange({ ...next, untilAt: next.isAway ? awayUntilAt(next, Date.now()) : undefined })
  }

  const awayOptions: readonly ChoiceCardOption<AwayUntilChoice>[] = [
    { id: 'today18', title: t('away.today18'), body: '' },
    { id: 'tomorrow', title: t('away.tomorrowMorning'), body: '' },
    { id: 'custom', title: t('away.chooseDate'), body: '' },
  ]

  return (
    <div className={styles.container} data-persona-user-away="">
      {header !== undefined && <div className={styles.header}>{header}</div>}
      <label className={styles.switchRow} htmlFor={switchId}>
        <span className={styles.switchLabel}>{t('away.switchLabel')}</span>
        <Switch
          id={switchId}
          checked={awayState.isAway}
          onChange={(next) => {
            emit({ ...awayState, isAway: next })
          }}
          label={t('away.switchLabel')}
        />
      </label>

      {awayState.isAway && (
        <div className={styles.awayDetails}>
          <ChoiceCards
            legend={t('away.untilLegend')}
            name="user-away-until"
            options={awayOptions}
            value={awayState.untilChoice}
            onChange={(choice) => {
              emit({ ...awayState, untilChoice: choice })
            }}
          />

          {awayState.untilChoice === 'custom' && (
            <div className={styles.customDateWrap}>
              <Input
                type="date"
                label={t('away.chooseDate')}
                hideLabel
                value={awayState.untilDate ?? ''}
                onChange={(e) => {
                  emit({ ...awayState, untilDate: e.target.value })
                }}
              />
            </div>
          )}

          <div className={styles.consequence}>
            {substitute != null ? (
              <div className={styles.substituteRow}>
                <Avatar name={substitute.name} src={substitute.avatarUrl} size={24} shape="portrait" decorative />
                <p className={styles.substituteText}>
                  {t('away.substituteInfo', { name: substitute.name })}
                </p>
              </div>
            ) : (
              <div className={styles.noSubstituteWrap}>
                <Notice tone="warning">
                  {t('away.noSubstituteWarning')}
                </Notice>
                {onDefineSubstitute !== undefined && (
                  <Button size="s" variant="ghost" onClick={onDefineSubstitute}>
                    {t('away.setSubstituteAction')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
