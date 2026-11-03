/**
 * D5b — Uso e limites (Expansion is born of usage: contextual notice, never modal).
 */
import { useState, type ReactNode } from 'react'
import { PersonaButton } from '../primitives/PersonaButton.tsx'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Usage.module.css'
import { MOCK_LIMIT_NOTICE, MOCK_USAGE_METERS, type UsageMeter, type UsageOrigin } from './mock-data.ts'
import { pt as defaultDict } from '../locale/usage/locales.ts'

export type UsageSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface UsageLimitsProps {
  readonly dict?: LocaleDict
  readonly initialState?: UsageSurfaceState
  readonly showLimitNotice?: boolean
}

function originLabel(dict: LocaleDict, origin: UsageOrigin): string {
  return bindLocale(dict, `origin.${origin}`)
}

function MeterRow({ dict, meter }: { dict: LocaleDict; meter: UsageMeter }): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const unavailable = meter.origin === 'unavailable' || meter.percent === undefined
  const width = unavailable ? 0 : Math.min(100, Math.max(0, meter.percent))
  return (
    <li className={styles.meterRow}>
      <span className={styles.meterLabel}>{meter.label}</span>
      <span className={styles.origin}>{originLabel(dict, meter.origin)}</span>
      <span className={styles.percent} aria-live="polite">
        {unavailable ? t('meter.unavailable') : `${width}%`}
      </span>
      <div className={styles.barTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={unavailable ? undefined : width}
        aria-label={`${meter.label} ${originLabel(dict, meter.origin)}`}
      >
        <div
          className={`${styles.barFill}${unavailable ? ` ${styles.barUnavailable}` : ''}`}
          style={unavailable ? undefined : { width: `${width}%` }}
        />
      </div>
    </li>
  )
}

/** Usage dashboard preview with labeled origins. */
export function UsageLimits({
  dict = defaultDict,
  initialState = 'ready',
  showLimitNotice = true,
}: UsageLimitsProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 6 })
  const [surfaceState, setSurfaceState] = useState(initialState)

  if (surfaceState === 'loading') {
    return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
  }

  if (surfaceState === 'error') {
    return (
      <PersonaSurfaceError
        dict={dict}
        titleKey="error.title"
        retryKey="error.retry"
        onRetry={() => { setSurfaceState('ready') }}
      />
    )
  }

  if (surfaceState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="empty.illustration"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
      />
    )
  }

  return (
    <div className={styles.shell} ref={motion.ref} style={motion.style}>
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>
      {showLimitNotice && (
        <aside className={styles.notice} role="status">
          <p>{t('limit.contextual', { connection: MOCK_LIMIT_NOTICE.connection, percent: MOCK_LIMIT_NOTICE.percent })}</p>
          <PersonaButton variant="secondary">{t('limit.action')}</PersonaButton>
        </aside>
      )}
      <section aria-labelledby="usage-connections">
        <h2 id="usage-connections" className={styles.title}>{t('section.connections')}</h2>
        <ul className={styles.meterList}>
          {MOCK_USAGE_METERS.map(meter => (
            <MeterRow key={meter.id} dict={dict} meter={meter} />
          ))}
        </ul>
      </section>
    </div>
  )
}
