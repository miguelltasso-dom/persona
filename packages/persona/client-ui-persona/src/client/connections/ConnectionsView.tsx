/**
 * D4b — Conexões (Value first, ask later: detect CLIs, native login at point of use).
 */
import { useState, type ReactNode } from 'react'
import { PersonaButton } from '../primitives/PersonaButton.tsx'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Connections.module.css'
import type { ConnectionEntry, ConnectionStatus } from './mock-data.ts'
import { pt as defaultDict } from '../locale/connections/locales.ts'

export type ConnectionsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

function statusClass(status: ConnectionStatus): string {
  switch (status) {
    case 'ready': return styles.statusReady ?? ''
    case 'missing': return styles.statusMissing ?? ''
    case 'expired': return styles.statusExpired ?? ''
    default: return styles.statusMissing ?? ''
  }
}

function actionLabel(dict: LocaleDict, entry: ConnectionEntry): string {
  if (entry.status === 'ready') return bindLocale(dict, 'action.learn')
  if (entry.status === 'expired') return bindLocale(dict, 'action.reconnect')
  return bindLocale(dict, 'action.connect')
}

export interface ConnectionsViewProps {
  readonly dict?: LocaleDict
  readonly entries?: readonly ConnectionEntry[]
  readonly initialState?: ConnectionsSurfaceState
}

/** CLI connection list preview. */
export function ConnectionsView({
  dict = defaultDict,
  entries = [],
  initialState = 'ready',
}: ConnectionsViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
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
    <div className={styles.shell} ref={motion.ref} style={motion.style} data-persona-surface="connections">
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
        <p className={styles.note}>{t('valueFirst.note')}</p>
      </header>
      <ul className={styles.list}>
        {entries.map(entry => (
          <li key={entry.id} className={styles.row}>
            <div>
              <div className={styles.name}>{entry.name}</div>
              <span className={`${styles.status} ${statusClass(entry.status)}`}>
                <span aria-hidden="true">{entry.status === 'ready' ? '●' : entry.status === 'expired' ? '◐' : '○'}</span>
                {t(`status.${entry.status}`)}
              </span>
            </div>
            <div className={styles.actions}>
              <PersonaButton variant={entry.status === 'ready' ? 'secondary' : 'primary'}>
                {actionLabel(dict, entry)}
              </PersonaButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
