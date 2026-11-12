// @vitest-environment jsdom
// CV-5 (contracts/mentions-fanout.md §2): a task with several named personas shows "com Bento" on its board card; the first named leads.
// No collaborators = no chip (never an empty "com").
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectBoardView } from '@deepseek-ai/dsh-persona-host/types'
import { projectBoardToFlow } from '../src/client/data/adapters/board.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { ConnectedProjectFlowBoard } from '../src/client/remote/ConnectedProjectFlowBoard.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'

installPreviewTheme()
afterEach(() => { cleanup() })

const BOARD: ProjectBoardView = {
  projectId: 'proj-site',
  projectName: 'Site da agência',
  persisted: true,
  counts: { todo: 0, doing: 3, review: 0, needs_you: 0, done: 0, blocked: 0 },
  workflow: { projectId: 'proj-site', template: 'site', fields: [], columns: [{ id: 'c-doing', name: 'Fazendo', category: 'doing' }] },
  cards: [
    { ticketId: 't1', title: 'Página de contato', category: 'doing', columnId: 'c-doing', blocked: false, collaborators: [{ personaId: 'bento', name: 'Bento' }] },
    { ticketId: 't2', title: 'Folheto', category: 'doing', columnId: 'c-doing', blocked: false, collaborators: [{ personaId: 'bento', name: 'Bento' }, { personaId: 'luna', name: 'Luna' }, { personaId: 'sol', name: 'Sol' }] },
    { ticketId: 't3', title: 'Sem ninguém junto', category: 'doing', columnId: 'c-doing', blocked: false },
  ] as unknown as ProjectBoardView['cards'],
}

describe('"com {nome}" on the board card', () => {
  it('the adapter keeps only named collaborators', () => {
    const flow = projectBoardToFlow({
      ...BOARD,
      cards: [{ ticketId: 't1', title: 'X', category: 'doing', columnId: 'c-doing', blocked: false, collaborators: [{ personaId: 'a', name: '  Ana ' }, { personaId: 'b', name: '' }] }] as unknown as ProjectBoardView['cards'],
    })
    expect(flow.cards[0]?.collaborators).toEqual([{ personaId: 'a', name: 'Ana' }])
    expect(projectBoardToFlow(BOARD).cards[2]?.collaborators).toBeUndefined()
  })

  it('says "com Bento", "com Bento, Luna e Sol", and nothing when nobody is with the lead', async () => {
    const persona = { getProjectBoard: vi.fn(async () => ({ ok: true as const, value: BOARD })), moveTicket: vi.fn() } as unknown as PersonaRemoteClient
    render(<PreviewFrame brandLabel="Persona"><ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onMutate={() => {}} /></PreviewFrame>)
    expect(await screen.findByText('com Bento')).toBeTruthy()
    expect(screen.getByText('com Bento, Luna e Sol')).toBeTruthy()
    expect(screen.getAllByText(/^com /)).toHaveLength(2)
  })
})
