/**
 * Configurações › Ferramentas › "Quem pode usar?" (item 26, Muse §26): the 440 px side panel of a connected tool. The faces (40 px) are tickable and NOBODY is ticked until
 * the host says so (D-084: nobody without asking); below, what the tool permits in the host's own classes (Ler · Mudar · Enviar · Pagar · Apagar), with the 16 px lock on the
 * ones that always ask. `Pronto` closes. Never a dead control: a face is a button only when the screen was given the host call (`onToggle`) and a connector to hand it.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar, Button, IconButton, UiIcon } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as defaultDict } from '../locale/tools/locales.ts'
import styles from './WhoPanel.module.css'
import type { ToolCard } from './tools-model.ts'
import { grantsOfTool, permitsOf, refOfTool, whoRows, type ToolGrant, type ToolRef, type WhoFace, type WhoRow } from './who-model.ts'

export type WhoSurfaceState = 'loading' | 'error' | 'ready'

export interface WhoPanelProps {
  readonly dict?: LocaleDict
  readonly card: ToolCard
  readonly faces: readonly WhoFace[]
  /** The host's grants of the whole workspace; the panel keeps those of this tool. */
  readonly grants: readonly ToolGrant[]
  /** The connector to hand the host when ticking a face. Defaults to the one an existing grant of this tool points at; the host-bound panel remembers it so that unticking the LAST face does not strand the list. */
  readonly connectorRef?: ToolRef | undefined
  readonly state?: WhoSurfaceState
  /** Ticks (grant) or unticks (revoke) one face at the host. Absent = the list is read-only (no button). Must throw when the host refuses. */
  readonly onToggle?: ((row: WhoRow, next: boolean) => Promise<void>) | undefined
  readonly onRetry?: (() => void) | undefined
  readonly onClose: () => void
}

export function WhoPanel({ dict = defaultDict, card, faces, grants, connectorRef, state = 'ready', onToggle, onRetry, onClose }: WhoPanelProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const titleId = useId()
  const firstRef = useRef<HTMLElement | null>(null)
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [failed, setFailed] = useState(false)

  useEffect(() => { firstRef.current?.focus() }, [])

  const rows = whoRows(card, faces, grants)
  const mine = grantsOfTool(card, grants)
  // A face can be ticked only with a connector to hand the host: the one an existing grant of this tool already points at (or the one remembered from this session).
  const ref = connectorRef ?? refOfTool(card, grants)
  const permits = permitsOf(mine)
  const anyAlways = mine.some(grant => grant.loadedAlways)

  const toggle = async (row: WhoRow): Promise<void> => {
    if (onToggle === undefined || busy !== undefined) return
    if (!row.on && ref === undefined) return
    setBusy(row.face.id)
    setFailed(false)
    try {
      await onToggle(row, !row.on)
    } catch {
      setFailed(true)
    } finally {
      setBusy(undefined)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
  }

  const face = (row: WhoRow, index: number): ReactNode => {
    const content = (
      <>
        <Avatar name={row.face.name} size={40} shape="portrait" decorative {...(row.face.avatarSrc === undefined ? {} : { src: row.face.avatarSrc })} />
        <span className={styles.faceName}>{row.face.name}</span>
        <span className={styles.faceMark} aria-hidden="true">{row.on ? <UiIcon name="check" size={16} strokeWidth={2.6} /> : null}</span>
      </>
    )
    // Without the host call (or without a connector to hand it) the row only SAYS who can use it: no button that does nothing.
    const interactive = onToggle !== undefined && (row.on || ref !== undefined)
    return (
      <li key={row.face.id} className={styles.faceItem} data-persona={row.face.id} data-on={row.on ? 'true' : 'false'}>
        {interactive
          ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={row.on}
              aria-busy={busy === row.face.id}
              disabled={busy !== undefined && busy !== row.face.id}
              className={styles.face}
              ref={index === 0 ? (node) => { firstRef.current = node } : undefined}
              onClick={() => { void toggle(row) }}
            >
              {content}
            </button>
          )
          : <span className={`${styles.face} ${styles.faceStatic}`} ref={index === 0 ? (node) => { firstRef.current = node } : undefined} tabIndex={index === 0 ? -1 : undefined}>{content}</span>}
      </li>
    )
  }

  return (
    <aside className={styles.panel} aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h3 id={titleId} className={styles.title}>{t('who.title')}</h3>
          <p className={styles.subtitle}>{t('who.subtitle', { name: card.name })}</p>
        </div>
        <IconButton label={t('who.close')} icon={<UiIcon name="close" size={18} />} onClick={onClose} />
      </header>

      <div className={styles.body}>
        {state === 'loading' && <p className={styles.note} role="status">{t('who.loading')}</p>}
        {state === 'error' && (
          <div role="alert" className={styles.errorBox}>
            <p className={styles.note}>{t('who.error')}</p>
            {onRetry !== undefined && <Button variant="secondary" onClick={onRetry}>{t('who.retry')}</Button>}
          </div>
        )}
        {state === 'ready' && (
          <>
            {faces.length === 0
              ? <p className={styles.note}>{t('who.noTeam')}</p>
              : (
                <section aria-label={t('who.faces')} className={styles.section}>
                  <ul className={styles.faces}>{rows.map(face)}</ul>
                  {rows.every(row => !row.on) && <p className={styles.note}>{t('who.nobody')}</p>}
                  {onToggle !== undefined && ref === undefined && <p className={styles.note}>{t('who.noRef', { name: card.name })}</p>}
                  {onToggle === undefined && <p className={styles.note}>{t('who.readOnly')}</p>}
                </section>
              )}
            {failed && <p className={styles.errorLine} role="alert">{t('who.failed')}</p>}
            {anyAlways && <p className={styles.note}>{t('who.loadedAlways')}</p>}

            <section aria-labelledby={`${titleId}-allows`} className={styles.section}>
              <h4 id={`${titleId}-allows`} className={styles.sectionTitle}>{t('who.allows', { name: card.name })}</h4>
              <ul className={styles.permits}>
                {permits.map(permit => (
                  <li key={permit.id} className={styles.permit} data-permit={permit.id} data-on={permit.on ? 'true' : 'false'} data-asks={permit.asks ? 'true' : 'false'}>
                    <span className={styles.permitName}>{t(`who.group.${permit.id}`)}</span>
                    {permit.on && permit.asks && (
                      <span className={styles.permitLock}>
                        <UiIcon name="lock" size={16} />
                        <span>{t('who.alwaysAsks')}</span>
                      </span>
                    )}
                    {permit.on && !permit.asks && <span className={styles.permitOff}>{t('who.noAsk')}</span>}
                    {!permit.on && <span className={styles.permitOff}>{t('who.permit.off')}</span>}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>

      <footer className={styles.footer}>
        <Button variant="primary" onClick={onClose}>{t('who.done')}</Button>
      </footer>
    </aside>
  )
}
