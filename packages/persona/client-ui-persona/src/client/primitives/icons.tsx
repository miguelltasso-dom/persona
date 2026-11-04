/**
 * Persona icons (DESIGN-SYSTEM §5). Brand nav icons come from Brush (persona-assets/icons/nav) and are
 * painted through a CSS mask so they inherit currentColor; UI glyphs below share the same 1.75 round stroke.
 */

import type { CSSProperties, ReactNode } from 'react'
import { COLUMN_ICONS, FLOW_ICONS, NAV_ICONS, SECTOR_ICONS } from '../assets/generated-imports.ts'
import styles from './Icon.module.css'

export type BrandIconName = keyof typeof NAV_ICONS

export interface BrandIconProps {
  readonly name: BrandIconName
  /** Pixel size (default 20). */
  readonly size?: number
  readonly className?: string | undefined
}

/** Brush nav icon tinted with currentColor. */
export function BrandIcon({ name, size = 20, className }: BrandIconProps): ReactNode {
  const style = {
    '--persona-icon-url': `url("${NAV_ICONS[name]}")`,
    '--persona-icon-size': `${size}px`,
  } as CSSProperties
  const merged = className === undefined ? styles.brand : `${styles.brand} ${className}`
  return <span className={merged} style={style} aria-hidden="true" />
}

export type SectorId = 'vendas' | 'suporte' | 'produto' | 'engenharia' | 'marketing' | 'financeiro' | 'operacoes' | 'pessoas' | 'admin' | 'conteudo' | 'dados' | 'juridico'

/** Sector icon (Brush `icons/sectors`, GOVERNANCE-SPEC) tinted with currentColor; unknown ids render nothing. */
export function SectorIcon({ sector, size = 20, className }: { readonly sector: string; readonly size?: number; readonly className?: string | undefined }): ReactNode {
  const url = SECTOR_ICONS[sector]
  if (url === undefined) return null
  const style = { '--persona-icon-url': `url("${url}")`, '--persona-icon-size': `${size}px` } as CSSProperties
  return <span className={className === undefined ? styles.brand : `${styles.brand} ${className}`} style={style} aria-hidden="true" />
}

export type FlowModelId = 'contratacao' | 'site' | 'software' | 'marketing' | 'atendimento' | 'simples' | 'branco'

/** Workflow-model icon (Brush `icons/flows`, BOARDS-SPEC §6) tinted with currentColor. */
export function FlowIcon({ model, size = 20, className }: { readonly model: FlowModelId; readonly size?: number; readonly className?: string | undefined }): ReactNode {
  const url = FLOW_ICONS[`flow-${model}`]
  if (url === undefined) return null
  const style = { '--persona-icon-url': `url("${url}")`, '--persona-icon-size': `${size}px` } as CSSProperties
  return <span className={className === undefined ? styles.brand : `${styles.brand} ${className}`} style={style} aria-hidden="true" />
}

const UI_PATHS = {
  send: <><path d="M4.5 11.6 19.2 4.8c.5-.2 1 .3.8.8L13.4 20.3c-.2.5-.9.5-1.1 0l-2.1-5.6a1 1 0 0 0-.6-.6l-5.1-1.5c-.5-.2-.5-.8 0-1Z" /><path d="m10 14.2 4.6-4.6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="m4.5 17.5 5-4.5 3.5 3 2.5-2 4 3.5" /></>,
  attach: <path d="M19.5 11.3 12 18.8a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3.1 3.1 0 0 1 4.4 4.4l-7.7 7.7a1.5 1.5 0 0 1-2.2-2.2l7-7" />,
  smile: <><circle cx="12" cy="12" r="8.5" /><path d="M8.6 14.2a4.3 4.3 0 0 0 6.8 0" /><path d="M9.2 9.6v.6M14.8 9.6v.6" /></>,
  bell: <><path d="M6.2 16.5v-5a5.8 5.8 0 0 1 11.6 0v5l1.4 1.8H4.8l1.4-1.8Z" /><path d="M10 20.3a2.3 2.3 0 0 0 4 0" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.4v.5" /><path d="M12 16.6v.4" /></>,
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  chevronRight: <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  baton: <><path d="M5 19.5 15.5 9" /><circle cx="5.6" cy="18.9" r="1.6" /><path d="M18 3.5v3M16.5 5h3M20 9.5v2M19 10.5h2" /></>,
  minus: <path d="M5.5 12h13" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6.8A2.3 2.3 0 0 0 13.2 4.5H6.8a2.3 2.3 0 0 0-2.3 2.3v6.4a2.3 2.3 0 0 0 2.3 2.3h1.7" /></>,
  lock: <><rect x="5.5" y="11" width="13" height="9.5" rx="2.5" /><path d="M8 11V8.5a4 4 0 0 1 8 0V11" /></>,
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  at: <><circle cx="12" cy="12" r="3.6" /><path d="M15.6 12v1.4a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.4 7" /></>,
  arrowRight: <path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5" />,
  alert: <><path d="M10.4 4.6 3.3 17.4A1.8 1.8 0 0 0 4.9 20h14.2a1.8 1.8 0 0 0 1.6-2.6L13.6 4.6a1.8 1.8 0 0 0-3.2 0Z" /><path d="M12 9.5v4M12 16.8v.2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  sparkle: <path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5Z" />,
  more: <path d="M6.5 12h.01M12 12h.01M17.5 12h.01" />,
} as const satisfies Record<string, ReactNode>

export type UiIconName = keyof typeof UI_PATHS

export interface UiIconProps {
  readonly name: UiIconName
  readonly size?: number
  readonly className?: string | undefined
  /** Stroke width (default 1.75 like Brush nav icons). */
  readonly strokeWidth?: number
}

/** Inline UI glyph in the Brush icon stroke (currentColor). */
export function UiIcon({ name, size = 20, className, strokeWidth = 1.75 }: UiIconProps): ReactNode {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {UI_PATHS[name]}
    </svg>
  )
}

export type StageCategoryIcon = 'todo' | 'doing' | 'review' | 'needs_you' | 'done' | 'blocked'

const STAGE_COLUMN_ICON: Readonly<Record<StageCategoryIcon, keyof typeof COLUMN_ICONS | null>> = {
  todo: 'a-fazer',
  doing: 'em-andamento',
  review: 'em-revisao',
  needs_you: null,
  done: 'concluido',
  blocked: 'bloqueado',
}

const STAGE_UI_FALLBACK: Readonly<Record<StageCategoryIcon, UiIconName>> = {
  todo: 'plus',
  doing: 'sparkle',
  review: 'help',
  needs_you: 'clock',
  done: 'check',
  blocked: 'alert',
}

/** Stage category icon (Brush `icons/columns` when present, else UiIcon). */
export function ColumnCategoryIcon({ category, size = 14, className }: { readonly category: StageCategoryIcon; readonly size?: number; readonly className?: string | undefined }): ReactNode {
  const columnId = STAGE_COLUMN_ICON[category]
  const url = columnId === null ? undefined : COLUMN_ICONS[columnId]
  if (url !== undefined) {
    const style = { '--persona-icon-url': `url("${url}")`, '--persona-icon-size': `${size}px` } as CSSProperties
    return <span className={className === undefined ? styles.brand : `${styles.brand} ${className}`} style={style} aria-hidden="true" />
  }
  return <UiIcon name={STAGE_UI_FALLBACK[category]} size={size} strokeWidth={2.4} className={className} />
}
