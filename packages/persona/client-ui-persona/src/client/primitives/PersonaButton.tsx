import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from './Button.tsx'

export type PersonaButtonVariant = 'primary' | 'secondary'

export interface PersonaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PersonaButtonVariant
  children: ReactNode
}

/** Legacy alias of {@link Button} (kept for existing screens; prefer `Button`). */
export function PersonaButton({ variant = 'primary', children, ...rest }: PersonaButtonProps): ReactNode {
  return <Button variant={variant} {...rest}>{children}</Button>
}
