import type { ReactNode } from 'react'
import styles from './Avatar.module.css'

export type AvatarSize = 24 | 32 | 40 | 48 | 56 | 96
export type AvatarPresence = 'online' | 'busy' | 'away' | 'offline'

export interface AvatarProps {
  /** Display name (used for initials and alt text). */
  readonly name: string
  /** Portrait URL (persona). Without it the avatar renders initials. */
  readonly src?: string | undefined
  readonly size?: AvatarSize
  /** Persona portraits are rounded squares; people are circles. */
  readonly shape?: 'portrait' | 'person'
  readonly presence?: AvatarPresence | undefined
  /** Decorative avatar next to a visible name. */
  readonly decorative?: boolean
  readonly className?: string | undefined
}

const TONES = 4

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

function toneOf(name: string): number {
  let hash = 0
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return hash % TONES
}

/** Outlined portrait (persona art) or initials disc (user), optional presence dot. */
export function Avatar({
  name,
  src,
  size = 40,
  shape = src === undefined ? 'person' : 'portrait',
  presence,
  decorative = false,
  className,
}: AvatarProps): ReactNode {
  const classes = [styles.avatar, styles[shape], className ?? ''].filter(Boolean).join(' ')
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': name }
  return (
    <span
      className={classes}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      data-tone={src === undefined ? toneOf(name) : undefined}
      {...a11y}
    >
      {src !== undefined ? (
        <img className={styles.img} src={src} alt="" draggable={false} />
      ) : (
        <span className={styles.initials}>{initialsOf(name)}</span>
      )}
      {presence !== undefined && <span className={styles.presence} data-presence={presence} />}
    </span>
  )
}
