// @vitest-environment jsdom
/**
 * Dogfood Agência Ponto — AG-001 (sprint band on Site/Simples/Marketing quadros).
 * @see persona-spec/reports/dogfood-agencia.md
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectBoardView } from '@deepseek-ai/dsh-persona-host/types'
import { ConnectedProjectFlowBoard } from '../src/client/remote/ConnectedProjectFlowBoard.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const SITE_BOARD: ProjectBoardView = {
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

describe('dogfood AG-001 — sprint nos Quadros (client)', () => {
  it('site template shows Planejar sprint when no active sprint', async () => {
    const persona = {
      getProjectBoard: async () => ({ ok: true as const, value: SITE_BOARD }),
      moveTicket: async () => ({ ok: true as const, value: undefined }),
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
      expect(screen.getByRole('button', { name: kanbanPt['sprint.plan'] })).toBeTruthy()
    })
    expect(document.querySelector('[data-persona-sprint="idle"]')).toBeTruthy()
  })

  it('Pessoal/simples also shows Planejar (hub card after open)', async () => {
    const board: ProjectBoardView = {
      ...SITE_BOARD,
      projectId: 'pp',
      projectName: 'Pessoal',
      workflow: { ...SITE_BOARD.workflow, projectId: 'pp', template: 'simples' },
    }
    const persona = {
      getProjectBoard: async () => ({ ok: true as const, value: board }),
      moveTicket: async () => ({ ok: true as const, value: undefined }),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectFlowBoard
          persona={persona}
          scope={{ workspaceId: 'ws', projectId: 'pp' }}
          onBack={() => {}}
          onMutate={() => {}}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: kanbanPt['sprint.plan'] })).toBeTruthy()
    })
  })
})
