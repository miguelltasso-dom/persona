// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectBoardView, WorkflowProposalView } from '@deepseek-ai/dsh-persona-host/types'
import { ConnectedProjectFlowBoard } from '../src/client/remote/ConnectedProjectFlowBoard.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
installPreviewTheme()

afterEach(() => { cleanup() })

const MOCK_BOARD: ProjectBoardView = {
  projectId: 'proj-site',
  projectName: 'Site da agência',
  persisted: true,
  counts: { todo: 1, doing: 0, review: 0, needs_you: 0, done: 0, blocked: 0 },
  workflow: {
    projectId: 'proj-site',
    template: 'site',
    columns: [
      { id: 'col-todo', name: 'Backlog', category: 'todo' },
      { id: 'col-done', name: 'Live', category: 'done' },
    ],
    fields: [],
  },
  cards: [{
    ticketId: 't-hero',
    title: 'Hero da home',
    category: 'todo',
    blocked: false,
  }],
}

const HOST_PROPOSAL: WorkflowProposalView = {
  template: 'site',
  reason: 'Site da agência.',
  workflow: {
    projectId: 'proj-site',
    template: 'site',
    columns: [
      { id: 'col-todo', name: 'Backlog', category: 'todo' },
      { id: 'col-done', name: 'Live', category: 'done' },
    ],
    fields: [],
  },
  card: {
    question: 'Usar este fluxo?',
    primary: 'Usar este fluxo',
    impact: '2 colunas · modelo Site',
  },
}

