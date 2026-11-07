// @vitest-environment jsdom
// "Pode salvar arquivos no rascunho" (EQUIPE-REAL-SPEC (e), lib 6c): o interruptor em Configurações › Personas (o 1º do grupo, padrão LIGADO, desabilitado sem pasta)
// e a linha "Ferramentas" do cartão da persona ("Arquivos no rascunho" como 1º chip; "Só conversa" só sem chip).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectedPersonasSettings } from '../src/client/settings-personas/ConnectedPersonasSettings.tsx'
import { PersonasSettingsPanel } from '../src/client/settings-personas/PersonasSettingsPanel.tsx'
import { readFileTools } from '../src/client/settings-personas/file-tools.ts'
import { PersonaInfoCard } from '../src/client/profile/PersonaInfoCard.tsx'
import { pt } from '../src/client/locale/shell/locales.ts'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(pt, key, params)) as never

const HINT = 'Os arquivos ficam num rascunho. Sua pasta só muda quando você aplicar em Revisar mudanças.'
const NO_FOLDER = 'Este projeto ainda não tem pasta. Escolha uma pasta para o projeto e as personas poderão salvar arquivos.'

describe('Pode salvar arquivos no rascunho — painel', () => {
  it('é o 1º controle da persona, acima de "Pode contratar" e de "Pode pedir ajuda a colegas", com a dica; clicar manda o novo valor', () => {
    const onChangeCanSaveFiles = vi.fn()
    const { container } = render(
      <PersonasSettingsPanel
        t={t}
        personas={[{ id: 'p-luna', name: 'Luna', canRecruit: false, canSaveFiles: true, canSaveFilesAvailable: true, teamwork: { canAskColleagues: true, askCapPerDay: 6, askedToday: 0, maxOpinionRounds: 2 } }]}
        onChangeCanRecruit={vi.fn()}
        onChangeTeamwork={vi.fn()}
        onChangeCanSaveFiles={onChangeCanSaveFiles}
      />,
    )
    const row = container.querySelector<HTMLElement>('li[data-persona-id="p-luna"]')!
    const switches = within(row).getAllByRole('switch') as HTMLInputElement[]
    expect(switches.map(item => item.getAttribute('aria-labelledby') ?? '')).toHaveLength(3)
    const first = switches[0]!
    expect(within(row).getByText('Pode salvar arquivos no rascunho')).toBeTruthy()
    expect(first.id).toBe('switch-save-files-p-luna')
    expect(first.getAttribute('aria-checked') ?? String(first.checked)).toMatch(/true/u)
    expect(first.disabled).toBe(false)
    expect(within(row).getByText(HINT)).toBeTruthy()
    expect(first.getAttribute('aria-describedby')).toBeTruthy()
    fireEvent.click(first)
    expect(onChangeCanSaveFiles).toHaveBeenCalledWith('p-luna', false)
  })

  it('projeto sem pasta: o interruptor fica desabilitado, a frase da Muse toma o lugar da dica (aria-describedby) e "Escolher pasta" abre a escolha', () => {
    const onChangeCanSaveFiles = vi.fn()
    const onChooseFolder = vi.fn()
    const { container } = render(
      <PersonasSettingsPanel
        t={t}
        personas={[{ id: 'p-luna', name: 'Luna', canSaveFiles: false, canSaveFilesAvailable: false }]}
        onChangeCanSaveFiles={onChangeCanSaveFiles}
        onChooseFolder={onChooseFolder}
      />,
    )
    const row = container.querySelector<HTMLElement>('li[data-persona-id="p-luna"]')!
    const toggle = within(row).getByRole('switch') as HTMLInputElement
    expect(toggle.disabled).toBe(true)
    const phrase = within(row).getByText(NO_FOLDER)
    expect(toggle.getAttribute('aria-describedby')).toBe(phrase.id)
    expect(within(row).queryByText(HINT)).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Escolher pasta' }))
    expect(onChooseFolder).toHaveBeenCalledTimes(1)
    expect(onChangeCanSaveFiles).not.toHaveBeenCalled()
  })

  it('sem o dado do host (campo ausente) ou sem a ação, não há interruptor: nenhum controle sem nada por trás', () => {
    const { container } = render(<PersonasSettingsPanel t={t} personas={[{ id: 'p-luna', name: 'Luna' }, { id: 'p-sol', name: 'Sol', canSaveFiles: true }]} onChangeCanSaveFiles={vi.fn()} />)
    expect(within(container.querySelector<HTMLElement>('li[data-persona-id="p-luna"]')!).queryByRole('switch')).toBeNull()
    cleanup()
    const second = render(<PersonasSettingsPanel t={t} personas={[{ id: 'p-sol', name: 'Sol', canSaveFiles: true }]} />)
    expect(second.container.querySelector('[id="switch-save-files-p-sol"]')).toBeNull()
  })
})

