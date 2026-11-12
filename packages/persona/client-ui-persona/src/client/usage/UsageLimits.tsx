/**
 * D5b — Uso e limites (Expansion is born of usage: contextual notice, never modal).
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Chip, Screen, ScreenHeader, UiIcon, type ChipTone } from '../primitives/index.ts'
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
        <ReserveCard t={t} reserve={windowReserve} onContinue={onContinueWindow} />
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

/**
 * "às 06:06" on the same day, "segunda às 06:06" on another one; `''` when the vendor gave no clock (the line then says nothing about the hour).
 * @param resetsAt - ISO instant of the renewal.
 * @param now - The clock.
 */
export function reserveWhen(resetsAt: string | undefined, now: Date = new Date()): string {
  if (resetsAt === undefined) return ''
  const at = new Date(resetsAt)
  if (Number.isNaN(at.getTime())) return ''
  const clock = at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
  if (sameDay) return `às ${clock}`
  const weekday = at.toLocaleDateString('pt-BR', { weekday: 'long' }).split('-')[0] ?? ''
  return `${weekday} às ${clock}`
}

type UsageT = (key: string, params?: Readonly<Record<string, string | number>>) => string

/**
 * The reserve of the last 5% of the plan, in its three states (Muse, item 10): PAUSED (the only one in the attention tone: it waits for you to decide;
 * "Continuar agora" and how many requests wait), RELEASED (the plain card, a green ✓ as its only colour, no button, no count) and SPENT (the plain card
 * with the bar at 100%, requests are kept). No "janela", no money; the "%" only in "5%".
 */
function ReserveCard({ t, reserve, onContinue }: { readonly t: UsageT; readonly reserve: WindowReserveView; readonly onContinue: (() => void) | undefined }): ReactNode {
  const when = reserveWhen(reserve.resetsAt)
  if (reserve.overridden) {
    return (
      <Card padding="m" className={`${styles.reserve} ${styles.reserveCalm}`} data-window-reserve="released">
        <Chip className={styles.reserveAction} tone="success" size="s" icon={<UiIcon name="check" size={12} />}>{t('window.released')}</Chip>
        {when !== '' && <p className={styles.reserveWhen}>{t('window.releasedUntil', { when })}</p>}
      </Card>
    )
  }
  if (reserve.state === 'exhausted') {
    return (
      <Card padding="m" className={`${styles.reserve} ${styles.reserveCalm}`} data-window-reserve="exhausted">
        <div className={styles.reserveText}>
          <p>{t('window.exhausted')}{when !== '' && ` ${t('window.until', { when })}`}</p>
          <p className={styles.reserveWhen}>{t('window.exhaustedKept')}</p>
        </div>
        <div className={styles.reserveBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={100} aria-label={t('window.exhausted')}>
          <div className={styles.reserveBarFill} />
        </div>
      </Card>
    )
  }
  return (
    <Card padding="m" className={`${styles.notice} ${styles.reserve}`} tone="accent" data-window-reserve="paused">
      {/* A frase e o "Volta às HH:MM" são um pensamento só: ficam juntos (vão curto); o botão vem depois, com o vão da seção. */}
      <div className={styles.reserveText}>
        <p>{t('window.paused')}{when !== '' && ` ${t('window.until', { when })}`}</p>
        {reserve.queued > 0 && <p className={styles.reserveWhen}>{t(reserve.queued === 1 ? 'window.waiting.one' : 'window.waiting', { count: reserve.queued })}</p>}
      </div>
      {reserve.state === 'reserve' && onContinue !== undefined && (
        <Button className={styles.reserveAction} variant="secondary" size="s" onClick={onContinue}>{t('window.continue')}</Button>
      )}
    </Card>
  )
}
