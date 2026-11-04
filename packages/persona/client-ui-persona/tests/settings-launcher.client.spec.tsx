// @vitest-environment jsdom
// Decisão da Muse (04/11): "Configurações" do rodapé é o NOSSO botão (uma engrenagem só) no lugar do gatilho do DSW. Ele
// abre o lugar com as abas, entrega o `openSettings` do DSW à ponte (aba "Sobre e atualizações") e o slot do DSW segue
// montado em volta, com os indicadores de conexão e de atualização visíveis e clicáveis. "Ajuda e atalhos" é só ícone.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonaSidebar } from '../src/client/shell/PersonaSidebar.tsx'
import { SettingsLauncher } from '../src/client/shell/SettingsLauncher.tsx'
import { createShellStore, type MainPanelId } from '../src/client/shell/create-shell-store.ts'
import { NAV_PLACES, rememberPlaceTab } from '../src/client/shell/nav-places.ts'
import { canOpenSettingsModal, openSettingsModal } from '../src/client/shell/settings-launcher-bridge.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never
const settingsPlace = NAV_PLACES.find(place => place.id === 'settings')!

function launcher(options: { activePanel?: MainPanelId; openSettings?: () => void } = {}) {
  const shell = createShellStore()
  if (options.activePanel !== undefined) shell.actions.selectPanel(options.activePanel)
  const selectPanel = vi.fn<(id: MainPanelId) => void>()
  const openSettings = options.openSettings ?? vi.fn()
  const view = render(
    <SettingsLauncher
      t={t}
      useShell={bindObservableForTest(shell.store)}
      selectPanel={selectPanel}
      wide
      settingsOpen={false}
      openSettings={openSettings}
      openOnboarding={() => {}}
    />,
  )
  return { ...view, selectPanel, openSettings }
}

describe('SettingsLauncher', () => {
  it('é um botão "Configurações" com os data-nav-* que o Probe usa para navegar', () => {
    launcher()
    const button = screen.getByRole('button', { name: 'Configurações' })
    expect(button.hasAttribute('data-nav-item')).toBe(true)
    expect(button.getAttribute('data-nav-place')).toBe('settings')
    expect(button.getAttribute('data-nav-panel')).toBe(settingsPlace.tabs[0]?.panel)
    expect(button.getAttribute('data-nav-contains')).toBe(settingsPlace.tabs.map(tab => tab.panel).join(' '))
    expect(button.getAttribute('aria-haspopup')).toBeNull()
  })

  it('o clique abre o lugar na primeira aba; com uma aba lembrada, abre nela', () => {
    const first = launcher()
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }))
    expect(first.selectPanel).toHaveBeenCalledWith(settingsPlace.tabs[0]?.panel)
    cleanup()
    rememberPlaceTab(settingsPlace, 'usage')
    const again = launcher()
    expect(screen.getByRole('button', { name: 'Configurações' }).getAttribute('data-nav-panel')).toBe('usage')
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }))
    expect(again.selectPanel).toHaveBeenCalledWith('usage')
  })

  it('aria-current quando a tela aberta é uma das abas do lugar; fora dele, não', () => {
    launcher({ activePanel: 'usage' })
    expect(screen.getByRole('button', { name: 'Configurações' }).getAttribute('aria-current')).toBe('page')
    cleanup()
    launcher({ activePanel: 'overview' })
    expect(screen.getByRole('button', { name: 'Configurações' }).getAttribute('aria-current')).toBeNull()
  })

  it('entrega o openSettings do DSW à ponte ao montar e solta ao desmontar (a aba "Sobre" abre o modal)', () => {
    const openSettings = vi.fn()
    expect(canOpenSettingsModal()).toBe(false)
    const view = launcher({ openSettings })
    expect(canOpenSettingsModal()).toBe(true)
    expect(openSettingsModal()).toBe(true)
    expect(openSettings).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(canOpenSettingsModal()).toBe(false)
    expect(openSettingsModal()).toBe(false)
    expect(openSettings).toHaveBeenCalledTimes(1)
  })

  it('troca de openSettings (o DSW renderiza de novo): a ponte usa o mais novo', () => {
    const first = vi.fn()
    const second = vi.fn()
    const shell = createShellStore()
    const props = { t, useShell: bindObservableForTest(shell.store), selectPanel: () => {}, wide: true, settingsOpen: false, openOnboarding: () => {} }
    const { rerender } = render(<SettingsLauncher {...props} openSettings={first} />)
    rerender(<SettingsLauncher {...props} openSettings={second} />)
    openSettingsModal()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('rodapé do rail com o slot do DSW (flag A-1 ligada)', () => {
  beforeEach(() => { localStorage.setItem('persona.flag.navPlaces', '1') })

  function rail(renderSlot: (name: string, props: { wide: boolean }) => React.ReactNode) {
    const shell = createShellStore()
    const approvals = createSnapshotStore({ pending: 0 })
    const team = createSnapshotStore<readonly never[]>([])
    const revision = createSnapshotStore({ n: 0 })
    const selectPanel = vi.fn<(id: MainPanelId) => void>()
    const view = render(
      <div>
        <input aria-label="campo de texto" />
        <PersonaSidebar
          t={t}
          useShell={bindObservableForTest(shell.store)}
          useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
          usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
          useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
          selectPanel={selectPanel}
          renderSlot={renderSlot as never}
        />
      </div>,
    )
    return { ...view, selectPanel, shell }
  }

  it('o indicador de conexão/atualização do slot aparece no rodapé e é clicável', () => {
    const onReconnect = vi.fn()
    rail(() => (
      <div data-testid="dsw-row">
        <button type="button" onClick={onReconnect}>Reconectar</button>
      </div>
    ))
    const footer = document.querySelector('nav[data-persona-area="rail"]')!.lastElementChild as HTMLElement
    const indicator = within(footer).getByRole('button', { name: 'Reconectar' })
    fireEvent.click(indicator)
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('pede o slot sempre no modo largo (o nosso botão cuida do ícone-só em janela baixa)', () => {
    const renderSlot = vi.fn(() => null)
    rail(renderSlot)
    expect(renderSlot).toHaveBeenCalledWith('sidebar.settings', { wide: true })
  })

  it('Ajuda e atalhos: botão só de ícone com nome, data-nav-panel="help", clique abre a Ajuda', () => {
    const { selectPanel } = rail(() => null)
    const help = screen.getByRole('button', { name: 'Ajuda e atalhos' })
    expect(help.textContent).toBe('')
    expect(help.getAttribute('data-nav-panel')).toBe('help')
    expect(help.hasAttribute('data-nav-item')).toBe(true)
    expect(help.getAttribute('aria-keyshortcuts')).toBe('?')
    fireEvent.click(help)
    expect(selectPanel).toHaveBeenCalledWith('help')
  })

  it('a tecla "?" abre a Ajuda; dentro de um campo de texto ou com uma janela modal aberta, não', () => {
    const { selectPanel } = rail(() => null)
    fireEvent.keyDown(document.body, { key: '?' })
    expect(selectPanel).toHaveBeenCalledWith('help')
    selectPanel.mockClear()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'campo de texto' }), { key: '?' })
    expect(selectPanel).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: '?', ctrlKey: true })
    expect(selectPanel).not.toHaveBeenCalled()
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    fireEvent.keyDown(document.body, { key: '?' })
    expect(selectPanel).not.toHaveBeenCalled()
    modal.remove()
  })

  it('aria-current no botão de Ajuda quando a Ajuda está aberta', () => {
    const { shell } = rail(() => null)
    expect(screen.getByRole('button', { name: 'Ajuda e atalhos' }).getAttribute('aria-current')).toBeNull()
    act(() => { shell.actions.selectPanel('help') })
    expect(screen.getByRole('button', { name: 'Ajuda e atalhos' }).getAttribute('aria-current')).toBe('page')
  })
})

