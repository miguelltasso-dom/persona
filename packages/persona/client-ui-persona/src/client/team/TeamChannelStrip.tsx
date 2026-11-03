import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { BrandIcon, Button, Chip, TeamScene, UiIcon } from '../primitives/index.ts'
import type { ChannelPersonaMember } from './persona-work-state.ts'
import { WORK_STATUS_KEY } from './persona-work-state.ts'
import { PersonaTeamFigure } from './PersonaTeamFigure.tsx'
import styles from './TeamChannelStrip.module.css'

export interface TeamChannelStripProps extends PropsLocale<'persona.shell'> {
  readonly members: readonly ChannelPersonaMember[]
  /** Empty channel CTA ("Montar equipe"); hidden when not provided. */
  readonly onBuildTeam?: (() => void) | undefined
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
export function TeamChannelStrip({ t, members, onBuildTeam }: TeamChannelStripProps): ReactNode {
  const [ref, paused] = useAmbientPause()
  const bannerLight = ILLUSTRATIONS['team-banner-light']
  const bannerDark = ILLUSTRATIONS['team-banner-dark']

  return (
    <section
      ref={ref}
      className={styles.strip}
      aria-labelledby="persona-team-strip-title"
      data-ambient-paused={paused ? '' : undefined}
    >
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
          {members.length > 0 ? t('team.channelStripTitle') : t('team.emptyTitle')}
        </h2>
        {members.length > 0 ? (
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
          return (
            <li key={member.id} className={styles.member} data-state={member.state}>
              <PersonaTeamFigure member={member} breatheDelay={`${(index * 0.73) % 3.1}s`} />
              <span className={styles.tag}>
                <span className={styles.tagName}>{member.name}</span>
                <span className={styles.tagStatus}>
                  <span className={styles.statusDot} data-state={member.state} aria-hidden="true" />
                  {status}
                </span>
                <span className="persona-sr-only">{`, ${member.role}`}</span>
              </span>
            </li>
          )
        })}
        {members.length === 0 && [0.84, 1, 0.9].map((scale, index) => (
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
