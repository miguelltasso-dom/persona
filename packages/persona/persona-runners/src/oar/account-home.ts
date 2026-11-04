/**
 * WAVE2 §3 — isolated CLI config dir per account. Never copies another login.
 */

import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Engines that can have more than one login. */
export type AccountEngine =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'opencode'
  | 'opencode-go'
  | 'gemini'
  | 'grok'
  | 'dsh'
  | 'openrouter'

/** Env vars that must not leak across accounts. */
export const ACCOUNT_ISOLATION_VARS = [
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'CURSOR_CONFIG_DIR',
  'OPENCODE_CONFIG_DIR',
  'XDG_CONFIG_HOME',
  'GEMINI_CONFIG_DIR',
  'XAI_CONFIG_DIR',
  'GROK_HOME',
] as const

const ENV_OF: Readonly<Record<AccountEngine, readonly string[]>> = {
  claude: ['CLAUDE_CONFIG_DIR'],
  codex: ['CODEX_HOME'],
  cursor: ['CURSOR_CONFIG_DIR'],
  opencode: ['OPENCODE_CONFIG_DIR', 'XDG_CONFIG_HOME'],
  'opencode-go': ['OPENCODE_CONFIG_DIR', 'XDG_CONFIG_HOME'],
  gemini: ['GEMINI_CONFIG_DIR'],
  grok: ['XAI_CONFIG_DIR', 'GROK_HOME'],
  dsh: [],
  openrouter: [],
}

/**
 * Durable config dir for one account. Not a secret.
 * @param personaHome - PERSONA_HOME root.
 * @param personId - Human owner.
 * @param engine - Provider family.
 * @param accountId - Stable account id (not the label).
 */
export function accountHomeDir(
  personaHome: string,
  personId: string,
  engine: AccountEngine,
  accountId: string,
): string {
  return resolve(personaHome, 'accounts', personId, engine, accountId)
}

/**
 * Create the account dir and return isolation env. Does not copy native auth.
 * @param dir - Absolute account home.
 * @param engine - Provider family.
 * @param io - Injectable mkdir for tests.
 */
export function prepareAccountHome(
  dir: string,
  engine: AccountEngine,
  io: { mkdir?: (path: string) => void } = {},
): { readonly dir: string; readonly env: Record<string, string | null> } {
  const dest = resolve(dir)
  const mkdir = io.mkdir ?? ((path: string) => { mkdirSync(path, { recursive: true }) })
  mkdir(dest)
  return { dir: dest, env: accountIsolationEnv(engine, dest) }
}

/**
 * Session env that points only at this account. Other isolation vars are cleared.
 * @param engine - Provider family.
 * @param dir - Account config dir.
 */
export function accountIsolationEnv(
  engine: AccountEngine,
  dir: string,
): Record<string, string | null> {
  const env: Record<string, string | null> = {}
  for (const name of ACCOUNT_ISOLATION_VARS) env[name] = null
  for (const name of ENV_OF[engine]) env[name] = dir
  return env
}

/**
 * True when two accounts would share a config dir (forbidden).
 * @param left - First dir.
 * @param right - Second dir.
 */
export function accountsShareHome(left: string, right: string): boolean {
  return resolve(left) === resolve(right)
}

/** Native login markers — presence only; contents are never read. */
export const ACCOUNT_AUTH_MARKERS = ['auth.json', '.credentials.json', 'credentials.json'] as const

/**
 * Whether the isolated home has a native login file. Secrets stay unread.
 * @param dir - Account config dir.
 * @param exists - Injectable exists.
 */
export function accountLoginStatus(
  dir: string,
  exists: (path: string) => boolean = existsSync,
): 'logged_in' | 'logged_out' {
  const root = resolve(dir)
  for (const name of ACCOUNT_AUTH_MARKERS) {
    if (exists(join(root, name))) return 'logged_in'
  }
  return 'logged_out'
}
