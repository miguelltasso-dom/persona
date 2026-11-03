import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './PersonaButton.module.css'

export type PersonaButtonVariant = 'primary' | 'secondary'

export interface PersonaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PersonaButtonVariant
  children: ReactNode
}

/** Direction-D button (âmbar primary). */
export function PersonaButton({ variant = 'primary', className, children, ...rest }: PersonaButtonProps): ReactNode {
  const variantClass = variant === 'primary' ? styles.primary : styles.secondary
  const merged = className === undefined ? variantClass : `${variantClass} ${className}`
  return (
    <button type="button" className={merged} {...rest}>
      {children}
    </button>
  )
}
