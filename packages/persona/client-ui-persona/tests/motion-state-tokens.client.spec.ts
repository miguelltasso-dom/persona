/**
 * Muse (DESIGN-01-MUSE §0.2 and §2, 11/11): the motion system and the persona state vocabulary are tokens. Every name the
 * TypeScript mirror exposes must exist in persona-palette.css with the closed value, and reduced motion must shorten the new
 * durations too (no translate/scale ever comes from a token that kept its full length).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PERSONA_MOTION_DURATION_TOKENS,
  PERSONA_MOTION_EASING_TOKENS,
  PERSONA_MOTION_PRESETS,
  PERSONA_STATE_FILLED,
  PERSONA_STATE_TOKENS,
} from '../src/client/theme/tokens.ts'

const css = readFileSync(new URL('../src/client/theme/persona-palette.css', import.meta.url), 'utf8')
const declared = (name: string): string | undefined => new RegExp(`${name}:\\s*([^;]+);`, 'u').exec(css)?.[1]?.trim()

describe('motion tokens (DESIGN-01-MUSE §2)', () => {
  it('every duration and easing in the TS mirror is declared in the palette', () => {
    for (const name of [...PERSONA_MOTION_DURATION_TOKENS, ...PERSONA_MOTION_EASING_TOKENS]) expect(declared(name), name).toBeDefined()
  })

  it('keeps the closed values', () => {
    expect(declared('--motion-instant')).toBe('90ms')
    expect(declared('--motion-fast')).toBe('150ms')
    expect(declared('--motion-panel')).toBe('160ms')
    expect(declared('--motion-message')).toBe('180ms')
    expect(declared('--ease-standard')).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
    expect(declared('--ease-enter')).toBe('cubic-bezier(0.16, 1, 0.3, 1)')
    expect(declared('--ease-spring')).toBe('cubic-bezier(0.32, 1.14, 0.54, 1)')
    expect(declared('--ease-carry')).toBe('cubic-bezier(0.25, 0.9, 0.3, 1)')
  })

  it('reduced motion shortens every new duration (particles to 0)', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const name of ['--motion-panel', '--motion-message', '--motion-celebrate']) expect(reduced).toContain(`${name}: var(--motion-reduced-fade)`)
    expect(reduced).toContain('--motion-celebrate-burst: 0ms')
  })

  it('every preset points at declared tokens', () => {
    for (const preset of Object.values(PERSONA_MOTION_PRESETS)) {
      expect(declared(preset.duration), preset.duration).toBeDefined()
      expect(declared(preset.easing), preset.easing).toBeDefined()
    }
  })
})

describe('persona state vocabulary (DESIGN-01-MUSE §0.2)', () => {
  it('every state has a token that aliases a scheme token (so light and dark follow by themselves)', () => {
    for (const token of Object.values(PERSONA_STATE_TOKENS)) expect(declared(token), token).toMatch(/^var\(--persona-[a-z0-9-]+\)$/u)
  })

  it('active states are filled, idle states are rings', () => {
    expect(Object.entries(PERSONA_STATE_FILLED).filter(([, filled]) => filled).map(([name]) => name).sort())
      .toEqual(['draft', 'reviewing', 'stuck', 'waiting', 'working'])
  })
})
