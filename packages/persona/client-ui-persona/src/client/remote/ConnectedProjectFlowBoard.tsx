import { useCallback, useEffect, useState, type ReactNode } from 'react'
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
import { ProjectFlowBoard } from '../kanban/ProjectFlowBoard.tsx'
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
import { Toast, ToastRegion, usePawCelebration } from '../primitives/index.ts'
import type { ConversationSubjectUi } from '../chat/conversation-subjects.ts'

export interface ConnectedProjectFlowBoardProps {
  readonly persona: PersonaRemoteClient
  readonly scope: ProjectScopeRequest
  readonly projectHint?: string
  readonly onBack: () => void
  readonly onMutate: () => void
  readonly workspaceTab?: ProjectWorkspaceTab
  readonly onWorkspaceTabChange?: (tab: ProjectWorkspaceTab) => void
  readonly personaCard?: PersonaCardShellBridge | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  readonly channelSubjects?: readonly ConversationSubjectUi[]
  /** Where a new task starts (the conversation with the team). */
  readonly onNewTask?: (() => void) | undefined
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
  onBack,
  onMutate,
  workspaceTab = 'board',
  onWorkspaceTabChange,
  projectHint = '',
  personaCard,
  openPersonaProfile,
  channelSubjects = [],
  onNewTask,
}: ConnectedProjectFlowBoardProps): ReactNode {
  const [reloadToken, setReloadToken] = useState(0)
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
    if (freshApprovalIds.size === 0) return
    const timer = window.setTimeout(() => { setFreshApprovalIds(new Set()) }, 1200)
    return () => { window.clearTimeout(timer) }
  }, [freshApprovalIds])
  const t = (key: string) => bindLocale(kanbanDict, key)

  const load = useCallback(async () => {
    return unwrapRemote(await persona.getProjectBoard(scope))
  }, [persona, scope.workspaceId, scope.projectId])

  const { state, retry } = usePersonaRemoteLoad(true, boardLoadKey(scope, reloadToken), load)

  const surfaceState: KanbanSurfaceState = state.status === 'loading'
    ? 'loading'
    : state.status === 'error'
      ? 'error'
      : state.data.cards.length === 0 && state.data.workflow.columns.length === 0
        ? 'empty'
        : 'ready'

  const board: ProjectBoardView | null = state.status === 'ready' ? state.data : null
  const flow = board !== null
    ? projectBoardToFlow(board, { conversationSubjects: channelSubjects })
    : null
  const sprint = board?.currentSprint

  const planningEnabled = workspaceTab === 'sprints' && board !== null
  const planning = useSprintPlanningState(board, flow?.cards ?? [], planningEnabled)

  const reload = (): void => {
    setReloadToken(token => token + 1)
    retry()
    onMutate()
  }

  const onMoveCard = async (ticketId: string, columnId: string): Promise<void> => {
    await unwrapRemote(await persona.moveTicket({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      ticketId,
      columnId,
    }))
    reload()
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
        workspaceTab={workspaceTab}
        onBack={onBack}
        onRetry={reload}
        onNewTask={onNewTask}
        {...(onWorkspaceTabChange !== undefined ? { onWorkspaceTabChange } : {})}
        {...(personaCard === undefined ? {} : { personaCard })}
        {...(openPersonaProfile === undefined ? {} : { openPersonaProfile })}
      />
    )
  }

  return (
    <>
      <ProjectFlowBoard
        dict={kanbanDict}
        flow={flow}
        surfaceState={surfaceState}
        workspaceTab={workspaceTab}
        {...(sprint !== undefined ? { currentSprint: sprint } : {})}
        onBack={onBack}
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
        {...(onWorkspaceTabChange !== undefined ? { onWorkspaceTabChange } : {})}
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
            ? { onUndoApplied: (restorePointId: string) => { void personaHistoryRemote(persona).undo(scope, restorePointId).then(reload).catch(() => { /* the history screen shows it if it did not work */ }) } }
            : {})}
        />
      )}
      {applied !== null && (
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
      {sprintCloseSummary !== null && (
        <ToastRegion label={t('a11y.toastRegion')}>
          <Toast
            tone="celebrate"
            title={t('closeSprint.toastTitle')}
            body={sprintCloseSummary}
            dismissLabel={t('closeSprint.toastDismiss')}
            onDismiss={() => { setSprintCloseSummary(null) }}
          />
        </ToastRegion>
      )}
    </>
  )
}
