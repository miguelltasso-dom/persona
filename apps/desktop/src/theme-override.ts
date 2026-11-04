/**
 * Forced app theme for captures and proofs (UX-BEYOND P0-7).
 *
 * The installed app follows `nativeTheme`, and CSS media emulation does not reach the native chrome or the first frame, so the
 * dark theme of the INSTALLED app could never be captured on a light OS. `PERSONA_THEME=dark|light|system` (or
 * `--persona-theme=dark`) pins `nativeTheme.themeSource` before any window exists. The renderer then resolves its theme from
 * `prefers-color-scheme` as usual and writes `data-ds-dark-theme="true"` in dark (the attribute is removed in light), so the
 * capture exercises the real code path rather than a stylesheet trick.
 *
 * Appearance only: it changes no data, permission or network behaviour. Invalid values are ignored.
 */

export const PERSONA_THEME_ENV = 'PERSONA_THEME'
export const PERSONA_THEME_ARG = '--persona-theme='

export type ThemeSource = 'light' | 'dark' | 'system'

/** The slice of Electron's `nativeTheme` this module writes. */
export interface ThemeTarget {
  themeSource: ThemeSource
}

function parseThemeSource(value: string | undefined): ThemeSource | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'light' || normalized === 'dark' || normalized === 'system' ? normalized : undefined
}

/**
 * Read the forced theme. The command line wins over the environment.
 * @param env - Process environment.
 * @param argv - Process arguments.
 * @returns The forced theme, or undefined when none (or an invalid one) was given.
 */
export function parseThemeOverride(env: NodeJS.ProcessEnv, argv: readonly string[]): ThemeSource | undefined {
  const flag = argv.find(argument => argument.startsWith(PERSONA_THEME_ARG))
  if (flag !== undefined) return parseThemeSource(flag.slice(PERSONA_THEME_ARG.length))
  return parseThemeSource(env[PERSONA_THEME_ENV])
}

/**
 * Pin the native theme when a theme was forced.
 * @param target - Electron `nativeTheme` (or a double).
 * @param env - Process environment.
 * @param argv - Process arguments.
 * @returns The forced theme, so the caller can refuse the renderer's own `nativeThemeSet` afterwards; undefined when none.
 */
export function applyThemeOverride(target: ThemeTarget, env: NodeJS.ProcessEnv, argv: readonly string[]): ThemeSource | undefined {
  const forced = parseThemeOverride(env, argv)
  if (forced !== undefined) target.themeSource = forced
  return forced
}
