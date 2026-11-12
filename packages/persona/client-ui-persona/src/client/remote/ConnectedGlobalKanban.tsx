import { randomUuid } from './random-id.ts'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import { BoardsHome } from '../boards/BoardsHome.tsx'
import { GlobalCategoryLanes } from '../boards/GlobalCategoryLanes.tsx'
import { hostBoardSummariesToHub, templateToFlowModel } from '../data/adapters/board.ts'
import { deriveBoardSummaries, inferFlowModel } from '../boards/derive-board-summaries.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../data/persona-tenant.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { pt as kanbanDict } from '../locale/kanban/locales.ts'
import { readLastProject, rememberLastProject, resolveCurrentProject } from '../kanban/current-project.ts'
import { NewProjectFlowModal } from '../kanban/NewProjectFlowModal.tsx'
import { ProjectFlowBoard } from '../kanban/ProjectFlowBoard.tsx'
import type { ShellState } from '../shell/create-shell-store.ts'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'
import { ConnectedProjectFlowBoard } from './ConnectedProjectFlowBoard.tsx'
import { taskConversationBridgeOf } from './ConnectedTaskConversation.tsx'
import { readKanbanScaleSeed } from '../kanban/kanban-scale-dev.ts'
import { mockLargeKanbanCards } from '../kanban/mock-large-kanban-cards.ts'
import type { ProjectWorkspaceTab } from '../shell/ProjectWorkspaceTabs.tsx'
import { ConnectedProjectHistory } from './ConnectedProjectHistory.tsx'
import type { PersonaCardShellBridge } from './persona-card-shell-bridge.ts'

export interface ConnectedKanbanInjected {
  readonly persona: PersonaRemoteClient
  readonly refreshKanban: () => Promise<void>
  readonly clearBoardsFocusProject: () => void
  readonly clearKanbanFocusTicket: () => void
  /** The project of the moment: the Quadro, Arquivos and Canvas tabs of the place all read it. */
  readonly setProjectWorkspaceProjectId: (projectId: string | null) => void
  readonly hooks: {
    readonly live: HostObservable<PersonaLiveSnapshot>
    readonly tenant: HostObservable<PersonaTenantSnapshot>
    readonly shell: HostObservable<ShellState>
  }
  readonly personaCard?: PersonaCardShellBridge | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  /** Moves to another screen: the conversation with the team (where a new task starts), the board, or the grid of projects. */
  readonly selectMainPanel?: ((panel: 'channels' | 'kanban' | 'projects') => void) | undefined
  /** Which screen of the Projetos place this registration is: the board of the project of the moment (default) or the grid ("Ver todos os projetos"). */
  readonly view?: 'board' | 'grid' | undefined
}

export type ConnectedGlobalKanbanProps = InjectFace<ConnectedKanbanInjected>

type GridMode = 'grid' | 'global'

/** How long the board of a project may take to mount before a requested card is given up on (a card focused from Ctrl K or "Ver no quadro"). */
const FOCUS_CARD_POLL_MS = 100
const FOCUS_CARD_MAX_TRIES = 30

/**
 * The Projetos place (DESIGN-01-MUSE §5.1 #10). With `view` "board" (the `kanban` panel) it opens on the board of the project of the moment (the
 * last one used, or the only one) under a "Pessoal ▾" header; with `view` "grid" (the `projects` panel, reached by "Ver todos os projetos") it
 * shows the cards of every project. Legacy slot key `kanban`.
 */
