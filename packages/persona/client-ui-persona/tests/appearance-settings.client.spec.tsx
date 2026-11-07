// @vitest-environment jsdom
// TH-1 (Muse, APARENCIA-SPEC): Configurações › Aparência. Tema Sistema/Claro/Escuro em 3 cartões com miniatura de tokens, a troca AO VIVO muda
// body[data-ds-dark-theme] nos 3 estados, a escolha fica no Config do usuário (espelhada para a próxima abertura) e o Switch "Dicas de atalho".
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppearanceSettingsPanel } from '../src/client/shell/AppearanceSettingsPanel.tsx'
import { NAV_GROUPS } from '../src/client/shell/nav-groups.ts'
import { NAV_PLACES, panelsReachableFromPlaces, placeOfPanel } from '../src/client/shell/nav-places.ts'
import {
  SHORTCUT_TIPS_KEY, isShortcutTipsEnabled, resetShortcutTipsMemory, setShortcutTipsEnabled,
} from '../src/client/shell/shortcut-tips-preference.ts'
import {
  DARK_THEME_ATTRIBUTE, THEME_SOURCE_ATTRIBUTE, installPersonaColorScheme,
} from '../src/client/theme/install-color-scheme.ts'
import {
  THEME_CHOICES, THEME_MIRROR_KEY, applyStoredThemeEarly, createLocalThemeBridge, createThemeBridge, installThemeSync,
  readThemeMirror, writeThemeMirror, type ThemeBridge, type ThemeChoice,
} from '../src/client/theme/theme-preference.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { en as shellEn, pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

type Listener = () => void

/** `prefers-color-scheme` do navegador de mentira; `set` muda o Windows (e avisa quem escuta). */
function stubSystemScheme(initialDark: boolean) {
  const listeners = new Set<Listener>()
  const media = {
    matches: initialDark,
    addEventListener: (_: string, fn: Listener) => { listeners.add(fn) },
    removeEventListener: (_: string, fn: Listener) => { listeners.delete(fn) },
  }
  vi.stubGlobal('matchMedia', () => media)
  Object.defineProperty(window, 'matchMedia', { value: () => media, configurable: true })
  return { set(dark: boolean) { media.matches = dark; for (const fn of listeners) fn() } }
}

/** O que o `ThemePresenter` do host escreve a cada `theme/change`: html[data-ds-theme-source] e a PRESENÇA no body escuro. */
function presenterApply(dark: boolean, preference: string): void {
  document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE, preference === 'system' ? 'system' : dark ? 'dark' : 'light')
  if (dark) document.body.setAttribute(DARK_THEME_ATTRIBUTE, '')
  else document.body.removeAttribute(DARK_THEME_ATTRIBUTE)
}

/** O serviço de tema do ui-theme (ThemeRuntime) e o `ctx` que o expõe, de mentira: setTheme grava a preferência e publica `theme/change`. */
function fakeThemeCtx(initial: string = 'system', options: { readonly presenter?: boolean } = {}) {
  const listeners = new Set<(snapshot: { readonly preference: string }) => void>()
  let preference = initial
  const publish = (): void => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    // `presenter: false` = o shell REAL (medido no bundle 3): o ThemePresenter do host não escreve no DOM; só `theme/change` é publicado.
    if (options.presenter !== false) presenterApply(preference === 'dark' || (preference === 'system' && systemDark), preference)
    for (const listener of listeners) listener({ preference })
  }
  const service = {
    getTheme: () => ({ preference }),
    setTheme: vi.fn((id: string) => {
      if (preference === id) return
      preference = id
      publish()
    }),
  }
  const ctx = {
    get: (name: string) => (name === 'theme' ? service : undefined),
    on: (_event: string, listener: (snapshot: { readonly preference: string }) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  /** O Config do usuário chegou (ou outro lugar trocou o tema): a preferência muda e o host publica. */
  return { ctx, service, adopt: (next: string) => { preference = next; publish() }, listenerCount: () => listeners.size }
}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never
const tEn = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellEn, key, params)) as never

const bodyDark = (): string | null => document.body.getAttribute(DARK_THEME_ATTRIBUTE)
const radio = (name: RegExp): HTMLInputElement => screen.getByRole('radio', { name }) as HTMLInputElement

