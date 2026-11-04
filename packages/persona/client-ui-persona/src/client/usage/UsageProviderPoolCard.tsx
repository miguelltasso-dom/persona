import type { ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { AccountList, AccountRow, Card, PooledQuotaBar, type PooledAccount } from '../primitives/index.ts'
import { EngineBrandIcon } from '../connections/engine-brand-icon.tsx'
import type { UsageProviderPoolUi } from '../data/adapters/usage-pooled.ts'
import styles from './Usage.module.css'

function accountDisplayLabel(dict: LocaleDict, accountId: string, label: string): string {
  if (accountId === 'default' || label === 'default') {
    return bindLocale(dict, 'pool.defaultAccount')
  }
  return label
}

function poolReportsWindow(accounts: readonly PooledAccount[]): boolean {
  return accounts.some(a => a.leftPct !== undefined)
}

export interface UsageProviderPoolCardProps {
  readonly dict: LocaleDict
  readonly pool: UsageProviderPoolUi
}

function poolBarLabels(dict: LocaleDict, accounts: readonly { readonly id: string; readonly label: string; readonly plan?: string | undefined }[]) {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const metaById = new Map(accounts.map(a => [a.id, a]))
  return {
    left: (pct: number) => t('pool.left', { pct: String(pct) }),
    nextRefill: (pct: number, at: string, account: string) => t('pool.refill', { pct: String(pct), time: at, account }),
    noWindow: t('pool.noWindow'),
    segment: (a: PooledAccount) => {
      const meta = metaById.get(a.id)
      const plan = meta?.plan
      if (a.leftPct === undefined) {
        return plan === undefined ? `${a.label}: ${t('pool.noWindow')}` : t('pool.segmentNoWindowPlan', { account: a.label, plan })
      }
      const left = t('pool.leftShort', { pct: String(Math.round(a.leftPct)) })
      const refill = a.refillAt === undefined ? '' : t('pool.segmentRefillAt', { time: a.refillAt })
      return plan === undefined
        ? t('pool.segmentPlain', { account: a.label, left, refill })
        : t('pool.segmentPlan', { account: a.label, plan, left, refill })
    },
  }
}

function accountRowLabels(dict: LocaleDict, providerName: string, accountLabel: string) {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return {
    fiveHour: t('account.fiveHour'),
    week: t('account.week'),
    quotaUnavailable: t('account.quotaUnavailable'),
    usedBy: t('account.usedBy'),
    menu: t('account.menu', { provider: providerName, account: accountLabel }),
    inUse: t('account.inUse'),
  }
}

function stateText(dict: LocaleDict, pool: UsageProviderPoolUi, accountId: string): string {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const account = pool.accounts.find(a => a.id === accountId)
  if (account === undefined) return t('account.state.checking')
  if (account.state === 'limit') {
    const seg = [...pool.fiveHour, ...pool.week].find(s => s.id === accountId && s.refillAt !== undefined)
    return seg?.refillAt === undefined ? t('account.state.limit') : t('account.state.limitUntil', { time: seg.refillAt })
  }
  if (account.state === 'ready') return t('account.state.ready')
  return t('account.state.checking')
}

/** T3 §7 — pooled limits per provider with AccountRow list (WAVE2). */
export function UsageProviderPoolCard({ dict, pool }: UsageProviderPoolCardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const accountsForLabels = pool.accounts.map(a => ({
    ...a,
    label: accountDisplayLabel(dict, a.id, a.label),
  }))
  const labels = poolBarLabels(dict, accountsForLabels)
  const fiveHour = pool.fiveHour.map(seg => ({
    ...seg,
    label: accountDisplayLabel(dict, seg.id, seg.label),
  }))
  const week = pool.week.map(seg => ({
    ...seg,
    label: accountDisplayLabel(dict, seg.id, seg.label),
  }))
  const reportsLimits = poolReportsWindow(fiveHour) || poolReportsWindow(week)
  return (
    <Card padding="m" as="section" aria-labelledby={`usage-pool-${pool.provider}`}>
      <div className={styles.poolHead}>
        <EngineBrandIcon engineId={pool.provider} size={28} />
        <h3 id={`usage-pool-${pool.provider}`} className={styles.poolTitle}>{pool.providerName}</h3>
      </div>
      {reportsLimits ? (
        <div className={styles.poolBars}>
          <PooledQuotaBar window={t('pool.windowFiveHour')} accounts={fiveHour} labels={labels} color="var(--persona-lilac-500)" />
          <PooledQuotaBar window={t('pool.windowWeek')} accounts={week} labels={labels} color="var(--persona-lilac-500)" />
        </div>
      ) : (
        <p className={styles.poolNoLimits}>{t('pool.providerNoLimits', { provider: pool.providerName })}</p>
      )}
      <AccountList label={t('pool.accountsHeading', { provider: pool.providerName })}>
        {pool.accounts.map(account => (
          <AccountRow
            key={account.id}
            label={accountDisplayLabel(dict, account.id, account.label)}
            providerName={pool.providerName}
            state={account.state}
            stateText={stateText(dict, pool, account.id)}
            labels={accountRowLabels(dict, pool.providerName, account.label)}
            {...(account.fiveHourUsedPct === undefined && account.weekUsedPct === undefined
              ? {}
              : {
                quota: {
                  ...(account.fiveHourUsedPct === undefined ? {} : { fiveHourPct: account.fiveHourUsedPct }),
                  ...(account.weekUsedPct === undefined ? {} : { weekPct: account.weekUsedPct }),
                },
              })}
            {...(account.inUse === true ? { inUse: true } : {})}
          />
        ))}
      </AccountList>
    </Card>
  )
}
