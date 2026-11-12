// @vitest-environment jsdom
// DESIGN-01-MUSE §5.2 #11 (Carbon #11): Ctrl K abre a busca como MODAL por cima da tela atual, sem desmontá-la. 150 ms para entrar, 110 ms para sair
// (corte seco com movimento reduzido); Esc, o fundo ou escolher um resultado fecham e o foco volta; 1–9 só valem com a paleta aberta (e o campo vazio);
// a mensagem achada pisca 1× por 900 ms.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PersonaAppFrame } from '../src/client/shell/PersonaAppFrame.tsx'
import { PALETTE_EXIT_MS, SearchPalette } from '../src/client/shell/SearchPalette.tsx'
import { SearchPlaceholderView, type SearchAction } from '../src/client/shell/SearchPlaceholderView.tsx'
import type { RailPersona } from '../src/client/shell/RailTeam.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { globalStandardProps } from './global-standard-props.client.ts'

installPreviewTheme()

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never
const CSS = readFileSync(join(import.meta.dirname, '../src/client/shell/SearchPalette.module.css'), 'utf8').replaceAll('\r\n', '\n')

let reduced = false
beforeEach(() => {
  localStorage.clear()
  reduced = false
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion') && reduced, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('o estado: a busca é uma paleta, não uma tela', () => {
  it('selectPanel("search") abre a paleta e NÃO troca a tela de baixo', () => {
    const { store, actions } = createShellStore()
    actions.selectPanel('projects')
    actions.selectPanel('search')
    expect(store.getSnapshot().searchOpen).toBe(true)
    expect(store.getSnapshot().activePanel).toBe('projects')
  })

  it('ir para qualquer outra tela fecha a paleta; closeSearch fecha sem mudar de tela', () => {
    const { store, actions } = createShellStore()
    actions.selectPanel('search')
    actions.selectPanel('approvals')
    expect(store.getSnapshot()).toMatchObject({ searchOpen: false, activePanel: 'approvals' })
    actions.openSearch()
    expect(store.getSnapshot().searchOpen).toBe(true)
    actions.closeSearch()
    expect(store.getSnapshot()).toMatchObject({ searchOpen: false, activePanel: 'approvals' })
  })
})

