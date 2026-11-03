import type { ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import styles from './StaggerEntrance.module.css'

export interface StaggerEntranceProps {
  /** Stagger index (0-based); multiplied by 80ms when motion allowed. */
  index: number
  children: ReactNode
}

/** Staggered enter (UX-GUIDE onboarding: 80ms between teammates). */
export function StaggerEntrance({ index, children }: StaggerEntranceProps): ReactNode {
  const motion = usePersonaMotion({
    preset: 'base',
    fromOpacity: 0,
    fromTranslateY: 10,
    delayMs: index * 80,
  })
  return (
    <div className={styles.item} ref={motion.ref} style={motion.style}>
      {children}
    </div>
  )
}
