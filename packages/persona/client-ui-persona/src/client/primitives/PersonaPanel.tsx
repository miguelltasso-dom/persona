import type { HTMLAttributes, ReactNode } from 'react'
import styles from './PersonaPanel.module.css'

export interface PersonaPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** Elevated surface card using Persona tokens. */
export function PersonaPanel({ children, className, ...rest }: PersonaPanelProps): ReactNode {
  const merged = className === undefined ? styles.panel : `${styles.panel} ${className}`
  return (
    <div className={merged} {...rest}>
      {children}
    </div>
  )
}

/** Secondary hint text. */
export function PersonaMuted({ children, className, ...rest }: HTMLAttributes<HTMLParagraphElement>): ReactNode {
  const merged = className === undefined ? styles.muted : `${styles.muted} ${className}`
  return (
    <p className={merged} {...rest}>
      {children}
    </p>
  )
}
