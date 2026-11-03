import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 's' | 'm' | 'l'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  /** Leading icon (UiIcon / BrandIcon). */
  readonly icon?: ReactNode
  /** Trailing icon. */
  readonly iconEnd?: ReactNode
  /** Busy: keeps width, shows paw dots, sets aria-busy. */
  readonly loading?: boolean
  /** Full width. */
  readonly block?: boolean
}

function cx(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Sticker button (DESIGN-SYSTEM §5): plum outline + solid press shadow that sinks on click. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'm', icon, iconEnd, loading = false, block = false, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cx(styles.button, styles[variant], styles[size], block && styles.block, loading && styles.loading, className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon !== undefined && <span className={styles.icon}>{icon}</span>}
      {children !== undefined && <span className={styles.label}>{children}</span>}
      {iconEnd !== undefined && <span className={styles.icon}>{iconEnd}</span>}
      {loading && (
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      )}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name (required: icon-only control). */
  readonly label: string
  readonly icon: ReactNode
  readonly variant?: 'ghost' | 'secondary' | 'primary'
  readonly size?: 's' | 'm'
  /** Small amber dot (unread / attention). */
  readonly badge?: boolean
}

/** 40×40 icon-only control; ghost by default. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'm', badge = false, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cx(styles.button, styles.iconOnly, styles[variant], size === 's' ? styles.iconS : styles.iconM, className)}
      {...rest}
    >
      {icon}
      {badge && <span className={styles.badge} aria-hidden="true" />}
    </button>
  )
})
