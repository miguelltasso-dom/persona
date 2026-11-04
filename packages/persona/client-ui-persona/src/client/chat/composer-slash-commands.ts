/**
 * Slash and skill triggers in the composer (T3-UX-HARVEST §6; pattern from t3code docs/user/composer.md, MIT).
 */
import type { BrandIconName } from '../primitives/index.ts'

export type ComposerSlashId =
  | 'limites'
  | 'assunto'
  | 'lado'
  | 'ensinar'
  | 'contratar'
  | 'resumo'

export interface ComposerSlashCommand {
  readonly id: ComposerSlashId
  readonly prefix: string
  readonly needsArg?: boolean
  /** Brush icon for the menu row (Muse): each command reads at a glance. */
  readonly icon: BrandIconName
}

export const COMPOSER_SLASH_COMMANDS: readonly ComposerSlashCommand[] = [
  { id: 'limites', prefix: '/limites', icon: 'uso-e-limites' },
  { id: 'assunto', prefix: '/assunto', needsArg: true, icon: 'mover-assunto' },
  { id: 'lado', prefix: '/lado', needsArg: true, icon: 'conversa' },
  { id: 'ensinar', prefix: '/ensinar', icon: 'ensinar' },
  { id: 'contratar', prefix: '/contratar', icon: 'convidar' },
  { id: 'resumo', prefix: '/resumo', icon: 'conhecimento-memoria' },
]

/** Active `/word` token at the start of the field or after a newline. */
export function activeSlashToken(text: string, caret: number): { readonly query: string; readonly start: number } | null {
  const head = text.slice(0, caret)
  const lineStart = head.lastIndexOf('\n') + 1
  const line = head.slice(lineStart)
  if (!line.startsWith('/')) return null
  const match = /^\/([\w-]*)/u.exec(line)
  if (match === null) return null
  return { query: match[1] ?? '', start: lineStart }
}

export function filterSlashCommands(query: string): readonly ComposerSlashCommand[] {
  const q = query.toLowerCase()
  return COMPOSER_SLASH_COMMANDS.filter(row => row.prefix.slice(1).startsWith(q))
}
