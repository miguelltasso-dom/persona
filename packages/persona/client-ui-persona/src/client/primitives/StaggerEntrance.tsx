import type { ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import styles from './StaggerEntrance.module.css'

export interface StaggerEntranceProps {
  /** Stagger index (0-based); multiplied by 80ms when motion allowed. */
  index: number
  children: ReactNode
  /** Element to render. Use 'li' inside a <ul>/<ol>: a div wrapper between them breaks list semantics (axe list/listitem). */
  as?: 'div' | 'li'
  className?: string | undefined
}

/** Staggered enter (UX-GUIDE onboarding: 80ms between teammates). */
export function StaggerEntrance({ index, children, as = 'div', className }: StaggerEntranceProps): ReactNode {
  const motion = usePersonaMotion({
    preset: 'base',
    fromOpacity: 0,
    fromTranslateY: 10,
    delayMs: index * 80,
  })
  const Tag = as
  const cls = className === undefined ? styles.item : `${styles.item} ${className}`
  return (
    <Tag className={cls} ref={motion.ref} style={motion.style}>
      {children}
    </Tag>
  )
}
