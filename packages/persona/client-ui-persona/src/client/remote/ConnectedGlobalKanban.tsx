import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import { BoardsHome } from '../boards/BoardsHome.tsx'
import { GlobalCategoryLanes } from '../boards/GlobalCategoryLanes.tsx'
import { hostBoardSummariesToHub } from '../data/adapters/board.ts'
import { deriveBoardSummaries, inferFlowModel } from '../boards/derive-board-summaries.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../data/persona-tenant.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { pt as kanbanDict } from '../locale/kanban/locales.ts'
import { NewProjectFlowModal } from '../kanban/NewProjectFlowModal.tsx'
import type { ShellState } from '../shell/create-shell-store.ts'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'
import { ConnectedProjectFlowBoard } from './ConnectedProjectFlowBoard.tsx'
import { readKanbanScaleSeed } from '../kanban/kanban-scale-dev.ts'
import { mockLargeKanbanCards } from '../kanban/mock-large-kanban-cards.ts'
import type { ProjectWorkspaceTab } from '../shell/ProjectWorkspaceTabs.tsx'
import { ConnectedProjectHistory } from './ConnectedProjectHistory.tsx'
import type { PersonaCardShellBridge } from './persona-card-shell-bridge.ts'

export interface ConnectedKanbanInjected {
  readonly persona: PersonaRemoteClient
  readonly refreshKanban: () => Promise<void>
  readonly navigateProjectTab: (tab: ProjectWorkspaceTab) => void
  readonly clearBoardsFocusProject: () => void
  readonly clearKanbanFocusTicket: () => void
  readonly setProjectWorkspaceProjectId: (projectId: string | null) => void
  readonly hooks: {
    readonly live: HostObservable<PersonaLiveSnapshot>
    readonly tenant: HostObservable<PersonaTenantSnapshot>
    readonly shell: HostObservable<ShellState>
  }
  readonly personaCard?: PersonaCardShellBridge | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
}

export type ConnectedGlobalKanbanProps = InjectFace<ConnectedKanbanInjected>

type HubMode = 'grid' | 'global' | 'project'

