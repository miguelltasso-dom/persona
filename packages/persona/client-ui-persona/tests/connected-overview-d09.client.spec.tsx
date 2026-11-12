// @vitest-environment jsdom
// DESIGN-01 onda 2 · #09, a ligação com o host: a tarefa sugerida é lida UMA vez por workspace (a identidade do carregador não relê) e
// "Pedir a {Coordenação} agora" chama o `askCoordination` injetado com o texto do perfil. Sem carregador ou sem perfil, nada aparece.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ConnectedOverviewView } from '../src/client/remote/ConnectedOverviewView.tsx'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

const SNAPSHOT = {
  ready: true,
  tenant: { workspaceId: 'w1', projectId: 'p1', memberId: 'm1', channelId: 'geral' },
  nowRows: [{ member: { id: 'atlas', name: 'Guia', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] }, queueCount: 0 }],
  stripMembers: [],
  kanbanCards: [],
  awayEvents: [],
  attentionTitles: [],
  decisions: [],
  away: null,
  team: null,
  suggestedTask: null,
  firstDelivery: null,
} as never as PersonaLiveSnapshot

const TITLE = 'Sobre “Padaria da Ana”: crie cinco ideias para atrair mais clientes.'

function mount(inject: { askCoordination?: (text: string) => void; loadCompanySuggestion?: () => Promise<{ title: string } | null> }) {
  const store = createSnapshotStore<PersonaLiveSnapshot>(SNAPSHOT)
  const useLive = bindObservableForTest({ getSnapshot: () => store.getSnapshot(), subscribe: listener => store.subscribe(listener) })
  const view = (extra: typeof inject) => (
    <PreviewFrame brandLabel="Persona">
      <ConnectedOverviewView t={t} useLive={useLive} navigate={vi.fn()} openAwayTask={vi.fn()} {...extra} />
    </PreviewFrame>
  )
  const result = render(view(inject))
  return { ...result, rerenderWith: (extra: typeof inject) => { result.rerender(view(extra)) } }
}

describe('ConnectedOverviewView · tarefa sugerida do perfil (#09)', () => {
  it('lê o perfil, mostra o pedido e o botão envia o texto à Coordenação', async () => {
    const askCoordination = vi.fn()
    const loadCompanySuggestion = vi.fn(async () => ({ title: TITLE }))
    mount({ askCoordination, loadCompanySuggestion })
    expect(await screen.findByRole('heading', { level: 2, name: TITLE })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir a Guia agora' }))
    expect(askCoordination).toHaveBeenCalledWith(TITLE)
    expect(loadCompanySuggestion).toHaveBeenCalledTimes(1)
  })

  it('uma nova identidade do carregador (o slot injeta de novo) não relê o perfil', async () => {
    const first = vi.fn(async () => ({ title: TITLE }))
    const view = mount({ askCoordination: vi.fn(), loadCompanySuggestion: first })
    await screen.findByText(TITLE)
    const second = vi.fn(async () => ({ title: 'outro' }))
    view.rerenderWith({ askCoordination: vi.fn(), loadCompanySuggestion: second })
    await waitFor(() => { expect(screen.getByText(TITLE)).toBeTruthy() })
    expect(second).not.toHaveBeenCalled()
  })

  it('sem perfil (o carregador devolve null) ou sem carregador: o bloco não existe', async () => {
    const empty = vi.fn(async () => null)
    mount({ askCoordination: vi.fn(), loadCompanySuggestion: empty })
    await waitFor(() => { expect(empty).toHaveBeenCalled() })
    expect(screen.queryByText(shellPt['overview.suggestedTaskTitle'])).toBeNull()
    cleanup()
    mount({ askCoordination: vi.fn() })
    expect(screen.queryByText(shellPt['overview.suggestedTaskTitle'])).toBeNull()
  })

  it('o host sabe pedir mas a tela não tem o envio: sem botão morto, sem bloco', async () => {
    const load = vi.fn(async () => ({ title: TITLE }))
    mount({ loadCompanySuggestion: load })
    await waitFor(() => { expect(load).toHaveBeenCalled() })
    expect(screen.queryByText(TITLE)).toBeNull()
  })
})
