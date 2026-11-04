/** Isolation vars leftover hosts must not inherit unless isolation is explicit. */

export const CLI_ISOLATION_VARS = [
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'CURSOR_CONFIG_DIR',
  'OPENCODE_CONFIG_DIR',
  'XDG_CONFIG_HOME',
  'GEMINI_CONFIG_DIR',
  'XAI_CONFIG_DIR',
  'GROK_HOME',
] as const

/**
 * Session env that uses the user's native CLI login.
 * Isolation vars are removed (`null`) unless the caller sets them.
 * An empty `HOME` is removed so Windows CLIs fall back to `USERPROFILE`.
 * @param extra - explicit overrides (isolation dirs, extra keys).
 * @returns env overlay for `SessionOptions.env`.
 */
export function nativeSessionEnv(
  extra?: Readonly<Record<string, string | null>>,
): Record<string, string | null> {
  const env: Record<string, string | null> = {
    CLAUDE_CONFIG_DIR: null,
    CODEX_HOME: null,
    CURSOR_CONFIG_DIR: null,
    OPENCODE_CONFIG_DIR: null,
    XDG_CONFIG_HOME: null,
    GEMINI_CONFIG_DIR: null,
    XAI_CONFIG_DIR: null,
    GROK_HOME: null,
  }
  if (process.env.HOME === '') env.HOME = null
  if (extra !== undefined) Object.assign(env, extra)
  return env
}

/**
 * Drop inherited isolation from this process so OAR `authStatus` sees native login.
 * No-op when `PERSONA_ISOLATE_CLI_CONFIG=1`.
 * @param env - process env to mutate; defaults to `process.env`.
 */
export function restoreNativeCliLogin(env: NodeJS.ProcessEnv = process.env): void {
  if (env.PERSONA_ISOLATE_CLI_CONFIG === '1') return
  delete env.CLAUDE_CONFIG_DIR
  delete env.CODEX_HOME
  delete env.CURSOR_CONFIG_DIR
  delete env.OPENCODE_CONFIG_DIR
  delete env.XDG_CONFIG_HOME
  delete env.GEMINI_CONFIG_DIR
  delete env.XAI_CONFIG_DIR
  delete env.GROK_HOME
  if (env.HOME === '') delete env.HOME
}