/** Quadros hub + per-project flow board (legacy slot key `kanban`). */
export function ConnectedGlobalKanban({
  persona,
  useLive,
  useTenant,
  refreshKanban,
  navigateProjectTab,
  clearBoardsFocusProject,
  clearKanbanFocusTicket,
  setProjectWorkspaceProjectId,
  useShell,
  personaCard,
  openPersonaProfile,
}: ConnectedGlobalKanbanProps): ReactNode {
  const live = useLive(state => state)
  const boardsFocusProjectId = useShell(state => state.boardsFocusProjectId)
  const kanbanFocusTicketId = useShell(state => state.kanbanFocusTicketId)
  const { gate } = useRemoteTenantGate(useTenant)
  const [mode, setMode] = useState<HubMode>('grid')
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [projectWorkspaceTab, setProjectWorkspaceTab] = useState<ProjectWorkspaceTab>('board')
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  useEffect(() => {
    if (boardsFocusProjectId === null) return
    setOpenProjectId(boardsFocusProjectId)
    setProjectWorkspaceTab('board')
    setMode('project')
    clearBoardsFocusProject()
  }, [boardsFocusProjectId, clearBoardsFocusProject])

  useEffect(() => {
    if (kanbanFocusTicketId === null) return
    setMode('global')
    const ticketId = kanbanFocusTicketId
    const frame = window.requestAnimationFrame(() => {
      const card = document.querySelector(`[data-persona-kanban-card="${CSS.escape(ticketId)}"]`)
      if (card instanceof HTMLElement) {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        card.focus({ preventScroll: true })
      }
      clearKanbanFocusTicket()
    })
    return () => { window.cancelAnimationFrame(frame) }
  }, [kanbanFocusTicketId, clearKanbanFocusTicket, live.kanbanCards.length])

  const tenantScope: ProjectScopeRequest | null = useMemo(() => {
    if (gate === 'loading' || gate === 'error') return null
    return gate
  }, [gate])

  const listBoardsLoad = useCallback(async () => {
    if (tenantScope === null) throw new Error('no-scope')
    return unwrapRemote(await persona.listBoards(tenantScope))
  }, [persona, tenantScope?.workspaceId, tenantScope?.projectId])

  const boardsListKey = tenantScope === null ? '' : `${tenantScope.workspaceId}:boards`
  const { state: boardsState } = usePersonaRemoteLoad(tenantScope !== null, boardsListKey, listBoardsLoad)

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
  }, [boardsState, live.projects, displayKanbanCards, live.nowRows])

  const projectScope: ProjectScopeRequest | null = useMemo(() => {
    if (tenantScope === null || openProjectId === null) return null
    return { workspaceId: tenantScope.workspaceId, projectId: openProjectId }
  }, [tenantScope, openProjectId])

  const projectHint = useMemo(() => {
    if (openProjectId === null) return ''
    const project = live.projects.find(row => row.id === openProjectId)
    return project === undefined ? '' : `${project.name} ${project.kind}`.trim()
  }, [live.projects, openProjectId])

  const handleProjectWorkspaceTab = useCallback((tab: ProjectWorkspaceTab): void => {
    if (tab === 'board' || tab === 'sprints' || tab === 'history') {
      setProjectWorkspaceTab(tab)
      setProjectWorkspaceProjectId(null)
      return
    }
    if (openProjectId !== null) {
      setProjectWorkspaceProjectId(openProjectId)
    }
    navigateProjectTab(tab)
  }, [navigateProjectTab, openProjectId, setProjectWorkspaceProjectId])

  if (!live.ready || gate === 'loading') {
    return (
      <BoardsHome
        dict={kanbanDict}
        summaries={[]}
        surfaceState="loading"
        onOpenProject={() => {}}
      />
    )
  }

  if (mode === 'global') {
    return (
      <GlobalCategoryLanes
        dict={kanbanDict}
        summaries={summaries}
        previewCards={displayKanbanCards}
        onBack={() => { setMode('grid') }}
      />
    )
  }

  if (mode === 'project' && projectScope !== null && projectWorkspaceTab === 'history') {
    return (
      <ConnectedProjectHistory
        persona={persona}
        scope={projectScope}
        kanbanDict={kanbanDict}
        onBack={() => {
          setOpenProjectId(null)
          setProjectWorkspaceTab('board')
          setProjectWorkspaceProjectId(null)
          setMode('grid')
        }}
        onWorkspaceTabChange={handleProjectWorkspaceTab}
      />
    )
  }

  if (mode === 'project' && projectScope !== null) {
    return (
      <ConnectedProjectFlowBoard
        persona={persona}
        scope={projectScope}
        projectHint={projectHint}
        channelSubjects={live.channelSubjects}
        workspaceTab={projectWorkspaceTab}
        onBack={() => {
          setOpenProjectId(null)
          setProjectWorkspaceTab('board')
          setProjectWorkspaceProjectId(null)
          setMode('grid')
        }}
        onMutate={() => { void refreshKanban() }}
        onWorkspaceTabChange={handleProjectWorkspaceTab}
        {...(personaCard === undefined ? {} : { personaCard })}
        {...(openPersonaProfile === undefined ? {} : { openPersonaProfile })}
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
          setOpenProjectId(projectId)
          setProjectWorkspaceTab('board')
          setMode('project')
        }}
        onNewProject={() => { setNewProjectOpen(true) }}
        onGlobalView={() => { setMode('global') }}
      />
      {newProjectOpen && tenantScope !== null && (
        <NewProjectFlowModal
          dict={kanbanDict}
          onClose={() => { setNewProjectOpen(false) }}
          onSelectTemplate={async (template) => {
            await unwrapRemote(await persona.createWorkflowFromTemplate({
              workspaceId: tenantScope.workspaceId,
              projectId: tenantScope.projectId,
              template,
            }))
            setNewProjectOpen(false)
            void refreshKanban()
          }}
        />
      )}
    </>
  )
}
