import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { UiIcon } from './icons.tsx'
import styles from './Field.module.css'

interface FieldChrome {
  /** Visible label (always shown). */
  readonly label: ReactNode
  /** Helper text under the field. */
  readonly hint?: ReactNode
  /** Error message; sets aria-invalid. */
  readonly error?: ReactNode
  /** Visually hide the label (still announced). Use only inside labelled toolbars. */
  readonly hideLabel?: boolean | undefined
}

function FieldFrame({
  id,
  label,
  hint,
  error,
  hideLabel,
  children,
}: FieldChrome & { readonly id: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className={styles.field} data-invalid={error !== undefined ? '' : undefined}>
      <label htmlFor={id} className={hideLabel === true ? 'persona-sr-only' : styles.label}>{label}</label>
      {children}
      {error !== undefined ? (
        <p id={`${id}-msg`} className={styles.error}>
          <UiIcon name="alert" size={16} />
          {error}
        </p>
      ) : hint !== undefined ? (
        <p id={`${id}-msg`} className={styles.hint}>{hint}</p>
      ) : null}
    </div>
  )
}

export type InputProps = FieldChrome & InputHTMLAttributes<HTMLInputElement>

/** Text input with label, hint and error (DESIGN-SYSTEM §5). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, hideLabel, id, className, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const describedBy = error !== undefined || hint !== undefined ? `${fieldId}-msg` : undefined
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <input
        ref={ref}
        id={fieldId}
        className={className === undefined ? styles.control : `${styles.control} ${className}`}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy}
        {...rest}
      />
    </FieldFrame>
  )
})

export type TextareaProps = FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>

/** Multi-line field; no native resize handle, grows by rows. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, hideLabel, id, className, rows = 4, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const describedBy = error !== undefined || hint !== undefined ? `${fieldId}-msg` : undefined
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={className === undefined ? `${styles.control} ${styles.textarea}` : `${styles.control} ${styles.textarea} ${className}`}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy}
        {...rest}
      />
    </FieldFrame>
  )
})