let uninstall: (() => void) | undefined
let uninstallSync: (() => void) | undefined
const install = (): void => { uninstall = installPersonaColorScheme() }

beforeEach(() => {
  document.body.removeAttribute(DARK_THEME_ATTRIBUTE)
  document.documentElement.removeAttribute(THEME_SOURCE_ATTRIBUTE)
  document.documentElement.style.removeProperty('color-scheme')
  localStorage.clear()
  resetShortcutTipsMemory()
})
afterEach(() => {
  cleanup()
  uninstall?.()
  uninstall = undefined
  uninstallSync?.()
  uninstallSync = undefined
  Reflect.deleteProperty(window, 'personaDesktop')
  vi.unstubAllGlobals()
})

describe('o painel: 3 cartões de tema', () => {
  it('mostra Tema com Sistema, Claro e Escuro, cada um com a sua frase (pt)', () => {
    stubSystemScheme(false)
    render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Aparência' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Tema' })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getAllByRole('radio').map(input => (input as HTMLInputElement).value)).toEqual(['system', 'light', 'dark'])
    expect(screen.getByText('Segue o claro ou o escuro do Windows.')).toBeTruthy()
    expect(screen.getByText('Dia: papel creme e folhagem.')).toBeTruthy()
    expect(screen.getByText('Noite: a luminária acesa e os vaga-lumes.')).toBeTruthy()
  })

  it('as mesmas frases em inglês', () => {
    stubSystemScheme(false)
    render(<AppearanceSettingsPanel t={tEn} themeBridge={createLocalThemeBridge()} />)
    expect(screen.getByText('Follows Windows light or dark.')).toBeTruthy()
    expect(screen.getByText('Day: cream paper and leaves.')).toBeTruthy()
    expect(screen.getByText('Night: the lamp on and the fireflies.')).toBeTruthy()
    expect(screen.getByText('Shortcut tips')).toBeTruthy()
  })

  it('o padrão é Sistema', () => {
    stubSystemScheme(false)
    render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    expect(radio(/^Sistema/u).checked).toBe(true)
    expect(radio(/^Claro/u).checked).toBe(false)
    expect(radio(/^Escuro/u).checked).toBe(false)
  })

  it('cada cartão tem a miniatura 120 × 72 feita dos tokens da sua paleta; "Sistema" junta as duas na diagonal', () => {
    stubSystemScheme(false)
    const { container } = render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    const minis = [...container.querySelectorAll<HTMLElement>('[data-theme-mini]')]
    expect(minis.map(mini => mini.dataset.themeMini)).toEqual(['system', 'light', 'dark'])
    const schemes = (choice: string): string[] => [...container.querySelectorAll<HTMLElement>(`[data-theme-mini="${choice}"] [data-persona-scheme]`)]
      .map(scene => scene.dataset.personaScheme ?? '')
    expect(schemes('light')).toEqual(['light'])
    expect(schemes('dark')).toEqual(['dark'])
    expect(schemes('system')).toEqual(['light', 'dark'])
    // decorativa: o título e a frase do cartão dizem o resto
    for (const mini of minis) expect(mini.getAttribute('aria-hidden')).toBe('true')
    // a noite tem a luminária e os vaga-lumes; o dia não
    expect(container.querySelectorAll('[data-theme-mini="dark"] [data-n]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-theme-mini="light"] [data-n]')).toHaveLength(0)
  })

  it('o grupo usa a variante de pré-visualização (3 em linha, empilha em janelas estreitas)', () => {
    stubSystemScheme(false)
    const { container } = render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    expect(container.querySelector('[data-variant="preview"]')).toBeTruthy()
  })
})