describe('ConnectedProjectFlowBoard (PB-6/10)', () => {
  it('loads host board and renders flow columns', async () => {
    const persona = {
      getProjectBoard: vi.fn(async () => ({ ok: true as const, value: MOCK_BOARD })),
      moveTicket: vi.fn(),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectFlowBoard
          persona={persona}
          scope={{ workspaceId: 'ws', projectId: 'proj-site' }}
          onBack={() => {}}
          onMutate={() => {}}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Hero da home')).toBeTruthy()
    })
    expect(screen.getByText('Backlog')).toBeTruthy()
    expect(persona.getProjectBoard).toHaveBeenCalledWith({
      workspaceId: 'ws',
      projectId: 'proj-site',
    })
    expect(document.querySelector('[data-persona-kanban="project-flow"]')).toBeTruthy()
  })

  it('shows active sprint band from host currentSprint (PB-7)', async () => {
    const board: ProjectBoardView = {
      ...MOCK_BOARD,
      currentSprint: {
        id: 'sp-1',
        projectId: 'proj-site',
        name: 'Sprint 1',
        objective: 'Publicar landing',
        status: 'ativo',
        ticketIds: ['t-hero'],
        goalId: 'goal-1',
        daysLeft: 3,
      },
    }
    const persona = {
      getProjectBoard: vi.fn(async () => ({ ok: true as const, value: board })),
      moveTicket: vi.fn(),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectFlowBoard
          persona={persona}
          scope={{ workspaceId: 'ws', projectId: 'proj-site' }}
          onBack={() => {}}
          onMutate={() => {}}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Publicar landing')).toBeTruthy()
    })
    expect(screen.getByText('Sprint 1')).toBeTruthy()
  })

  it('opens sprint planning when workspace tab is sprints (PB-7)', async () => {
    const board: ProjectBoardView = {
      ...MOCK_BOARD,
      workflow: { ...MOCK_BOARD.workflow, template: 'software' },
      currentSprint: {
        id: 'sp-plan',
        projectId: 'proj-site',
        name: 'Sprint 2',
        objective: 'Integrar pagamentos',
        status: 'planejado',
        ticketIds: [],
        goalId: 'goal-2',
      },
    }
    const persona = {
      getProjectBoard: vi.fn(async () => ({ ok: true as const, value: board })),
      moveTicket: vi.fn(),
    } as unknown as PersonaRemoteClient
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectFlowBoard
          persona={persona}
          scope={{ workspaceId: 'ws', projectId: 'proj-site' }}
          workspaceTab="sprints"
          onBack={() => {}}
          onMutate={() => {}}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: kanbanPt['planSprint.title'] })).toBeTruthy()
    })
    expect(screen.getByLabelText(kanbanPt['planSprint.objective'])).toBeTruthy()
  })

  it('calls moveTicket when card moves to another flow column (PB-6)', async () => {
    const moveTicket = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const getProjectBoard = vi.fn(async () => ({ ok: true as const, value: MOCK_BOARD }))
    const persona = { getProjectBoard, moveTicket } as unknown as PersonaRemoteClient
    const onMutate = vi.fn()

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectFlowBoard
          persona={persona}
          scope={{ workspaceId: 'ws', projectId: 'proj-site' }}
          onBack={() => {}}
          onMutate={onMutate}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Hero da home')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: kanbanPt['a11y.cardMenu'] }))
    fireEvent.click(screen.getByRole('menuitem', { name: kanbanPt['action.moveTo'].replace('{column}', 'Live') }))

    await waitFor(() => {
      expect(moveTicket).toHaveBeenCalledWith({
        workspaceId: 'ws',
        projectId: 'proj-site',
        ticketId: 't-hero',
        columnId: 'col-done',
      })
    })
    expect(onMutate).toHaveBeenCalled()
  })

  it('requests and accepts Coordination workflow proposal (PB-3/6)', async () => {
    const proposeWorkflow = vi.fn(async () => ({ ok: true as const, value: HOST_PROPOSAL }))
    const acceptWorkflowProposal = vi.fn(async () => ({ ok: true as const, value: HOST_PROPOSAL.workflow }))
    const getProjectBoard = vi.fn(async () => ({ ok: true as const, value: MOCK_BOARD }))
    const persona = { getProjectBoard, proposeWorkflow, acceptWorkflowProposal, moveTicket: vi.fn() } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectFlowBoard
          persona={persona}
          scope={{ workspaceId: 'ws', projectId: 'proj-site' }}
          onBack={() => {}}
          onMutate={() => {}}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Hero da home')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: kanbanPt['proposal.request'] }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Usar este fluxo?' })).toBeTruthy()
    })
    expect(proposeWorkflow).toHaveBeenCalledWith({
      workspaceId: 'ws',
      projectId: 'proj-site',
      description: 'Site da agência',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Usar este fluxo' }))
    await waitFor(() => {
      expect(acceptWorkflowProposal).toHaveBeenCalledTimes(1)
    })
  })

  it('dismisses workflow proposal via reject RPC (PB-3)', async () => {
    const proposeWorkflow = vi.fn(async () => ({ ok: true as const, value: HOST_PROPOSAL }))
    const rejectWorkflowProposal = vi.fn(async () => ({ ok: true as const, value: HOST_PROPOSAL.workflow }))
    const persona = {
      getProjectBoard: vi.fn(async () => ({ ok: true as const, value: MOCK_BOARD })),
      proposeWorkflow,
      rejectWorkflowProposal,
      moveTicket: vi.fn(),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectFlowBoard
          persona={persona}
          scope={{ workspaceId: 'ws', projectId: 'proj-site' }}
          onBack={() => {}}
          onMutate={() => {}}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Hero da home')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: kanbanPt['proposal.request'] }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: kanbanPt['proposal.dismiss'] })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: kanbanPt['proposal.dismiss'] }))
    await waitFor(() => {
      expect(rejectWorkflowProposal).toHaveBeenCalledWith({
        workspaceId: 'ws',
        projectId: 'proj-site',
      })
    })
  })

  it('calls closeSprint when user confirms modal (PB-7)', async () => {
    const board: ProjectBoardView = {
      ...MOCK_BOARD,
      currentSprint: {
        id: 'sp-close',
        projectId: 'proj-site',
        name: 'Sprint fechar',
        objective: 'Entregar hero',
        status: 'ativo',
        ticketIds: ['t-hero'],
        goalId: 'goal-1',
        daysLeft: 2,
      },
    }
    const closeSprint = vi.fn(async () => ({
      ok: true as const,
      value: { summary: 'Resumo do sprint no canal.' },
    }))
    const persona = {
      getProjectBoard: vi.fn(async () => ({ ok: true as const, value: board })),
      closeSprint,
      moveTicket: vi.fn(),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectFlowBoard
          persona={persona}
          scope={{ workspaceId: 'ws', projectId: 'proj-site' }}
          onBack={() => {}}
          onMutate={() => {}}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Entregar hero')).toBeTruthy()
    })
    const openClose = screen.getAllByRole('button', { name: kanbanPt['sprint.close'] })[0]
    if (openClose === undefined) throw new Error('missing sprint close trigger')
    fireEvent.click(openClose)
    const confirmClose = screen.getAllByRole('button', { name: kanbanPt['closeSprint.confirm'] }).at(-1)
    if (confirmClose === undefined) throw new Error('missing close sprint confirm')
    fireEvent.click(confirmClose)

    await waitFor(() => {
      expect(closeSprint).toHaveBeenCalledWith({
        workspaceId: 'ws',
        projectId: 'proj-site',
        sprintId: 'sp-close',
        leftover: 'next',
        confirmed: true,
      })
    })
    await waitFor(() => {
      expect(screen.getByText('Resumo do sprint no canal.')).toBeTruthy()
    })
  })
})
