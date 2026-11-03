import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Small caps label above the title. */
  readonly eyebrow?: ReactNode
  readonly title?: ReactNode
  /** Right side of the header (buttons, chips). */
  readonly actions?: ReactNode
  /** Hover lift for clickable cards. */
  readonly interactive?: boolean
  /** Tone strip on the left edge. */
  readonly tone?: 'accent' | 'brand' | 'success' | 'danger'
  readonly padding?: 'none' | 's' | 'm' | 'l'
  /** Render as section/article (default div). */
  readonly as?: 'div' | 'section' | 'article' | 'li'
  /** Heading level for the title (default h3). */
  readonly titleAs?: 'h2' | 'h3'
}

/** Paper card glued on the page: plum outline + sticker shadow, radius l. */
export function Card({
  eyebrow,
  title,
  actions,
  interactive = false,
  tone,
  padding = 'm',
  as: Tag = 'div',
  titleAs: TitleTag = 'h3',
  className,
  children,
  ...rest
}: CardProps): ReactNode {
  const classes = [styles.card, styles[`pad-${padding}`], interactive ? styles.interactive : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  const hasHeader = eyebrow !== undefined || title !== undefined || actions !== undefined
  return (
    <Tag className={classes} data-tone={tone} {...rest}>
      {hasHeader && (
        <div className={styles.header}>
          <div className={styles.titles}>
            {eyebrow !== undefined && <p className={styles.eyebrow}>{eyebrow}</p>}
            {title !== undefined && <TitleTag className={styles.title}>{title}</TitleTag>}
          </div>
          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}

/** Small caps section label. */
export function Eyebrow({ children, className }: { readonly children: ReactNode; readonly className?: string }): ReactNode {
  return <p className={className === undefined ? styles.eyebrow : `${styles.eyebrow} ${className}`}>{children}</p>
}
