// @vitest-environment jsdom
// P0-22 (UX-BEYOND): em janela baixa (< 600 px, zoom 200%) o rail marca `data-short`, a folhagem sai por CSS e o slot de
// Configurações é pedido em modo estreito (só o ícone) para dividir a linha com a pílula de estado.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonaSidebar } from '../src/client/shell/PersonaSidebar.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { SHORT_VIEWPORT_QUERY } from '../src/client/shell/use-short-viewport.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

interface FakeMedia {
  matches: boolean
  addEventListener: (type: 'change', listener: () => void) => void
  removeEventListener: (type: 'change', listener: () => void) => void
}

let short = false
const listeners = new Set<() => void>()

beforeEach(() => {
  localStorage.clear()
  short = false
  listeners.clear()
  vi.stubGlobal('matchMedia', (query: string): FakeMedia => ({
    get matches() { return query === SHORT_VIEWPORT_QUERY && short },
    addEventListener: (_type, listener) => { listeners.add(listener) },
    removeEventListener: (_type, listener) => { listeners.delete(listener) },
  }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function renderRail(renderSlot: (name: string, props: { wide: boolean }) => null) {
  const { store } = createShellStore()
  const approvals = createSnapshotStore({ pending: 0 })
  const team = createSnapshotStore<readonly never[]>([])
  const revision = createSnapshotStore({ n: 0 })
  return render(
    <PersonaSidebar
      t={t}
      useShell={bindObservableForTest(store)}
      useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
      usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
      useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
      selectPanel={() => {}}
      renderSlot={renderSlot as never}
    />,
  )
}

const rail = (): HTMLElement => document.querySelector('nav[data-persona-area="rail"]') as HTMLElement

describe('rail em janela baixa (P0-22)', () => {
  it('janela alta: sem data-short', () => {
    const renderSlot = vi.fn((_name: string, _props: { wide: boolean }) => null)
    renderRail(renderSlot)
    expect(rail().hasAttribute('data-short')).toBe(false)
    // flag A-1 desligada (padrão, D-077): o gatilho do DSW, com o nome
    expect(renderSlot).toHaveBeenLastCalledWith('sidebar.settings', { wide: true })
  })

  it('janela baixa, flag desligada: data-short e o gatilho do DSW só com o ícone (wide: false), como antes', () => {
    short = true
    const renderSlot = vi.fn((_name: string, _props: { wide: boolean }) => null)
    renderRail(renderSlot)
    expect(rail().hasAttribute('data-short')).toBe(true)
    expect(renderSlot).toHaveBeenLastCalledWith('sidebar.settings', { wide: false })
  })

  it('janela baixa, flag A-1 ligada: o slot do DSW segue montado no modo largo (o nosso botão decide o ícone-só)', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    short = true
    const renderSlot = vi.fn((_name: string, _props: { wide: boolean }) => null)
    renderRail(renderSlot)
    expect(rail().hasAttribute('data-short')).toBe(true)
    expect(renderSlot).toHaveBeenLastCalledWith('sidebar.settings', { wide: true })
  })

  it('acompanha o zoom: muda sozinho quando a media query muda, sem recarregar', () => {
    const renderSlot = vi.fn((_name: string, _props: { wide: boolean }) => null)
    renderRail(renderSlot)
    expect(rail().hasAttribute('data-short')).toBe(false)
    short = true
    act(() => { for (const listener of listeners) listener() })
    expect(rail().hasAttribute('data-short')).toBe(true)
    short = false
    act(() => { for (const listener of listeners) listener() })
    expect(rail().hasAttribute('data-short')).toBe(false)
  })

  it('a pílula de estado continua sendo um botão com o nome completo (o texto só trunca por CSS)', () => {
    short = true
    renderRail(() => null)
    const pill = document.querySelector('button[aria-haspopup="dialog"]') as HTMLElement
    expect(pill).toBeTruthy()
    expect(pill.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: pill.getAttribute('aria-label') ?? '' })).toBe(pill)
  })
})
