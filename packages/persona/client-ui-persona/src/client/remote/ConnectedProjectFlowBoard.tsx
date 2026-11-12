import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  CloseSprintView,
  ProjectBoardView,
  ProjectScopeRequest,
  WorkflowProposalView,
} from '@deepseek-ai/dsh-persona-host/types'
import {
  acceptWorkflowProposalRemote,
  buildAcceptWorkflowRequest,
  proposeWorkflowRemote,
  rejectWorkflowProposalRemote,
} from '../data/boards-remote.ts'
import { projectBoardToFlow } from '../data/adapters/board.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as kanbanDict } from '../locale/kanban/locales.ts'
import { MOVE_UNDO_MS, undoableMove, type UndoableMove } from '../kanban/move-undo.ts'
import { ProjectFlowBoard, type ProjectBoardSwitcher } from '../kanban/ProjectFlowBoard.tsx'
import { SprintPlanningView } from '../kanban/SprintPlanningView.tsx'
import { sprintDatesFromDraft, useSprintPlanningState } from '../kanban/use-sprint-planning-state.ts'
import type { KanbanSurfaceState } from '../kanban/types.ts'
import { KanbanReviewSheet } from '../review/KanbanReviewSheet.tsx'
import { REVIEW_DEV_TASK_TITLE, REVIEW_DEV_TICKET_ID, reviewDevSampleEnabled } from '../review/review-dev-sample.ts'
import { AppliedToast } from '../review/simple/AppliedToast.tsx'
import { personaHistoryRemote } from '../data/history-remote.ts'
import type { PersonaCardShellBridge } from './persona-card-shell-bridge.ts'
import type { ProjectWorkspaceTab } from '../shell/ProjectWorkspaceTabs.tsx'
import { destByRemovedForProposal } from '../kanban/accept-workflow-proposal.ts'
import { ticketCountByColumnId } from '../kanban/workflow-editor-draft.ts'
import { Button, Toast, ToastRegion, usePawCelebration } from '../primitives/index.ts'
import { ConfettiMoment } from '../decor/HouseDecor.tsx'
import { personaFaceSrc } from '../hire/persona-face.ts'
import { personaPortrait } from '../second-brain/brain-ui-adapters.ts'
import { isTeamworkEnabled } from '../teamwork/teamwork-flag.ts'
import { TeamworkProvider, type TeamworkContextValue, type TeamworkPersona } from '../teamwork/teamwork-context.tsx'
import { useStartedNow } from '../kanban/started-now.ts'
import { StartedNowProvider } from '../kanban/StartedNowNote.tsx'
import { readHandoffNote, readReviewing, readWorkPath, type HandoffNoteUi, type PathStepUi, type ReviewingUi } from '../teamwork/teamwork-wire.ts'
import { isTeamworkSampleCardId, teamworkDevSampleEnabled, teamworkSampleCards, teamworkSamplePersona } from '../teamwork/teamwork-dev-sample.ts'
import { WorkPathSheet } from '../teamwork/WorkPathSheet.tsx'
import type { ConversationSubjectUi } from '../chat/conversation-subjects.ts'
import { ConnectedTaskConversation, type TaskConversationBridge } from './ConnectedTaskConversation.tsx'
import conversationStyles from './ConnectedTaskConversation.module.css'

export interface ConnectedProjectFlowBoardProps {
  readonly persona: PersonaRemoteClient
  readonly scope: ProjectScopeRequest
  readonly projectHint?: string
  readonly onMutate: () => void
  /** Which view of the project is open: the board, the sprint planning or the history (the tabs Quadro · Arquivos · Canvas belong to the shell's place). */
  readonly workspaceTab?: ProjectWorkspaceTab
  readonly onWorkspaceTabChange?: (tab: ProjectWorkspaceTab) => void
  /** The header title becomes the "Pessoal ▾" switcher (DESIGN-01 #10). */
  readonly switcher?: ProjectBoardSwitcher | undefined
  /** "+ Novo projeto" in the header. */
  readonly onNewProject?: (() => void) | undefined
  readonly personaCard?: PersonaCardShellBridge | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  readonly channelSubjects?: readonly ConversationSubjectUi[]
  /** Where a new task starts (the conversation with the team). */
  readonly onNewTask?: (() => void) | undefined
  /** COLHEITA 18: with it, a click on a card opens the conversation of the task in a side panel; without it the cards are as they were. */
  readonly taskConversation?: TaskConversationBridge | undefined
}

