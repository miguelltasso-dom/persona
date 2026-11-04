// @vitest-environment jsdom
// Gauge P0 visual: o tema escuro nunca aplicava (atributo vazio; a paleta casa data-ds-dark-theme='true').
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DARK_THEME_ATTRIBUTE, applyPersonaColorScheme, installPersonaColorScheme } from '../src/client/theme/install-color-scheme.ts'

type Listener = () => void

function stubMatchMedia(initialDark: boolean) {
  const listeners = new Set<Listener>()
  const media = {
    matches: initialDark,
    addEventListener: (_: string, fn: Listener) => { listeners.add(fn) },
    removeEventListener: (_: string, fn: Listener) => { listeners.delete(fn) },
  }
  vi.stubGlobal('matchMedia', () => media)
  Object.defineProperty(window, 'matchMedia', { value: () => media, configurable: true })
  return {
    set(dark: boolean) { media.matches = dark; for (const fn of listeners) fn() },
  }
}

beforeEach(() => { document.body.removeAttribute(DARK_THEME_ATTRIBUTE) })
afterEach(() => { vi.unstubAllGlobals() })

describe('tema escuro do Persona', () => {
  it('escuro: o atributo vale "true" (a paleta e os módulos casam o valor), nunca vazio', () => {
    applyPersonaColorScheme(document.body, true)
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
    expect(document.body.matches("[data-ds-dark-theme='true']")).toBe(true)
  })

  it('claro: o atributo some (os componentes do host casam a presença e não podem ficar escuros no claro)', () => {
    applyPersonaColorScheme(document.body, true)
    applyPersonaColorScheme(document.body, false)
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    expect(document.body.matches('body[data-ds-dark-theme]')).toBe(false)
    expect(document.body.matches(":not([data-ds-dark-theme='true'])")).toBe(true)
  })

  it('segue o prefers-color-scheme na instalação e a cada mudança', () => {
    const media = stubMatchMedia(true)
    installPersonaColorScheme()
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
    media.set(false)
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    media.set(true)
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
  })

  it('começando no claro: claro → escuro → claro (o listener de mudança liga e desliga)', () => {
    const media = stubMatchMedia(false)
    installPersonaColorScheme()
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    media.set(true)
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
    media.set(false)
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBeNull()
  })

  it('a paleta escura casa o MESMO valor que o instalador escreve', () => {
    const css = readFileSync(resolve(__dirname, '../src/client/theme/persona-palette.css'), 'utf8')
    expect(css).toContain("body[data-ds-dark-theme='true']")
  })
})
