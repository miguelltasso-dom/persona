import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { BrandIcon, Button, Chip, Skeleton, TeamScene, UiIcon, usePawCelebration } from '../primitives/index.ts'
import type { ChannelPersonaMember } from './persona-work-state.ts'
import { WORK_STATUS_KEY } from './persona-work-state.ts'
import { PersonaTeamFigure } from './PersonaTeamFigure.tsx'
import styles from './TeamChannelStrip.module.css'

export interface TeamChannelStripProps extends PropsLocale<'persona.shell'> {
  readonly members: readonly ChannelPersonaMember[]
  /** Empty channel CTA ("Montar equipe"); hidden when not provided. */
  readonly onBuildTeam?: (() => void) | undefined
  /** Os dados do host ainda não chegaram: skeleton no lugar do "Monte sua equipe" (nunca afirma equipe vazia). */
  readonly loading?: boolean | undefined
  readonly personaCardTrigger?: ((characterId: string) => {
    readonly onClick: (event: MouseEvent<HTMLElement>) => void
    readonly onPointerEnter: (event: MouseEvent<HTMLElement>) => void
  }) | undefined
}

/** Pause ambient loops when the tab is hidden or the banner scrolls away (UX-GUIDE §2.3). */
function useAmbientPause(): [RefObject<HTMLElement>, boolean] {
  const ref = useRef<HTMLElement>(null)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const node = ref.current
    let visible = true
    const update = (): void => { setPaused(document.hidden || !visible) }
    const onVisibility = (): void => { update() }
    document.addEventListener('visibilitychange', onVisibility)
    let observer: IntersectionObserver | undefined
    if (node !== null && typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        visible = entries.some(entry => entry.isIntersecting)
        update()
      })
      observer.observe(node)
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      observer?.disconnect()
    }
  }, [])
  return [ref, paused]
}

/** "Sua equipe neste canal" — Brush banner scene, full-body poses on one ground line, sticker name tags. */
export function TeamChannelStrip({ t, members, onBuildTeam, loading = false, personaCardTrigger }: TeamChannelStripProps): ReactNode {
  const showLoading = loading && members.length === 0
  const [ref, paused] = useAmbientPause()
  const paw = usePawCelebration()
  const celebratedArrival = useRef(false)
  const bannerLight = ILLUSTRATIONS['team-banner-light']
  const bannerDark = ILLUSTRATIONS['team-banner-dark']

  useEffect(() => {
    if (!members.some(member => member.arriving === true)) {
      celebratedArrival.current = false
      return
    }
    if (celebratedArrival.current) return
    celebratedArrival.current = true
    paw.celebrate()
  }, [members, paw.celebrate])

  return (
    <section
      ref={ref}
      className={styles.strip}
      aria-labelledby="persona-team-strip-title"
      data-ambient-paused={paused ? '' : undefined}
      aria-busy={showLoading ? 'true' : undefined}
      data-loading={showLoading ? '' : undefined}
    >
      {paw.node}
      <div className={styles.scene} aria-hidden="true">
        {bannerLight !== undefined ? (
          <>
            <img className={styles.bannerLight} src={bannerLight} alt="" />
            <img className={styles.bannerDark} src={bannerDark ?? bannerLight} alt="" />
          </>
        ) : (
          <TeamScene />
        )}
      </div>

      <div className={styles.intro}>
        <h2 id="persona-team-strip-title" className={styles.title}>
          {showLoading ? t('team.channelStripTitle') : members.length > 0 ? t('team.channelStripTitle') : t('team.emptyTitle')}
        </h2>
        {showLoading ? (
          <Skeleton width={96} height={26} shape="block" />
        ) : members.length > 0 ? (
          <Chip tone="plain" icon={<BrandIcon name="equipe" size={16} />}>
            {t('team.memberCount', { count: String(members.length) })}
          </Chip>
        ) : (
          <>
            <p className={styles.emptyBody}>{t('team.emptyBody')}</p>
            {onBuildTeam !== undefined && (
              <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={onBuildTeam}>
                {t('team.emptyAction')}
              </Button>
            )}
          </>
        )}
      </div>

      <ul className={styles.cast}>
        {members.map((member, index) => {
          const status = t(WORK_STATUS_KEY[member.state])
          const inDraft = member.state === 'working' && (member.draftFiles ?? 0) >= 1
          return (
            <li
              key={member.id}
              className={styles.member}
              data-state={member.state}
              data-arriving={member.arriving === true ? '' : undefined}
              style={{ '--arrive-delay': `${index * 180}ms` } as CSSProperties}
            >
              {member.arriving === true && <span className={styles.arrived} role="status">{t('team.arrived', { name: member.name })}</span>}
              {personaCardTrigger === undefined ? (
                <PersonaTeamFigure member={member} breatheDelay={`${(index * 0.73) % 3.1}s`} />
              ) : (
                <button
                  type="button"
                  className={styles.figureButton}
                  aria-label={member.name}
                  {...personaCardTrigger(member.id)}
                >
                  <PersonaTeamFigure member={member} breatheDelay={`${(index * 0.73) % 3.1}s`} />
                </button>
              )}
              <span className={styles.tag}>
                <span className={styles.tagName}>
                  {member.systemRoles?.includes('team_manager') === true && <UiIcon name="baton" size={13} strokeWidth={2.4} className={styles.gestorIcon} />}
                  {member.name}
                </span>
                {inDraft ? (
                  // SW-7: "Trabalhando num rascunho" — o ponto brand + o texto (nunca só cor); o leitor de tela ouve a frase inteira.
                  <span className={styles.tagStatus} data-draft="">
                    <span className={styles.statusDot} data-state="draft" aria-hidden="true" />
                    <span aria-hidden="true">{t('team.statusDraft')}</span>
                    <span className="persona-sr-only">{t('team.statusDraftSr')}</span>
                  </span>
                ) : (
                  <span className={styles.tagStatus}>
                    <span className={styles.statusDot} data-state={member.state} aria-hidden="true" />
                    {status}
                  </span>
                )}
                <span className="persona-sr-only">{`, ${member.role}`}</span>
              </span>
            </li>
          )
        })}
        {showLoading && [0.84, 1, 0.9].map(scale => (
          <li key={scale} className={styles.member} aria-hidden="true">
            <Skeleton width={Math.round(72 * scale)} height={Math.round(72 * scale)} shape="circle" />
            <Skeleton width={64} height={14} />
          </li>
        ))}
        {!showLoading && members.length === 0 && [0.84, 1, 0.9].map((scale, index) => (
          <li key={scale} className={styles.member}>
            <span className={styles.seat} style={{ '--seat-scale': scale, animationDelay: `${index * 0.6}s` } as CSSProperties} aria-hidden="true">
              <UiIcon name="plus" size={26} strokeWidth={2.4} />
            </span>
            <span className={`${styles.tag} ${styles.tagSeat}`}>{t('team.emptySeat')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