describe('a troca é AO VIVO e muda body[data-ds-dark-theme] nos 3 estados', () => {
  it('Sistema com o Windows no escuro: escuro; no claro: claro; e acompanha o Windows ao vivo', async () => {
    const system = stubSystemScheme(true)
    install()
    const { ctx } = fakeThemeCtx('light')
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    fireEvent.click(radio(/^Sistema/u))
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    system.set(false)
    await waitFor(() => { expect(bodyDark()).toBeNull() })
    system.set(true)
    await waitFor(() => { expect(bodyDark()).toBe('true') })
  })

  it('Claro: claro mesmo com o Windows no escuro (o atributo é REMOVIDO, não "false")', async () => {
    stubSystemScheme(true)
    install()
    const { ctx } = fakeThemeCtx('dark')
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    fireEvent.click(radio(/^Claro/u))
    await waitFor(() => { expect(bodyDark()).toBeNull() })
    expect(document.body.hasAttribute(DARK_THEME_ATTRIBUTE)).toBe(false)
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('light')
  })

  it('Escuro: escuro mesmo com o Windows no claro, com o VALOR "true" que a paleta casa (e não vazio)', async () => {
    stubSystemScheme(false)
    install()
    const { ctx } = fakeThemeCtx('light')
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    fireEvent.click(radio(/^Escuro/u))
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    expect(document.body.matches("[data-ds-dark-theme='true']")).toBe(true)
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('dark')
  })

  it('claro → escuro → sistema na mesma sessão, sem reiniciar', async () => {
    const system = stubSystemScheme(false)
    install()
    const { ctx, service } = fakeThemeCtx('light')
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    fireEvent.click(radio(/^Escuro/u))
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    expect(radio(/^Escuro/u).checked).toBe(true)
    fireEvent.click(radio(/^Claro/u))
    await waitFor(() => { expect(bodyDark()).toBeNull() })
    system.set(true)
    fireEvent.click(radio(/^Sistema/u))
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    expect(service.setTheme.mock.calls.map(call => call[0])).toEqual(['dark', 'light', 'system'])
  })

  it('o cartão marcado segue a preferência do host, mesmo quando outro lugar troca o tema (modal do DSW, Config)', async () => {
    stubSystemScheme(false)
    install()
    const { ctx, adopt } = fakeThemeCtx('system')
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    expect(radio(/^Sistema/u).checked).toBe(true)
    adopt('dark')
    await waitFor(() => { expect(radio(/^Escuro/u).checked).toBe(true) })
    expect(bodyDark()).toBe('true')
  })

  it('sem o serviço de tema do host (galeria, prévia web) a ponte local aplica no <html> e o body muda do mesmo jeito', async () => {
    stubSystemScheme(false)
    install()
    render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    fireEvent.click(radio(/^Escuro/u))
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    fireEvent.click(radio(/^Claro/u))
    await waitFor(() => { expect(bodyDark()).toBeNull() })
    fireEvent.click(radio(/^Sistema/u))
    await waitFor(() => { expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('system') })
    expect(document.documentElement.style.colorScheme).toBe('')
  })
})

describe('persistência: a escolha fica no Config do usuário e a próxima abertura pinta certo de primeira', () => {
  it('escolher grava no serviço de tema do host (Config do usuário) E no espelho local', () => {
    stubSystemScheme(false)
    const { ctx, service } = fakeThemeCtx('system')
    const bridge = createThemeBridge(ctx)
    expect(bridge.persistence).toBe('config')
    render(<AppearanceSettingsPanel t={t} themeBridge={bridge} />)
    fireEvent.click(radio(/^Escuro/u))
    expect(service.setTheme).toHaveBeenCalledWith('dark')
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('dark')
  })

  it('sem o serviço, a ponte é local e diz isso', () => {
    stubSystemScheme(false)
    expect(createThemeBridge({ get: () => undefined }).persistence).toBe('local')
    expect(createThemeBridge({}).persistence).toBe('local')
  })

  it('a tela publica onde a escolha fica guardada (config com o serviço do host, local sem ele) para as provas lerem', () => {
    stubSystemScheme(false)
    const { container, unmount } = render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(fakeThemeCtx().ctx)} />)
    expect(container.querySelector('[data-theme-persistence]')?.getAttribute('data-theme-persistence')).toBe('config')
    unmount()
    const local = render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    expect(local.container.querySelector('[data-theme-persistence]')?.getAttribute('data-theme-persistence')).toBe('local')
  })

  it('o espelho acompanha TODA troca do host, também as feitas fora desta tela', () => {
    stubSystemScheme(false)
    const { ctx, adopt } = fakeThemeCtx('system')
    const stop = installThemeSync(ctx)
    adopt('dark')
    expect(readThemeMirror()).toBe('dark')
    adopt('light')
    expect(readThemeMirror()).toBe('light')
    stop()
    adopt('dark')
    expect(readThemeMirror()).toBe('light')
  })

  it('sem o serviço de tema não há o que sincronizar (nada é escutado)', () => {
    expect(installThemeSync({ get: () => undefined })()).toBeUndefined()
  })
})

