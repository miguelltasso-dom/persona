import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { teamBannerDark, teamBannerLight } from '../assets/generated-imports.ts'
import type { ChannelPersonaMember } from './persona-work-state.ts'
import { WORK_STATUS_KEY } from './persona-work-state.ts'
import { PersonaTeamFigure } from './PersonaTeamFigure.tsx'
import styles from './TeamChannelStrip.module.css'

export interface TeamChannelStripProps extends PropsLocale<'persona.shell'> {
  readonly members: readonly ChannelPersonaMember[]
}

/** Full-body team banner (dirD): lilac scene, large poses on shared ground line. */
export function TeamChannelStrip({ t, members }: TeamChannelStripProps): ReactNode {
  const delays = useMemo(() => members.map((_, index) => `${index * 0.35}s`), [members])
  const hasBanner = teamBannerLight !== undefined || teamBannerDark !== undefined
  const sceneStyle = hasBanner
    ? ({
      ...(teamBannerLight !== undefined ? { '--team-banner-url-light': `url(${teamBannerLight})` } : {}),
      ...(teamBannerDark !== undefined ? { '--team-banner-url-dark': `url(${teamBannerDark})` } : {}),
    } as CSSProperties)
    : undefined

  return (
    <section className={styles.strip} aria-label={t('team.channelStripTitle')}>
      <div className={styles.scene} style={sceneStyle} data-has-banner={hasBanner ? '' : undefined}>
        <div className={styles.headerRow}>
          <h2 className={styles.title}>{t('team.channelStripTitle')}</h2>
          <span className={styles.memberChip}>
            {t('team.memberCount', { count: String(members.length) })}
          </span>
        </div>
        <div className={styles.stage}>
          <ul className={styles.list}>
            {members.map((member, index) => (
              <li
                key={member.id}
                className={styles.member}
                style={{ '--persona-breathe-delay': delays[index] } as CSSProperties}
              >
                <PersonaTeamFigure member={member} breatheDelay={delays[index] ?? '0s'} />
                <span className={styles.meta}>
                  <span className={styles.name}>{member.name}</span>
                  <span className={styles.role}>{member.role}</span>
                  <span className={styles.status}>
                    <span className={styles.statusIcon} data-state={member.state} aria-hidden="true" />
                    {t(WORK_STATUS_KEY[member.state])}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.groundLine} aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
