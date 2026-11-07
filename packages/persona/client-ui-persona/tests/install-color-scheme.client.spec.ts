// @vitest-environment jsdom
// Gauge P0 visual: o tema escuro nunca aplicava (atributo vazio; a paleta casa data-ds-dark-theme='true').
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DARK_THEME_ATTRIBUTE, THEME_SOURCE_ATTRIBUTE, applyPersonaColorScheme, installPersonaColorScheme, resolvePersonaDark,
} from '../src/client/theme/install-color-scheme.ts'

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

let uninstall: (() => void) | undefined
const install = (): void => { uninstall = installPersonaColorScheme() }
const settle = (): Promise<void> => new Promise((done) => { setTimeout(done, 0) })

/** O que o `ThemePresenter` do host (ui-layout/theme-presenter.ts) escreve a cada `theme/change`: a PRESENÇA no escuro, nunca o valor. */
function hostPresenterApply(scheme: 'light' | 'dark', preference: 'system' | 'light' | 'dark'): void {
  document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE, preference === 'system' ? 'system' : scheme)
  if (scheme === 'dark') document.body.setAttribute(DARK_THEME_ATTRIBUTE, '')
  else document.body.removeAttribute(DARK_THEME_ATTRIBUTE)
}

beforeEach(() => {
  document.body.removeAttribute(DARK_THEME_ATTRIBUTE)
  document.documentElement.removeAttribute(THEME_SOURCE_ATTRIBUTE)
})
afterEach(() => {
  uninstall?.()
  uninstall = undefined
  vi.unstubAllGlobals()
})

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
    install()
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
    media.set(false)
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    media.set(true)
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
  })

  it('começando no claro: claro → escuro → claro (o listener de mudança liga e desliga)', () => {
    const media = stubMatchMedia(false)
    install()
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

// INST-3: o host reescreve o atributo a cada theme/change (troca manual em Configurações, Windows mudando em "Sistema").
describe('INST-3: o apresentador do host não derruba o escuro do Persona', () => {
  it('a preferência fixa do host vence o sistema; no "Sistema" vale o prefers-color-scheme', () => {
    const root = document.documentElement
    root.setAttribute(THEME_SOURCE_ATTRIBUTE, 'dark')
    expect(resolvePersonaDark(root, false)).toBe(true)
    root.setAttribute(THEME_SOURCE_ATTRIBUTE, 'light')
    expect(resolvePersonaDark(root, true)).toBe(false)
    root.setAttribute(THEME_SOURCE_ATTRIBUTE, 'system')
    expect(resolvePersonaDark(root, true)).toBe(true)
    expect(resolvePersonaDark(root, false)).toBe(false)
    root.removeAttribute(THEME_SOURCE_ATTRIBUTE)
    expect(resolvePersonaDark(root, true)).toBe(true)
  })

  it('o script de boot do host deixa o atributo vazio antes da montagem: a instalação o normaliza para "true"', () => {
    stubMatchMedia(true)
    document.body.toggleAttribute(DARK_THEME_ATTRIBUTE, true) // boot-theme.ts: presença, valor ""
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('')
    install()
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
  })

  it('troca manual para Escuro com o Windows no claro: o host escreve "" e o Persona fica escuro (valor "true")', async () => {
    stubMatchMedia(false)
    install()
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    hostPresenterApply('dark', 'dark')
    await settle()
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
    expect(document.body.matches("body[data-ds-dark-theme='true']")).toBe(true)
  })

  it('troca manual para Claro com o Windows no escuro: o atributo é REMOVIDO (nem a paleta nem o host ficam escuros)', async () => {
    stubMatchMedia(true)
    install()
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
    hostPresenterApply('light', 'light')
    await settle()
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    expect(document.body.matches('body[data-ds-dark-theme]')).toBe(false)
  })

  it('"Sistema": volta a seguir o Windows e troca ao vivo, mesmo com o host reescrevendo o atributo', async () => {
    const media = stubMatchMedia(false)
    install()
    hostPresenterApply('dark', 'dark') // escolheu Escuro
    await settle()
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
    hostPresenterApply('light', 'system') // voltou para Sistema com o Windows no claro
    await settle()
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    media.set(true) // o Windows vai para o escuro
    hostPresenterApply('dark', 'system') // o host reaplica
    await settle()
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
    media.set(false) // e volta para o claro
    hostPresenterApply('light', 'system')
    await settle()
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
  })

  it('várias reescritas seguidas do host terminam em "true" no escuro e sem atributo no claro (sem laço de observadores)', async () => {
    stubMatchMedia(false)
    install()
    for (let i = 0; i < 20; i++) hostPresenterApply(i % 2 === 0 ? 'dark' : 'light', i % 2 === 0 ? 'dark' : 'light')
    await settle() // a última (i = 19) foi o claro
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('light')
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    hostPresenterApply('dark', 'dark')
    await settle()
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('true')
  })

  it('o desinstalador solta os observadores e o listener do sistema', async () => {
    const media = stubMatchMedia(false)
    install()
    uninstall?.()
    uninstall = undefined
    hostPresenterApply('dark', 'dark')
    await settle()
    expect(document.body.getAttribute(DARK_THEME_ATTRIBUTE)).toBe('') // ninguém normaliza mais
    document.body.removeAttribute(DARK_THEME_ATTRIBUTE)
    media.set(true)
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
  })
})
