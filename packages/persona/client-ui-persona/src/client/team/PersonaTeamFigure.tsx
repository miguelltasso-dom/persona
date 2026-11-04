import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  // Blink/tail frames belong to the standing pose only; layering them over another pose shows two animals.
  const blink = pose === 'disponivel' ? poseLifeUrl(member.id, 'disponivel-blink') : undefined
  const tail = pose === 'disponivel' ? poseLifeUrl(member.id, 'disponivel-tail') : undefined
  const overlayKey = workStateOverlay(member.state)
  const overlaySrc = OVERLAY_ICONS[overlayKey as keyof typeof OVERLAY_ICONS]

  // UX-GUIDE §3 "Troca de estado: crossfade de pose 220 ms + pequeno pulo 6 px na entrada" (real state changes only;
  // nothing on first mount). The leaving pose keeps its own size while it fades.
  const previous = useRef<{ readonly src: string | undefined; readonly pose: string }>({ src, pose })
  const [leaving, setLeaving] = useState<{ readonly src: string; readonly pose: string; readonly key: number } | null>(null)
  useEffect(() => {
    const before = previous.current
    previous.current = { src, pose }
    if (before.src === undefined || before.src === src) return undefined
    setLeaving({ src: before.src, pose: before.pose, key: Date.now() })
    const timer = setTimeout(() => { setLeaving(null) }, 260)
    return () => { clearTimeout(timer) }
  }, [src, pose])

  if (src === undefined) {
    return <span className={styles.silhouette} aria-hidden="true" />
  }

  const style = { '--persona-breathe-delay': breatheDelay } as CSSProperties

  return (
    <div className={styles.figure} style={style} data-state={member.state} data-character={member.id} data-pose={pose}>
      <div className={styles.poseStack}>
        <img key={src} className={leaving === null ? styles.poseBase : `${styles.poseBase} ${styles.poseEntering}`} src={src} alt="" aria-hidden="true" />
        {leaving !== null && (
          <img
            key={leaving.key}
            className={styles.poseLeaving}
            src={leaving.src}
            alt=""
            aria-hidden="true"
            style={{ '--pose-k': leaving.pose === 'descansando' ? 0.56 : 1 } as CSSProperties}
          />
        )}
        {blink !== undefined && (
          <img className={styles.poseBlink} src={blink} alt="" aria-hidden="true" />
        )}
        {tail !== undefined && (
          <img className={styles.poseTail} src={tail} alt="" aria-hidden="true" />
        )}
        <img className={styles.overlay} src={overlaySrc} alt="" aria-hidden="true" />
      </div>
    </div>
  )
}
