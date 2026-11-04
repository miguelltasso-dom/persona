import type { HTMLAttributes, ReactNode } from 'react'
import { BrandIcon, type BrandIconName } from './icons.tsx'
import styles from './Screen.module.css'

export interface ScreenProps extends HTMLAttributes<HTMLDivElement> {
  /** Max content width: reading (880), default (1180) or full. */
  readonly width?: 'reading' | 'default' | 'full'
}

/** Scrollable main-panel container on paper (DESIGN-SYSTEM §6). */
export function Screen({ width = 'default', className, children, ...rest }: ScreenProps): ReactNode {
  const merged = [styles.screen, className ?? ''].filter(Boolean).join(' ')
  return (
    // tabIndex 0: the screen scrolls, so it must be reachable by keyboard even when it holds nothing focusable
    // (axe scrollable-region-focusable on Uso e limites). The focus ring is inset so it never clips.
    <div className={merged} data-persona-root="" tabIndex={0} {...rest}>
      <div className={styles.inner} data-width={width}>{children}</div>
    </div>
  )
}

export interface ScreenHeaderProps {
  /** Brush nav icon shown in the outlined badge. */
  readonly icon?: BrandIconName | undefined
  readonly eyebrow?: ReactNode
  readonly title: ReactNode
  readonly subtitle?: ReactNode
  /** Right side: at most ONE primary (amber) button + ghosts. */
  readonly actions?: ReactNode
  /** Optional id for the h1 (aria-labelledby). */
  readonly titleId?: string | undefined
}

/** Screen header: icon badge + eyebrow + Fredoka h1 + subtitle + actions. */
export function ScreenHeader({ icon, eyebrow, title, subtitle, actions, titleId }: ScreenHeaderProps): ReactNode {
  return (
    <header className={styles.header}>
      {icon !== undefined && (
        <span className={styles.badge} aria-hidden="true"><BrandIcon name={icon} size={22} /></span>
      )}
      <div className={styles.titles}>
        {eyebrow !== undefined && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.title} id={titleId}>{title}</h1>
        {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions !== undefined && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