describe('a moldura da paleta', () => {
  const frame = (open: boolean, onClose = vi.fn()) => (
    <SearchPalette open={open} onClose={onClose} label="Busca">
      <input aria-label="campo" />
      <button type="button">resultado</button>
    </SearchPalette>
  )

  it('só existe aberta: um diálogo modal com nome', () => {
    const view = render(frame(false))
    expect(screen.queryByRole('dialog')).toBeNull()
    view.rerender(frame(true))
    const dialog = screen.getByRole('dialog', { name: 'Busca' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('Esc e o clique no fundo fecham; o clique dentro do diálogo não', () => {
    const onClose = vi.fn()
    render(frame(true, onClose))
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(document.querySelector('[data-persona-search-palette]') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('o foco volta para onde estava', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const view = render(frame(true))
    ;(screen.getByLabelText('campo') as HTMLElement).focus()
    view.rerender(frame(false))
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('saída de 110 ms: continua montada (data-closing) e some depois; com movimento reduzido some na hora', () => {
    vi.useFakeTimers()
    const view = render(frame(true))
    view.rerender(frame(false))
    expect(document.querySelector('[data-persona-search-palette]')?.hasAttribute('data-closing')).toBe(true)
    act(() => { vi.advanceTimersByTime(PALETTE_EXIT_MS + 5) })
    expect(document.querySelector('[data-persona-search-palette]')).toBeNull()
    cleanup()
    reduced = true
    const cut = render(frame(true))
    cut.rerender(frame(false))
    expect(document.querySelector('[data-persona-search-palette]')).toBeNull()
  })

  it('o Tab fica preso dentro do diálogo (do último volta ao primeiro)', () => {
    render(frame(true))
    const last = screen.getByRole('button', { name: 'resultado' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('campo'))
  })
})

describe('a busca dentro da paleta', () => {
  const TEAM: readonly RailPersona[] = [
    { id: 'p-nina', characterId: 'nina', name: 'Nina', role: 'Pesquisa', state: 'resting', unread: 0 },
  ]
  const useTeam = ((selector: (rows: readonly RailPersona[]) => unknown) => selector(TEAM)) as never

  function palette(extra: { readonly run?: () => void; readonly onClose?: () => void } = {}) {
    const actions: SearchAction[] = [
      { id: 'a1', label: 'Contratar persona', run: extra.run ?? vi.fn() },
      { id: 'a2', label: 'Ver as regras', run: vi.fn() },
    ]
    const openPersonaProfile = vi.fn()
    const navigate = vi.fn()
    const onClose = extra.onClose ?? vi.fn()
    render(
      <SearchPalette open onClose={onClose} label="Busca">
        <SearchPlaceholderView t={t} useTeam={useTeam} navigate={navigate} openPersonaProfile={openPersonaProfile} actions={actions} />
      </SearchPalette>,
    )
    return { actions, openPersonaProfile, navigate, onClose }
  }

  it('sem o cabeçalho de página: só o campo, e "Fazer agora" já vem com o campo vazio, numerado de 1 a 9', () => {
    palette()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    const section = screen.getByRole('region', { name: shellPt['search.do'] })
    const numbers = [...section.querySelectorAll('kbd')].map(node => node.textContent)
    expect(numbers).toEqual(['1', '2'])
  })

  it('apertar 2 com o campo vazio roda a 2ª ação e fecha a paleta', () => {
    const { actions, onClose } = palette()
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: '2' })
    expect(actions[1]?.run).toHaveBeenCalledTimes(1)
    expect(actions[0]?.run).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('com texto no campo um número é só texto (nenhuma ação roda); com Ctrl/Alt também não', () => {
    const { actions } = palette()
    const field = screen.getByRole('searchbox')
    fireEvent.change(field, { target: { value: 'nina' } })
    fireEvent.keyDown(field, { key: '1' })
    expect(actions[0]?.run).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.keyDown(field, { key: '1', ctrlKey: true })
    fireEvent.keyDown(field, { key: '1', altKey: true })
    expect(actions[0]?.run).not.toHaveBeenCalled()
  })

  it('escolher uma pessoa abre o perfil e fecha a paleta; Esc no campo também fecha', () => {
    const { openPersonaProfile, onClose } = palette()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nin' } })
    fireEvent.click(within(screen.getByRole('region', { name: shellPt['search.team'] })).getByRole('button', { name: /Nina/u }))
    expect(openPersonaProfile).toHaveBeenCalledWith('p-nina')
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ordem na paleta: Fazer agora, Pessoas e só depois Ir para; na página o "Ir para" vem antes das pessoas', () => {
    palette()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'e' } })
    const titles = [...document.querySelectorAll('h2')].map(node => node.textContent)
    expect(titles.indexOf(shellPt['search.team'])).toBeGreaterThanOrEqual(0)
    expect(titles.indexOf(shellPt['search.team'])).toBeLessThan(titles.indexOf(shellPt['search.goTo']))
    cleanup()
    render(<SearchPlaceholderView t={t} useTeam={useTeam} navigate={vi.fn()} openPersonaProfile={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'e' } })
    const page = [...document.querySelectorAll('h2')].map(node => node.textContent)
    expect(page.indexOf(shellPt['search.goTo'])).toBeLessThan(page.indexOf(shellPt['search.team']))
  })

  it('como PÁGINA (sem paleta) nada mudou: tem o cabeçalho e os números não rodam nada', () => {
    const run = vi.fn()
    render(<SearchPlaceholderView t={t} actions={[{ id: 'a1', label: 'Contratar persona', run }]} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: '1' })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('no frame do app: a tela de baixo continua montada', () => {
  it('com a paleta aberta a tela atual segue no DOM e a paleta aparece por cima; fechar mantém a mesma tela', () => {
    const { store, actions } = createShellStore()
    actions.selectPanel('projects')
    const renderSlot = ((name: string, _props: unknown, options?: { readonly entryKey?: string }) => {
      if (name === 'main') return options?.entryKey === 'search' ? <div data-testid="search-view">busca</div> : <div data-testid="screen">tela {options?.entryKey}</div>
      return null
    }) as never
    const view = render(
      <PersonaAppFrame
        {...globalStandardProps}
        t={t}
        renderSlot={renderSlot}
        useShell={bindObservableForTest(store)}
        selectPanel={actions.selectPanel}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { actions.selectPanel('search') })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('search-view')).toBeTruthy()
    expect(screen.getByTestId('screen').textContent).toBe('tela projects')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(store.getSnapshot()).toMatchObject({ searchOpen: false, activePanel: 'projects' })
    view.unmount()
  })
})

describe('o CSS da paleta e da mensagem achada', () => {
  const block = (css: string, header: string): string => {
    const start = css.indexOf(header)
    if (start < 0) return ''
    const open = css.indexOf('{', start)
    let depth = 0
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++
      if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
    }
    return ''
  }

  it('a 14vh do topo, min(640px, 92vw), até 460px, raio xl e sombra flutuante', () => {
    expect(block(CSS, '.backdrop {')).toMatch(/padding-top:\s*14vh\s*;/u)
    const dialog = block(CSS, '.dialog {')
    expect(dialog).toMatch(/width:\s*min\(640px,\s*92vw\)\s*;/u)
    // até 460 px, mas nunca além da janela (a 200% a janela tem 360 px): a lista de dentro rola (Ember, pré-aceite do lote)
    expect(dialog).toMatch(/max-height:\s*min\(460px,\s*calc\(100vh\s*-\s*14vh\s*-\s*16px\)\)\s*;/u)
    expect(dialog).toMatch(/max-height:\s*min\(460px,\s*calc\(100dvh\s*-\s*14vh\s*-\s*16px\)\)\s*;/u)
    expect(dialog).toMatch(/border-radius:\s*var\(--persona-radius-xl\)\s*;/u)
    expect(dialog).toMatch(/box-shadow:\s*var\(--persona-shadow-float\)\s*;/u)
  })

  it('entra em 150 ms (escala 0,97 → 1 e opacidade) e sai em 110 ms com a curva de saída; fundo sólido, sem blur', () => {
    expect(block(CSS, '.dialog {')).toMatch(/animation:\s*paletteIn\s+150ms\s+var\(--ease-enter\)/u)
    expect(block(CSS, '.backdrop[data-closing] .dialog {')).toMatch(/animation:\s*paletteOut\s+110ms\s+var\(--ease-exit\)/u)
    expect(block(CSS, '@keyframes paletteIn')).toMatch(/scale\(0\.97\)[\s\S]*scale\(1\)/u)
    expect(CSS).toMatch(/background:\s*rgb\(36 22 48 \/ 0\.56\)/u)
    expect(CSS).toMatch(/background:\s*rgb\(8 4 12 \/ 0\.72\)/u)
    expect(CSS).not.toMatch(/backdrop-filter|filter:\s*blur/u)
  })

  it('com movimento reduzido: corte seco', () => {
    expect(block(CSS, '@media (prefers-reduced-motion: reduce)')).toMatch(/animation:\s*none\s*;/u)
  })

  it('a mensagem achada pisca 1× por 900 ms; com movimento reduzido fica só o contorno parado', () => {
    const channel = readFileSync(join(import.meta.dirname, '../src/client/chat/GeneralChannelView.module.css'), 'utf8').replaceAll('\r\n', '\n')
    expect(channel).toMatch(/\[data-message-id\]\[data-focus-pulse\][^{]*\{[^}]*animation:\s*searchFound\s+900ms[^;]*\s1\s*;/u)
    expect(channel).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:global\(\[data-message-id\]\[data-focus-pulse\][^{]*\{[^}]*animation:\s*none\s*;[^}]*outline:/u)
  })
})
