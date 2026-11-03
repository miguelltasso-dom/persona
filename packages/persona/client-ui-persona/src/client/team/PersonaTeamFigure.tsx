import type { CSSProperties, ReactNode } from 'react'
import { OVERLAY_ICONS } from '../assets/generated-imports.ts'
import { poseLifeUrl, poseUrl } from '../assets/asset-url.ts'
import type { ChannelPersonaMember } from './persona-work-state.ts'
import { uiStateToPose, workStateOverlay } from './persona-work-state.ts'
import styles from './PersonaTeamFigure.module.css'

export interface PersonaTeamFigureProps {
  readonly member: ChannelPersonaMember
  readonly breatheDelay: string
}

/** Single roster figure: pose by state, blink/tail life, state overlay (UX-GUIDE §3). */
export function PersonaTeamFigure({ member, breatheDelay }: PersonaTeamFigureProps): ReactNode {
  const pose = uiStateToPose(member.state)
  const src = poseUrl(member.id, pose)
  const blink = poseLifeUrl(member.id, 'disponivel-blink')
  const tail = poseLifeUrl(member.id, 'disponivel-tail')
  const overlayKey = workStateOverlay(member.state)
  const overlaySrc = OVERLAY_ICONS[overlayKey as keyof typeof OVERLAY_ICONS]

  if (src === undefined) {
    return <span className={styles.silhouette} aria-hidden="true" />
  }

  const style = { '--persona-breathe-delay': breatheDelay } as CSSProperties

  return (
    <div className={styles.figure} style={style} data-state={member.state}>
      <div className={styles.poseStack}>
        <img className={styles.poseBase} src={src} alt="" aria-hidden="true" />
        {blink !== undefined && (
          <img className={styles.poseBlink} src={blink} alt="" aria-hidden="true" />
        )}
        {tail !== undefined && (
          <img className={styles.poseTail} src={tail} alt="" aria-hidden="true" />
        )}
      </div>
      <img className={styles.overlay} src={overlaySrc} alt="" aria-hidden="true" />
    </div>
  )
}
