import { useEffect, useState, type ReactNode } from 'react'
import { poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import { BrandIcon, Button, Card, Chip, EmptyState, Modal } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './SkillsPanel.module.css'
import { PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { SkillRecord } from './mock-data.ts'
import { pt as defaultDict } from '../locale/skills/locales.ts'

/** No skills: the real screen never invents any (IV-8). Sample skills live in `mock-data.ts` for tests and the gallery only. */
const NO_SKILLS: readonly SkillRecord[] = []

export type SkillsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

type RowAction = 'activate' | 'rollback' | 'share'

/** What a row action resolves with: the skill as the host now has it (shown at once, no reload flicker). */
export type SkillActionHandler = (skill: SkillRecord) => Promise<SkillRecord | undefined | void>

export interface SkillsPanelProps {
  readonly dict?: LocaleDict
  readonly skills?: readonly SkillRecord[]
  readonly initialState?: SkillsSurfaceState
  /** Whose skills these are: names the empty state ("{persona} ainda não tem skills") and picks her `pensando` pose. */
  readonly personaName?: string | undefined
  /** Gallery id of the persona's animal (e.g. `nina`), for the pose in the empty state. */
  readonly personaCharacter?: string | undefined
  /** "Ensinar a {persona}": the way to get a first skill. No handler, no button (no dead controls). */
  readonly onTeach?: (() => void) | undefined
  /**
   * Row actions. A button exists only when its handler does (no dead controls). Handlers may reject: the row then says
   * so in words and keeps the skill as it was.
   * - `onActivate`: turn a taught candidate on. `onRollback`: take it back (taught → candidate, others → previous version).
   * - `onShare`: share with the team (always after a written confirmation here). `onReview`: open where proposals are decided.
   */
  readonly onActivate?: SkillActionHandler | undefined
  readonly onRollback?: SkillActionHandler | undefined
  readonly onShare?: SkillActionHandler | undefined
  readonly onReview?: ((skill: SkillRecord) => void) | undefined
}

export function SkillsPanel({
  dict = defaultDict,
  skills = NO_SKILLS,
  initialState = 'ready',
  personaName,
  personaCharacter,
  onTeach,
  onActivate,
  onRollback,
  onShare,
  onReview,
}: SkillsPanelProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [busy, setBusy] = useState<{ readonly id: string; readonly action: RowAction } | null>(null)
  const [failed, setFailed] = useState<{ readonly id: string; readonly text: string } | null>(null)
  const [live, setLive] = useState('')
  const [sharing, setSharing] = useState<SkillRecord | null>(null)
  // Skills as the host reported them after an action of this session; dropped when the list is reloaded.
  const [applied, setApplied] = useState<Readonly<Record<string, SkillRecord>>>({})
  useEffect(() => { setApplied({}) }, [skills])

  const run = (skill: SkillRecord, action: RowAction, handler: SkillActionHandler, done: string): void => {
    if (busy !== null) return
    setBusy({ id: skill.id, action })
    setFailed(null)
    void handler(skill).then((next) => {
      if (next !== undefined) setApplied(current => ({ ...current, [skill.id]: next }))
      setLive(done)
    }).catch(() => {
      setFailed({ id: skill.id, text: t(`error.${action}`, { name: skill.name }) })
    }).finally(() => { setBusy(null) })
  }

  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
  if (initialState === 'empty' || skills.length === 0) {
    const name = personaName?.trim() ?? ''
    const pose = personaCharacter === undefined ? undefined : poseUrl(personaCharacter as PersonaCharacterId, 'disponivel')
    return (
      <EmptyState
        {...(pose === undefined ? {} : { illustration: pose })}
        title={name.length > 0 ? t('empty.titleFor', { persona: name }) : t('empty.title')}
        body={name.length > 0 ? t('empty.bodyFor', { persona: name }) : t('empty.hint')}
        {...(onTeach === undefined || name.length === 0
          ? {}
          : {
            action: (
              <Button variant="primary" icon={<BrandIcon name="ensinar" size={18} />} onClick={onTeach}>
                {t('empty.teach', { persona: name })}
              </Button>
            ),
          })}
      />
    )
  }

  return (
    <section aria-labelledby="skills-heading">
      <h2 id="skills-heading" className={styles.sectionTitle}>{t('title')}</h2>
      <p className={styles.sectionSubtitle}>{t('subtitle')}</p>
      <ul className={styles.list}>
        {skills.map((listed) => {
          const skill = applied[listed.id] ?? listed
          const taught = skill.origin === 'taught'
          const mine = busy?.id === skill.id ? busy.action : null
          const canActivate = skill.status === 'candidate' && taught && onActivate !== undefined
          const canReview = skill.status === 'candidate' && !taught && onReview !== undefined
          // A plain skill can only go back to an earlier version when there is one.
          const canRollback = skill.status === 'active' && onRollback !== undefined && (taught || skill.version > 1)
          const canShare = !skill.sharedWithTeam && taught && onShare !== undefined
          return (
            <li key={skill.id}>
              <Card padding="m">
                <div className={styles.headRow}>
                  <span className={styles.skillName}>{skill.name}</span>
                  <Chip tone="accent" size="s">{t(`status.${skill.status}`)}</Chip>
                  <Chip tone="neutral" size="s">{t('field.version', { version: skill.version })}</Chip>
                  {skill.sharedWithTeam && <Chip tone="brand" size="s">{t('status.shared')}</Chip>}
                </div>
                {skill.rating !== undefined && (
                  <p className={styles.meta}>{t('field.rating', { rating: skill.rating })}</p>
                )}
                {skill.proposer !== undefined && (
                  <p className={styles.meta}>{t('proposal.fromAgent', { name: skill.proposer })}</p>
                )}
                {(canActivate || canReview || canRollback || canShare) && (
                  <div className={styles.actions}>
                    {canActivate && (
                      <Button
                        variant="primary"
                        size="s"
                        loading={mine === 'activate'}
                        disabled={busy !== null}
                        onClick={() => { run(skill, 'activate', onActivate, t('live.activated', { name: skill.name })) }}
                      >
                        {mine === 'activate' ? t('action.activating') : t('action.activate')}
                      </Button>
                    )}
                    {canReview && (
                      <Button variant="primary" size="s" onClick={() => { onReview(skill) }}>{t('action.reviewProposal')}</Button>
                    )}
                    {canRollback && (
                      <Button
                        variant="secondary"
                        size="s"
                        loading={mine === 'rollback'}
                        disabled={busy !== null}
                        onClick={() => { run(skill, 'rollback', onRollback, t(taught ? 'live.backToCandidate' : 'live.rolledBack', { name: skill.name })) }}
                      >
                        {mine === 'rollback' ? t('action.rollingBack') : t(taught ? 'action.backToCandidate' : 'action.rollback')}
                      </Button>
                    )}
                    {canShare && (
                      <Button variant="secondary" size="s" disabled={busy !== null} onClick={() => { setSharing(skill) }}>{t('action.shareTeam')}</Button>
                    )}
                  </div>
                )}
                {failed?.id === skill.id && <p className={styles.failure} role="alert">{failed.text}</p>}
              </Card>
            </li>
          )
        })}
      </ul>
      <p className="persona-sr-only" aria-live="polite">{live}</p>
      {sharing !== null && onShare !== undefined && (
        <Modal
          open
          size="m"
          title={t('share.title', { name: sharing.name })}
          closeLabel={t('share.close')}
          onClose={() => { setSharing(null) }}
          footer={(
            <>
              <Button variant="ghost" onClick={() => { setSharing(null) }}>{t('share.cancel')}</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const skill = sharing
                  setSharing(null)
                  run(skill, 'share', onShare, t('live.shared', { name: skill.name }))
                }}
              >
                {t('share.confirm')}
              </Button>
            </>
          )}
        >
          <p>{t('share.body')}</p>
        </Modal>
      )}
    </section>
  )
}
