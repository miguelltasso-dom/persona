// @vitest-environment jsdom
// P1-11 (NEXT-STEP-SHORTCUTS-SPEC §2): o toast "Dica: Ctrl K → 'quadros' chega aqui mais rápido." na 3ª chegada pelo mouse à mesma tela.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { en as shellEn, pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { PersonaAppFrame } from '../src/client/shell/PersonaAppFrame.tsx'
import { createShellStore, type MainPanelId } from '../src/client/shell/create-shell-store.ts'
import { SHORTCUT_TIP_SEEN_KEY } from '../src/client/shell/shortcut-tip-rules.ts'
import { ShortcutTipToast } from '../src/client/shell/ShortcutTipToast.tsx'
import { SHORTCUT_TIPS_KEY, resetShortcutTipsMemory, setShortcutTipsEnabled } from '../src/client/shell/shortcut-tips-preference.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { globalStandardProps } from './global-standard-props.client.ts'

const tPt = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never
const tEn = ((key: string, params?: Record<string, string | number>) => bindLocale(shellEn, key, params)) as never

function resetStorage(): void {
  localStorage.removeItem(SHORTCUT_TIP_SEEN_KEY)
  localStorage.removeItem(SHORTCUT_TIPS_KEY)
  resetShortcutTipsMemory()
}

beforeEach(() => {
  vi.useFakeTimers()
  resetStorage()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
  resetStorage()
})

/** Uma sessão: `go(painel)` = a pessoa clica (mouse) e a tela troca. */
function session(t: never = tPt, first: MainPanelId = 'overview') {
  const view = render(<ShortcutTipToast t={t} activePanel={first} />)
  const go = (panel: MainPanelId, how: 'mouse' | 'keyboard' | 'program' = 'mouse'): void => {
    if (how === 'mouse') fireEvent.pointerDown(document.body)
    if (how === 'keyboard') fireEvent.keyDown(document.body, { key: 'Enter' })
    act(() => { view.rerender(<ShortcutTipToast t={t} activePanel={panel} />) })
  }
  // `times` chegadas a `panel`, voltando entre elas a uma tela SEM dica (Canais): uma tela com dica acumularia as suas próprias chegadas e dispararia a dela
  const visit = (panel: MainPanelId, times: number, other: MainPanelId = 'channels', how: 'mouse' | 'keyboard' | 'program' = 'mouse'): void => {
    for (let i = 0; i < times; i += 1) {
      go(panel, how)
      if (i < times - 1) go(other, how)
    }
  }
  return { ...view, go, visit }
}

const tip = (): HTMLElement | null => document.querySelector('[data-shortcut-tip]')

