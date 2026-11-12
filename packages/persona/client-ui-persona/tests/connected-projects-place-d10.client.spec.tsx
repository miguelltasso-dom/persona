// @vitest-environment jsdom
// DESIGN-01 onda 2 · #10, a ligação do lugar Projetos com o host: abre no QUADRO do último projeto usado (ou do único), o seletor troca de
// projeto sem sair da aba e deixa o shell no mesmo projeto (Arquivos e Canvas leem o mesmo), "Ver todos os projetos" leva à grade, a grade
// abre o quadro do projeto escolhido, e projeto vazio = colunas vazias + o convite ao #geral.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectBoardView } from '@deepseek-ai/dsh-persona-host/types'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub, personaLiveStoreLifecycleStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { ConnectedGlobalKanban, type ConnectedGlobalKanbanProps } from '../src/client/remote/ConnectedGlobalKanban.tsx'
import { LAST_PROJECT_KEY } from '../src/client/kanban/current-project.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'

installPreviewTheme()

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

function liveStoreHarness(initial: PersonaLiveSnapshot): PersonaLiveStore {
  const store = createSnapshotStore(initial)
  return {
    observable: store,
    ...personaLiveStoreWave2Stub,
    ...personaLiveStoreGestorStub,
    ...personaLiveStoreLifecycleStub,
    bootstrap: async () => {},
    runDevHarnessSeedIfEnabled: async () => {},
    refresh: async () => {},
    postChannelMessage: async () => {},
    uploadChannelAttachment: async () => ({ id: 'a', name: 'f' }),
    uploadDmAttachment: async () => ({ id: 'b', name: 'f' }),
    selectDm: async () => {},
    openPersonaDm: async () => {},
    openFirstAvailableDm: async () => {},
    loadTurnContext: async () => {},
    postDmMessage: async () => {},
    toggleMessageReaction: async () => {},
    commitOnboardingRoster: async () => {},
    completeOnboarding: async () => {},
    setPersonaAutonomyLevel: async () => {},
  }
}

const PESSOAL = { id: 'p-pessoal', name: 'Pessoal', kind: 'personal' }
const SITE = { id: 'p-site', name: 'Site da loja', kind: 'shared' }

function boardOf(projectId: string, projectName: string, withCard: boolean): ProjectBoardView {
  return {
    projectId,
    projectName,
    persisted: true,
    counts: { todo: withCard ? 1 : 0, doing: 0, review: 0, needs_you: 0, done: 0, blocked: 0 },
    workflow: {
      projectId,
      template: 'simples',
      columns: [
        { id: 'c-todo', name: 'A fazer', category: 'todo' },
        { id: 'c-done', name: 'Pronto', category: 'done' },
      ],
      fields: [],
    },
    cards: withCard ? [{ ticketId: `t-${projectId}`, title: `Tarefa de ${projectName}`, category: 'todo', blocked: false }] : [],
  }
}

function mount(opts: {
  readonly projects: readonly { id: string; name: string; kind: string }[]
  readonly view?: 'board' | 'grid'
  readonly cardsByProject?: Readonly<Record<string, boolean>>
  readonly kanbanCards?: PersonaLiveSnapshot['kanbanCards']
  readonly boardsFocusProjectId?: string
}) {
  const live = liveStoreHarness({
    ready: true,
    tenant: { workspaceId: 'ws', projectId: 'p-pessoal', memberId: 'm1', channelId: 'ch' },
    team: null,
    nowRows: [],
    stripMembers: [],
    awayEvents: [],
    attentionTitles: [],
    messages: [],
    passThroughFollowers: [],
    dms: [],
    selectedDmId: null,
    dmMessages: [],
    projects: opts.projects,
    kanbanCards: opts.kanbanCards ?? [],
    dmUnreadByPersonaId: {},
    suggestedTask: null,
    turnContext: null,
    error: null,
    ...PERSONA_LIVE_GESTOR_FIELDS,
  })
  const useLive = bindObservableForTest(live.observable)
  const useTenant = bindObservableForTest(createLiveTenantObservable(live))
  const { store: shellStore, actions: shellActions } = createShellStore()
  if (opts.boardsFocusProjectId !== undefined) shellActions.openProjectBoard(opts.boardsFocusProjectId)
  const useShell = bindObservableForTest(shellStore)
  const names = new Map(opts.projects.map(project => [project.id, project.name]))
  const getProjectBoard = vi.fn(async (request: { projectId: string }) => ({
    ok: true as const,
    value: boardOf(request.projectId, names.get(request.projectId) ?? request.projectId, opts.cardsByProject?.[request.projectId] ?? true),
  }))
  const persona = {
    getProjectBoard,
    listBoards: vi.fn(async () => ({ ok: true as const, value: [] })),
    createProject: vi.fn(),
  } as unknown as PersonaRemoteClient
  const selectMainPanel = vi.fn()
  render(
    <PreviewFrame brandLabel="Persona">
      <ConnectedGlobalKanban
        persona={persona}
        refreshKanban={async () => {}}
        clearBoardsFocusProject={() => { shellActions.clearBoardsFocusProject() }}
        clearKanbanFocusTicket={() => { shellActions.clearKanbanFocusTicket() }}
        setProjectWorkspaceProjectId={(id) => { shellActions.setProjectWorkspaceProjectId(id) }}
        selectMainPanel={selectMainPanel}
        {...(opts.view === undefined ? {} : { view: opts.view })}
        useLive={useLive as ConnectedGlobalKanbanProps['useLive']}
        useTenant={useTenant as ConnectedGlobalKanbanProps['useTenant']}
        useShell={useShell as ConnectedGlobalKanbanProps['useShell']}
      />
    </PreviewFrame>,
  )
  return { getProjectBoard, selectMainPanel, shellStore, persona }
}

