import { describe, expect, it } from 'vitest'
import {
  PERSONA_THEME_ARG, PERSONA_THEME_ENV, applyThemeOverride, parseThemeOverride, themeOverrideArguments, type ThemeSource, type ThemeTarget,
} from '../src/theme-override.ts'

const target = (initial: ThemeSource = 'system'): ThemeTarget => ({ themeSource: initial })

describe('parseThemeOverride', () => {
  it('reads the environment variable, case- and space-insensitively', () => {
    expect(parseThemeOverride({ [PERSONA_THEME_ENV]: 'dark' }, [])).toBe('dark')
    expect(parseThemeOverride({ [PERSONA_THEME_ENV]: ' LIGHT ' }, [])).toBe('light')
    expect(parseThemeOverride({ [PERSONA_THEME_ENV]: 'System' }, [])).toBe('system')
  })

  it('reads --persona-theme=… and lets it win over the environment', () => {
    expect(parseThemeOverride({}, ['Persona.exe', `${PERSONA_THEME_ARG}dark`])).toBe('dark')
    expect(parseThemeOverride({ [PERSONA_THEME_ENV]: 'light' }, [`${PERSONA_THEME_ARG}dark`])).toBe('dark')
  })

  it.each(['', 'blue', 'dark mode', '1', 'true', 'dark;light'])('ignores an invalid value (%j)', (value) => {
    expect(parseThemeOverride({ [PERSONA_THEME_ENV]: value }, [])).toBeUndefined()
    expect(parseThemeOverride({}, [`${PERSONA_THEME_ARG}${value}`])).toBeUndefined()
  })

  it('does not fall back to the environment when the flag is present but invalid', () => {
    expect(parseThemeOverride({ [PERSONA_THEME_ENV]: 'dark' }, [`${PERSONA_THEME_ARG}blue`])).toBeUndefined()
  })

  it('is off by default', () => {
    expect(parseThemeOverride({}, ['Persona.exe', '--remote-debugging-port=9222'])).toBeUndefined()
  })
})

describe('applyThemeOverride', () => {
  it('pins the native theme and reports it, so the renderer cannot undo it', () => {
    const nativeTheme = target('light')
    expect(applyThemeOverride(nativeTheme, { [PERSONA_THEME_ENV]: 'dark' }, [])).toBe('dark')
    expect(nativeTheme.themeSource).toBe('dark')
  })

  it('leaves the native theme alone without a valid override', () => {
    const nativeTheme = target('light')
    expect(applyThemeOverride(nativeTheme, {}, [])).toBeUndefined()
    expect(applyThemeOverride(nativeTheme, { [PERSONA_THEME_ENV]: 'purple' }, [])).toBeUndefined()
    expect(nativeTheme.themeSource).toBe('light')
  })

  it('can force light on a dark OS and hand back to the system', () => {
    const nativeTheme = target('dark')
    applyThemeOverride(nativeTheme, {}, [`${PERSONA_THEME_ARG}light`])
    expect(nativeTheme.themeSource).toBe('light')
    applyThemeOverride(nativeTheme, { [PERSONA_THEME_ENV]: 'system' }, [])
    expect(nativeTheme.themeSource).toBe('system')
  })
})

describe('themeOverrideArguments (TH-1: the argument that carries the forced theme to the window preload)', () => {
  it('turns the environment into the one flag the preload reads, normalized', () => {
    expect(themeOverrideArguments({ [PERSONA_THEME_ENV]: ' DARK ' }, [])).toEqual([`${PERSONA_THEME_ARG}dark`])
  })

  it('lets the command line win over the environment, as the native theme does', () => {
    expect(themeOverrideArguments({ [PERSONA_THEME_ENV]: 'light' }, [`${PERSONA_THEME_ARG}system`])).toEqual([`${PERSONA_THEME_ARG}system`])
  })

  it('adds nothing without a valid override', () => {
    expect(themeOverrideArguments({}, ['Persona.exe'])).toEqual([])
    expect(themeOverrideArguments({ [PERSONA_THEME_ENV]: 'purple' }, [])).toEqual([])
    expect(themeOverrideArguments({ [PERSONA_THEME_ENV]: 'dark' }, [`${PERSONA_THEME_ARG}blue`])).toEqual([])
  })

  it('round-trips through the preload parser for every theme', () => {
    for (const theme of ['light', 'dark', 'system'] as const) {
      expect(parseThemeOverride({}, ['renderer', ...themeOverrideArguments({ [PERSONA_THEME_ENV]: theme }, [])])).toBe(theme)
    }
  })
})