function canProposeWorkflow(client: PersonaRemoteClient): boolean {
  return typeof (client as { proposeWorkflow?: unknown }).proposeWorkflow === 'function'
}

function boardLoadKey(scope: ProjectScopeRequest, reloadToken: number): string {
  return `${scope.workspaceId}:${scope.projectId}:board:${reloadToken}`
}

/** Per-project workflow board via `getProjectBoard` + `moveTicket`. */
export function ConnectedProjectFlowBoard({
  persona,
  scope,
  onMutate,
  workspaceTab = 'board',
  onWorkspaceTabChange,
  projectHint = '',
  personaCard,
  openPersonaProfile,
  channelSubjects = [],
  onNewTask,
  switcher,
  onNewProject,
  taskConversation,
}: ConnectedProjectFlowBoardProps): ReactNode {
  const [reloadToken, setReloadToken] = useState(0)
  /** COLHEITA 18: the card whose conversation is open in the side panel (`null` = closed). */
  const [conversationCardId, setConversationCardId] = useState<string | null>(null)
  /** New copy: the same words if this build's generated locale does not carry the keys yet. */
  const tr = (key: string, fallback: string): string => {
    const text = t(key)
    return text === key ? fallback : text
  }
  /** P1-10: the last move that can be put back exactly (see move-undo.ts); gone after 6 s or at the next move. */
  const [moveUndo, setMoveUndo] = useState<(UndoableMove & { readonly ticketId: string; readonly title: string; readonly failed?: boolean }) | null>(null)
  const [moveBlocked, setMoveBlocked] = useState<{ readonly id: string; readonly title: string } | null>(null)
  const [reviewTarget, setReviewTarget] = useState<{ id: string; title: string } | null>(
    // Capture-only (dev seed + persona.devSeed.review): the sample opens on its own, once. Never without the flag.
    () => (reviewDevSampleEnabled() ? { id: REVIEW_DEV_TICKET_ID, title: REVIEW_DEV_TASK_TITLE } : null),
  )
  const [applied, setApplied] = useState<{ readonly restorePointId?: string | undefined } | null>(null)
  const [startPending, setStartPending] = useState(false)
  const [workflowProposal, setWorkflowProposal] = useState<WorkflowProposalView | null>(null)
  const [proposalPending, setProposalPending] = useState(false)
  const [acceptProposalPending, setAcceptProposalPending] = useState(false)
  const [sprintCloseSummary, setSprintCloseSummary] = useState<string | null>(null)
  const [freshApprovalIds, setFreshApprovalIds] = useState<ReadonlySet<string>>(() => new Set())
  const paw = usePawCelebration()
  const proposeEnabled = canProposeWorkflow(persona)

  useEffect(() => {
    if (moveUndo === null) return
    const timer = window.setTimeout(() => { setMoveUndo(null) }, MOVE_UNDO_MS)
    return () => { window.clearTimeout(timer) }
  }, [moveUndo])

  useEffect(() => {
    if (freshApprovalIds.size === 0) return
    const timer = window.setTimeout(() => { setFreshApprovalIds(new Set()) }, 1200)
    return () => { window.clearTimeout(timer) }
  }, [freshApprovalIds])
  const t = (key: string) => bindLocale(kanbanDict, key)

  const load = useCallback(async () => {
    return unwrapRemote(await persona.getProjectBoard(scope))
  }, [persona, scope.workspaceId, scope.projectId])

  const { state, retry } = usePersonaRemoteLoad(true, boardLoadKey(scope, reloadToken), load)

  // A reload (after a move, an Aplicar, a sprint closing) keeps the board it already has on screen until the new one arrives. Dropping it to
  // "carregando" swapped the whole tree, and the review sheet — mounted only with a board — was torn down in the middle of "Aplicar na pasta":
  // the success moment and its Desfazer were lost, and the sheet came back as a fresh one. Another project never borrows this board.
  const lastBoard = useRef<{ readonly key: string; readonly board: ProjectBoardView } | null>(null)
  const scopeKey = `${scope.workspaceId}:${scope.projectId}`
  if (state.status === 'ready') lastBoard.current = { key: scopeKey, board: state.data }
  const staleBoard = state.status === 'loading' && lastBoard.current?.key === scopeKey ? lastBoard.current.board : null
  const shownBoard = state.status === 'ready' ? state.data : staleBoard

  const surfaceState: KanbanSurfaceState = state.status === 'error'
    ? 'error'
    : shownBoard === null
      ? 'loading'
      : shownBoard.cards.length === 0 && shownBoard.workflow.columns.length === 0
        ? 'empty'
        : 'ready'

  const board: ProjectBoardView | null = shownBoard
  const boardFlow = board !== null
    ? projectBoardToFlow(board, { conversationSubjects: channelSubjects })
    : null
  // EQUIPE REAL (D-090): the bilhete and the work path live on the host's TASK (`TaskView.note/path`), not on the board card: read below.
  const [taskExtras, setTaskExtras] = useState<ReadonlyMap<string, { readonly note?: HandoffNoteUi; readonly path?: readonly PathStepUi[]; readonly reviewing?: ReviewingUi }>>(() => new Map())
  const flowMerged = boardFlow === null || taskExtras.size === 0
    ? boardFlow
    : {
      ...boardFlow,
      cards: boardFlow.cards.map((card) => {
        const extra = taskExtras.get(card.id)
        return extra === undefined ? card : { ...card, ...(extra.note === undefined ? {} : { note: extra.note }), ...(extra.path === undefined ? {} : { path: extra.path }), ...(extra.reviewing === undefined ? {} : { reviewing: extra.reviewing }) }
      }),
    }
  // CAPTURES ONLY (two dev keys: persona.devSeed.v1 + persona.devSeed.teamwork): three example cards so the design review can see the chips.
  const teamworkSample = teamworkDevSampleEnabled()
  const flow = flowMerged === null || !teamworkSample
    ? flowMerged
    : { ...flowMerged, cards: [...flowMerged.cards, ...teamworkSampleCards(flowMerged.columns, flowMerged.projectId, flowMerged.projectName)] }
  const sprint = board?.currentSprint

  // EQUIPE REAL (D-090, behind persona.flag.teamwork): the chip "Pedido por {A}" needs A's name and face, which the card only has as an id.
  // The team is read ONCE, and only when some card actually carries a handoff or a work path; without it the chip never appears.
  const [teamPersonas, setTeamPersonas] = useState<ReadonlyMap<string, TeamworkPersona>>(() => new Map())
  const [pathCardId, setPathCardId] = useState<string | null>(null)
  const teamworkWanted = isTeamworkEnabled() && boardFlow !== null && boardFlow.cards.length > 0
  useEffect(() => {
    if (!teamworkWanted) return
    let cancelled = false
    void (async () => {
      try {
        const rows = await unwrapRemote(await persona.listPersonas({ workspaceId: scope.workspaceId, projectId: scope.projectId }))
        if (cancelled) return
        // D-069: a persona is never a letter. A name or reference that is not a gallery animal ("Téo") gets the stable animal of its id.
        setTeamPersonas(new Map(rows.map(row => [row.id, { name: row.name, avatarSrc: personaPortrait(row) ?? personaFaceSrc(row.avatarRef, row.id) }] as const)))
      } catch {
        /* no names, no chip: the card stays as it was */
      }
      // The bilhete and the work path: `TaskView.note/path` (contracts/team-real.md), matched to the card by id. Nothing there = nothing drawn.
      try {
        const tasksWire = persona as unknown as { listTasks?(request: { workspaceId: string; projectId: string }): Promise<RemoteResult<readonly unknown[]>> }
        if (tasksWire.listTasks === undefined) return
        const tasks = await unwrapRemote(await tasksWire.listTasks({ workspaceId: scope.workspaceId, projectId: scope.projectId }))
        if (cancelled) return
        const extras = new Map<string, { note?: HandoffNoteUi; path?: readonly PathStepUi[]; reviewing?: ReviewingUi }>()
        for (const task of tasks) {
          const row = task as { id?: unknown; note?: unknown; path?: unknown; reviewing?: unknown }
          if (typeof row.id !== 'string') continue
          const note = readHandoffNote(row.note)
          const path = readWorkPath(row.path)
          const reviewing = readReviewing(row.reviewing)
          if (note === undefined && path.length === 0 && reviewing === undefined) continue
          extras.set(row.id, { ...(note === undefined ? {} : { note }), ...(path.length === 0 ? {} : { path }), ...(reviewing === undefined ? {} : { reviewing }) })
        }
        setTaskExtras(extras)
      } catch {
        /* no work path: the card keeps its chip only */
      }
    })()
    return () => { cancelled = true }
  }, [teamworkWanted, reloadToken, persona, scope.workspaceId, scope.projectId])
  const teamworkValue: TeamworkContextValue = {
    personaFor: personaId => teamPersonas.get(personaId) ?? (teamworkSample ? teamworkSamplePersona(personaId) : undefined),
    openPath: (cardId) => { setPathCardId(cardId) },
  }
  const pathCard = pathCardId === null ? undefined : flow?.cards.find(card => card.id === pathCardId)
  // COLHEITA 18: the card whose conversation is open; a card that left the board (deleted, another project) closes the panel on its own.
  const openConversationCard = conversationCardId === null ? undefined : flow?.cards.find(card => card.id === conversationCardId)
  // HT-3 (behind persona.flag.teamwork): "{nome} começou agora" on the card the PERSON just moved to Fazendo, only when that persona's current task IS the card.
  const startedNow = useStartedNow({
    enabled: isTeamworkEnabled(),
    readNow: async () => (await unwrapRemote(await persona.getOverviewNow({ workspaceId: scope.workspaceId, projectId: scope.projectId }))).personas,
  })

  const planningEnabled = workspaceTab === 'sprints' && board !== null
  const planning = useSprintPlanningState(board, flow?.cards ?? [], planningEnabled)

  const reload = (): void => {
    setReloadToken(token => token + 1)
    retry()
    onMutate()
  }

  /**
   * A card whose delivery is still waiting (it sits in a review column) must not be dragged into "Concluído": the host
   * would drop the pending review (FLOW-1). The UI never even asks; and if the host refuses with `delivery_pending` the
   * answer is the same: the card stays where it was and the person is told why, with the way to review it.
   */
  const deliveryWaiting = (ticketId: string, columnId: string): { readonly id: string; readonly title: string } | null => {
    const card = flow?.cards.find(row => row.id === ticketId)
    if (flow === null || card === undefined) return null
    const from = flow.columns.find(column => column.id === card.columnId)
    const to = flow.columns.find(column => column.id === columnId)
    if (to?.category !== 'done') return null
    // The host knows (`BoardCardView.deliveryPending`): `true` = a result waits (wherever the card sits), `false` = nothing waits (e.g. a
    // task without a folder has no draft), so the move is allowed. Without the field, the old guess: a card in review is waiting.
    const waiting = card.deliveryPending ?? from?.category === 'review'
    return waiting ? { id: card.id, title: card.title } : null
  }

  const onMoveCard = async (ticketId: string, columnId: string): Promise<void> => {
    // An example card (captures only) is not a task: nothing to move at the host; the board simply settles back.
    if (isTeamworkSampleCardId(ticketId)) { reload(); return }
    // A new move closes the old notice: "Desfazer" must never put back something older than what the person just did.
    setMoveUndo(null)
    const movedCard = flow?.cards.find(row => row.id === ticketId)
    const fromColumnId = movedCard?.columnId
    const waiting = deliveryWaiting(ticketId, columnId)
    if (waiting !== null) {
      setMoveBlocked(waiting)
      reload()
      return
    }
    const result = await persona.moveTicket({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      ticketId,
      columnId,
    })
    // The typed code list does not know `delivery_pending` yet (Forge/Anvil are adding it): compare as text.
    if (!result.ok && (result.error?.code as string | undefined) === 'delivery_pending') {
      const card = flow?.cards.find(row => row.id === ticketId)
      setMoveBlocked({ id: ticketId, title: card?.title ?? '' })
      reload()
      return
    }
    await unwrapRemote(result)
    // HT-3: the person moved it to Fazendo in this session: watch (up to 2 min) whether the persona starts ON this card.
    if (flow?.columns.find(column => column.id === columnId)?.category === 'doing') startedNow.watch(ticketId)
    const undoable = fromColumnId === undefined || flow === null ? null : undoableMove(flow.columns, fromColumnId, columnId)
    if (undoable !== null) setMoveUndo({ ...undoable, ticketId, title: movedCard?.title ?? '' })
    reload()
  }

  /** "Desfazer": the card goes back to the column it came from. The undo itself is not undoable (no second notice). */
  const undoMove = async (): Promise<void> => {
    const pending = moveUndo
    if (pending === null) return
    setMoveUndo(null)
    try {
      const result = await persona.moveTicket({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        ticketId: pending.ticketId,
        columnId: pending.fromColumnId,
      })
      if (!result.ok) throw new Error('move-undo-failed')
    } catch {
      setMoveUndo({ ...pending, failed: true })
    }
    reload()
  }

  /** Words with slots: the same text if this build's generated locale does not carry the key yet. */
  const trSlots = (key: string, fallback: string, slots: Readonly<Record<string, string>>): string => {
    const text = bindLocale(kanbanDict, key, slots)
    if (text !== key) return text
    return Object.entries(slots).reduce((line, [name, value]) => line.replace('{' + name + '}', value), fallback)
  }

  const goToBoardTab = (): void => {
    onWorkspaceTabChange?.('board')
  }

  const requestWorkflowProposal = (): void => {
    if (!proposeEnabled || flow === null) return
    setProposalPending(true)
    const description = projectHint.trim().length > 0 ? projectHint : flow.projectName
    void (async () => {
      try {
        setWorkflowProposal(await proposeWorkflowRemote(persona, {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          description,
        }))
      } finally {
        setProposalPending(false)
      }
    })()
  }

  const acceptWorkflowProposal = (): void => {
    if (workflowProposal === null || board === null || flow === null) return
    setAcceptProposalPending(true)
    const proposal = workflowProposal
    const ticketCounts = ticketCountByColumnId(flow.cards)
    const destByRemoved = destByRemovedForProposal(board.workflow.columns, proposal.workflow.columns, ticketCounts)
    const acceptRequest = buildAcceptWorkflowRequest(scope, proposal, destByRemoved)
    void acceptWorkflowProposalRemote(persona, acceptRequest)
      .then(() => {
        setWorkflowProposal(null)
        reload()
      })
      .finally(() => { setAcceptProposalPending(false) })
  }

  const dismissWorkflowProposal = (): void => {
    setWorkflowProposal(null)
    void rejectWorkflowProposalRemote(persona, scope)
  }

  const onStartSprint = async (): Promise<void> => {
    if (planning === null || board === null) return
    setStartPending(true)
    try {
      const dates = sprintDatesFromDraft(planning.draft)
      if (!planning.persisted) {
        await unwrapRemote(await persona.createSprint({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          id: planning.sprintId,
          name: planning.draft.name.trim(),
          objective: planning.draft.objective.trim(),
          ...dates,
        }))
      } else {
        await unwrapRemote(await persona.updateSprint({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          sprintId: planning.sprintId,
          name: planning.draft.name.trim(),
          objective: planning.draft.objective.trim(),
          ...dates,
        }))
      }
      await unwrapRemote(await persona.planSprint({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        sprintId: planning.sprintId,
        ticketIds: [...planning.ticketIds],
      }))
      await unwrapRemote(await persona.startSprint({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        sprintId: planning.sprintId,
      }))
      reload()
      goToBoardTab()
    } finally {
      setStartPending(false)
    }
  }

  if (planningEnabled && planning !== null && flow !== null) {
    return (
      <SprintPlanningView
        dict={kanbanDict}
        projectName={flow.projectName}
        backlog={planning.backlogCards}
        sprintCards={planning.sprintCards}
        draft={planning.draft}
        selectedBacklogId={planning.selectedBacklogId}
        selectedSprintId={planning.selectedSprintId}
        onDraftChange={planning.setDraftPatch}
        onSelectBacklog={planning.setSelectedBacklogId}
        onSelectSprint={planning.setSelectedSprintId}
        onAddToSprint={planning.addSelectedToSprint}
        onRemoveFromSprint={planning.removeSelectedFromSprint}
        onMoveToSprint={planning.moveToSprint}
        onMoveToBacklog={planning.moveToBacklog}
        onCancel={goToBoardTab}
        onStart={() => { void onStartSprint() }}
        startPending={startPending}
      />
    )
  }

  if (flow === null) {
    return (
      <ProjectFlowBoard
        dict={kanbanDict}
        flow={{
          projectId: scope.projectId,
          projectName: scope.projectId,
          template: 'simples',
          columns: [],
          cards: [],
        }}
        surfaceState={surfaceState}
        onRetry={reload}
        onNewTask={onNewTask}
        switcher={switcher}
        onNewProject={onNewProject}
        {...(personaCard === undefined ? {} : { personaCard })}
        {...(openPersonaProfile === undefined ? {} : { openPersonaProfile })}
      />
    )
  }

  return (
    <TeamworkProvider value={teamworkValue}>
      <StartedNowProvider value={startedNow}>
        {/* COLHEITA 18: the board and the conversation panel side by side; with the panel closed the wrapper is `display: contents` (the board is where it was). */}
        <div className={conversationStyles.layout} data-task-conversation-open={openConversationCard === undefined ? undefined : ''}>
          <ProjectFlowBoard
            dict={kanbanDict}
            flow={flow}
            surfaceState={surfaceState}
            {...(taskConversation === undefined ? {} : { onOpenConversation: (ticketId: string) => { setConversationCardId(ticketId) } })}
            {...(sprint !== undefined ? { currentSprint: sprint } : {})}
            switcher={switcher}
            onNewProject={onNewProject}
            {...(onWorkspaceTabChange === undefined ? {} : { onOpenHistory: () => { onWorkspaceTabChange('history') } })}
            onMoveCard={(ticketId, columnId) => { void onMoveCard(ticketId, columnId) }}
            onOpenReview={(ticketId) => {
              const card = flow.cards.find(row => row.id === ticketId)
              if (card !== undefined) setReviewTarget({ id: ticketId, title: card.title })
            }}
            onRetry={reload}
            onNewTask={onNewTask}
            onPlanSprint={() => { onWorkspaceTabChange?.('sprints') }}
            workflowFields={board?.workflow.fields ?? []}
            onSaveWorkflow={async (columns, destByRemoved, fields) => {
              await unwrapRemote(await persona.updateWorkflow({
                workspaceId: scope.workspaceId,
                projectId: scope.projectId,
                columns,
                fields,
                ...(Object.keys(destByRemoved).length > 0 ? { destByRemoved } : {}),
              }))
              reload()
            }}
            {...(sprint !== undefined
              ? {
                onConfirmCloseSprint: (leftover) => {
                  void (async () => {
                    const closed = await unwrapRemote(
                      await persona.closeSprint({
                        workspaceId: scope.workspaceId,
                        projectId: scope.projectId,
                        sprintId: sprint.id,
                        leftover,
                        confirmed: true,
                      }) as RemoteResult<CloseSprintView>,
                    )
                    if (closed.summary.trim().length > 0) {
                      setSprintCloseSummary(closed.summary)
                    }
                    reload()
                  })()
                },
              }
              : {})}
            freshApprovalStampIds={freshApprovalIds}
            celebrationNode={paw.node}
            {...(proposeEnabled
              ? {
                workflowProposal,
                workflowProposalPending: proposalPending,
                workflowProposalAcceptPending: acceptProposalPending,
                onRequestWorkflowProposal: requestWorkflowProposal,
                onAcceptWorkflowProposal: acceptWorkflowProposal,
                onDismissWorkflowProposal: dismissWorkflowProposal,
              }
              : {})}
            {...(personaCard === undefined ? {} : { personaCard })}
            {...(openPersonaProfile === undefined ? {} : { openPersonaProfile })}
          />
          {taskConversation !== undefined && openConversationCard !== undefined && (
            <ConnectedTaskConversation
              key={openConversationCard.id}
              bridge={taskConversation}
              kanbanDict={kanbanDict}
              card={openConversationCard}
              columnLabel={flow.columns.find(column => column.id === openConversationCard.columnId)?.name}
              onClose={() => { setConversationCardId(null) }}
              returnFocusTo={() => document.querySelector<HTMLElement>(`[data-persona-kanban-card="${openConversationCard.id}"]`)}
            />
          )}
        </div>
        {reviewTarget !== null && (
          <KanbanReviewSheet
            persona={persona}
            scope={scope}
            ticketId={reviewTarget.id}
            taskTitle={reviewTarget.title}
            onClose={() => { setReviewTarget(null) }}
            onMutate={reload}
            onAccepted={(id) => {
              setFreshApprovalIds(prev => new Set(prev).add(id))
              paw.celebrate()
            }}
            onApplied={(info) => { setApplied(info.restorePointId === undefined ? {} : { restorePointId: info.restorePointId }) }}
            {...(personaHistoryRemote(persona).available
              ? { onUndoApplied: (restorePointId: string) => { setApplied(null); void personaHistoryRemote(persona).undo(scope, restorePointId).then(reload).catch(() => { /* the history screen shows it if it did not work */ }) } }
              : {})}
          />
        )}
        {/* The success moment already says "Aplicado na pasta" and offers Desfazer: the toast waits for the sheet to close (it sat over "Voltar ao quadro" at 200 % zoom). */}
        {applied !== null && reviewTarget === null && (
          <AppliedToast
            onDismiss={() => { setApplied(null) }}
            {...(applied.restorePointId !== undefined && personaHistoryRemote(persona).available
              ? { onUndo: () => {
                const id = applied.restorePointId
                if (id !== undefined) void personaHistoryRemote(persona).undo(scope, id).then(reload).catch(() => { /* the history screen shows it if it did not work */ })
              } }
              : {})}
          />
        )}
        {moveUndo !== null && (
          <ToastRegion label={t('a11y.toastRegion')}>
            {moveUndo.failed === true
              ? (
                <Toast
                  tone="warning"
                  title={tr('moveUndo.failed', 'Não consegui desfazer agora. O cartão ficou onde está.')}
                  dismissLabel={tr('moveBlocked.dismiss', 'Fechar aviso')}
                  onDismiss={() => { setMoveUndo(null) }}
                />
              )
              : (
                <Toast
                  tone="neutral"
                  title={trSlots('moveUndo.title', '“{title}” foi para {column}', { title: moveUndo.title, column: moveUndo.toName })}
                  action={(
                    <Button size="s" variant="ghost" onClick={() => { void undoMove() }}>
                      {tr('moveUndo.undo', 'Desfazer')}
                    </Button>
                  )}
                />
              )}
          </ToastRegion>
        )}
        {moveBlocked !== null && (
          <ToastRegion label={t('a11y.toastRegion')}>
            <Toast
              tone="warning"
              title={tr('moveBlocked.title', 'Esse cartão tem mudanças esperando revisão')}
              body={tr('moveBlocked.body', 'Revise e aplique as mudanças, ou peça ajustes, antes de concluir a tarefa.')}
              action={(
                <Button size="s" variant="primary" onClick={() => { setReviewTarget({ id: moveBlocked.id, title: moveBlocked.title }); setMoveBlocked(null) }}>
                  {tr('moveBlocked.review', 'Revisar')}
                </Button>
              )}
              dismissLabel={tr('moveBlocked.dismiss', 'Fechar aviso')}
              onDismiss={() => { setMoveBlocked(null) }}
            />
          </ToastRegion>
        )}
        {sprintCloseSummary !== null && (
          <ToastRegion label={t('a11y.toastRegion')}>
            <ConfettiMoment>
              <Toast
                tone="celebrate"
                title={t('closeSprint.toastTitle')}
                body={sprintCloseSummary}
                dismissLabel={t('closeSprint.toastDismiss')}
                onDismiss={() => { setSprintCloseSummary(null) }}
              />
            </ConfettiMoment>
          </ToastRegion>
        )}
        {pathCard !== undefined && isTeamworkEnabled() && (pathCard.path?.length ?? 0) > 0 && (
          <WorkPathSheet
            dict={kanbanDict}
            open
            taskTitle={pathCard.title}
            steps={pathCard.path ?? []}
            note={pathCard.note}
            personaFor={teamworkValue.personaFor}
            onClose={() => { setPathCardId(null) }}
          />
        )}
      </StartedNowProvider>
    </TeamworkProvider>
  )
}
