/**
 * D5b — Uso e limites (Expansion is born of usage: contextual notice, never modal).
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Chip, Screen, ScreenHeader, type ChipTone } from '../primitives/index.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Usage.module.css'
import type { ActivationFunnelView, WindowReserveView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaImpactUi } from '../data/adapters/insights.ts'
import type { UsageLimitNotice, UsageMeter, UsageOrigin } from './mock-data.ts'
import type { UsageProviderPoolUi } from '../data/adapters/usage-pooled.ts'
import { UsageProviderPoolCard } from './UsageProviderPoolCard.tsx'
import type { UsageTokenPanelUi } from '../data/adapters/usage-panel.ts'
import { LocalInsights } from './LocalInsights.tsx'
import { UsageTokenPanel } from './UsageTokenPanel.tsx'
import { pt as defaultDict } from '../locale/usage/locales.ts'
import { NextStepBar } from '../next-step/NextStepBar.tsx'

export type UsageSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface UsageLimitsProps {
  readonly dict?: LocaleDict
  readonly meters?: readonly UsageMeter[]
  readonly providerPools?: readonly UsageProviderPoolUi[]
  /** "Trocar de conta" on the limit notice (Onda 2); omitted → no button (no dead control). */
  readonly onLimitAction?: (() => void) | undefined
  readonly limitNotice?: UsageLimitNotice | null
  readonly initialState?: UsageSurfaceState
  readonly showLimitNotice?: boolean
  readonly onRemoteRetry?: () => void
  readonly insightsFunnel?: ActivationFunnelView | null
  readonly insightsImpacts?: readonly PersonaImpactUi[]
  readonly onEmptyPrimary?: (() => void) | undefined
  /** OPT-7 token ledger fold (null = hide section). */
  readonly tokenPanel?: UsageTokenPanelUi | null
  /** Harvest 10: the last 5% of the official window (null = not read). */
  readonly windowReserve?: WindowReserveView | null
  /** “Continuar agora”: spend the last 5% of this window cycle. */
  readonly onContinueWindow?: (() => void) | undefined
}

function originChipTone(origin: UsageOrigin): ChipTone {
  if (origin === 'official') return 'success'
  if (origin === 'estimated') return 'accent'
  if (origin === 'unavailable' || origin === 'notYet') return 'neutral'
  return 'brand'
}

function originLabel(dict: LocaleDict, origin: UsageOrigin): string {
  return bindLocale(dict, `origin.${origin}`)
}

function MeterRow({ dict, meter }: { dict: LocaleDict; meter: UsageMeter }): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const unavailable = meter.origin === 'unavailable' || meter.origin === 'notYet' || meter.percent === undefined
  const width = unavailable ? 0 : Math.min(100, Math.max(0, meter.percent))
  const fillClass = unavailable
    ? styles.barUnavailable
    : width >= 95
      ? styles.barDanger
      : width >= 80
        ? styles.barWarn
        : styles.barOk
  return (
    <li className={styles.meterRow}>
      <div className={styles.meterHead}>
        <span className={styles.meterValue}>{unavailable ? t('meter.unavailable') : `${width}%`}</span>
        <span className={styles.meterLabel}>{meter.label}</span>
        <Chip tone={originChipTone(meter.origin)} size="s">{originLabel(dict, meter.origin)}</Chip>
      </div>
      <div
        className={styles.barTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={unavailable ? undefined : width}
        aria-label={`${meter.label} ${originLabel(dict, meter.origin)}`}
      >
        <div
          className={`${styles.barFill} ${fillClass}`}
          style={unavailable ? undefined : { width: `${width}%` }}
        />
      </div>
    </li>
  )
}

