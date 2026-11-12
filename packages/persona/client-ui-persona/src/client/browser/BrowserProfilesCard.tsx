/**
 * Item 17 (colheita) — Configurações › Conexões › Navegador: os perfis do Chrome do computador, quem dirige cada um
 * agora ("Assumir controle"/"Devolver") e quais personas podem usá-lo. Apresentação pura: o painel conectado resolve os
 * dados e as ações; aqui não há chamada de rede.
 */

import { useState, type ReactNode } from 'react'
import { Button, Card, Chip, EmptyState, Input, UiIcon } from '../primitives/index.ts'
import type { BrowserKey } from '../locale/browser/locales.ts'
import styles from './BrowserProfilesCard.module.css'

/** A persona the screen can grant or name. */
export interface BrowserPersonaOption {
  readonly id: string
  readonly name: string
  /** Absent = the engine can carry the browser;  = the screen says "sem navegador" (Cursor). */
  readonly canBrowse?: boolean
}

/** Who drives a profile right now. */
export interface BrowserHolderView {
  readonly kind: 'persona' | 'person'
  readonly name: string
}

/** One profile as the list shows it. */
export interface BrowserProfileRow {
  readonly id: string
  readonly name: string
  /** Absent = free. */
  readonly holder?: BrowserHolderView
  /** Its Chrome is up. */
  readonly running: boolean
  /** Personas allowed to drive it. */
  readonly personas: readonly BrowserPersonaOption[]
  /** Personas that use it when they do not name one. */
  readonly defaultFor: readonly string[]
}

/** What the card draws and what it can do. */
export interface BrowserProfilesCardProps {
  readonly state: 'loading' | 'error' | 'empty' | 'ready'
  /** Chrome was not found on this machine: the card says so instead of promising a browser. */
  readonly chromeMissing: boolean
  readonly profiles: readonly BrowserProfileRow[]
  /** Every persona of the project (the grant menu). */
  readonly personas: readonly BrowserPersonaOption[]
  /** A missing handler is a missing button: the card never draws an action it cannot run. */
  readonly onCreate?: (name: string) => Promise<void>
  readonly onRename?: (profileId: string, name: string) => Promise<void>
  readonly onGrant?: (profileId: string, personaId: string) => Promise<void>
  readonly onRevoke?: (profileId: string, personaId: string) => Promise<void>
  readonly onTake?: (profileId: string) => Promise<void>
  readonly onRelease?: (profileId: string) => Promise<void>
  readonly onClose?: (profileId: string) => Promise<void>
  readonly onRetry?: (() => void) | undefined
  readonly t: (key: BrowserKey, params?: Readonly<Record<string, string | number>>) => string
}

