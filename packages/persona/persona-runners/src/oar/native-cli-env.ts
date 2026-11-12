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
  Object.assign(env, GIT_SESSION_PINS) // last: no caller overlay drops them
  return env
}

/**
 * P0-B (auditoria final da Colheita S1): git runs programs named by the repository it is in (hooks, `core.fsmonitor`), and the persona writes repositories inside her draft. Config given
 * through the environment beats the repository's, so every CLI session (and the shell it opens) runs git with no hooks, no fsmonitor and no bare repository found by accident.
 * The command policy refuses `GIT_*` on a command line, so the persona cannot take them back.
 */
const GIT_SESSION_PINS: Readonly<Record<string, string>> = {
  GIT_CONFIG_COUNT: '3',
  GIT_CONFIG_KEY_0: 'core.hooksPath',
  GIT_CONFIG_VALUE_0: '/dev/null',
  GIT_CONFIG_KEY_1: 'core.fsmonitor',
  GIT_CONFIG_VALUE_1: 'false',
  GIT_CONFIG_KEY_2: 'safe.bareRepository',
  GIT_CONFIG_VALUE_2: 'explicit',
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
