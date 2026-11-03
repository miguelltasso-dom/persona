/**
 * D5b — Uso e limites (Expansion is born of usage: contextual notice, never modal).
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Chip, Screen, ScreenHeader, type ChipTone } from '../primitives/index.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Usage.module.css'
import type { UsageLimitNotice, UsageMeter, UsageOrigin } from './mock-data.ts'
import { pt as defaultDict } from '../locale/usage/locales.ts'

export type UsageSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface UsageLimitsProps {
  readonly dict?: LocaleDict
  readonly meters?: readonly UsageMeter[]
  readonly limitNotice?: UsageLimitNotice | null
  readonly initialState?: UsageSurfaceState
  readonly showLimitNotice?: boolean
  readonly onRemoteRetry?: () => void
}

function originChipTone(origin: UsageOrigin): ChipTone {
  if (origin === 'official') return 'success'
  if (origin === 'estimated') return 'accent'
  if (origin === 'unavailable') return 'neutral'
  return 'brand'
}

function originLabel(dict: LocaleDict, origin: UsageOrigin): string {
  return bindLocale(dict, `origin.${origin}`)
}

function MeterRow({ dict, meter }: { dict: LocaleDict; meter: UsageMeter }): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const unavailable = meter.origin === 'unavailable' || meter.percent === undefined
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
  limitNotice = null,
  initialState = 'ready',
  showLimitNotice = true,
  onRemoteRetry,
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
        />
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="usage">
      {header}
      {showLimitNotice && limitNotice !== null && (
        <Card padding="m" className={styles.notice} tone="accent">
          <p>{t('limit.contextual', { connection: limitNotice.connection, percent: limitNotice.percent })}</p>
          <Button variant="secondary" size="s">{t('limit.action')}</Button>
        </Card>
      )}
      <Card padding="m" as="section" aria-labelledby="usage-connections">
        <p id="usage-connections" className={styles.sectionEyebrow}>{t('section.connections')}</p>
        <ul className={styles.meterList}>
          {meters.map(meter => (
            <MeterRow key={meter.id} dict={dict} meter={meter} />
          ))}
        </ul>
      </Card>
    </Screen>
  )
}
