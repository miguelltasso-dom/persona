/** Classify CLI stdout that is a login prompt, never a model reply. */

import type { CliKind } from '../contract.ts'
import { loginHintFor } from '../resolve/errors.ts'

/** Shared phrases Keel listed, plus the per-CLI vendor wording. */
const SHARED = [
  'not logged in',
  'não logado',
  'nao logado',
  'login required',
  'please run /login',
  'please sign in',
  'please log in',
  'please login',
] as const

/**
 * Login-required phrases per CLI. Matched case-insensitively as substrings.
 * `/login` is only the command hint, not an arbitrary URL path.
 */
export const LOGIN_REQUIRED_PHRASES: Readonly<Record<CliKind, readonly string[]>> = {
  claude: [...SHARED, 'run /login', '/login'],
  codex: [...SHARED, 'run /login', '/login', 'not authenticated'],
  opencode: [...SHARED, 'run /login', '/login', 'opencode auth login'],
  cursor: [...SHARED, 'sign in to cursor', 'sign in to the agent'],
}

export interface LoginRequiredMatch {
  readonly cli: CliKind
  readonly code: 'not_logged_in'
  readonly loginHint: string
}

/**
 * True when `text` is a vendor login wall, not model output.
 * @param cli - CLI that produced the text.
 * @param text - Chunk or accumulated stdout.
 */
export function classifyLoginOutput(cli: CliKind, text: string): LoginRequiredMatch | undefined {
  const normalized = text.normalize('NFKC').toLowerCase()
  if (normalized.trim() === '') return undefined
  for (const phrase of LOGIN_REQUIRED_PHRASES[cli]) {
    if (normalized.includes(phrase.toLowerCase())) {
      return { cli, code: 'not_logged_in', loginHint: loginHintFor(cli) }
    }
  }
  return undefined
}

/**
 * True when `text` is a prefix of a login phrase (hold the first delta).
 * Ordinary model text returns false so the 1st token is not delayed.
 * @param cli - CLI that produced the text.
 * @param text - Held stdout so far.
 */
export function mayBecomeLogin(cli: CliKind, text: string): boolean {
  const normalized = text.normalize('NFKC').toLowerCase().trim()
  if (normalized === '') return true
  if (classifyLoginOutput(cli, text) !== undefined) return true
  for (const phrase of LOGIN_REQUIRED_PHRASES[cli]) {
    const needle = phrase.toLowerCase()
    if (needle.startsWith(normalized) || normalized.startsWith(needle.slice(0, Math.min(12, needle.length)))) {
      return true
    }
  }
  return false
}