describe('Pode salvar arquivos no rascunho — tela conectada (host de mentira)', () => {
  const personas = [{ id: 'p-luna', name: 'Luna', title: 'Vigia', avatarRef: 'luna', canRecruit: false, canSaveFiles: true, canSaveFilesAvailable: true }]
  const snapshot = { tenant: { workspaceId: 'ws-1', projectId: 'proj-1' }, projects: [], team: { personas } }
  function mount(client: object, refreshLive = vi.fn()): { refreshLive: ReturnType<typeof vi.fn> } {
    render(
      <ConnectedPersonasSettings
        t={t}
        useLive={(<T,>(selector: (state: typeof snapshot) => T): T => selector(snapshot)) as never}
        persona={client as never}
        refreshLive={refreshLive}
      />,
    )
    return { refreshLive }
  }

  it('desligar grava no host com o molde do setPersonaCanRecruit e atualiza o live', async () => {
    const setPersonaCanSaveFiles = vi.fn(async () => ({ ok: true, value: {} }))
    const { refreshLive } = mount({ setPersonaCanSaveFiles })
    const toggle = document.getElementById('switch-save-files-p-luna') as HTMLInputElement
    expect(toggle.getAttribute('aria-checked') ?? String(toggle.checked)).toMatch(/true/u)
    fireEvent.click(toggle)
    await waitFor(() => { expect(setPersonaCanSaveFiles).toHaveBeenCalledWith({ workspaceId: 'ws-1', projectId: 'proj-1', personaId: 'p-luna', canSaveFiles: false }) })
    await waitFor(() => { expect(refreshLive).toHaveBeenCalled() })
    expect((document.getElementById('switch-save-files-p-luna') as HTMLInputElement).getAttribute('aria-checked') ?? '').toMatch(/false/u)
  })

  it('se o host recusar, o interruptor volta ao que estava (rollback)', async () => {
    const setPersonaCanSaveFiles = vi.fn(async () => { throw new Error('forbidden') })
    mount({ setPersonaCanSaveFiles })
    fireEvent.click(document.getElementById('switch-save-files-p-luna') as HTMLInputElement)
    await waitFor(() => { expect(setPersonaCanSaveFiles).toHaveBeenCalled() })
    await waitFor(() => { expect((document.getElementById('switch-save-files-p-luna') as HTMLInputElement).getAttribute('aria-checked') ?? '').toMatch(/true/u) })
  })

  it('readFileTools só devolve o que veio como booleano', () => {
    expect(readFileTools({ canSaveFiles: true, canSaveFilesAvailable: false })).toEqual({ canSaveFiles: true, canSaveFilesAvailable: false })
    expect(readFileTools({ canSaveFiles: 'sim' })).toEqual({})
    expect(readFileTools({})).toEqual({})
  })
})

describe('cartão da persona — linha Ferramentas', () => {
  const base = { personaId: 'p-luna', name: 'Luna', role: 'Vigia', systemRoles: [] as const, nowKind: 'idle' as const, presence: 'online' as const, autonomyLevel: 'propose' as const }

  it('ligado: "Arquivos no rascunho" é o 1º chip, sem tirar os outros; desligado e sem chip: "Só conversa"', () => {
    const { rerender } = render(<PersonaInfoCard dict={profilePt} info={{ ...base, canSaveFiles: true, capabilities: { tools: ['Google Calendar'] } } as never} />)
    const chips = screen.getByText('Arquivos no rascunho').parentElement!.textContent ?? ''
    expect(chips.indexOf('Arquivos no rascunho')).toBeLessThan(chips.indexOf('Google Calendar'))
    expect(screen.queryByText('Só conversa')).toBeNull()
    rerender(<PersonaInfoCard dict={profilePt} info={{ ...base, canSaveFiles: false } as never} />)
    expect(screen.getByText('Só conversa')).toBeTruthy()
    expect(screen.queryByText('Arquivos no rascunho')).toBeNull()
    rerender(<PersonaInfoCard dict={profilePt} info={{ ...base, canSaveFiles: false, capabilities: { tools: ['Google Calendar'] } } as never} />)
    expect(screen.getByText('Google Calendar')).toBeTruthy()
    expect(screen.queryByText('Só conversa')).toBeNull()
  })
})