export function ConnectedGlobalKanban({
  persona,
  useLive,
  useTenant,
  refreshKanban,
  clearBoardsFocusProject,
  clearKanbanFocusTicket,
  setProjectWorkspaceProjectId,
  useShell,
  personaCard,
  openPersonaProfile,
  selectMainPanel,
  view = 'board',
}: ConnectedGlobalKanbanProps): ReactNode {
  const live = useLive(state => state)
  const boardsFocusProjectId = useShell(state => state.boardsFocusProjectId)
  const kanbanFocusTicketId = useShell(state => state.kanbanFocusTicketId)
  const shellProjectId = useShell(state => state.projectWorkspaceProjectId)
  const { gate } = useRemoteTenantGate(useTenant)
  const [gridMode, setGridMode] = useState<GridMode>('grid')
  const [boardView, setBoardView] = useState<ProjectWorkspaceTab>('board')
  const [lastUsedId, setLastUsedId] = useState<string | null>(() => readLastProject())
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  // Bumped after a project is created so the list (and each project's flow) is read again.
  const [boardsToken, setBoardsToken] = useState(0)

  const currentProjectId = resolveCurrentProject({ projects: live.projects, shellProjectId, lastUsedId })

  const selectProject = useCallback((projectId: string): void => {
    rememberLastProject(projectId)
    setLastUsedId(projectId)
    setProjectWorkspaceProjectId(projectId)
    setBoardView('board')
  }, [setProjectWorkspaceProjectId])

  // The tabs Arquivos and Canvas read the shell's project: keep it equal to what the board shows (also when it came from the last-used memory).
  useEffect(() => {
    if (view !== 'board' || currentProjectId === null || shellProjectId === currentProjectId) return
    setProjectWorkspaceProjectId(currentProjectId)
    rememberLastProject(currentProjectId)
  }, [view, currentProjectId, shellProjectId, setProjectWorkspaceProjectId])

  useEffect(() => {
    if (boardsFocusProjectId === null) return
    selectProject(boardsFocusProjectId)
    clearBoardsFocusProject()
  }, [boardsFocusProjectId, clearBoardsFocusProject, selectProject])

  // A card asked for from elsewhere (Ctrl K, "Ver no quadro"): open the board of ITS project, then focus the card once the board has drawn it.
  useEffect(() => {
    if (kanbanFocusTicketId === null) return undefined
    const ticketId = kanbanFocusTicketId
    const owner = live.kanbanCards.find(card => card.id === ticketId)?.projectId
    if (owner !== undefined && owner !== '' && owner !== currentProjectId && live.projects.some(project => project.id === owner)) {
      selectProject(owner)
    }
    setBoardView('board')
    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      const card = document.querySelector(`[data-persona-kanban-card="${CSS.escape(ticketId)}"]`)
      if (card instanceof HTMLElement) {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        card.focus({ preventScroll: true })
      }
      if (card instanceof HTMLElement || tries >= FOCUS_CARD_MAX_TRIES) {
        window.clearInterval(timer)
        clearKanbanFocusTicket()
      }
    }, FOCUS_CARD_POLL_MS)
    return () => { window.clearInterval(timer) }
  }, [kanbanFocusTicketId, clearKanbanFocusTicket, selectProject, live.kanbanCards.length])

  const tenantScope: ProjectScopeRequest | null = useMemo(() => {
    if (gate === 'loading' || gate === 'error') return null
    return gate
  }, [gate])

  const listBoardsLoad = useCallback(async () => {
    if (tenantScope === null) throw new Error('no-scope')
    return unwrapRemote(await persona.listBoards(tenantScope))
  }, [persona, tenantScope?.workspaceId, tenantScope?.projectId])

  // Only the grid needs the summaries of every project.
  const boardsListKey = tenantScope === null ? '' : `${tenantScope.workspaceId}:boards:${boardsToken}`
  const { state: boardsState } = usePersonaRemoteLoad(tenantScope !== null && view === 'grid', boardsListKey, listBoardsLoad)

  // The list says nothing about a project's flow: read it from each project's own board, so a tile never keeps the old label.
  const boardProjectIds = boardsState.status === 'ready' ? boardsState.data.map(row => row.projectId) : []
  const modelsKey = `${boardsListKey}:models:${boardProjectIds.join('|')}`
  const loadModels = useCallback(async () => {
    if (tenantScope === null) throw new Error('no-scope')
    const pairs = await Promise.all(boardProjectIds.map(async (projectId) => {
      try {
        const board = await unwrapRemote(await persona.getProjectBoard({ workspaceId: tenantScope.workspaceId, projectId }))
        return [projectId, templateToFlowModel(board.workflow.template)] as const
      } catch {
        return null
      }
    }))
    return Object.fromEntries(pairs.filter((pair): pair is NonNullable<typeof pair> => pair !== null))
  }, [persona, tenantScope?.workspaceId, modelsKey])
  const { state: modelsState } = usePersonaRemoteLoad(tenantScope !== null && view === 'grid' && boardsState.status === 'ready', modelsKey, loadModels)

  const kanbanScaleSeed = readKanbanScaleSeed()
  const displayKanbanCards = useMemo(() => (
    kanbanScaleSeed !== null ? mockLargeKanbanCards(kanbanScaleSeed) : live.kanbanCards
  ), [kanbanScaleSeed, live.kanbanCards])

  const summaries = useMemo(() => {
    if (boardsState.status === 'ready' && boardsState.data.length >= 1) {
      const models: Record<string, import('../boards/types.ts').FlowModelId> = {}
      for (const project of live.projects) {
        models[project.id] = inferFlowModel(project.id, project.kind)
      }
      if (modelsState.status === 'ready') Object.assign(models, modelsState.data)
      return hostBoardSummariesToHub(
        boardsState.data,
        models,
        projectId => inferFlowModel(projectId, undefined),
      )
    }
    return deriveBoardSummaries({
      projects: live.projects,
      kanbanCards: displayKanbanCards,
      nowRows: live.nowRows,
    })
  }, [boardsState, modelsState, live.projects, displayKanbanCards, live.nowRows])

  const projectScope: ProjectScopeRequest | null = useMemo(() => {
    if (tenantScope === null || currentProjectId === null) return null
    return { workspaceId: tenantScope.workspaceId, projectId: currentProjectId }
  }, [tenantScope, currentProjectId])

  const projectHint = useMemo(() => {
    if (currentProjectId === null) return ''
    const project = live.projects.find(row => row.id === currentProjectId)
    return project === undefined ? '' : `${project.name} ${project.kind}`.trim()
  }, [live.projects, currentProjectId])

  const newProjectModal = newProjectOpen && tenantScope !== null && (
    <NewProjectFlowModal
      dict={kanbanDict}
      onClose={() => { setNewProjectOpen(false) }}
      onSelectTemplate={async (template, name) => {
        // A NEW project with its own flow — never a new flow on the project the person already has.
        const id = `proj-${randomUuid().slice(0, 8)}`
        await unwrapRemote(await persona.createProject({
          id,
          workspaceId: tenantScope.workspaceId,
          name,
          description: '',
          template,
        }))
        setNewProjectOpen(false)
        setBoardsToken(token => token + 1)
        await refreshKanban()
        // The new project becomes the project of the moment and the person lands on its (empty) board.
        selectProject(id)
        selectMainPanel?.('kanban')
      }}
    />
  )

  if (!live.ready || gate === 'loading') {
    return view === 'grid' ? (
      <BoardsHome
        dict={kanbanDict}
        summaries={[]}
        surfaceState="loading"
        onOpenProject={() => {}}
      />
    ) : (
      <ProjectFlowBoard
        dict={kanbanDict}
        flow={{ projectId: '', projectName: kanbanDict['projects.switcher.title'], template: 'simples', columns: [], cards: [] }}
        surfaceState="loading"
      />
    )
  }

  if (view === 'grid') {
    if (gridMode === 'global') {
      return (
        <GlobalCategoryLanes
          dict={kanbanDict}
          summaries={summaries}
          previewCards={displayKanbanCards}
          onBack={() => { setGridMode('grid') }}
        />
      )
    }
    return (
      <>
        <BoardsHome
          dict={kanbanDict}
          summaries={summaries}
          surfaceState="ready"
          onOpenProject={(projectId) => {
            selectProject(projectId)
            selectMainPanel?.('kanban')
          }}
          onNewProject={() => { setNewProjectOpen(true) }}
          onGlobalView={() => { setGridMode('global') }}
          {...(selectMainPanel === undefined ? {} : { onCreateFirstTask: () => { selectMainPanel('channels') } })}
        />
        {newProjectModal}
      </>
    )
  }

  // No project yet: the place invites to create the first one.
  if (currentProjectId === null || projectScope === null) {
    return (
      <>
        <BoardsHome
          dict={kanbanDict}
          summaries={[]}
          surfaceState="empty"
          onOpenProject={() => {}}
          onNewProject={() => { setNewProjectOpen(true) }}
        />
        {newProjectModal}
      </>
    )
  }

  if (boardView === 'history') {
    return (
      <ConnectedProjectHistory
        persona={persona}
        scope={projectScope}
        kanbanDict={kanbanDict}
        tasks={live.kanbanCards}
        onBack={() => { setBoardView('board') }}
      />
    )
  }

  // COLHEITA 18: a click on a card opens the conversation of the task — of the project the BOARD shows, as the person who is looking.
  const taskConversation = taskConversationBridgeOf(
    persona,
    live.tenant === null ? null : { workspaceId: projectScope.workspaceId, projectId: projectScope.projectId, memberId: live.tenant.memberId },
    live.team,
    live.stripMembers, // P1-01: o `@` do campo da conversa chama as mesmas personas do campo do canal
  )

  return (
    <>
      <ConnectedProjectFlowBoard
        persona={persona}
        scope={projectScope}
        projectHint={projectHint}
        channelSubjects={live.channelSubjects}
        workspaceTab={boardView}
        onWorkspaceTabChange={setBoardView}
        onMutate={() => { void refreshKanban() }}
        switcher={{
          projects: live.projects,
          currentId: currentProjectId,
          onSelect: selectProject,
          onSeeAll: () => { selectMainPanel?.('projects') },
        }}
        onNewProject={() => { setNewProjectOpen(true) }}
        {...(selectMainPanel === undefined ? {} : { onNewTask: () => { selectMainPanel('channels') } })}
        {...(personaCard === undefined ? {} : { personaCard })}
        {...(openPersonaProfile === undefined ? {} : { openPersonaProfile })}
        {...(taskConversation === undefined ? {} : { taskConversation })}
      />
      {newProjectModal}
    </>
  )
}
