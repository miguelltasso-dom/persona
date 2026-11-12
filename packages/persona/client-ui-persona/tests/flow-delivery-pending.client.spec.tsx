// @vitest-environment jsdom
// FLOW-1 (Keel/Ember): a card with a delivery waiting for review must not leave for "Concluído" — the host would drop
// the pending review. The UI never asks; if the host refuses with delivery_pending the card stays and the person is told.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectBoardView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { ConnectedProjectFlowBoard } from '../src/client/remote/ConnectedProjectFlowBoard.tsx'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const BOARD: ProjectBoardView = {
  projectId: 'proj-site',
  projectName: 'Site da agência',
  persisted: true,
  counts: { todo: 0, doing: 0, review: 1, needs_you: 0, done: 0, blocked: 0 },
  workflow: {
    projectId: 'proj-site',
    template: 'site',
    columns: [
      { id: 'col-review', name: 'Em revisão', category: 'review' },
      { id: 'col-done', name: 'Live', category: 'done' },
      { id: 'col-doing', name: 'Fazendo', category: 'doing' },
    ],
    fields: [],
  },
  cards: [{ ticketId: 't-hero', title: 'Hero da home', category: 'review', columnId: 'col-review', blocked: false }],
}

function board(persona: PersonaRemoteClient) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onMutate={() => {}} />
    </PreviewFrame>,
  )
}

async function moveHeroTo(column: string): Promise<void> {
  await waitFor(() => { expect(screen.getByText('Hero da home')).toBeTruthy() })
  fireEvent.click(screen.getByRole('button', { name: kanbanPt['a11y.cardMenu'] }))
  fireEvent.click(screen.getByRole('menuitem', { name: kanbanPt['action.moveTo'].replace('{column}', column) }))
}

describe('a card with a delivery waiting never leaves for Concluído (FLOW-1)', () => {
  it('review → Concluído: the host is never asked; the card says why and offers Revisar', async () => {
    const moveTicket = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const getProjectBoard = vi.fn(async () => ({ ok: true as const, value: BOARD }))
    board({ getProjectBoard, moveTicket } as unknown as PersonaRemoteClient)
    await moveHeroTo('Live')
    expect(await screen.findByText('Esse cartão tem mudanças esperando revisão')).toBeTruthy()
    expect(moveTicket).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeTruthy()
  })

  it('the host refusing with delivery_pending ends the same way (a card the UI could not tell about)', async () => {
    const moveTicket = vi.fn(async () => ({ ok: false as const, error: { code: 'delivery_pending', message: 'delivery_pending' } }))
    const getProjectBoard = vi.fn(async () => ({ ok: true as const, value: BOARD }))
    board({ getProjectBoard, moveTicket } as unknown as PersonaRemoteClient)
    await moveHeroTo('Fazendo')
    await waitFor(() => { expect(moveTicket).toHaveBeenCalledTimes(1) })
    expect(await screen.findByText('Esse cartão tem mudanças esperando revisão')).toBeTruthy()
  })

  it('a move with nothing waiting is not touched: review → another column still goes to the host', async () => {
    const moveTicket = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const getProjectBoard = vi.fn(async () => ({ ok: true as const, value: BOARD }))
    board({ getProjectBoard, moveTicket } as unknown as PersonaRemoteClient)
    await moveHeroTo('Fazendo')
    await waitFor(() => { expect(moveTicket).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj-site', ticketId: 't-hero', columnId: 'col-doing' }) })
    expect(screen.queryByText('Esse cartão tem mudanças esperando revisão')).toBeNull()
  })
})

describe('the host\'s own answer (BoardCardView.deliveryPending) wins over the column guess', () => {
  const withCard = (card: Record<string, unknown>): ProjectBoardView => ({ ...BOARD, cards: [card as unknown as ProjectBoardView['cards'][number]] })
  const mountWith = (view: ProjectBoardView, moveTicket: ReturnType<typeof vi.fn>) => board({
    getProjectBoard: vi.fn(async () => ({ ok: true as const, value: view })),
    moveTicket,
  } as unknown as PersonaRemoteClient)

  it('a card the host marks pending is held back even outside a review column', async () => {
    const moveTicket = vi.fn(async () => ({ ok: true as const, value: undefined }))
    mountWith(withCard({ ticketId: 't-hero', title: 'Hero da home', category: 'doing', columnId: 'col-doing', blocked: false, deliveryPending: true }), moveTicket)
    await moveHeroTo('Live')
    expect(await screen.findByText('Esse cartão tem mudanças esperando revisão')).toBeTruthy()
    expect(moveTicket).not.toHaveBeenCalled()
  })

  it('a card in review that the host says has nothing waiting (a task without a folder) goes to Concluído', async () => {
    const moveTicket = vi.fn(async () => ({ ok: true as const, value: undefined }))
    mountWith(withCard({ ticketId: 't-hero', title: 'Hero da home', category: 'review', columnId: 'col-review', blocked: false, deliveryPending: false }), moveTicket)
    await moveHeroTo('Live')
    await waitFor(() => { expect(moveTicket).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj-site', ticketId: 't-hero', columnId: 'col-done' }) })
    expect(screen.queryByText('Esse cartão tem mudanças esperando revisão')).toBeNull()
  })
})
