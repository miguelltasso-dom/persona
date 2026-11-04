/**
 * As barras de limite do `/limites` e da gaveta "Contexto usado" (UX-BEYOND IV-4 = P0-28). Só desenha o que o host
 * publicou: com dado, o `PooledQuotaBar` de Uso (5 horas e Semana, um segmento por conta); sem dado, "—" e "Cota oficial
 * indisponível"; lendo, esqueletos. Nunca um número de exemplo.
 */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { PooledQuotaBar, Skeleton, type PooledAccount } from '../primitives/index.ts'
import type { EngineLimitsUi } from '../remote/engine-limits.ts'
import styles from './EngineLimitsBars.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

const reports = (accounts: readonly PooledAccount[]): boolean => accounts.some(account => account.leftPct !== undefined)

export function EngineLimitsBars({ t, limits }: { readonly t: ChatT; readonly limits: EngineLimitsUi }): ReactNode {
  if (limits.state === 'loading') {
    return (
      <div className={styles.loading} aria-busy="true" data-persona-limits="loading">
        <Skeleton width="45%" height={12} />
        <Skeleton width="100%" height={12} />
      </div>
    )
  }
  if (limits.state === 'unavailable') {
    return (
      <p className={styles.unavailable} data-persona-limits="unavailable">
        <span className={styles.dash} aria-hidden="true">—</span>
        <span>{t('composer.limitsUnavailable')}</span>
      </p>
    )
  }
  const labels = {
    left: (pct: number) => t('composer.limitsRemaining', { pct: String(pct) }),
    nextRefill: (pct: number, at: string, account: string) => t('composer.limitsRecharge', { pct: String(pct), time: at, account }),
    noWindow: t('composer.limitsNoWindow'),
    segment: (account: PooledAccount) => account.label,
  }
  return (
    <div className={styles.bars} data-persona-limits="ready">
      {reports(limits.fiveHour) && (
        <PooledQuotaBar compact window={t('composer.limitsWindow')} color="var(--persona-lilac-500)" accounts={limits.fiveHour} labels={labels} />
      )}
      {reports(limits.week) && (
        <PooledQuotaBar compact window={t('composer.limitsWindowWeek')} color="var(--persona-lilac-500)" accounts={limits.week} labels={labels} />
      )}
    </div>
  )
}
