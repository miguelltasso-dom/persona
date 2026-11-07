// @vitest-environment jsdom
// CV-1 (CONVERSAS-SPEC §0): a 960 px (ou 200% de zoom) a barra única vira o trilho de 64 px: ícones dos lugares, um # que abre a
// lista dos canais por cima e os rostos das Recentes. O trilho abre a barra inteira por cima (Esc e clique fora fecham). O jsdom
// não calcula layout; aqui ficam provados a estrutura, o teclado e o foco. As medidas ficam para a captura no shell real.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationsRail } from '../src/client/shell/ConversationsRail.tsx'
import { PersonaSidebar } from '../src/client/shell/PersonaSidebar.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { NAV_PLACES_FLAG_KEY } from '../src/client/shell/nav-flag.ts'
import { NARROW_WINDOW_QUERY, useNarrowWindow } from '../src/client/shell/use-narrow-window.ts'
import type { ConversationsSource } from '../src/client/shell/conversations-source.ts'
import type { ConversationTarget } from '../src/client/shell/conversation-selection.ts'
import type { RailPersona } from '../src/client/shell/RailTeam.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

/** Simula a janela: `narrow = true` faz a media query de largura casar. */
function mockWindow(narrow: boolean): { setNarrow: (value: boolean) => void } {
  let matches = narrow
  const listeners = new Set<() => void>()
  window.matchMedia = ((query: string) => ({
    matches: query === NARROW_WINDOW_QUERY ? matches : false,
    media: query,
    addEventListener: (_type: string, listener: () => void) => { listeners.add(listener) },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener) },
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as never
  return { setNarrow: (value) => { matches = value; for (const listener of [...listeners]) listener() } }
}

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useNarrowWindow', () => {
  it('segue a media query de largura ≤ 960 px', () => {
    const win = mockWindow(false)
    const { result } = renderHook(() => useNarrowWindow())
    expect(result.current).toBe(false)
    act(() => { win.setNarrow(true) })
    expect(result.current).toBe(true)
    expect(NARROW_WINDOW_QUERY).toBe('(max-width: 960px)')
  })

  it('sem matchMedia (ambiente antigo) é "não estreita"', () => {
    window.matchMedia = undefined as never
    const { result } = renderHook(() => useNarrowWindow())
    expect(result.current).toBe(false)
  })
})

const SOURCE: ConversationsSource = {
  channels: [{ id: 'ch-geral', name: 'geral', unread: 0 }],
  people: [
    { id: 'nina', name: 'Nina', role: 'Pesquisa', characterId: 'nina', state: 'working', teamId: null, teamName: null, unread: 3, hasConversation: true, recentRank: 0 },
    { id: 'luna', name: 'Luna', role: 'Vigia', characterId: 'luna', state: 'resting', teamId: null, teamName: null, unread: 0, hasConversation: false },
  ],
}

describe('ConversationsRail variant="trail"', () => {
  function trail(active: ConversationTarget | null = null) {
    const openConversation = vi.fn()
    const view = render(<ConversationsRail t={t} source={SOURCE} active={active} openConversation={openConversation} variant="trail" />)
    return { ...view, openConversation }
  }

  it('um # para os canais e os rostos (cada rosto é um botão com o nome acessível); nada de seções com texto', () => {
    const { container } = trail()
    expect(container.querySelector('[data-persona-conversations-trail]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Canais' }).textContent).toBe('#')
    const nina = container.querySelector('[data-persona-id="nina"]') as HTMLElement
    expect(nina.getAttribute('aria-label')).toContain('Nina')
    expect(nina.getAttribute('aria-label')).toContain('3')
    expect(screen.queryByText('Pessoas')).toBeNull()
  })

  it('até 8 pessoas: quem já conversou vem primeiro nos rostos', () => {
    const { container } = trail()
    expect([...container.querySelectorAll('[data-persona-id]')].map(node => node.getAttribute('data-persona-id'))).toEqual(['nina', 'luna'])
  })

  it('clicar num rosto abre a DM', () => {
    const { container, openConversation } = trail()
    fireEvent.click(container.querySelector('[data-persona-id="luna"]') as HTMLElement)
    expect(openConversation).toHaveBeenCalledWith({ kind: 'dm', personaId: 'luna' })
  })

  it('o # abre a lista dos canais por cima; escolher um canal abre e fecha a lista', () => {
    const { openConversation } = trail()
    const hash = screen.getByRole('button', { name: 'Canais' })
    expect(hash.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(hash)
    expect(hash.getAttribute('aria-expanded')).toBe('true')
    const list = screen.getByRole('list', { name: 'Canais' })
    fireEvent.click(within(list).getByText('geral'))
    expect(openConversation).toHaveBeenCalledWith({ kind: 'channel', id: 'ch-geral' })
    expect(screen.queryByRole('list', { name: 'Canais' })).toBeNull()
  })

  it('Esc fecha a lista dos canais e devolve o foco ao #; clique fora também fecha', () => {
    trail()
    const hash = screen.getByRole('button', { name: 'Canais' })
    fireEvent.click(hash)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('list', { name: 'Canais' })).toBeNull()
    expect(document.activeElement).toBe(hash)
    fireEvent.click(hash)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('list', { name: 'Canais' })).toBeNull()
  })

  it('a conversa aberta fica marcada: o # no canal, o rosto na DM (uma só)', () => {
    trail({ kind: 'channel', id: 'ch-geral' })
    expect(screen.getByRole('button', { name: 'Canais' }).getAttribute('aria-current')).toBe('page')
    cleanup()
    const { container } = trail({ kind: 'dm', personaId: 'nina' })
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(container.querySelector('[data-persona-id="nina"]')?.getAttribute('aria-current')).toBe('page')
  })

  it('Alt+↓ também percorre as conversas no trilho', () => {
    const { openConversation } = trail({ kind: 'channel', id: 'ch-geral' })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true }) })
    expect(openConversation).toHaveBeenLastCalledWith({ kind: 'dm', personaId: 'nina' })
  })
})


