/** Project page: header, sprint band, workflow board (BOARDS-SPEC §2). */

import { useState, type ReactNode } from 'react'
import type { SprintView, WorkflowColumnView, WorkflowFieldView, WorkflowProposalView } from '@deepseek-ai/dsh-persona-host/types'
import { flowModelLabel } from '../boards/flow-models.ts'
import { templateToFlowModel } from '../data/adapters/board.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, MenuButton, Screen, ScreenHeader, UiIcon, type MenuItem } from '../primitives/index.ts'
import { FlowKanbanBoard } from './FlowKanbanBoard.tsx'
import type { ProjectFlowSnapshot } from './flow-types.ts'
import styles from './Kanban.module.css'
import { SprintBand } from './SprintBand.tsx'
import type { KanbanSurfaceState } from './types.ts'
import { CloseSprintModal } from './CloseSprintModal.tsx'
import { WorkflowEditorModal } from './WorkflowEditorModal.tsx'
import { WorkflowProposalCard } from './WorkflowProposalCard.tsx'
import { ticketCountByColumnId } from './workflow-editor-draft.ts'
import type { PersonaCardShellBridge } from '../remote/persona-card-shell-bridge.ts'
import type { ProjectChoice } from './current-project.ts'
import { ProjectSwitcher } from './ProjectSwitcher.tsx'

/** The project switcher of the Projetos place header (DESIGN-01-MUSE §5.1): the project name as the title, with "Ver todos os projetos". */
export interface ProjectBoardSwitcher {
  readonly projects: readonly ProjectChoice[]
  readonly currentId: string | null
  readonly onSelect: (projectId: string) => void
  readonly onSeeAll: () => void
}

export interface ProjectFlowBoardProps {
  readonly dict: LocaleDict
  readonly flow: ProjectFlowSnapshot
  readonly surfaceState: KanbanSurfaceState
  readonly currentSprint?: SprintView
  /** The title becomes the "Pessoal ▾" switcher. Absent = the title is the project name. */
  readonly switcher?: ProjectBoardSwitcher | undefined
  /** "Novo projeto": an item of the project switcher menu (not a header button). Absent = no item. */
  readonly onNewProject?: (() => void) | undefined
  /** "Histórico" (the project's restore points). Absent = no button. */
  readonly onOpenHistory?: (() => void) | undefined
  readonly onMoveCard?: (ticketId: string, columnId: string) => void
  readonly onOpenReview?: (ticketId: string) => void
  readonly onRetry?: () => void
  /** Where a new task starts. Without it the button is not drawn. */
  readonly onNewTask?: (() => void) | undefined
  readonly onPlanSprint?: () => void
  readonly onConfirmCloseSprint?: (leftover: 'next' | 'backlog') => void
  readonly workflowFields?: readonly WorkflowFieldView[]
  readonly onSaveWorkflow?: (
    columns: readonly WorkflowColumnView[],
    destByRemoved: Readonly<Record<string, string>>,
    fields: readonly WorkflowFieldView[],
  ) => void | Promise<void>
  readonly workflowProposal?: WorkflowProposalView | null
  readonly workflowProposalPending?: boolean
  readonly workflowProposalAcceptPending?: boolean
  readonly onRequestWorkflowProposal?: () => void
  readonly onAcceptWorkflowProposal?: () => void
  readonly onDismissWorkflowProposal?: () => void
  readonly freshApprovalStampIds?: ReadonlySet<string>
  readonly celebrationNode?: ReactNode
  readonly personaCard?: PersonaCardShellBridge | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  readonly onTeach?: ((ticketId: string, personaId: string) => void) | undefined
}

