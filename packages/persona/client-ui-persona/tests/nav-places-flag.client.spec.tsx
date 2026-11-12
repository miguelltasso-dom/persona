// @vitest-environment jsdom
// D-077: a navegação em 6 lugares (A-1) entra ATRÁS DE FLAG, desligada por padrão, e só liga depois do aceite da Muse.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonaSidebar } from '../src/client/shell/PersonaSidebar.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { NAV_PLACES_FLAG_KEY, isPlacesNavEnabled } from '../src/client/shell/nav-flag.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
  vi.restoreAllMocks()
})

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

function rail(selectPanel: (panel: never) => void = () => {}, initialPanel?: string) {
  const { store, actions } = createShellStore()
  if (initialPanel !== undefined) actions.selectPanel(initialPanel as never)
  const approvals = createSnapshotStore({ pending: 2 })
  const team = createSnapshotStore<readonly never[]>([])
  const revision = createSnapshotStore({ n: 0 })
  return render(
    <PersonaSidebar
      t={t}
      useShell={bindObservableForTest(store)}
      useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
      usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
      useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
      selectPanel={selectPanel as never}
      renderSlot={(() => null) as never}
    />,
  )
}

const items = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[data-nav-item]')]

describe('a flag', () => {
  it('desligada por padrão', () => {
    expect(isPlacesNavEnabled()).toBe(false)
  })

  it('liga por localStorage="1" e por window.__PERSONA_FLAGS__; "0" ou lixo não liga; storage bloqueado = desligada', () => {
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    expect(isPlacesNavEnabled()).toBe(true)
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '0')
    expect(isPlacesNavEnabled()).toBe(false)
    localStorage.setItem(NAV_PLACES_FLAG_KEY, 'sim')
    expect(isPlacesNavEnabled()).toBe(false)
    ;(window as unknown as { __PERSONA_FLAGS__: unknown }).__PERSONA_FLAGS__ = { navPlaces: true }
    expect(isPlacesNavEnabled()).toBe(true)
    delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(isPlacesNavEnabled()).toBe(false)
  })
})

describe('rail com a flag DESLIGADA (o app de antes)', () => {
  it('mostra os itens de sempre (Canais, Mensagens diretas, Quadros…) e nenhum "Conversas" nem "Memória da empresa"', () => {
    const { container } = rail()
    const panels = items(container).map(node => node.getAttribute('data-nav-panel'))
    expect(panels).toContain('channels')
    expect(panels).toContain('directMessages')
    expect(panels).toContain('kanban')
    expect(screen.queryByRole('button', { name: /^Conversas/u })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Memória da empresa/u })).toBeNull()
    expect(container.querySelector('[data-nav-place]')).toBeNull()
  })
})

describe('rail com a flag LIGADA (5 lugares compactos + a barra de conversas)', () => {
  beforeEach(() => { localStorage.setItem(NAV_PLACES_FLAG_KEY, '1') })

  it('cinco lugares na ordem do NAV-SPEC (Conversas saiu: são a própria barra), sem grupos recolhíveis', () => {
    const { container } = rail()
    const places = items(container).filter(node => node.hasAttribute('data-nav-place'))
    expect(places.map(node => node.getAttribute('data-nav-place'))).toEqual(['overview', 'projects', 'approvals', 'team', 'memory'])
    expect(places.map(node => node.querySelector('[class*="navLabel"]')?.textContent)).toEqual([
      'Visão geral', 'Projetos', 'Aprovações', 'Equipe', 'Memória da empresa',
    ])
    expect(container.querySelector('#persona-nav-places [aria-expanded]')).toBeNull() // nada de grupo que dobra
    expect(container.querySelector('[class*="groupToggle"]')).toBeNull()
  })

  it('cada lugar traz data-nav-panel (entrada) e data-nav-contains (todas as telas) para os gates', () => {
    const { container } = rail()
    const team = container.querySelector('[data-nav-place="team"]')!
    expect(team.getAttribute('data-nav-panel')).toBe('team')
    expect(team.getAttribute('data-nav-contains')).toBe('team orgChart teamHealth routines')
    expect(container.querySelector('[data-nav-place="projects"]')!.getAttribute('data-nav-contains')).toBe('kanban files canvas projects')
  })

  it('clicar num lugar abre a última aba usada nele (ou a primeira)', () => {
    const select = vi.fn()
    localStorage.setItem('persona.place.lastTab.team', 'teamHealth')
    const { container } = rail(select)
    fireEvent.click(container.querySelector('[data-nav-place="team"]')!)
    expect(select).toHaveBeenCalledWith('teamHealth')
    fireEvent.click(container.querySelector('[data-nav-place="memory"]')!)
    expect(select).toHaveBeenLastCalledWith('secondBrain')
  })

  it('o lugar fica marcado quando a tela ativa é uma das suas abas', () => {
    const { container } = rail(undefined, 'orgChart')
    expect(container.querySelector('[data-nav-place="team"]')!.getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('[data-nav-place="memory"]')!.hasAttribute('aria-current')).toBe(false)
  })

  it('a contagem de Aprovações continua como descrição do botão (o nome segue "Aprovações")', () => {
    rail()
    const approvals = screen.getByRole('button', { name: /^Aprovações/u })
    expect(approvals.getAttribute('aria-describedby')).toBe('persona-nav-approvals-pending')
    expect(document.getElementById('persona-nav-approvals-pending')?.textContent).toBe('2 pendentes')
  })
})
