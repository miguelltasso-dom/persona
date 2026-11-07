// @vitest-environment jsdom
// P1-10 (Muse/Ember → Lumen): after moving a card the person gets "“{cartão}” foi para {coluna} · Desfazer" for 6 s — but only
// when moving back puts everything back exactly as it was. Into Concluído / A fazer, or out of Precisa de você, the
// host drops something (the pending delivery, the last report, the real question): no promise we cannot keep.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectBoardView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { FlowColumnModel } from '../src/client/kanban/flow-types.ts'
import { MOVE_UNDO_MS, undoableMove } from '../src/client/kanban/move-undo.ts'
import { ConnectedProjectFlowBoard } from '../src/client/remote/ConnectedProjectFlowBoard.tsx'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup(); vi.useRealTimers() })

type HostCategory = 'todo' | 'doing' | 'review' | 'needs_you' | 'done'
type TestColumn = FlowColumnModel & { readonly category: HostCategory }
const COLUMNS: readonly TestColumn[] = [
  { id: 'c-todo', name: 'A fazer', category: 'todo' },
  { id: 'c-doing', name: 'Fazendo', category: 'doing' },
  { id: 'c-review', name: 'Em revisão', category: 'review' },
  { id: 'c-ask', name: 'Precisa de você', category: 'needs_you' },
  { id: 'c-done', name: 'Live', category: 'done' },
]

describe('which moves can be put back (undoableMove)', () => {
  it('A fazer / Fazendo / Em revisão → Fazendo / Em revisão: yes, back to where it was', () => {
    expect(undoableMove(COLUMNS, 'c-todo', 'c-doing')).toEqual({ fromColumnId: 'c-todo', fromName: 'A fazer', toName: 'Fazendo' })
    expect(undoableMove(COLUMNS, 'c-doing', 'c-review')).toEqual({ fromColumnId: 'c-doing', fromName: 'Fazendo', toName: 'Em revisão' })
    expect(undoableMove(COLUMNS, 'c-review', 'c-doing')?.fromColumnId).toBe('c-review')
  })

  it('never into Concluído or A fazer, never out of Precisa de você, never to the same column', () => {
    expect(undoableMove(COLUMNS, 'c-doing', 'c-done')).toBeNull()
    expect(undoableMove(COLUMNS, 'c-review', 'c-done')).toBeNull()
    expect(undoableMove(COLUMNS, 'c-doing', 'c-todo')).toBeNull()
    expect(undoableMove(COLUMNS, 'c-ask', 'c-doing')).toBeNull()
    expect(undoableMove(COLUMNS, 'c-done', 'c-doing')).toBeNull()
    expect(undoableMove(COLUMNS, 'c-doing', 'c-ask')).toBeNull()
    expect(undoableMove(COLUMNS, 'c-doing', 'c-doing')).toBeNull()
    expect(undoableMove(COLUMNS, 'c-doing', 'unknown')).toBeNull()
  })

  it('the notice stays 6 s (the same as the decisions)', () => {
    expect(MOVE_UNDO_MS).toBe(6000)
  })
})

const BOARD: ProjectBoardView = {
  projectId: 'proj-site',
  projectName: 'Site da agência',
  persisted: true,
  counts: { todo: 0, doing: 1, review: 0, needs_you: 0, done: 0, blocked: 0 },
  workflow: {
    projectId: 'proj-site',
    template: 'site',
    columns: COLUMNS.map(column => ({ id: column.id, name: column.name, category: column.category })),
    fields: [],
  },
  cards: [{ ticketId: 't-hero', title: 'Hero da home', category: 'doing', columnId: 'c-doing', blocked: false }],
}

function mountBoard(moveTicket: ReturnType<typeof vi.fn>) {
  const persona = { getProjectBoard: vi.fn(async () => ({ ok: true as const, value: BOARD })), moveTicket } as unknown as PersonaRemoteClient
  return render(
    <PreviewFrame brandLabel="Persona">
      <ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onBack={() => {}} onMutate={() => {}} />
    </PreviewFrame>,
  )
}

async function moveHeroTo(column: string): Promise<void> {
  await waitFor(() => { expect(screen.getByText('Hero da home')).toBeTruthy() })
  fireEvent.click(screen.getByRole('button', { name: kanbanPt['a11y.cardMenu'] }))
  fireEvent.click(screen.getByRole('menuitem', { name: kanbanPt['action.moveTo'].replace('{column}', column) }))
}

const ok = () => vi.fn(async () => ({ ok: true as const, value: undefined }))

describe('the "Desfazer" notice on the board', () => {
  it('a move without loss says where the card went; "Desfazer" moves it back', async () => {
    const moveTicket = ok()
    mountBoard(moveTicket)
    await moveHeroTo('Em revisão')
    expect(await screen.findByText('“Hero da home” foi para Em revisão')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => { expect(moveTicket).toHaveBeenCalledTimes(2) })
    expect(moveTicket).toHaveBeenLastCalledWith({ workspaceId: 'ws', projectId: 'proj-site', ticketId: 't-hero', columnId: 'c-doing' })
    // the undo is not undoable: no second notice
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull() })
  })

  it('moves that lose something (Concluído, A fazer, Precisa de você) get no "Desfazer"', async () => {
    for (const column of ['Live', 'A fazer', 'Precisa de você']) {
      const moveTicket = ok()
      const view = mountBoard(moveTicket)
      await moveHeroTo(column)
      await waitFor(() => { expect(moveTicket).toHaveBeenCalledTimes(1) })
      await act(async () => { await Promise.resolve() })
      expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
      view.unmount()
    }
  })

  it('a host that refuses the undo says so and leaves the card where it is', async () => {
    const moveTicket = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: undefined })
      .mockResolvedValueOnce({ ok: false as const, error: { code: 'internal', message: 'no' } })
    mountBoard(moveTicket)
    await moveHeroTo('Em revisão')
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    expect(await screen.findByText('Não consegui desfazer agora. O cartão ficou onde está.')).toBeTruthy()
  })

  it('the notice goes away by itself after 6 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const moveTicket = ok()
    mountBoard(moveTicket)
    await moveHeroTo('Em revisão')
    expect(await screen.findByText('“Hero da home” foi para Em revisão')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(MOVE_UNDO_MS + 100) })
    expect(screen.queryByText('“Hero da home” foi para Em revisão')).toBeNull()
  })
})
