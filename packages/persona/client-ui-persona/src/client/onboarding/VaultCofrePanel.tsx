import type { ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import styles from './OnboardingWizard.module.css'

export interface VaultCofrePanelProps {
  readonly badgeLabel: string
  readonly activeLabel: string
  readonly hasContent: boolean
}

/** Cofre da empresa visual with enter motion when content exists. */
export function VaultCofrePanel({ badgeLabel, activeLabel, hasContent }: VaultCofrePanelProps): ReactNode {
  const motion = usePersonaMotion({ preset: 'fast', fromOpacity: 0, fromTranslateY: 4 })
  return (
    <div className={hasContent ? `${styles.vaultWrap} ${styles.vaultWrapActive}` : styles.vaultWrap} ref={motion.ref} style={motion.style}>
      <span className={styles.badge}>{badgeLabel}</span>
      {hasContent && (
        <p className={styles.vaultActive} role="status">
          {activeLabel}
        </p>
      )}
    </div>
  )
}
