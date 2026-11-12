import type { ReactNode } from 'react'
import type { PersonaStateName } from '../theme/tokens.ts'
import styles from './Avatar.module.css'

export type AvatarSize = 24 | 28 | 32 | 36 | 40 | 44 | 48 | 56 | 96
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
  /**
   * What a PERSONA is doing, in the one state vocabulary (DESIGN-01-MUSE §0.2; `team/persona-state.ts` derives it). Draws the
   * state dot with the `--persona-state-*` color and takes the place of `presence`, which stays for people.
   */
  readonly state?: PersonaStateName | undefined
  /** Decorative avatar next to a visible name. */
  readonly decorative?: boolean
  /**
   * Muse: a system actor with no face ("O bibliotecário" with no persona in the role): an icon on a calm wash disc
   * instead of initials, which read as a person who does not exist. Ignored when `src` is given.
   */
  readonly icon?: ReactNode
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
  state,
  decorative = false,
  className,
  icon,
}: AvatarProps): ReactNode {
  const classes = [styles.avatar, styles[shape], className ?? ''].filter(Boolean).join(' ')
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': name }
  return (
    <span
      className={classes}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      data-tone={src === undefined && icon === undefined ? toneOf(name) : undefined}
      data-icon={src === undefined && icon !== undefined ? '' : undefined}
      {...a11y}
    >
      {src !== undefined ? (
        <img className={styles.img} src={src} alt="" draggable={false} />
      ) : icon !== undefined ? (
        <span className={styles.icon} aria-hidden="true">{icon}</span>
      ) : (
        <span className={styles.initials}>{initialsOf(name)}</span>
      )}
      {state !== undefined
        ? <span className={styles.presence} data-persona-state={state} />
        : presence !== undefined && <span className={styles.presence} data-presence={presence} />}
    </span>
  )
}