describe('o lugar Projetos abre no quadro (#10)', () => {
  it('com um projeto só: abre o quadro dele, com o cabeçalho "Pessoal ▾" e o shell já no mesmo projeto', async () => {
    const { getProjectBoard, shellStore } = mount({ projects: [PESSOAL] })
    expect(await screen.findByText('Tarefa de Pessoal')).toBeTruthy()
    expect(getProjectBoard).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'p-pessoal' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Pessoal')
    // Arquivos e Canvas leem este projeto
    expect(shellStore.getSnapshot().projectWorkspaceProjectId).toBe('p-pessoal')
    // a grade não é a porta de entrada
    expect(document.querySelector('[data-persona-boards]')).toBeNull()
  })

  it('com vários: abre o último usado; sem lembrança, o Pessoal', async () => {
    localStorage.setItem(LAST_PROJECT_KEY, 'p-site')
    const first = mount({ projects: [PESSOAL, SITE] })
    expect(await screen.findByText('Tarefa de Site da loja')).toBeTruthy()
    expect(first.getProjectBoard).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'p-site' })
    cleanup()
    localStorage.clear()
    const second = mount({ projects: [SITE, PESSOAL] })
    expect(await screen.findByText('Tarefa de Pessoal')).toBeTruthy()
    expect(second.getProjectBoard).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'p-pessoal' })
  })

  it('o seletor troca de projeto: carrega o outro quadro, lembra a escolha e deixa o shell no mesmo projeto', async () => {
    const { getProjectBoard, shellStore } = mount({ projects: [PESSOAL, SITE] })
    await screen.findByText('Tarefa de Pessoal')
    const heading = screen.getByRole('heading', { level: 1 })
    fireEvent.click(within(heading).getByRole('button'))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Site da loja' }))
    expect(await screen.findByText('Tarefa de Site da loja')).toBeTruthy()
    expect(getProjectBoard).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'p-site' })
    expect(shellStore.getSnapshot().projectWorkspaceProjectId).toBe('p-site')
    expect(localStorage.getItem(LAST_PROJECT_KEY)).toBe('p-site')
  })

  it('"Ver todos os projetos" leva à grade; abrir um cartão da grade escolhe o projeto e volta ao quadro', async () => {
    const board = mount({ projects: [PESSOAL, SITE] })
    await screen.findByText('Tarefa de Pessoal')
    fireEvent.click(within(screen.getByRole('heading', { level: 1 })).getByRole('button'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver todos os projetos' }))
    expect(board.selectMainPanel).toHaveBeenCalledWith('projects')
    cleanup()
    const grid = mount({ projects: [PESSOAL, SITE], view: 'grid' })
    await waitFor(() => { expect(document.querySelector('[data-persona-boards]')).not.toBeNull() })
    fireEvent.click(screen.getByRole('article', { name: 'Abrir quadro Site da loja' }))
    expect(grid.selectMainPanel).toHaveBeenCalledWith('kanban')
    expect(grid.shellStore.getSnapshot().projectWorkspaceProjectId).toBe('p-site')
    expect(localStorage.getItem(LAST_PROJECT_KEY)).toBe('p-site')
  })

  it('a grade tem o título do lugar, não "Quadros"', async () => {
    mount({ projects: [PESSOAL, SITE], view: 'grid' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Todos os projetos' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1, name: 'Quadros' })).toBeNull()
  })

  it('"Abrir quadro" de fora (openProjectBoard) seleciona esse projeto', async () => {
    const { getProjectBoard } = mount({ projects: [PESSOAL, SITE], boardsFocusProjectId: 'p-site' })
    expect(await screen.findByText('Tarefa de Site da loja')).toBeTruthy()
    expect(getProjectBoard).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'p-site' })
  })

  it('sem nenhum projeto: o convite de criar o primeiro, nunca um quadro vazio sem dono', async () => {
    mount({ projects: [] })
    expect(await screen.findByText('Crie seu primeiro projeto')).toBeTruthy()
  })
})

describe('projeto vazio (#10)', () => {
  it('colunas vazias + "Peça a primeira tarefa no #geral", que leva ao #geral', async () => {
    const { selectMainPanel } = mount({ projects: [PESSOAL], cardsByProject: { 'p-pessoal': false } })
    expect(await screen.findByText('Peça a primeira tarefa no #geral')).toBeTruthy()
    expect(screen.getAllByText('A fazer').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o #geral' }))
    expect(selectMainPanel).toHaveBeenCalledWith('channels')
  })
})
