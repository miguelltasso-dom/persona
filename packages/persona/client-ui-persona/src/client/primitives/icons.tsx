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

// Muse (DESIGN-01 · ARTE lote 1.2, 11/11): Brush's own UI glyphs (persona-assets/icons/ui-glyphs/*.svg, 24×24, stroke-only,
// currentColor, 1.75), copied as path data so they theme and take strokeWidth. 'fileText' and 'fileSheet' keep the previous
// drawing until Brush delivers theirs. 'baton' is the redrawn conductor's baton (the first one read as a pencil).
const UI_PATHS = {
  send: <path d="M3 11.2 21 3l-6.8 18-3.1-7.4L3 11.2Zm8.1 2.4L21 3" />,
  plus: <path d="M12 4.5v15M4.5 12h15" />,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="15.8" cy="9" r="1.5" /><path d="m4 16 4.5-4.5 3.4 3.3 2.6-2.4 5.5 5" /></>,
  attach: <path d="m8.7 12.9 6.7-6.7a3 3 0 0 1 4.2 4.2l-8.4 8.4a4.6 4.6 0 0 1-6.5-6.5l8.5-8.5M8.7 12.9a1.5 1.5 0 0 0 2.1 2.1l6.3-6.3" />,
  smile: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.2c.8 1.4 2 2.1 3.5 2.1s2.7-.7 3.5-2.1M9 9.4v.5m6-.5v.5" /></>,
  bell: <path d="M5 17h14l-1.5-2.3v-3.5c0-3.3-2.1-5.6-5.5-5.6s-5.5 2.3-5.5 5.6v3.5L5 17ZM10 19.1c.4.8 1 1.1 2 1.1s1.6-.3 2-1.1M12 3.6v2" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.7v5M12 7.7v.1" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.2a2.4 2.4 0 0 1 4.7.7c0 1.9-2.5 2.2-2.5 4M12 17v.1" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.3" /><path d="m15.2 15.2 4.2 4.2" /></>,
  chevronDown: <path d="m6.5 9 5.5 5.5L17.5 9" />,
  chevronRight: <path d="m9 6.5 5.5 5.5L9 17.5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.4 4.3 4.2L19 7" />,
  baton: <><circle cx="6.4" cy="17.6" r="1.8" /><path d="M7.7 16.3 17.2 6.8M15.6 3.2l.4 1.8m3.7.4 1.5-.8m-1 3.3 1.8.3" /></>,
  minus: <path d="M5 12h14" />,
  copy: <><rect x="7.5" y="7.5" width="11.5" height="12.5" rx="2" /><path d="M16.5 7.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1.5" /></>,
  lock: <><rect x="5.3" y="10.4" width="13.4" height="9.5" rx="2" /><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4M12 14.3v1.9" /></>,
  eye: <><path d="M3 12s3.4-5.5 9-5.5 9 5.5 9 5.5-3.4 5.5-9 5.5S3 12 3 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  file: <path d="M7 3.5h6.7l4.8 4.8V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5ZM13.5 3.8v4.7h4.7" />,
  fileText: <><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" /><path d="M14 3.5V8h4.5" /><path d="M8.5 12.5h7M8.5 15.5h7M8.5 9.5h3" /></>,
  fileSheet: <><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" /><path d="M14 3.5V8h4.5" /><path d="M8.5 11.5h7v6h-7ZM8.5 14.5h7M12 11.5v6" /></>,
  at: <path d="M16.1 16.8c-1.2.8-2.5 1.1-4.1 1.1a6.2 6.2 0 1 1 6.2-6.2v1.1c0 1.3-.7 2.1-1.8 2.1s-1.6-.7-1.6-1.8V8.8M14.8 11.7a3.1 3.1 0 1 1-6.2 0 3.1 3.1 0 0 1 6.2 0Z" />,
  arrowRight: <path d="M4.5 12h14.8m-5.8-5.7 5.8 5.7-5.8 5.7" />,
  alert: <path d="M10.4 4.8a1.8 1.8 0 0 1 3.2 0l6.6 11.7a1.8 1.8 0 0 1-1.6 2.7H5.4a1.8 1.8 0 0 1-1.6-2.7L10.4 4.8ZM12 9v4.2m0 3v.1" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.2v5.1l3.3 1.9" /></>,
  sparkle: <path d="M12 3.3c.7 4.7 2.1 6.2 6.7 7-4.6.8-6 2.4-6.7 7-.8-4.6-2.3-6.2-6.8-7 4.5-.8 6-2.3 6.8-7ZM18.8 16.2v3.1M17.3 17.7h3.1" />,
  more: <path d="M5.2 12h.1M12 12h.1m6.6 0h.1" />,
  // COLHEITA (11/11, COLHEITA-MUSE "Arte para o Brush"): the hold-to-confirm hint, voice, pin and the indicator icons.
  hold: <><path d="M8 12V7a2 2 0 0 1 4 0v4-1a1.8 1.8 0 0 1 3.6 0v1a1.8 1.8 0 0 1 3.6 0v3.2c0 3.4-2.2 5.8-5.5 5.8h-1.4c-2 0-3.5-.8-4.7-2.4l-2.5-3.5a1.8 1.8 0 0 1 2.9-2.1L8 13" /><path d="M5 5.5 3.8 4.3M8 4V2.5M11 5.5l1.2-1.2" /></>,
  mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6" /></>,
  stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
  trash: <path d="M4 6h16M9 6V4h6v2M6.5 6l1 13a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2l1-13M10 10v7M14 10v7" />,
  play: <path d="M7 4.5 19 12 7 19.5z" />,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  pin: <path d="m9 4 6 0 1 5 3 3v2H5v-2l3-3 1-5ZM12 14v7" />,
  vendas: <path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6M15 7h4v4" />,
  boletos: <path d="M6 3h12v18l-3-1.5-3 1.5-3-1.5L6 21V3ZM9 7h6M9 10h6M9 14h1M12 14h1M15 14h1" />,
  clientes: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.5A5.5 5.5 0 0 1 9 12a5.5 5.5 0 0 1 5.5 5.5V19zM16 5.4a3 3 0 0 1 0 5.7M17 12.5a5 5 0 0 1 3.5 4.8V19h-3" /></>,
  estoque: <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3ZM4 7.2l8 4.3 8-4.3M12 11.5V21M8 5.2l8 4.2" />,
  agenda: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16M8 13h2M14 13h2M8 16h2" /></>,
  'contatos-sem-resposta': <><path d="M13.5 17H8l-4 3V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" /><circle cx="18" cy="17" r="4" /><path d="M18 14.8v2.4l1.5.9" /></>,
  // Cofre (item 15): a chave das linhas de "Chaves".
  key: <><circle cx="8" cy="8" r="4" /><path d="m10.9 10.9 8.6 8.6M15.7 15.7l2-2M17.8 17.8l2-2" /></>,
  // Item 24: a persona que trabalha na Estação (o mini-PC sempre ligado).
  estacao: <><rect x="3" y="7" width="18" height="10" rx="2.5" /><path d="M6.5 11v2M9 11v2M6 19h2M16 19h2" /><circle cx="17" cy="12" r="0.7" /></>,
  // Item 22: "Nova equipe" (o '+' é o que o separa de 'clientes').
  'equipe-nova': <><circle cx="7.5" cy="8.5" r="2.8" /><path d="M2.5 19v-1a5 5 0 0 1 10 0v1zM14 10a2.5 2.5 0 0 1 0 4.8M14.7 15.2a4 4 0 0 1 3.4 3.8M19 2.5v5M16.5 5h5" /></>,
  // Casa da Equipe (§29): o glifo de cada equipe (Brush, 12/11).
  'equipe-geral': <path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9.5 20v-6h5v6" />,
  'equipe-vendas': <path d="M5 8h14l1.1 11H3.9L5 8ZM9 9V7a3 3 0 0 1 6 0v2" />,
  'equipe-atendimento': <><path d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3v-3a2.5 2.5 0 0 1-3-2.5v-7A2.5 2.5 0 0 1 5.5 5Z" /><path d="M12 14s-3-1.8-3-3.6a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1C15 12.2 12 14 12 14Z" /></>,
  'equipe-redes': <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10 5h4M11 19h2M12 15s-3-1.8-3-3.6a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1C15 13.2 12 15 12 15Z" /></>,
  'equipe-criacao': <><path d="m4 19 1-3L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 0-1ZM14.8 6.2l3 3M5 5l5 5M14 14l2 2" /><path d="M16 16c1.8-1.2 3 .1 3 1.5 0 1.4.7 1.8 1.5 2-2.2 1.3-5 1-5.5-.7-.3-1 .1-2 1-2.8Z" /></>,
  'equipe-coordenacao': <><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><path d="M9 3h6l1 3H8l1-3ZM8.5 13l2.3 2.3 4.7-5" /></>,
  'equipe-financeiro': <><circle cx="12" cy="12" r="9" /><path d="M14.8 8.4c-.6-.6-1.5-.9-2.8-.9-1.7 0-2.8.8-2.8 2s1 1.8 2.8 2.2 2.8 1 2.8 2.3-1.1 2.1-2.8 2.1c-1.3 0-2.4-.4-3-1.1M12 5.8v12.4" /></>,
  'equipe-producao': <path d="M9 5V4a3 3 0 0 1 6 0v1M9 5c-.4 2.3-1.4 3.7-3 5v9.5h12V10c-1.6-1.3-2.6-2.7-3-5H9ZM6 11l-2 1.5M18 11l2 1.5M9 14h6v2.5H9z" />,
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