describe('rodapé do rail com a flag A-1 DESLIGADA (padrão, D-077): o app é o de antes', () => {
  function railOff(renderSlot: (name: string, props: { wide: boolean }) => React.ReactNode) {
    const shell = createShellStore()
    const approvals = createSnapshotStore({ pending: 0 })
    const team = createSnapshotStore<readonly never[]>([])
    const revision = createSnapshotStore({ n: 0 })
    const selectPanel = vi.fn<(id: MainPanelId) => void>()
    const view = render(
      <PersonaSidebar
        t={t}
        useShell={bindObservableForTest(shell.store)}
        useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
        usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
        useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
        selectPanel={selectPanel}
        renderSlot={renderSlot as never}
      />,
    )
    return { ...view, selectPanel }
  }

  it('Configurações é o gatilho do DSW (o slot), sem o ícone de Ajuda do rodapé e sem os data-nav do lugar', () => {
    railOff(() => <button type="button" aria-haspopup="dialog" aria-label="Configurações">gatilho do DSW</button>)
    expect(screen.getByRole('button', { name: 'Configurações' }).getAttribute('data-nav-place')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajuda e atalhos' })).toBeNull()
  })

  it('a Ajuda continua sendo o item do rail antigo (grupo Mais), não um ícone no rodapé', () => {
    railOff(() => null)
    expect(document.querySelector('nav[data-persona-area="rail"] button[data-nav-panel="help"]')).toBeNull()
  })

  it('a tecla "?" não faz nada (ninguém promete essa tecla com a flag desligada)', () => {
    const { selectPanel } = railOff(() => null)
    fireEvent.keyDown(document.body, { key: '?' })
    expect(selectPanel).not.toHaveBeenCalledWith('help')
  })

  it('o slot do DSW vem dentro da pílula de sempre (wide acompanha a altura)', () => {
    const renderSlot = vi.fn(() => null)
    railOff(renderSlot)
    expect(renderSlot).toHaveBeenCalledWith('sidebar.settings', { wide: true })
  })
})