describe('PersonaSidebar: o trilho de 64 px e a barra que abre por cima', () => {
  const TEAM: readonly RailPersona[] = [{ id: 'nina', characterId: 'nina', name: 'Nina', role: 'Pesquisa', state: 'working', unread: 0 }]

  function observable<V>(initial: V): HostObservable<V> {
    return { getSnapshot: () => initial, subscribe: () => () => {} }
  }

  function sidebar() {
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    const { store } = createShellStore()
    const approvals = createSnapshotStore({ pending: 0 })
    const team = createSnapshotStore<readonly RailPersona[]>(TEAM)
    const revision = createSnapshotStore({ n: 0 })
    const openConversation = vi.fn()
    const selectPanel = vi.fn()
    const view = render(
      <PersonaSidebar
        t={t}
        useShell={bindObservableForTest(store)}
        useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
        usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
        useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
        selectPanel={selectPanel as never}
        renderSlot={(() => null) as never}
        openConversation={openConversation}
        activeConversation={observable<ConversationTarget | null>(null)}
        conversations={observable(SOURCE)}
      />,
    )
    const nav = view.container.querySelector('nav') as HTMLElement
    return { ...view, nav, openConversation, selectPanel }
  }

  it('janela larga: a barra completa de 296 px, sem trilho', () => {
    mockWindow(false)
    const { nav } = sidebar()
    expect(nav.hasAttribute('data-conversations')).toBe(true)
    expect(nav.hasAttribute('data-trail')).toBe(false)
    expect(nav.hasAttribute('data-collapsed')).toBe(false)
    expect(screen.getByRole('button', { name: 'Pessoas' })).toBeTruthy()
  })

  it('janela estreita: vira o trilho (recolhido, só ícones e rostos) e o botão da marca abre a barra por cima', () => {
    mockWindow(true)
    const { nav, container } = sidebar()
    expect(nav.hasAttribute('data-trail')).toBe(true)
    expect(nav.hasAttribute('data-collapsed')).toBe(true)
    expect(nav.hasAttribute('data-trail-open')).toBe(false)
    expect(container.querySelector('[data-persona-conversations-trail]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pessoas' })).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Expandir menu' })
    fireEvent.click(toggle)
    expect(nav.hasAttribute('data-trail-open')).toBe(true)
    expect(nav.hasAttribute('data-collapsed')).toBe(false)
    expect(screen.getByRole('button', { name: 'Pessoas' })).toBeTruthy()
  })

  it('aberta por cima: Esc fecha e o foco volta ao botão do trilho', () => {
    mockWindow(true)
    const { nav } = sidebar()
    const toggle = screen.getByRole('button', { name: 'Expandir menu' })
    fireEvent.click(toggle)
    expect(nav.hasAttribute('data-trail-open')).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(nav.hasAttribute('data-trail-open')).toBe(false)
    expect(document.activeElement).toBe(toggle)
  })

  it('aberta por cima: clicar fora fecha; clicar dentro não', () => {
    mockWindow(true)
    const { nav } = sidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menu' }))
    fireEvent.pointerDown(nav)
    expect(nav.hasAttribute('data-trail-open')).toBe(true)
    fireEvent.pointerDown(document.body)
    expect(nav.hasAttribute('data-trail-open')).toBe(false)
  })

  it('escolher uma conversa ou um lugar na barra aberta por cima fecha o trilho', () => {
    mockWindow(true)
    const { nav, container, openConversation, selectPanel } = sidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menu' }))
    fireEvent.click(container.querySelector('[data-persona-id="nina"]') as HTMLElement)
    expect(openConversation).toHaveBeenCalledWith({ kind: 'dm', personaId: 'nina' })
    expect(nav.hasAttribute('data-trail-open')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menu' }))
    fireEvent.click(container.querySelector('[data-nav-place="projects"]') as HTMLElement)
    expect(selectPanel).toHaveBeenCalled()
    expect(nav.hasAttribute('data-trail-open')).toBe(false)
  })

  it('a janela volta a ficar larga: o trilho e o "por cima" somem', () => {
    const win = mockWindow(true)
    const { nav } = sidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menu' }))
    act(() => { win.setNarrow(false) })
    expect(nav.hasAttribute('data-trail')).toBe(false)
    expect(nav.hasAttribute('data-trail-open')).toBe(false)
  })

  it('sem a flag do A-1 (ou sem as conversas) nunca vira trilho, mesmo estreita', () => {
    mockWindow(true)
    const { store } = createShellStore()
    const approvals = createSnapshotStore({ pending: 0 })
    const team = createSnapshotStore<readonly RailPersona[]>(TEAM)
    const revision = createSnapshotStore({ n: 0 })
    const { container } = render(
      <PersonaSidebar
        t={t}
        useShell={bindObservableForTest(store)}
        useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
        usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
        useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
        selectPanel={vi.fn() as never}
        renderSlot={(() => null) as never}
      />,
    )
    const nav = container.querySelector('nav') as HTMLElement
    expect(nav.hasAttribute('data-trail')).toBe(false)
    expect(nav.hasAttribute('data-conversations')).toBe(false)
  })
})