describe('P1-11: a dica de atalho', () => {
  it('a 3ª chegada pelo mouse a Quadros mostra UMA dica, com a frase da Muse e as teclas em kbd', () => {
    const s = session()
    s.visit('kanban', 2)
    expect(tip()).toBeNull()
    s.go('channels')
    s.go('kanban')
    const node = tip()
    expect(node).not.toBeNull()
    expect(node?.textContent).toBe("Dica: Ctrl K → 'quadros' chega aqui mais rápido.")
    expect([...(node?.querySelectorAll('kbd') ?? [])].map(key => key.textContent)).toEqual(['Ctrl', 'K'])
    expect(document.querySelectorAll('[data-shortcut-tip]')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toContain('Ctrl')
    // o canto de sempre: uma região de toasts com nome próprio
    expect(screen.getByRole('region', { name: 'Dicas' })).toBeTruthy()
  })

  it('duas chegadas não bastam; teclado e chegadas sem toque do mouse não contam', () => {
    const s = session()
    s.visit('kanban', 2)
    expect(tip()).toBeNull()
    const k = session()
    k.visit('routines', 3, 'overview', 'keyboard')
    expect(tip()).toBeNull()
    const p = session()
    p.visit('files', 3, 'overview', 'program')
    expect(tip()).toBeNull()
  })

  it('a troca de tela passados 1,5 s do toque não é "do mouse"', () => {
    const view = render(<ShortcutTipToast t={tPt} activePanel="overview" />)
    const go = (panel: MainPanelId): void => {
      fireEvent.pointerDown(document.body)
      act(() => { vi.advanceTimersByTime(1600) })
      act(() => { view.rerender(<ShortcutTipToast t={tPt} activePanel={panel} />) })
    }
    go('kanban'); go('overview'); go('kanban'); go('overview'); go('kanban')
    expect(tip()).toBeNull()
  })

  it('chegar pelo Ctrl K / Busca ("Ir para") não conta: quem usou o atalho já o conhece', () => {
    const s = session()
    for (let i = 0; i < 4; i += 1) {
      s.go('search')
      s.go('kanban')
    }
    expect(tip()).toBeNull()
  })

  it('some sozinha em 6 s; o ✕ fecha antes', () => {
    const s = session()
    s.visit('kanban', 3)
    expect(tip()).not.toBeNull()
    act(() => { vi.advanceTimersByTime(5999) })
    expect(tip()).not.toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(tip()).toBeNull()
    expect(screen.queryByRole('region', { name: 'Dicas' })).toBeNull()

    const again = session()
    again.visit('routines', 3)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar dica' }))
    expect(tip()).toBeNull()
  })

  it('a dica sai junto quando a pessoa sai daquela tela', () => {
    const s = session()
    s.visit('kanban', 3)
    expect(tip()).not.toBeNull()
    s.go('usage')
    expect(tip()).toBeNull()
  })

  it('uma vez por atalho para sempre (storage) e 1 por sessão', () => {
    const s = session()
    s.visit('kanban', 3)
    expect(tip()).not.toBeNull()
    act(() => { vi.advanceTimersByTime(6000) })
    // mesma sessão, outra tela: 3 chegadas, nenhuma dica (1 por sessão)
    s.visit('routines', 3)
    expect(tip()).toBeNull()
    cleanup()
    expect(JSON.parse(localStorage.getItem(SHORTCUT_TIP_SEEN_KEY) ?? '[]')).toEqual(['kanban'])
    // sessão nova (recarregou): Quadros já foi ensinado, Rotinas ainda não
    const next = session()
    next.visit('kanban', 3)
    expect(tip()).toBeNull()
    next.visit('routines', 3)
    expect(tip()?.textContent).toContain("'rotinas'")
  })

  it('digitando ou com um Modal aberto a dica espera; liberou, a próxima chegada mostra', () => {
    const s = session()
    s.visit('usage', 2)
    s.go('channels')
    const field = document.createElement('textarea')
    document.body.append(field)
    field.focus()
    s.go('usage')
    expect(tip()).toBeNull()
    field.blur()
    field.remove()
    s.go('channels')
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    s.go('usage')
    expect(tip()).toBeNull()
    modal.remove()
    s.go('channels')
    s.go('usage')
    expect(tip()?.textContent).toContain("'uso e limites'")
  })

  it('"Dicas de atalho" desligada: nenhuma dica; desligar com a dica à vista a esconde', () => {
    setShortcutTipsEnabled(false)
    const off = session()
    off.visit('kanban', 4)
    expect(tip()).toBeNull()
    cleanup()
    setShortcutTipsEnabled(true)
    const on = session()
    on.visit('kanban', 3)
    expect(tip()).not.toBeNull()
    act(() => { setShortcutTipsEnabled(false) })
    expect(tip()).toBeNull()
  })

  it('conversas, Ajuda e perfil nunca ensinam', () => {
    const s = session()
    for (const panel of ['channels', 'directMessages', 'help', 'profile'] as const) {
      s.visit(panel, 4)
      expect(tip()).toBeNull()
    }
  })

  it('em inglês: "Tip: Ctrl K → \'boards\' gets you here faster."', () => {
    const s = session(tEn)
    s.visit('kanban', 3)
    expect(tip()?.textContent).toBe("Tip: Ctrl K → 'boards' gets you here faster.")
  })

  it('o frame monta a dica: 3 cliques de mouse no store do shell mostram o toast', () => {
    const { store, actions } = createShellStore()
    render(
      <PersonaAppFrame
        {...globalStandardProps}
        t={tPt}
        selectPanel={actions.selectPanel}
        useShell={bindObservableForTest(store)}
        renderSlot={((name: string) => (name === 'main' ? <h1>Tela</h1> : null)) as never}
      />,
    )
    for (let i = 0; i < 2; i += 1) {
      fireEvent.pointerDown(document.body)
      act(() => { actions.selectPanel('kanban') })
      fireEvent.pointerDown(document.body)
      act(() => { actions.selectPanel('channels') })
    }
    expect(document.querySelectorAll('[data-shortcut-tip]')).toHaveLength(0)
    fireEvent.pointerDown(document.body)
    act(() => { actions.selectPanel('kanban') })
    expect(document.querySelector('[data-shortcut-tip="kanban"]')?.textContent).toContain('Ctrl')
  })
})
