// @vitest-environment jsdom
// P1-10 (Carbon, colheita-s1), perfis do navegador (Item 17), lado da tela:
//  - criar o 1º perfil em Conexões › Navegador mantinha o estado "Nenhum perfil ainda": a tela lia o `state.data` ANTIGO (o carregado) em vez da view
//    que a própria ação devolveu.
//  - a view que cada ação devolve precisa trazer o mesmo `withoutBrowser` da view carregada (a marca "sem navegador" de uma persona do Cursor não some
//    depois de criar/conceder).
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectedBrowserProfiles } from '../src/client/browser/ConnectedBrowserProfiles.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
const CHROME = { path: 'C:/chrome.exe', version: '130' }
const PERSONAS = [
  { id: 'nina', name: 'Nina', title: 'Design' },
  { id: 'rex', name: 'Rex', title: 'Código' },
]

function mount(persona: Record<string, unknown>) {
  const tenant = createSnapshotStore<PersonaTenantSnapshot>({ status: 'ready', scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' } })
  const useTenant = bindObservableForTest({ getSnapshot: () => tenant.getSnapshot(), subscribe: listener => tenant.subscribe(listener) })
  const { store } = createShellStore()
  render(
    <PreviewFrame brandLabel="Persona">
      <ConnectedBrowserProfiles persona={persona as unknown as PersonaRemoteClient} useTenant={useTenant} useShell={bindObservableForTest(store)} />
    </PreviewFrame>,
  )
}

describe('o 1º perfil criado sai do estado vazio', () => {
  it('"Nenhum perfil ainda" some e o perfil novo aparece na lista assim que o host o devolve', async () => {
    const created = { profiles: [{ id: 'prof-1', name: 'Loja', running: false, personas: [], defaultsFor: [] }], chrome: CHROME }
    const persona = {
      browserView: vi.fn(() => ok({ profiles: [], chrome: CHROME })),
      listTeam: vi.fn(() => ok({ personas: PERSONAS, members: [] })),
      createBrowserProfile: vi.fn(() => ok(created)),
    }
    mount(persona)
    await screen.findByText('Nenhum perfil ainda')
    fireEvent.change(screen.getByLabelText('Nome do perfil'), { target: { value: 'Loja' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Criar perfil' }).at(-1)!)
    await waitFor(() => { expect(persona.createBrowserProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Loja' })) })
    expect(await screen.findByRole('heading', { name: 'Loja' })).toBeTruthy()
    expect(screen.queryByText('Nenhum perfil ainda')).toBeNull()
  })
})

describe('a marca "sem navegador" (Cursor) sobrevive às ações', () => {
  it('depois de conceder um perfil, a persona que não carrega navegador continua marcada', async () => {
    const withoutBrowser = ['rex']
    const base = { profiles: [{ id: 'prof-1', name: 'Loja', running: false, personas: [], defaultsFor: [] }], chrome: CHROME, withoutBrowser }
    const persona = {
      browserView: vi.fn(() => ok(base)),
      listTeam: vi.fn(() => ok({ personas: PERSONAS, members: [] })),
      // o host devolve a view da AÇÃO com a mesma marca (é o que o teste de host trava); a tela a mantém
      grantBrowserProfile: vi.fn(() => ok({ ...base, profiles: [{ ...base.profiles[0]!, personas: ['rex'] }] })),
    }
    mount(persona)
    await screen.findByRole('heading', { name: 'Loja' })
    fireEvent.click(screen.getByRole('button', { name: /Rex/u }))
    await waitFor(() => { expect(persona.grantBrowserProfile).toHaveBeenCalled() })
    expect(await screen.findByText(/sem navegador/iu)).toBeTruthy()
  })
})
