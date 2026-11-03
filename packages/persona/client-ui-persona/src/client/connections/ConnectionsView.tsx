/**
 * D4b — Conexões (Value first, ask later: detect CLIs, native login at point of use).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Card, Chip, Screen, ScreenHeader } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Connections.module.css'
import type { ConnectionEntry, ConnectionResolveErrorCode, ConnectionStatus } from './mock-data.ts'
import { pt as defaultDict } from '../locale/connections/locales.ts'

export type ConnectionsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

function chipTone(entry: ConnectionEntry): 'success' | 'neutral' | 'accent' | 'danger' {
  if (entry.errorCode === 'quota_exhausted') return 'danger'
  if (entry.status === 'ready') return 'success'
  if (entry.status === 'expired') return 'accent'
  return 'neutral'
}

function statusKey(entry: ConnectionEntry): string {
  if (entry.errorCode === 'quota_exhausted') return 'status.quota'
  return `status.${entry.status}`
}

function actionKey(entry: ConnectionEntry): string | undefined {
  if (entry.status === 'ready') return 'action.learn'
  if (entry.errorCode === 'cli_not_found') return 'action.install'
  if (entry.errorCode === 'quota_exhausted') return 'action.usage'
  if (entry.copyCommand !== undefined) return undefined
  return 'action.connect'
}

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', 'true')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

export interface ConnectionsViewProps {
  readonly dict?: LocaleDict
  readonly entries?: readonly ConnectionEntry[]
  readonly initialState?: ConnectionsSurfaceState
  readonly onRetry?: () => void
}

/** CLI connection list. */
export function ConnectionsView({
  dict = defaultDict,
  entries = [],
  initialState = 'ready',
  onRetry,
}: ConnectionsViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [surfaceState, setSurfaceState] = useState(initialState)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    setSurfaceState(initialState)
  }, [initialState])

  const header = (
    <ScreenHeader
      icon="skills"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  let body: ReactNode
  if (surfaceState === 'loading') {
    body = <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
  } else if (surfaceState === 'error') {
    body = (
      <PersonaSurfaceError
        dict={dict}
        titleKey="error.title"
        retryKey="error.retry"
        onRetry={() => {
          onRetry?.()
          setSurfaceState('ready')
        }}
      />
    )
  } else if (surfaceState === 'empty') {
    body = (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationKey="empty-connections"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
      />
    )
  } else {
    body = (
      <>
        <p className={styles.note}>{t('valueFirst.note')}</p>
        <ul className={styles.list}>
          {entries.map((entry) => {
            const secondaryKey = actionKey(entry)
            const showCopy = entry.copyCommand !== undefined
            return (
              <li key={entry.id}>
                <Card padding="m" className={styles.cliCard}>
                  <div className={styles.body}>
                    <h3 className={styles.name}>{entry.name}</h3>
                    <Chip tone={chipTone(entry)} size="s">{t(statusKey(entry))}</Chip>
                    {entry.detail !== '' && (
                      <p className={styles.detail}>{entry.detail}</p>
                    )}
                  </div>
                  <div className={styles.actions}>
                    {showCopy && (
                      <Button
                        variant="primary"
                        size="s"
                        onClick={() => {
                          void copyText(entry.copyCommand ?? '').then(() => {
                            setCopiedId(entry.id)
                            window.setTimeout(() => { setCopiedId(current => (current === entry.id ? null : current)) }, 2000)
                          })
                        }}
                      >
                        {copiedId === entry.id ? t('action.copied') : t('action.copyCommand')}
                      </Button>
                    )}
                    {secondaryKey !== undefined && (
                      <Button variant={showCopy ? 'secondary' : 'primary'} size="s">
                        {t(secondaryKey)}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      </>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="connections">
      {header}
      {copiedId !== null && (
        <p className={styles.srOnly} role="status" aria-live="polite">
          {t('action.copied')}
        </p>
      )}
      {body}
    </Screen>
  )
}

export type { ConnectionResolveErrorCode, ConnectionStatus }