describe('sem o ThemePresenter do host (o shell REAL, medido no bundle 3): o Persona aplica a escolha sozinho', () => {
  it('escolher Escuro no painel troca o <html> e o <body> mesmo sem o presenter, e a escolha vai ao serviço do host', async () => {
    stubSystemScheme(false)
    install()
    const { ctx, service } = fakeThemeCtx('system', { presenter: false })
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    expect(bodyDark()).toBeNull()
    fireEvent.click(radio(/^Escuro/u))
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(service.setTheme).toHaveBeenCalledWith('dark')
    fireEvent.click(radio(/^Claro/u))
    await waitFor(() => { expect(bodyDark()).toBeNull() })
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('light')
  })

  it('Claro com o Windows no escuro (o caso que a captura mostrou falhar): claro de verdade', async () => {
    stubSystemScheme(true)
    install()
    const { ctx } = fakeThemeCtx('system', { presenter: false })
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    fireEvent.click(radio(/^Claro/u))
    await waitFor(() => { expect(bodyDark()).toBeNull() })
  })

  it('a troca que vem de fora (modal de Configurações do DSW, Config que chega depois) também vai ao DOM pelo instalador de sincronia', async () => {
    stubSystemScheme(false)
    install()
    const { ctx, adopt } = fakeThemeCtx('system', { presenter: false })
    uninstallSync = installThemeSync(ctx)
    adopt('dark')
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('dark')
    adopt('system')
    await waitFor(() => { expect(bodyDark()).toBeNull() })
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('system')
  })

  it('com o presenter ativo os dois escrevem os mesmos valores (sem se contradizer)', async () => {
    stubSystemScheme(false)
    install()
    const { ctx } = fakeThemeCtx('system')
    uninstallSync = installThemeSync(ctx)
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    fireEvent.click(radio(/^Escuro/u))
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('dark')
    fireEvent.click(radio(/^Sistema/u))
    await waitFor(() => { expect(bodyDark()).toBeNull() })
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('system')
  })
})

describe('persistência (continuação)', () => {

  it('reabrir: o tema salvo vai para o <html> e o <body> ANTES do app montar (sem piscar o tema errado)', () => {
    stubSystemScheme(false)
    writeThemeMirror('dark')
    applyStoredThemeEarly(document, window)
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(bodyDark()).toBe('true')
  })

  it('reabrir em Claro com o Windows no escuro: claro de primeira', () => {
    stubSystemScheme(true)
    writeThemeMirror('light')
    applyStoredThemeEarly(document, window)
    expect(bodyDark()).toBeNull()
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('light')
  })

  it('reabrir em Sistema segue o Windows (e não deixa o color-scheme fixo)', () => {
    stubSystemScheme(true)
    writeThemeMirror('system')
    applyStoredThemeEarly(document, window)
    expect(bodyDark()).toBe('true')
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('system')
    expect(document.documentElement.style.colorScheme).toBe('')
  })

  it('o boot do host (Config do usuário no <html>, presença "" no <body>) vira o valor "true" que a paleta casa, sem espelho nenhum', () => {
    stubSystemScheme(false)
    // o que `boot-theme.ts` escreve a cada carga: html[data-ds-theme-source]=dark e body com a presença (vazia)
    document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE, 'dark')
    document.body.setAttribute(DARK_THEME_ATTRIBUTE, '')
    applyStoredThemeEarly(document, window)
    expect(bodyDark()).toBe('true')
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('dark')
    // Config em "claro" com o Windows no escuro: o boot não deixa o atributo no body, e continua claro
    stubSystemScheme(true)
    document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE, 'light')
    applyStoredThemeEarly(document, window)
    expect(bodyDark()).toBeNull()
  })

  it('o Config (boot do host) vence um espelho velho', () => {
    stubSystemScheme(false)
    writeThemeMirror('dark')
    document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE, 'light')
    applyStoredThemeEarly(document, window)
    expect(bodyDark()).toBeNull()
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('light')
  })

  it('sem nada salvo não toca em nada; o que o host já escreveu no <html> não é sobrescrito', () => {
    stubSystemScheme(true)
    applyStoredThemeEarly(document, window)
    expect(document.documentElement.hasAttribute(THEME_SOURCE_ATTRIBUTE)).toBe(false)
    expect(bodyDark()).toBeNull()
    writeThemeMirror('dark')
    document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE, 'light')
    applyStoredThemeEarly(document, window)
    expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('light')
    expect(bodyDark()).toBeNull()
  })

  it('o painel reaberto mostra o cartão salvo', () => {
    stubSystemScheme(false)
    const first = fakeThemeCtx('system')
    const { unmount } = render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(first.ctx)} />)
    fireEvent.click(radio(/^Escuro/u))
    unmount()
    // reabre: o Config do usuário devolve a preferência salva
    const reopened = fakeThemeCtx(first.service.getTheme().preference)
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(reopened.ctx)} />)
    expect(radio(/^Escuro/u).checked).toBe(true)
  })

  it('espelho inválido ou storage bloqueado: ignora, sem lançar', () => {
    localStorage.setItem(THEME_MIRROR_KEY, 'roxo')
    expect(readThemeMirror()).toBeUndefined()
    expect(readThemeMirror({ getItem: () => { throw new Error('blocked') } })).toBeUndefined()
    expect(() => { writeThemeMirror('dark', { setItem: () => { throw new Error('blocked') } }) }).not.toThrow()
    expect(THEME_CHOICES).toEqual(['system', 'light', 'dark'])
  })
})

