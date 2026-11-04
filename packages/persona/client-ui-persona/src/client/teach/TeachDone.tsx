/**
 * "Ensinar a persona" (W2-10) — after "Salvar como skill candidata".
 * Three explicit, separate decisions, none of them automatic:
 *   1. turn it on for the persona (the host refuses tools the persona does not have),
 *   2. go back to candidate at any time (rollback),
 *   3. share beyond the persona (project / team) only with a written confirmation.
 */
import { useState, type ReactNode } from 'react'
import { Button, ChoiceCards, MilestoneCard } from '../primitives/index.ts'
import { teachFailureKind, type TeachShareScope } from './teach-model.ts'
import type { TeachT } from './TeachReview.tsx'
import styles from './TeachFlow.module.css'

export interface TeachDoneProps {
  readonly t: TeachT
  readonly personaName: string
  readonly skillTitle: string
  readonly art: string
  /** Turn the candidate on for the persona. Rejects when the host refuses (e.g. tools above the persona's). */
  readonly onActivate: () => Promise<void>
  /** Turn it back off (the host raises the version and keeps the skill as a candidate). */
  readonly onRevert: () => Promise<void>
  /** Share with the project or the team; always called with the person's explicit confirmation. */
  readonly onShare: (scope: Exclude<TeachShareScope, 'persona'>) => Promise<void>
  readonly onClose: () => void
}

type Busy = 'activate' | 'revert' | 'share' | null

export function TeachDone({ t, personaName, skillTitle, art, onActivate, onRevert, onShare, onClose }: TeachDoneProps): ReactNode {
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [scope, setScope] = useState<Exclude<TeachShareScope, 'persona'>>('project')
  const [confirmed, setConfirmed] = useState(false)
  const [sharedWith, setSharedWith] = useState<string | null>(null)

  const failure = (caught: unknown): string => {
    const kind = teachFailureKind(caught)
    return kind === 'tools' ? t('teach.error.tools', { name: personaName })
      : kind === 'forbidden' ? t('teach.error.forbidden')
        : t('teach.error.generic')
  }

  const run = (kind: Exclude<Busy, null>, action: () => Promise<void>, onOk: () => void): void => {
    if (busy !== null) return
    setBusy(kind)
    setError(null)
    void action().then(onOk).catch((caught: unknown) => { setError(failure(caught)) }).finally(() => { setBusy(null) })
  }

  const activate = (): void => {
    run('activate', onActivate, () => {
      setActive(true)
      setLive(t('teach.done.activeTitle', { skill: skillTitle, name: personaName }))
    })
  }
  const revert = (): void => {
    run('revert', onRevert, () => {
      setActive(false)
      setLive(t('teach.done.reverted', { name: personaName }))
    })
  }
  const share = (): void => {
    if (!confirmed) return
    run('share', () => onShare(scope), () => {
      const label = scope === 'team' ? t('teach.share.team') : t('teach.share.project')
      setSharedWith(label)
      setShareOpen(false)
      setConfirmed(false)
      setLive(t('teach.share.done', { scope: label.toLowerCase() }))
    })
  }

  const actions = (
    <div className={styles.doneActions}>
      {active ? (
        <Button variant="secondary" loading={busy === 'revert'} disabled={busy !== null} onClick={revert}>
          {busy === 'revert' ? t('teach.done.reverting') : t('teach.done.revert')}
        </Button>
      ) : (
        <Button variant="primary" loading={busy === 'activate'} disabled={busy !== null} onClick={activate}>
          {busy === 'activate' ? t('teach.done.activating') : t('teach.done.activate', { name: personaName })}
        </Button>
      )}
      {!shareOpen && sharedWith === null && (
        <Button variant="secondary" disabled={busy !== null} onClick={() => { setShareOpen(true) }}>{t('teach.done.share')}</Button>
      )}
      <Button variant="ghost" disabled={busy !== null} onClick={onClose}>{t('teach.done.close')}</Button>
    </div>
  )

  return (
    <div className={styles.doneWrap}>
      <MilestoneCard
        {...(art === '' ? {} : { illustration: art })}
        celebrate
        eyebrow={active ? t('teach.done.activeEyebrow') : t('teach.done.eyebrow')}
        title={active
          ? t('teach.done.activeTitle', { skill: skillTitle, name: personaName })
          : t('teach.done.title', { skill: skillTitle, name: personaName })}
        body={active ? t('teach.done.activeBody', { name: personaName }) : t('teach.done.body')}
        actions={actions}
      />
      {error !== null && <p className={styles.failure} role="alert">{error}</p>}
      {sharedWith !== null && <p className={styles.hint}>{t('teach.share.done', { scope: sharedWith.toLowerCase() })}</p>}
      {shareOpen && (
        <section className={styles.sharePanel} aria-label={t('teach.share.title')}>
          <h2 className={styles.shareTitle}>{t('teach.share.title')}</h2>
          <ChoiceCards
            legend={t('teach.share.legend')}
            hideLegend
            name="persona-teach-share-scope"
            value={scope}
            onChange={(next) => { setScope(next) }}
            options={[
              { id: 'project', title: t('teach.share.project'), body: t('teach.share.projectBody') },
              { id: 'team', title: t('teach.share.team'), body: t('teach.share.teamBody') },
            ]}
          />
          <label className={styles.confirm}>
            <input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked) }} />
            <span>{t('teach.share.confirm')}</span>
          </label>
          {!confirmed && <p id="persona-teach-share-hint" className={styles.hint}>{t('teach.share.confirmHint')}</p>}
          <div className={styles.doneActions}>
            <Button
              variant="primary"
              loading={busy === 'share'}
              disabled={!confirmed || busy !== null}
              {...(confirmed ? {} : { 'aria-describedby': 'persona-teach-share-hint' })}
              onClick={share}
            >
              {busy === 'share' ? t('teach.share.sharing') : t('teach.share.action')}
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => { setShareOpen(false); setConfirmed(false) }}>{t('teach.share.cancel')}</Button>
          </div>
        </section>
      )}
      <p className="persona-sr-only" role="status" aria-live="polite">{live}</p>
    </div>
  )
}