export function BrowserProfilesCard(props: BrowserProfilesCardProps): ReactNode {
  const { t } = props
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | undefined>(undefined)
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError(undefined)
    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('error.failed'))
    } finally {
      setBusy(undefined)
    }
  }

  const create = (): void => {
    const name = draft.trim()
    if (name === '') {
      setError(t('error.name'))
      return
    }
    const submit = props.onCreate
    if (submit === undefined) return
    void run('create', async () => {
      await submit(name)
      setDraft('')
    })
  }

  return (
    <Card
      as="section"
      eyebrow={t('card.eyebrow')}
      title={t('card.title')}
      className={styles.card}
    >
      <p className={styles.subtitle}>{t('card.subtitle')}</p>
      {props.chromeMissing && (
        <p className={styles.warning} role="status">
          <UiIcon name="alert" size={16} />
          {t('chrome.missing')}
        </p>
      )}
      {props.state === 'loading' && <div className={styles.loading} aria-busy="true" />}
      {props.state === 'error' && (
        <div className={styles.errorBlock} role="alert">
          <p>{t('error.failed')}</p>
          {props.onRetry !== undefined && <Button size="s" variant="secondary" onClick={props.onRetry}>{t('action.save')}</Button>}
        </div>
      )}
      {props.state === 'empty' && (
        <EmptyState
          compact
          title={t('empty.title')}
          body={t('empty.body')}
          action={props.onCreate === undefined ? undefined : <Button size="s" onClick={create} disabled={busy !== undefined}>{t('action.create')}</Button>}
        />
      )}
      {props.state === 'ready' && (
        <ul className={styles.list}>
          {props.profiles.map((profile) => {
            const holder = profile.holder
            const personHolds = holder?.kind === 'person'
            return (
              <li key={profile.id} className={styles.row} data-holder={holder?.kind ?? 'free'}>
                <div className={styles.head}>
                  {renaming?.id === profile.id ? (
                    <form
                      className={styles.rename}
                      onSubmit={(event) => {
                        event.preventDefault()
                        const name = renaming.name.trim()
                        if (name === '') {
                          setError(t('error.name'))
                          return
                        }
                        const rename = props.onRename
                        if (rename === undefined) return
                        void run(`rename:${profile.id}`, async () => {
                          await rename(profile.id, name)
                          setRenaming(undefined)
                        })
                      }}
                    >
                      <Input
                        label={t('field.name')}
                        hideLabel
                        value={renaming.name}
                        onChange={(event) => { setRenaming({ id: profile.id, name: event.target.value }) }}
                      />
                      <Button size="s" type="submit" disabled={busy !== undefined}>{t('action.save')}</Button>
                      <Button size="s" type="button" variant="ghost" onClick={() => { setRenaming(undefined) }}>{t('action.cancel')}</Button>
                    </form>
                  ) : (
                    <>
                      <h4 className={styles.name}>{profile.name}</h4>
                      <Chip size="s" tone={personHolds ? 'brand' : holder === undefined ? 'neutral' : 'accent'}>
                        {holder === undefined ? t('list.free') : t(holder.kind === 'person' ? 'list.person' : 'list.persona', { name: holder.name })}
                      </Chip>
                      <Chip size="s" tone={profile.running ? 'success' : 'plain'}>
                        {profile.running ? t('list.open') : t('list.closed')}
                      </Chip>
                    </>
                  )}
                </div>
                <div className={styles.personas}>
                  <span className={styles.personasLabel}>{t('list.personas')}</span>
                  {profile.personas.length === 0 && <span className={styles.muted}>{t('list.nobody')}</span>}
                  {profile.personas.map(persona => (
                    <Chip key={persona.id} size="s" tone="plain" title={profile.defaultFor.includes(persona.name) ? t('list.default', { name: persona.name }) : undefined}>
                      {persona.name}
                      {profile.defaultFor.includes(persona.name) && <span aria-hidden="true"> · ★</span>}
                      {persona.canBrowse === false && <span className={styles.muted}> · {t('list.noBrowser')}</span>}
                      <button
                        type="button"
                        className={styles.revoke}
                        aria-label={t('action.revoke', { name: persona.name })}
                        disabled={busy !== undefined}
                        onClick={() => { const revoke = props.onRevoke; if (revoke !== undefined) void run(`revoke:${profile.id}:${persona.id}`, () => revoke(profile.id, persona.id)) }}
                      >
                        ×
                      </button>
                    </Chip>
                  ))}
                  {props.personas.filter(persona => !profile.personas.some(allowed => allowed.id === persona.id)).map(persona => (
                    <Button
                      key={persona.id}
                      size="s"
                      variant="ghost"
                      disabled={busy !== undefined}
                      onClick={() => { const grant = props.onGrant; if (grant !== undefined) void run(`grant:${profile.id}:${persona.id}`, () => grant(profile.id, persona.id)) }}
                    >
                      {t('action.grant')} {persona.name}
                    </Button>
                  ))}
                </div>
                <div className={styles.actions}>
                  {personHolds
                    ? (props.onRelease === undefined ? null : <Button size="s" variant="secondary" disabled={busy !== undefined} onClick={() => { const release = props.onRelease; if (release !== undefined) void run(`release:${profile.id}`, () => release(profile.id)) }}>{t('action.release')}</Button>)
                    : (props.onTake === undefined ? null : <Button size="s" disabled={busy !== undefined} onClick={() => { const take = props.onTake; if (take !== undefined) void run(`take:${profile.id}`, () => take(profile.id)) }}>{t('action.take')}</Button>)}
                  {props.onRename !== undefined && <Button size="s" variant="ghost" disabled={busy !== undefined} onClick={() => { setRenaming({ id: profile.id, name: profile.name }) }}>{t('action.rename')}</Button>}
                  {profile.running && props.onClose !== undefined && <Button size="s" variant="ghost" disabled={busy !== undefined} onClick={() => { const close = props.onClose; if (close !== undefined) void run(`close:${profile.id}`, () => close(profile.id)) }}>{t('action.close')}</Button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {props.state !== 'loading' && props.onCreate !== undefined && (
        <form
          className={styles.create}
          onSubmit={(event) => { event.preventDefault(); create() }}
        >
          <Input
            label={t('field.name')}
            placeholder={t('field.namePlaceholder')}
            value={draft}
            onChange={(event) => { setDraft(event.target.value) }}
          />
          <Button type="submit" size="s" disabled={busy !== undefined}>{t('action.create')}</Button>
        </form>
      )}
      {error !== undefined && <p className={styles.error} role="alert">{error}</p>}
    </Card>
  )
}