describe('PERSONA_THEME (tema forçado do app instalado) continua vencendo', () => {
  const force = (value: ThemeChoice): void => {
    ;(window as unknown as { personaDesktop?: unknown }).personaDesktop = { forcedTheme: value }
  }

  it('forçado "dark" vence a escolha Claro (e o host reescrevendo o body não desfaz)', async () => {
    stubSystemScheme(false)
    force('dark')
    install()
    const { ctx } = fakeThemeCtx('system')
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    fireEvent.click(radio(/^Claro/u))
    await waitFor(() => { expect(bodyDark()).toBe('true') })
    // o presenter do host acabou de remover o atributo (preferência Claro): o forçado o restaura
    presenterApply(false, 'light')
    await waitFor(() => { expect(bodyDark()).toBe('true') })
  })

  it('forçado "light" vence a escolha Escuro', async () => {
    stubSystemScheme(true)
    force('light')
    install()
    const { ctx } = fakeThemeCtx('system')
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    fireEvent.click(radio(/^Escuro/u))
    await waitFor(() => { expect(document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)).toBe('dark') })
    expect(bodyDark()).toBeNull()
  })

  it('pintura de abertura: o forçado vence o espelho', () => {
    stubSystemScheme(false)
    writeThemeMirror('light')
    force('dark')
    applyStoredThemeEarly(document, window)
    expect(bodyDark()).toBe('true')
  })

  it('valor forçado inválido é ignorado', async () => {
    stubSystemScheme(false)
    ;(window as unknown as { personaDesktop?: unknown }).personaDesktop = { forcedTheme: 'roxo' }
    install()
    const { ctx } = fakeThemeCtx('system')
    render(<AppearanceSettingsPanel t={t} themeBridge={createThemeBridge(ctx)} />)
    fireEvent.click(radio(/^Escuro/u))
    await waitFor(() => { expect(bodyDark()).toBe('true') })
  })
})