describe('o rodapé do trilho (CONVERSAS-SPEC §0.1): ponto → Ajuda → Configurações', () => {
  const TEAM2: readonly RailPersona[] = [{ id: 'nina', characterId: 'nina', name: 'Nina', role: 'Pesquisa', state: 'working', unread: 0 }]

  function footerRail(narrow: boolean) {
    mockWindow(narrow)
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    const { store } = createShellStore()
    const approvals = createSnapshotStore({ pending: 0 })
    const team = createSnapshotStore<readonly RailPersona[]>(TEAM2)
    const revision = createSnapshotStore({ n: 0 })
    const slotProps: Record<string, unknown>[] = []
    const view = render(
      <PersonaSidebar
        t={t}
        useShell={bindObservableForTest(store)}
        useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
        usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
        useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
        selectPanel={vi.fn() as never}
        renderSlot={(((name: string, props: Record<string, unknown>) => {
          slotProps.push({ name, ...props })
          return <button type="button" data-testid="settings-slot" data-wide={String(props.wide)}>Configurações</button>
        }) as never)}
        openConversation={vi.fn()}
        activeConversation={{ getSnapshot: () => null, subscribe: () => () => {} }}
        conversations={{ getSnapshot: () => SOURCE, subscribe: () => () => {} }}
      />,
    )
    return { ...view, slotProps, nav: view.container.querySelector('nav') as HTMLElement }
  }

  it('no trilho fechado: a ordem do DOM (e do Tab) é ponto de estado → Ajuda → Configurações', () => {
    const { nav } = footerRail(true)
    const pill = nav.querySelector('button[aria-haspopup="dialog"]') as HTMLElement
    const help = nav.querySelector('[data-nav-panel="help"]') as HTMLElement
    const settings = screen.getByTestId('settings-slot')
    const follows = (a: Node, b: Node): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(follows(pill, help)).toBe(true)
    expect(follows(help, settings)).toBe(true)
  })

  it('no trilho o slot das Configurações recebe wide:false (só o ícone, alvo de 40 px); na barra aberta, wide:true e a ordem de antes', () => {
    const closed = footerRail(true)
    expect(screen.getByTestId('settings-slot').getAttribute('data-wide')).toBe('false')
    closed.unmount()
    cleanup()
    const wide = footerRail(false)
    expect(screen.getByTestId('settings-slot').getAttribute('data-wide')).toBe('true')
    const help = wide.nav.querySelector('[data-nav-panel="help"]') as HTMLElement
    const settings = screen.getByTestId('settings-slot')
    expect((settings.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true) // Configurações antes da Ajuda
  })

  it('o ponto de estado ganha Tooltip com o texto da pílula (o ponto sozinho não diz nada) e sem title no botão', () => {
    vi.useFakeTimers()
    const { nav } = footerRail(true)
    const pill = nav.querySelector('button[aria-haspopup="dialog"]') as HTMLElement
    expect(pill.hasAttribute('title')).toBe(false)
    expect(pill.closest('[aria-describedby], span')).toBeTruthy()
    fireEvent.focus(pill)
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.getByRole('tooltip').textContent).toBe(pill.getAttribute('aria-label'))
    vi.useRealTimers()
  })

  it('abrir a barra por cima devolve o rodapé normal (Configurações com rótulo e antes da Ajuda)', () => {
    const { nav } = footerRail(true)
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menu' }))
    expect(nav.hasAttribute('data-trail-open')).toBe(true)
    expect(screen.getByTestId('settings-slot').getAttribute('data-wide')).toBe('true')
  })
})
