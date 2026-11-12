/**
 * COLHEITA 24 — Configurações › Conexões › Estação de Agentes: o computador dedicado 24/7 (pareamento por código, Windows
 * acordado só com trabalho, admissão por RAM) e o Tailscale. Apresentação pura: o painel conectado resolve os dados.
 */

import { useState, type ReactNode } from 'react'
import { Button, Card, Chip, Input, UiIcon } from '../primitives/index.ts'
import type { StationKey } from '../locale/station/locales.ts'
import styles from './StationCard.module.css'

/** What the screen shows about the station (a mirror of the host view, ids and numbers only). */
export interface StationViewUi {
  readonly paired: boolean
  readonly power: 'segurando' | 'livre'
  readonly running: boolean
  readonly ram: { readonly freeBytes: number; readonly floorBytes: number; readonly perCliBytes: number }
  readonly queue: number
  readonly clis: number
  readonly tailscale: { readonly state: 'ativo' | 'parado' | 'ausente'; readonly address?: string; readonly line: string }
}

/** What the card draws and what it can do. */
export interface StationCardProps {
  readonly state: 'loading' | 'error' | 'ready'
  readonly view?: StationViewUi | undefined
  /** The code issued for this screen (shown once). */
  readonly code?: { readonly code: string; readonly expiresAt: string } | undefined
  readonly onIssue?: (() => Promise<void>) | undefined
  readonly onPair?: ((code: string) => Promise<void>) | undefined
  readonly onToggle?: ((running: boolean) => Promise<void>) | undefined
  /** Shown only when Tailscale is missing: the person runs the install themselves. */
  readonly onInstallTailscale?: (() => void) | undefined
  readonly onRetry?: (() => void) | undefined
  readonly t: (key: StationKey, params?: Readonly<Record<string, string | number>>) => string
}

export function StationCard(props: StationCardProps): ReactNode {
  const { t, view } = props
  const issue = props.onIssue
  const pair = props.onPair
  const toggle = props.onToggle
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('error.code'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card as="section" eyebrow={t('card.eyebrow')} title={t('card.title')} className={styles.card}>
      <p className={styles.subtitle}>{t('card.subtitle')}</p>
      {props.state === 'loading' && <div className={styles.loading} aria-busy="true" />}
      {props.state === 'error' && (
        <div className={styles.errorBlock} role="alert">
          <p>{t('error.code')}</p>
          {props.onRetry !== undefined && <Button size="s" variant="secondary" onClick={props.onRetry}>{t('pair.action')}</Button>}
        </div>
      )}
      {props.state === 'ready' && view !== undefined && (
        <>
          <div className={styles.chips}>
            <Chip size="s" tone={view.paired ? 'success' : 'neutral'}>{t(view.paired ? 'state.paired' : 'state.unpaired')}</Chip>
            <Chip size="s" tone={view.running ? 'accent' : 'plain'}>{t(view.running ? 'state.on' : 'state.off')}</Chip>
            <Chip size="s" tone={view.power === 'segurando' ? 'warning' : 'plain'}>{t(view.power === 'segurando' ? 'power.holding' : 'power.free')}</Chip>
            {view.queue > 0 && <Chip size="s" tone="info">{t('queue', { n: view.queue })}</Chip>}
            {view.clis > 0 && <Chip size="s" tone="brand">{t('clis', { n: view.clis })}</Chip>}
          </div>
          <p className={styles.ram}>{t('ram.free', { gb: (view.ram.freeBytes / 1024 ** 3).toFixed(1) })}</p>
          <p className={styles.muted}>{t('ram.floor', { gb: (view.ram.floorBytes / 1024 ** 3).toFixed(1), mb: Math.round(view.ram.perCliBytes / 1024 ** 2) })}</p>
          <p className={styles.tailscale}>
            <UiIcon name={view.tailscale.state === 'ativo' ? 'check' : 'alert'} size={16} />
            {view.tailscale.line}
            {view.tailscale.state === 'ausente' && props.onInstallTailscale !== undefined && (
              <Button size="s" variant="ghost" onClick={props.onInstallTailscale}>{t('tailscale.install')}</Button>
            )}
          </p>
          {props.code !== undefined && (
            <div className={styles.codeBlock} role="status">
              <p className={styles.codeTitle}>{t('code.title')}</p>
              <p className={styles.code}>{props.code.code}</p>
              <p className={styles.muted}>{t('code.expires')}</p>
            </div>
          )}
          <div className={styles.actions}>
            {issue !== undefined && (
              <Button size="s" disabled={busy} onClick={() => { void run(() => issue()) }}>{t('action.issue')}</Button>
            )}
            {toggle !== undefined && (
              <Button size="s" variant="secondary" disabled={busy} onClick={() => { void run(() => toggle(!view.running)) }}>
                {t(view.running ? 'action.off' : 'action.on')}
              </Button>
            )}
          </div>
          {pair !== undefined && (
            <form
              className={styles.pair}
              onSubmit={(event) => {
                event.preventDefault()
                const code = draft.trim()
                if (code === '') {
                  setError(t('error.code'))
                  return
                }
                void run(async () => {
                  await pair(code)
                  setDraft('')
                })
              }}
            >
              <Input
                label={t('pair.label')}
                placeholder={t('pair.placeholder')}
                value={draft}
                onChange={(event) => { setDraft(event.target.value) }}
              />
              <Button type="submit" size="s" disabled={busy}>{t('pair.action')}</Button>
            </form>
          )}
        </>
      )}
      {error !== undefined && <p className={styles.error} role="alert">{error}</p>}
    </Card>
  )
}
