/** Labeled filter control using primitive field chrome (no raw unstyled select). */
import type { ReactNode, SelectHTMLAttributes } from 'react'
import fieldStyles from '../primitives/Field.module.css'

export interface KanbanFilterFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: ReactNode
}

export function KanbanFilterField({ label, id, className, children, ...rest }: KanbanFilterFieldProps): ReactNode {
  const controlClass = className === undefined ? fieldStyles.control : `${fieldStyles.control} ${className}`
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>{label}</label>
      <select id={id} className={controlClass} {...rest}>{children}</select>
    </div>
  )
}
