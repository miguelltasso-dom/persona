/**
 * Hand-drawn accents (DESIGN-SYSTEM §5/§7): squiggle underline, paw trail, sparkle, rail hills and the
 * team-banner scene. Pure inline SVG painted with theme tokens; max two accents per screen.
 */

import type { CSSProperties, ReactNode } from 'react'
import { ACCENTS } from '../assets/generated-imports.ts'
import styles from './Accents.module.css'

/** Wobbly amber underline drawn under one title per screen. */
export function Squiggle({ className }: { readonly className?: string | undefined }): ReactNode {
  const merged = className === undefined ? styles.squiggle : `${styles.squiggle} ${className}`
  return (
    <svg className={merged} viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M2 7.5c9-4.5 15 3.5 24-.5s14-5 23-.8 15 4.4 24 .2 15-4.6 24-.6 14 3.7 21 .8" />
    </svg>
  )
}

function Paw({ x, y, rotate, scale = 1 }: { x: number; y: number; rotate: number; scale?: number }): ReactNode {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <ellipse cx="0" cy="3.2" rx="4.4" ry="3.4" />
      <circle cx="-4.6" cy="-2.6" r="1.7" />
      <circle cx="-1.6" cy="-5" r="1.7" />
      <circle cx="1.8" cy="-5" r="1.7" />
      <circle cx="4.7" cy="-2.6" r="1.7" />
    </g>
  )
}

/** Small trail of paw prints (empty states, celebrations). */
export function PawTrail({ className }: { readonly className?: string | undefined }): ReactNode {
  const merged = className === undefined ? styles.paws : `${styles.paws} ${className}`
  return (
    <svg className={merged} viewBox="0 0 96 40" aria-hidden="true" focusable="false">
      <Paw x={10} y={30} rotate={-20} scale={0.8} />
      <Paw x={32} y={18} rotate={10} scale={0.9} />
      <Paw x={56} y={26} rotate={-12} />
      <Paw x={82} y={12} rotate={16} scale={1.05} />
    </svg>
  )
}

/** Four-point sparkle ("novo", highlights). */
export function Sparkle({ className, size = 16 }: { readonly className?: string | undefined; readonly size?: number }): ReactNode {
  const merged = className === undefined ? styles.sparkle : `${styles.sparkle} ${className}`
  return (
    <svg className={merged} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.5c.7 5 2.5 6.8 7.5 7.5-5 .7-6.8 2.5-7.5 7.5-.7-5-2.5-6.8-7.5-7.5 5-.7 6.8-2.5 7.5-7.5Z" />
    </svg>
  )
}

/** Illustrated hills + leaves at the foot of the navigation rail (dirD-tela). */
export function RailHills({ className }: { readonly className?: string | undefined }): ReactNode {
  const merged = className === undefined ? styles.railHills : `${styles.railHills} ${className}`
  return (
    <svg className={merged} viewBox="0 0 272 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <path className={styles.hill3} d="M0 70c38-26 78-30 118-10 30 15 52 14 80-2 28-15 52-17 74-6v98H0Z" />
      <g className={styles.leaf}>
        <path d="M44 72c-2-14 2-26 10-34M54 38c-8 1-13 6-14 13 7 0 12-5 14-13ZM50 52c8-1 14 2 16 8-7 2-13-1-16-8ZM47 62c-7-3-13-1-16 4 6 3 12 2 16-4Z" />
        <path d="M222 78c1-12 6-21 13-27M235 51c-7-1-12 3-14 9 6 1 11-2 14-9ZM229 63c7 0 12 4 13 9-6 1-11-2-13-9Z" />
      </g>
      <path className={styles.hill2} d="M0 98c30-18 66-22 104-8 34 13 64 10 96-6 26-13 50-14 72-4v70H0Z" />
      <path className={styles.hill1} d="M0 124c40-16 86-18 128-6 40 11 82 8 144-12v44H0Z" />
      <g className={styles.flower}>
        <circle cx="168" cy="96" r="3" />
        <circle cx="186" cy="104" r="2.2" />
        <circle cx="34" cy="110" r="2.4" />
      </g>
    </svg>
  )
}

/** Team banner backdrop (sky → lavender hills → ground) used until Brush's banner art lands. */
export function TeamScene({ className }: { readonly className?: string | undefined }): ReactNode {
  const merged = className === undefined ? styles.scene : `${styles.scene} ${className}`
  return (
    <svg className={merged} viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="persona-scene-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--persona-scene-sky-2)" />
          <stop offset="1" stopColor="var(--persona-scene-sky)" />
        </linearGradient>
      </defs>
      <rect width="1200" height="300" fill="url(#persona-scene-sky)" />
      <g className={styles.clouds}>
        <path d="M120 78c6-14 26-16 34-4 10-8 26-2 26 10H112c-2-4 2-7 8-6Z" />
        <path d="M930 56c6-12 22-14 30-4 9-7 23-2 23 9h-60c-2-3 1-6 7-5Z" />
        <path d="M1040 110c5-10 18-11 24-3 7-5 18-1 18 7h-47c-1-3 1-5 5-4Z" />
      </g>
      <path className={styles.hillFar} d="M0 190c90-60 190-74 300-40 80 25 150 18 240-14 110-38 210-30 320 10 110 40 220 30 340-14v168H0Z" />
      <path className={styles.hillNear} d="M0 232c120-42 250-46 380-14 110 27 220 22 340-6 140-32 300-26 480 18v70H0Z" />
      <path className={styles.ground} d="M0 262c200-14 400-18 600-14s400 6 600 14v38H0Z" />
      <g className={styles.grass}>
        <path d="M70 262c2-8 6-12 10-14M78 262c0-6-2-10-6-13M960 260c2-8 6-12 10-14M968 260c0-6-2-10-6-13M1130 264c2-7 5-11 9-13" />
      </g>
    </svg>
  )
}

export interface AccentProps {
  /** Brush accent id (persona-assets/accents): squiggle-1..3, paw-prints, sparkle-1..2, leaf-1..2, doodle-arrow, doodle-circle, stars-cluster. */
  readonly name: string
  readonly width: number
  readonly height: number
  readonly className?: string | undefined
}

/** Brush hand-drawn accent painted with currentColor through a mask (max two per screen). */
export function Accent({ name, width, height, className }: AccentProps): ReactNode {
  const url = ACCENTS[name]
  if (url === undefined) return null
  const style = { width, height, '--persona-accent-url': `url("${url}")` } as CSSProperties
  const merged = className === undefined ? styles.accent : `${styles.accent} ${className}`
  return <span className={merged} style={style} aria-hidden="true" />
}