/** Usage dashboard preview with labeled origins. */
export function UsageLimits({
  dict = defaultDict,
  meters = [],
  providerPools = [],
  onLimitAction,
  limitNotice = null,
  initialState = 'ready',
  showLimitNotice = true,
  onRemoteRetry,
  insightsFunnel = null,
  insightsImpacts = [],
  onEmptyPrimary,
  tokenPanel = null,
  windowReserve = null,
  onContinueWindow,
}: UsageLimitsProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [surfaceState, setSurfaceState] = useState(initialState)

  useEffect(() => {
    setSurfaceState(initialState)
  }, [initialState])

  const header = (
    <ScreenHeader
      icon="uso-e-limites"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  if (surfaceState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="usage">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
      </Screen>
    )
  }

  if (surfaceState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="usage">
        {header}
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={() => { onRemoteRetry?.() }}
        />
      </Screen>
    )
  }

  if (surfaceState === 'empty') {
    return (
      <Screen className={styles.shell} data-persona-surface="usage">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-inbox"
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
          {...(onEmptyPrimary === undefined ? {} : { onPrimary: onEmptyPrimary })}
        />
      </Screen>
    )
  }

  // Muse (integração Atlas): the screen is "Uso e LIMITES" → pooled limits first (T3-UX-HARVEST §7), then
  // consumption, then local insights. Impact lists only personas that delivered something (no invented ~0 h rows).
  const deliveredImpacts = insightsImpacts.filter(row => row.tasksCompleted > 0 || row.proposalsAccepted > 0)
  return (
    <Screen className={styles.shell} data-persona-surface="usage">
      {header}
      <NextStepBar
        screen="usage"
        state={{
          isEmpty: meters.length === 0 && providerPools.length === 0,
          highUsageWindow: limitNotice !== null && limitNotice.percent > 80
            ? { engineName: limitNotice.connection, percent: limitNotice.percent, untilLabel: '18:30' }
            : undefined,
        }}
        {...(onLimitAction === undefined ? {} : { onAction: () => { onLimitAction() } })}
      />
      {windowReserve !== null && windowReserve.state !== 'ok' && (
        <Card padding="m" className={styles.notice} tone="accent">
          <p>
            {windowReserve.state === 'exhausted'
              ? t('window.exhausted', {
                window: reserveWindowName(t, windowReserve.windowId),
                percent: Math.round(windowReserve.usedPercent ?? 0),
                count: windowReserve.queued,
              })
              : t(windowReserve.queued === 1 ? 'window.reserve.one' : 'window.reserve', {
                window: reserveWindowName(t, windowReserve.windowId),
                percent: Math.round(windowReserve.usedPercent ?? 0),
                count: windowReserve.queued,
              })}
          </p>
          {reserveClock(windowReserve.resetsAt) !== '' && (
            <p>{t('window.until', { when: reserveClock(windowReserve.resetsAt) })}</p>
          )}
          {windowReserve.state === 'reserve' && !windowReserve.overridden && onContinueWindow !== undefined && (
            <Button variant="secondary" size="s" onClick={onContinueWindow}>{t('window.continue')}</Button>
          )}
          {windowReserve.overridden && <p>{t('window.overridden')}</p>}
        </Card>
      )}
      {showLimitNotice && limitNotice !== null && (
        <Card padding="m" className={styles.notice} tone="accent">
          <p>{t('limit.contextual', { connection: limitNotice.connection, percent: limitNotice.percent })}</p>
          {onLimitAction !== undefined && <Button variant="secondary" size="s" onClick={onLimitAction}>{t('limit.action')}</Button>}
        </Card>
      )}
      {providerPools.length > 0 && (
        <section aria-labelledby="usage-limits-pools" className={styles.poolsSection}>
          <p id="usage-limits-pools" className={styles.sectionEyebrow}>{t('section.limits')}</p>
          <ul className={styles.poolList}>
            {providerPools.map(pool => (
              <li key={pool.provider}>
                <UsageProviderPoolCard dict={dict} pool={pool} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {tokenPanel !== null && <UsageTokenPanel dict={dict} panel={tokenPanel} />}
      <Card padding="m" as="section" aria-labelledby="usage-connections">
        <p id="usage-connections" className={styles.sectionEyebrow}>{t('section.connections')}</p>
        <ul className={styles.meterList}>
          {meters.map(meter => (
            <MeterRow key={meter.id} dict={dict} meter={meter} />
          ))}
        </ul>
      </Card>
      {insightsFunnel !== null && (
        <>
          {deliveredImpacts.length === 0 && insightsImpacts.length > 0 && (
            <p className={styles.impactEmpty}>{t('insights.impact.none')}</p>
          )}
          <LocalInsights dict={dict} funnel={insightsFunnel} impacts={deliveredImpacts} />
        </>
      )}
    </Screen>
  )
}

/** Human name of the official window in the reserve card ("de 5 h", "semanal"). */
function reserveWindowName(t: (key: string) => string, windowId: string | undefined): string {
  if (windowId === undefined) return t('window.nameSubscription')
  if (/5h|five/iu.test(windowId)) return t('window.nameFiveHour')
  if (/week|semana|7d/iu.test(windowId)) return t('window.nameWeek')
  return t('window.nameSubscription')
}

/** Local `HH:MM` of the reset, or `''` when the vendor gave no clock. */
function reserveClock(resetsAt: string | undefined): string {
  if (resetsAt === undefined) return ''
  const at = new Date(resetsAt)
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
