/**
 * Peak-end moments (UX-GUIDE §1/§3, Muse): a one-shot paw burst for real milestones (review approved, sprint
 * closed, onboarding finished) and a milestone card (sprint summary / channel milestone message).
 * Never loops; reduced-motion shows a single static check badge; at most one burst every few seconds.
 */

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ACCENTS, AVATAR_96 } from '../assets/generated-imports.ts'
import { houseStampUrl } from '../decor/HouseDecor.tsx'
import { Avatar } from './Avatar.tsx'
import { Button } from './Button.tsx'
import { UiIcon } from './icons.tsx'
import styles from './Celebration.module.css'

const PAWS = 7
const COOLDOWN_MS = 2500

function Paw(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <ellipse cx="12" cy="15.5" rx="5.2" ry="4.2" />
      <circle cx="6.2" cy="9.4" r="2" />
      <circle cx="9.8" cy="6.4" r="2" />
      <circle cx="14.2" cy="6.4" r="2" />
      <circle cx="17.8" cy="9.4" r="2" />
    </svg>
  )
}

/** One paw burst centered in its (relative) parent; unmounts itself when done. */
export function PawBurst({ onDone }: { readonly onDone?: (() => void) | undefined }): ReactNode {
  useEffect(() => {
    const timer = setTimeout(() => { onDone?.() }, 1100)
    return () => { clearTimeout(timer) }
  }, [onDone])
  return (
    <span className={styles.burst} aria-hidden="true">
      <span className={styles.badge}><UiIcon name="check" size={18} strokeWidth={3} /></span>
      {Array.from({ length: PAWS }, (_, index) => (
        <span
          key={index}
          className={styles.paw}
          style={{ '--angle': `${(360 / PAWS) * index - 90}deg`, '--delay': `${index * 25}ms` } as CSSProperties}
        >
          <Paw />
        </span>
      ))}
    </span>
  )
}

/**
 * Trigger a paw burst from an event handler. Render `node` inside a `position: relative` wrapper.
 * Throttled (one burst per 2.5 s) so repeated approvals don't turn into noise.
 */
export function usePawCelebration(): { readonly node: ReactNode; readonly celebrate: () => void } {
  const [burstId, setBurstId] = useState<number | null>(null)
  const last = useRef(0)
  const celebrate = useCallback((): void => {
    const now = Date.now()
    if (now - last.current < COOLDOWN_MS) return
    last.current = now
    setBurstId(now)
  }, [])
  const done = useCallback((): void => { setBurstId(null) }, [])
  return { node: burstId === null ? null : <PawBurst key={burstId} onDone={done} />, celebrate }
}

export interface MilestoneStat {
  readonly label: string
  readonly value: number | string
  readonly tone?: 'neutral' | 'success' | 'warning'
}

export interface MilestoneContributor {
  readonly name: string
  readonly characterId?: string | undefined
  readonly count: number
}

export interface MilestoneCardProps {
  readonly illustration?: string | undefined
  readonly eyebrow?: ReactNode
  readonly title: ReactNode
  readonly body?: ReactNode
  readonly stats?: readonly MilestoneStat[]
  readonly contributors?: readonly MilestoneContributor[]
  /** "Quem fez o quê" */
  readonly contributorsLabel?: string
  readonly actions?: ReactNode
  /** Play the paw burst once when the card mounts (peak-end). */
  readonly celebrate?: boolean
}

/** Milestone card: illustration stage, big numbers, who-did-what avatars (sprint closed / channel milestone). */
export function MilestoneCard({
  illustration, eyebrow, title, body, stats = [], contributors = [], contributorsLabel, actions, celebrate = false,
}: MilestoneCardProps): ReactNode {
  const [burst, setBurst] = useState(celebrate)
  const portraits = AVATAR_96 as Readonly<Record<string, string>>
  return (
    <article className={styles.milestone}>
      {illustration !== undefined && (
        <div className={styles.stage} aria-hidden="true">
          <img src={illustration} alt="" />
          {burst && <PawBurst onDone={() => { setBurst(false) }} />}
        </div>
      )}
      <div className={styles.content}>
        {eyebrow !== undefined && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h3 className={styles.title}>{title}</h3>
        {body !== undefined && <p className={styles.body}>{body}</p>}
        {stats.length > 0 && (
          <dl className={styles.stats}>
            {stats.map(stat => (
              <div key={stat.label} className={styles.stat} data-tone={stat.tone ?? 'neutral'}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {contributors.length > 0 && (
          <div className={styles.contributors}>
            {contributorsLabel !== undefined && <p className={styles.contributorsLabel}>{contributorsLabel}</p>}
            <ul>
              {contributors.map(person => (
                <li key={person.name}>
                  <Avatar name={person.name} src={person.characterId !== undefined ? portraits[person.characterId] : undefined} shape="portrait" size={32} decorative />
                  <span className={styles.contributorName}>{person.name}</span>
                  <span className={styles.contributorCount}>{person.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {actions !== undefined && <div className={styles.actions}>{actions}</div>}
      </div>
    </article>
  )
}

export interface ApprovedStampProps {
  /** "Aprovado" — also the accessible name. */
  readonly label: string
  readonly size?: number
  /** Stamp-in once (the moment of approval); false for a card that was already approved. */
  readonly animate?: boolean
  /** A stable text of the card (its id): with the house ornaments on, it picks the drawn stamp ("feito", "boa!", "uau!"). */
  readonly seed?: string
  /** An action next to the stamp ("Ver em Skills"). Drawn only together with `onAction`: an action with no handler is not a button. */
  readonly actionLabel?: string
  readonly onAction?: () => void
}

/** Brush "aprovado" paw stamp: pressed onto a card once when the human approves (peak-end). */
export function ApprovedStamp({ label, size = 64, animate = true, seed, actionLabel, onAction }: ApprovedStampProps): ReactNode {
  const url = ACCENTS['stamp-aprovado']
  const fallbackSeed = useId()
  // BR-P4 #12 (behind persona.flag.houseDecor): the drawn stamp. The word in the art is decoration; the real text stays below.
  const drawn = houseStampUrl(seed ?? fallbackSeed)
  const stamp = (
    <span
      className={styles.stamp}
      data-animate={animate ? '' : undefined}
      data-drawn={drawn === undefined ? undefined : ''}
      style={{ '--stamp-size': `${size}px` } as CSSProperties}
      role="img"
      aria-label={label}
    >
      {drawn !== undefined && <img className={styles.stampArt} src={drawn} alt="" aria-hidden="true" />}
      {url !== undefined && <span className={styles.stampMark} style={{ '--stamp-url': `url("${url}")` } as CSSProperties} aria-hidden="true" />}
      <span className={styles.stampText} aria-hidden="true">{label}</span>
    </span>
  )
  if (actionLabel === undefined || onAction === undefined) return stamp
  // The stamp stays a read-only image; the action is a real button beside it, never inside it.
  return (
    <span className={styles.stampRow}>
      {stamp}
      <Button size="s" variant="ghost" onClick={onAction}>{actionLabel}</Button>
    </span>
  )
}
