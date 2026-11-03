/** Isolated preview chrome (not the production shell slot). */

import type { ReactNode } from 'react'
import styles from './PreviewFrame.module.css'

export interface PreviewFrameProps {
  /** Brand label from locale dictionary. */
  brandLabel: string
  children: ReactNode
}

/** Two-column preview layout aligned with direction D rail + surface. */
export function PreviewFrame({ brandLabel, children }: PreviewFrameProps): ReactNode {
  return (
    <div className={styles.frame} data-persona-preview="">
      <aside className={styles.rail} aria-label={brandLabel}>
        <div className={styles.brand}>{brandLabel}</div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