export function ProjectFlowBoard({
  dict,
  flow,
  surfaceState,
  currentSprint,
  switcher,
  onNewProject,
  onOpenHistory,
  onMoveCard,
  onOpenReview,
  onRetry,
  onNewTask,
  onPlanSprint,
  onConfirmCloseSprint,
  workflowFields = [],
  onSaveWorkflow,
  workflowProposal = null,
  workflowProposalPending = false,
  workflowProposalAcceptPending = false,
  onRequestWorkflowProposal,
  onAcceptWorkflowProposal,
  onDismissWorkflowProposal,
  freshApprovalStampIds,
  celebrationNode,
  personaCard,
  openPersonaProfile,
  onTeach,
}: ProjectFlowBoardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [editorOpen, setEditorOpen] = useState(false)
  const [closeSprintOpen, setCloseSprintOpen] = useState(false)
  const flowModel = templateToFlowModel(flow.template)
  const sprintTicketIds = new Set(currentSprint?.ticketIds ?? [])
  const sprintCards = sprintTicketIds.size === 0
    ? flow.cards
    : flow.cards.filter(card => sprintTicketIds.has(card.id))
  const doneCount = sprintCards.filter(card => card.column === 'done').length
  const rolledCount = sprintCards.filter(card => card.column !== 'done').length
  const contributors = (() => {
    const byPerson = new Map<string, { id: string; name: string; count: number }>()
    for (const card of sprintCards) {
      if (card.column !== 'done' || card.assignee === undefined) continue
      const row = byPerson.get(card.assignee.id) ?? { id: card.assignee.id, name: card.assignee.name, count: 0 }
      row.count += 1
      byPerson.set(card.assignee.id, row)
    }
    return [...byPerson.values()].sort((a, b) => b.count - a.count)
  })()
  const leftoverTasks = sprintCards.filter(card => card.column !== 'done').map(card => ({ id: card.id, title: card.title }))
  const ticketCountByColumn = ticketCountByColumnId(flow.cards)
  // The header keeps two controls (Carbon): "Opções ▾" holds what is not the task of the moment. Only what the host can do is an item.
  const optionItems: readonly MenuItem[] = [
    ...(onRequestWorkflowProposal === undefined ? [] : [{
      id: 'proposal',
      label: t('proposal.request'),
      disabled: workflowProposalPending,
      onSelect: () => { onRequestWorkflowProposal() },
    }]),
    ...(onSaveWorkflow === undefined ? [] : [{ id: 'edit-flow', label: t('action.editFlow'), onSelect: () => { setEditorOpen(true) } }]),
    ...(onOpenHistory === undefined ? [] : [{ id: 'history', label: t('projects.history.open'), onSelect: () => { onOpenHistory() } }]),
    // With the project name as a plain title there is no switcher menu to hold "Novo projeto": it lives here, never nowhere.
    ...(switcher !== undefined || onNewProject === undefined ? [] : [{ id: 'new-project', label: t('boards.newProject'), onSelect: () => { onNewProject() } }]),
  ]
  const noTaskYet = flow.cards.length === 0

  return (
    <Screen width="full" className={styles.boardShell} data-persona-kanban="project-flow" data-persona-surface="boards">
      <ScreenHeader
        icon="kanban"
        eyebrow={t('header.eyebrowProject')}
        title={switcher === undefined ? flow.projectName : (
          <ProjectSwitcher
            dict={dict}
            projects={switcher.projects}
            currentId={switcher.currentId}
            onSelect={switcher.onSelect}
            onSeeAll={switcher.onSeeAll}
            {...(onNewProject === undefined ? {} : { onNewProject })}
          />
        )}
        subtitle={`${flowModelLabel(dict, flowModel)} · ${t('subtitle.projectFlow')}`}
        actions={(
          <>
            {optionItems.length > 0 && <MenuButton label={t('projects.options')} text={t('projects.options')} items={optionItems} />}
            {onNewTask !== undefined && (
              <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={() => { onNewTask() }}>{t('action.newTask')}</Button>
            )}
          </>
        )}
      />
      {workflowProposal !== null && onAcceptWorkflowProposal !== undefined && onDismissWorkflowProposal !== undefined && (
        <WorkflowProposalCard
          dict={dict}
          proposal={workflowProposal}
          acceptPending={workflowProposalAcceptPending}
          onAccept={() => { onAcceptWorkflowProposal() }}
          onDismiss={() => { onDismissWorkflowProposal() }}
        />
      )}
      {/* A project with no task has nothing to plan: the invitation below is the only band. */}
      {!(noTaskYet && currentSprint === undefined) && (
        <SprintBand
          dict={dict}
          {...(currentSprint !== undefined ? { sprint: currentSprint } : {})}
          sprintsEnabled={
            flow.template === 'software'
            || flow.template === 'site'
            || flow.template === 'simples'
            || flow.template === 'marketing'
            || currentSprint !== undefined
          }
          doneCount={doneCount}
          totalCount={sprintCards.length > 0 ? sprintCards.length : flow.cards.length}
          {...(onPlanSprint !== undefined ? { onPlan: onPlanSprint } : {})}
          {...(onConfirmCloseSprint !== undefined && currentSprint !== undefined
            ? { onCloseSprint: () => { setCloseSprintOpen(true) } }
            : {})}
        />
      )}
      <FlowKanbanBoard
        dict={dict}
        columns={flow.columns}
        cards={flow.cards}
        surfaceState={surfaceState}
        projectName={flow.projectName}
        {...(onNewTask === undefined ? {} : {
          // A project with no task yet: the columns stay (empty) and ONE invitation says where the first one starts.
          emptyInvite: (
            <div className={styles.emptyInvite} data-persona-empty-invite="">
              <p className={styles.emptyInviteText}>{t('projects.emptyInvite')}</p>
              <Button variant="secondary" size="s" onClick={() => { onNewTask() }}>{t('projects.emptyInviteAction')}</Button>
            </div>
          ),
        })}
        {...(onMoveCard !== undefined ? { onMoveCard } : {})}
        {...(onOpenReview !== undefined ? { onOpenReview } : {})}
        {...(onRetry !== undefined ? { onRetry } : {})}
        {...(freshApprovalStampIds !== undefined ? { freshApprovalStampIds } : {})}
        {...(celebrationNode !== undefined ? { celebrationNode } : {})}
        {...(personaCard === undefined ? {} : { personaCard })}
        {...(openPersonaProfile === undefined ? {} : { openPersonaProfile })}
        {...(onTeach !== undefined ? { onTeach } : {})}
      />
      {editorOpen && onSaveWorkflow !== undefined && (
        <WorkflowEditorModal
          dict={dict}
          flowModel={flowModel}
          columns={flow.columns}
          ticketCountByColumn={ticketCountByColumn}
          fields={workflowFields}
          onClose={() => { setEditorOpen(false) }}
          onSave={onSaveWorkflow}
        />
      )}
      {closeSprintOpen && currentSprint !== undefined && onConfirmCloseSprint !== undefined && (
        <CloseSprintModal
          dict={dict}
          sprintName={currentSprint.name}
          delivered={doneCount}
          rolled={rolledCount}
          contributors={contributors}
          leftoverTasks={leftoverTasks}
          onClose={() => { setCloseSprintOpen(false) }}
          onConfirm={(leftover) => {
            setCloseSprintOpen(false)
            onConfirmCloseSprint(leftover)
          }}
        />
      )}
    </Screen>
  )
}