describe('Dicas de atalho', () => {
  it('é um interruptor (role=switch) LIGADO por padrão, com o nome e a frase da spec', () => {
    stubSystemScheme(false)
    render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    const toggle = screen.getByRole('switch', { name: 'Dicas de atalho' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Mostrar uma dica quando houver um atalho mais rápido.')).toBeTruthy()
    expect(toggle.getAttribute('aria-describedby')).toBe('persona-shortcut-tips-hint')
    expect(isShortcutTipsEnabled()).toBe(true)
  })

  it('desligar grava, vale na hora para quem pergunta e sobrevive a reabrir; ligar de novo volta', () => {
    stubSystemScheme(false)
    const { unmount } = render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Dicas de atalho' }))
    expect(screen.getByRole('switch', { name: 'Dicas de atalho' }).getAttribute('aria-checked')).toBe('false')
    expect(localStorage.getItem(SHORTCUT_TIPS_KEY)).toBe('0')
    expect(isShortcutTipsEnabled()).toBe(false)
    unmount()
    resetShortcutTipsMemory()
    render(<AppearanceSettingsPanel t={t} themeBridge={createLocalThemeBridge()} />)
    expect(screen.getByRole('switch', { name: 'Dicas de atalho' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('switch', { name: 'Dicas de atalho' }))
    expect(screen.getByRole('switch', { name: 'Dicas de atalho' }).getAttribute('aria-checked')).toBe('true')
    expect(isShortcutTipsEnabled()).toBe(true)
  })

  it('storage bloqueado: a escolha vale na memória até recarregar, sem lançar', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => { setShortcutTipsEnabled(false) }).not.toThrow()
    expect(isShortcutTipsEnabled()).toBe(false)
    blocked.mockRestore()
  })
})

describe('a aba em Configurações', () => {
  it('fica entre Importadores e Sobre, com o id de painel `appearance`', () => {
    const settings = NAV_PLACES.find(place => place.id === 'settings')!
    const panels = settings.tabs.map(tab => tab.panel)
    expect(panels.indexOf('appearance')).toBe(panels.indexOf('importers') + 1)
    expect(panels.at(-1)).toBe('about')
    expect(placeOfPanel('appearance')?.id).toBe('settings')
    expect(panelsReachableFromPlaces()).toContain('appearance')
    const tab = settings.tabs.find(item => item.panel === 'appearance')!
    expect(shellPt[tab.labelKey]).toBe('Aparência')
    expect(shellEn[tab.labelKey]).toBe('Appearance')
  })

  it('com a navegação por lugares desligada a tela continua a 1 clique (grupo "Mais" da barra)', () => {
    const more = NAV_GROUPS.find(group => group.id === 'more')!
    expect(more.items.map(item => item.panel)).toContain('appearance')
  })
})

describe('estilos: só tokens, empilha a 960 / 200 %', () => {
  const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n')

  it('a miniatura é desenhada só com tokens (nenhum hex), nunca com uma captura', () => {
    const css = read('../src/client/shell/AppearanceSettingsPanel.module.css')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u)
    expect(css).not.toContain('url(')
    expect(css).toContain('var(--persona-rail)')
    expect(css).toContain('var(--persona-accent)')
    expect(css).toMatch(/width:\s*120px/u)
    expect(css).toMatch(/height:\s*72px/u)
  })

  it('a paleta abre os dois esquemas para um escopo local (a miniatura Claro na janela escura e vice-versa)', () => {
    const css = read('../src/client/theme/persona-palette.css')
    expect(css).toContain("body:not([data-ds-dark-theme='true']),\n[data-persona-scheme='light'] {")
    expect(css).toContain("body[data-ds-dark-theme='true'],\n[data-persona-scheme='dark'] {")
  })

  it('os 3 cartões ficam em linha e empilham em janelas até 1024 px (960 e o zoom de 200 % de 1440)', () => {
    const css = read('../src/client/primitives/ChoiceCards.module.css')
    expect(css).toMatch(/\.grid\[data-variant='preview'\] \{\n  grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/u)
    const narrow = css.slice(css.indexOf('@media (max-width: 1024px)'))
    expect(narrow).toContain('grid-template-columns: 1fr;')
    expect(narrow).toContain('flex-direction: row;')
  })

  it('a miniatura não anima (sem movimento próprio: o app segue o "reduzir movimento" do Windows)', () => {
    const css = read('../src/client/shell/AppearanceSettingsPanel.module.css')
    expect(css).not.toMatch(/animation|@keyframes|transition/u)
  })
})

describe('ponte', () => {
  it('a ponte local avisa quem escuta e para de avisar ao cancelar', () => {
    stubSystemScheme(false)
    const bridge: ThemeBridge = createLocalThemeBridge()
    const seen: ThemeChoice[] = []
    const stop = bridge.subscribe(choice => seen.push(choice))
    bridge.write('dark')
    stop()
    bridge.write('light')
    expect(seen).toEqual(['dark'])
    expect(bridge.read()).toBe('light')
  })

  it('um tema registrado por outro plugin (id fora das três escolhas) conta como Sistema neste painel', () => {
    const { ctx } = fakeThemeCtx('midnight')
    expect(createThemeBridge(ctx).read()).toBe('system')
  })
})
