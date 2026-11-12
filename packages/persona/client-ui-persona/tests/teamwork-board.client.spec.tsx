// @vitest-environment jsdom
// EQUIPE REAL (D-090, EQUIPE-REAL-SPEC "No quadro" + "O bilhete" + "O caminho do trabalho"), behind persona.flag.teamwork:
// the card of the colleague says "Pedido por {A}", the card of who asked says "Esperando {B}" (faces 16), and the task's
// "Caminho do trabalho" shows who wrote, handed on and delivered, each step with its "Bilhete de {A}" folded. The note is
// the persona's own text, shown as text. No name known = no chip (never an id). Flag off = the board is the one it always was.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectBoardView } from '@deepseek-ai/dsh-persona-host/types'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { projectBoardToFlow } from '../src/client/data/adapters/board.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { ConnectedProjectFlowBoard } from '../src/client/remote/ConnectedProjectFlowBoard.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { TEAMWORK_FLAG_KEY } from '../src/client/teamwork/teamwork-flag.ts'
import { readCardHandoff, readHandoffNote, readWorkPath } from '../src/client/teamwork/teamwork-wire.ts'

installPreviewTheme()
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

const on = (): void => { localStorage.setItem(TEAMWORK_FLAG_KEY, '1') }

describe('what the host sends is read as data, never trusted', () => {
  it('a card handoff needs a known role and a persona id', () => {
    expect(readCardHandoff({ role: 'asked', otherPersonaId: 'bia' })).toEqual({ role: 'asked', otherPersonaId: 'bia' })
    expect(readCardHandoff({ role: 'waiting', otherPersonaId: ' teo ' })).toEqual({ role: 'waiting', otherPersonaId: 'teo' })
    expect(readCardHandoff({ role: 'boss', otherPersonaId: 'bia' })).toBeUndefined()
    expect(readCardHandoff({ role: 'asked', otherPersonaId: '' })).toBeUndefined()
    expect(readCardHandoff(null)).toBeUndefined()
    expect(readCardHandoff('asked')).toBeUndefined()
  })

  it('a note with nothing in it is no note; the lists are trimmed text', () => {
    expect(readHandoffNote({ fromPersonaId: 'bia', done: [], needed: [], files: [], decisions: [] })).toBeUndefined()
    expect(readHandoffNote({ done: ['x'] })).toBeUndefined()
    const note = readHandoffNote({ fromPersonaId: 'bia', done: ['  Texto pronto  ', '', 7], needed: ['Arte'], decisions: ['Tom informal'], files: ['site/home.md'], at: '2026-11-04T10:00:00Z' })
    expect(note).toEqual({ fromPersonaId: 'bia', done: ['Texto pronto'], needed: ['Arte'], decisions: ['Tom informal'], files: ['site/home.md'], at: '2026-11-04T10:00:00Z' })
  })

  it('control characters are dropped and a runaway line is cut', () => {
    const note = readHandoffNote({ fromPersonaId: 'bia', done: ['ok\u0000\u0007bom', 'a'.repeat(5000)] })
    expect(note?.done[0]).toBe('okbom')
    expect(note?.done[1]?.length).toBe(600)
  })

  it('a work path keeps only valid steps', () => {
    expect(readWorkPath([{ personaId: 'bia', step: 'wrote' }, { personaId: 'teo', step: 'handed' }, { personaId: '', step: 'wrote' }, { personaId: 'x', step: 'danced' }, 3])).toEqual([
      { personaId: 'bia', step: 'wrote' },
      { personaId: 'teo', step: 'handed' },
    ])
    expect(readWorkPath('nope')).toEqual([])
  })
})

const BOARD: ProjectBoardView = {
  projectId: 'proj-site',
  projectName: 'Site da agência',
  persisted: true,
  counts: { todo: 0, doing: 2, review: 0, needs_you: 0, done: 0, blocked: 0 },
  workflow: {
    projectId: 'proj-site',
    template: 'site',
    columns: [
      { id: 'c-doing', name: 'Fazendo', category: 'doing' },
      { id: 'c-done', name: 'Live', category: 'done' },
    ],
    fields: [],
  },
  cards: [
    {
      ticketId: 't-art', title: 'Arte da home', category: 'doing', columnId: 'c-doing', blocked: false,
      handoff: { role: 'asked', otherPersonaId: 'bia' },
      note: { fromPersonaId: 'bia', done: ['Texto da home pronto'], needed: ['Arte do topo'], decisions: ['Tom informal, sem emoji'], files: ['site/home.md'], at: '2026-11-04T10:00:00Z' },
      path: [{ personaId: 'bia', step: 'wrote' }, { personaId: 'bia', step: 'handed' }, { personaId: 'teo', step: 'wrote' }],
    },
    { ticketId: 't-copy', title: 'Texto da home', category: 'doing', columnId: 'c-doing', blocked: false, handoff: { role: 'waiting', otherPersonaId: 'teo' } },
  ] as unknown as ProjectBoardView['cards'],
}

describe('the board adapter', () => {
  it('carries handoff, note and path from the host card to the flow card', () => {
    const flow = projectBoardToFlow(BOARD)
    const art = flow.cards.find(card => card.id === 't-art')
    expect(art?.handoff).toEqual({ role: 'asked', otherPersonaId: 'bia' })
    expect(art?.note?.decisions).toEqual(['Tom informal, sem emoji'])
    expect(art?.path).toHaveLength(3)
    const copy = flow.cards.find(card => card.id === 't-copy')
    expect(copy?.handoff?.role).toBe('waiting')
    expect(copy?.path).toBeUndefined()
  })
})

const PERSONAS = [
  { id: 'bia', name: 'Bia', title: 'Redação', systemRoles: [] },
  { id: 'teo', name: 'Téo', title: 'Arte', systemRoles: [] },
]

function mount(personas: readonly unknown[] = PERSONAS) {
  const listPersonas = vi.fn(async () => ({ ok: true as const, value: personas }))
  const persona = { getProjectBoard: vi.fn(async () => ({ ok: true as const, value: BOARD })), moveTicket: vi.fn(), listPersonas } as unknown as PersonaRemoteClient
  const view = render(
    <PreviewFrame brandLabel="Persona">
      <ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onMutate={() => {}} />
    </PreviewFrame>,
  )
  return { listPersonas, view }
}

describe('with persona.flag.teamwork ON', () => {
  it('the colleague\'s card says "Pedido por Bia", the one who asked says "Esperando Téo"', async () => {
    on()
    mount()
    expect(await screen.findByText('Pedido por Bia')).toBeTruthy()
    expect(screen.getByText('Esperando Téo')).toBeTruthy()
  })

  it('a persona the team does not know gets no chip (never an id on the screen)', async () => {
    on()
    const { listPersonas } = mount([{ id: 'teo', name: 'Téo', title: 'Arte', systemRoles: [] }])
    await waitFor(() => { expect(listPersonas).toHaveBeenCalled() })
    await screen.findByText('Esperando Téo')
    expect(screen.queryByText(/Pedido por/)).toBeNull()
    expect(screen.queryByText(/bia/)).toBeNull()
  })

  it('"Caminho do trabalho" opens the path with the faces; the note is folded and then read as plain text', async () => {
    on()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Caminho do trabalho' }))
    const dialog = await screen.findByRole('dialog')
    const steps = within(dialog).getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(within(dialog).getByText('Arte da home')).toBeTruthy()
    expect(steps[2]?.getAttribute('aria-current')).toBe('step')
    expect(steps[0]?.getAttribute('aria-current')).toBeNull()
    // the note is folded until asked for
    expect(within(dialog).queryByText('Texto da home pronto')).toBeNull()
    const toggle = within(dialog).getByRole('button', { name: 'Bilhete de Bia' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(within(dialog).getByText('Texto da home pronto')).toBeTruthy()
    expect(within(dialog).getByText('O que já está pronto')).toBeTruthy()
    expect(within(dialog).getByText('O que falta')).toBeTruthy()
    expect(within(dialog).getByText('Arte do topo')).toBeTruthy()
    expect(within(dialog).getByText('Decisões tomadas')).toBeTruthy()
    expect(within(dialog).getByText('Tom informal, sem emoji')).toBeTruthy()
    expect(within(dialog).getByText('Arquivos')).toBeTruthy()
    expect(within(dialog).getByText('site/home.md')).toBeTruthy()
  })

  it('a note written with markup stays literal text: nothing in it becomes an element or an instruction', async () => {
    on()
    const hostile = {
      ...BOARD,
      cards: [{
        ticketId: 't-art', title: 'Arte da home', category: 'doing', columnId: 'c-doing', blocked: false,
        path: [{ personaId: 'bia', step: 'handed' }, { personaId: 'teo', step: 'wrote' }],
        note: { fromPersonaId: 'bia', done: ['<b>negrito</b> <img src=x onerror=alert(1)>'], needed: [], decisions: [], files: [] },
      }] as unknown as ProjectBoardView['cards'],
    }
    const persona = { getProjectBoard: vi.fn(async () => ({ ok: true as const, value: hostile })), moveTicket: vi.fn(), listPersonas: vi.fn(async () => ({ ok: true as const, value: PERSONAS })) } as unknown as PersonaRemoteClient
    render(<PreviewFrame brandLabel="Persona"><ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onMutate={() => {}} /></PreviewFrame>)
    fireEvent.click(await screen.findByRole('button', { name: 'Caminho do trabalho' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bilhete de Bia' }))
    expect(within(dialog).getByText('<b>negrito</b> <img src=x onerror=alert(1)>')).toBeTruthy()
    expect(dialog.querySelector('b')).toBeNull()
    expect(dialog.querySelector('img[src="x"]')).toBeNull()
  })
})

describe('the bilhete and the path come from the host TASK (TaskView.note/path), matched by id', () => {
  it('a card with only the chip gets its "Caminho do trabalho" from listTasks', async () => {
    on()
    const slim = {
      ...BOARD,
      cards: [{ ticketId: 't-art', title: 'Arte da home', category: 'doing', columnId: 'c-doing', blocked: false, handoff: { role: 'asked', otherPersonaId: 'bia' } }] as unknown as ProjectBoardView['cards'],
    }
    const listTasks = vi.fn(async () => ({
      ok: true as const,
      value: [
        { id: 't-art', title: 'Arte da home', stage: 'doing', stageAction: '', note: { fromPersonaId: 'bia', done: ['Texto pronto'], needed: [], decisions: ['Sem emoji'], files: [] }, path: [{ personaId: 'bia', step: 'handed' }, { personaId: 'teo', step: 'wrote' }] },
        { id: 'outra', title: 'Outra', stage: 'doing', stageAction: '' },
      ],
    }))
    const persona = { getProjectBoard: vi.fn(async () => ({ ok: true as const, value: slim })), moveTicket: vi.fn(), listPersonas: vi.fn(async () => ({ ok: true as const, value: PERSONAS })), listTasks } as unknown as PersonaRemoteClient
    render(<PreviewFrame brandLabel="Persona"><ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onMutate={() => {}} /></PreviewFrame>)
    fireEvent.click(await screen.findByRole('button', { name: 'Caminho do trabalho' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bilhete de Bia' }))
    expect(within(dialog).getByText('Sem emoji')).toBeTruthy()
    expect(listTasks).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj-site' })
  })

  it('a host without listTasks (or a task with nothing) leaves the card with its chip only', async () => {
    on()
    mount()
    expect(await screen.findByText('Pedido por Bia')).toBeTruthy()
  })
})

describe('BR-P6: the "caminho" icon sits beside the words, never alone', () => {
  it('the card link and the sheet title carry the icon (hidden from readers) next to "Caminho do trabalho"', async () => {
    on()
    mount()
    const link = await screen.findByRole('button', { name: 'Caminho do trabalho' })
    expect(link.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(link.querySelector('svg')).toBeNull() // the Brush icon, not the old chevron
    fireEvent.click(link)
    const dialog = await screen.findByRole('dialog')
    const heading = within(dialog).getByRole('heading', { name: 'Caminho do trabalho' })
    expect(heading.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('with the flag OFF the board is the one it always was', () => {
  it('no chip, no link, and the team is not even read', async () => {
    const { listPersonas } = mount()
    await screen.findByText('Arte da home')
    expect(screen.queryByText(/Pedido por|Esperando/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Caminho do trabalho' })).toBeNull()
    expect(listPersonas).not.toHaveBeenCalled()
  })
})

describe('"Revisando: {R}" (reviewing?: { personaId, round } on the card or the task)', () => {
  it('reads a review in progress; no persona, no review', async () => {
    const { readReviewing } = await import('../src/client/teamwork/teamwork-wire.ts')
    expect(readReviewing({ personaId: 'atlas', round: 2 })).toEqual({ personaId: 'atlas', round: 2 })
    expect(readReviewing({ personaId: 'atlas' })).toEqual({ personaId: 'atlas', round: 1 })
    expect(readReviewing({ personaId: '' })).toBeUndefined()
    expect(readReviewing(null)).toBeUndefined()
  })

  it('the card says "Revisando: Bia" with the face; without the field there is no chip', async () => {
    on()
    const reviewing = {
      ...BOARD,
      cards: [
        { ticketId: 't-r', title: 'Folheto', category: 'doing', columnId: 'c-doing', blocked: false, reviewing: { personaId: 'bia', round: 1 } },
        { ticketId: 't-n', title: 'Sem revisão', category: 'doing', columnId: 'c-doing', blocked: false },
      ] as unknown as ProjectBoardView['cards'],
    }
    const persona = { getProjectBoard: vi.fn(async () => ({ ok: true as const, value: reviewing })), moveTicket: vi.fn(), listPersonas: vi.fn(async () => ({ ok: true as const, value: PERSONAS })) } as unknown as PersonaRemoteClient
    render(<PreviewFrame brandLabel="Persona"><ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onMutate={() => {}} /></PreviewFrame>)
    expect(await screen.findByText('Revisando: Bia')).toBeTruthy()
    expect(screen.getAllByText(/Revisando:/)).toHaveLength(1)
  })

  it('it also arrives on the TASK (listTasks), matched by id', async () => {
    on()
    const slim = { ...BOARD, cards: [{ ticketId: 't-r', title: 'Folheto', category: 'doing', columnId: 'c-doing', blocked: false }] as unknown as ProjectBoardView['cards'] }
    const persona = {
      getProjectBoard: vi.fn(async () => ({ ok: true as const, value: slim })),
      moveTicket: vi.fn(),
      listPersonas: vi.fn(async () => ({ ok: true as const, value: PERSONAS })),
      listTasks: vi.fn(async () => ({ ok: true as const, value: [{ id: 't-r', reviewing: { personaId: 'teo', round: 1 } }] })),
    } as unknown as PersonaRemoteClient
    render(<PreviewFrame brandLabel="Persona"><ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onMutate={() => {}} /></PreviewFrame>)
    expect(await screen.findByText('Revisando: Téo')).toBeTruthy()
  })
})

describe('the capture-only example board (two dev keys + the flag; never in the real app)', () => {
  const REVIEW_BOARD: ProjectBoardView = {
    ...BOARD,
    workflow: { ...BOARD.workflow, columns: [{ id: 'c-doing', name: 'Fazendo', category: 'doing' }, { id: 'c-review', name: 'Em revisão', category: 'review' }, { id: 'c-done', name: 'Live', category: 'done' }] },
    cards: [{ ticketId: 't-real', title: 'Tarefa de verdade', category: 'doing', columnId: 'c-doing', blocked: false }] as unknown as ProjectBoardView['cards'],
  }
  function mountReal() {
    const moveTicket = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const persona = { getProjectBoard: vi.fn(async () => ({ ok: true as const, value: REVIEW_BOARD })), moveTicket, listPersonas: vi.fn(async () => ({ ok: true as const, value: [] })) } as unknown as PersonaRemoteClient
    render(<PreviewFrame brandLabel="Persona"><ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onMutate={() => {}} /></PreviewFrame>)
    return { moveTicket }
  }

  it('with only ONE dev key, or the dev keys without the flag, there is no example card', async () => {
    on()
    localStorage.setItem('persona.devSeed.teamwork', '1')
    const first = mountReal()
    await screen.findByText('Tarefa de verdade')
    expect(screen.queryByText('Arte da home')).toBeNull()
    expect(first.moveTicket).not.toHaveBeenCalled()
    cleanup()
    localStorage.clear()
    localStorage.setItem('persona.devSeed.v1', '1')
    localStorage.setItem('persona.devSeed.teamwork', '1')
    mountReal()
    await screen.findByText('Tarefa de verdade')
    // the example cards exist (flag-independent data), but with the flag off none of their chips is drawn
    expect(screen.queryByText(/Pedido por|Esperando|Revisando:/)).toBeNull()
  })

  it('with both keys and the flag: three example cards, each tagged "Exemplo", with the chips, the path and the open note', async () => {
    on()
    localStorage.setItem('persona.devSeed.v1', '1')
    localStorage.setItem('persona.devSeed.teamwork', '1')
    const { moveTicket } = mountReal()
    expect(await screen.findByText('Pedido por Nina')).toBeTruthy()
    expect(screen.getByText('Esperando Bento')).toBeTruthy()
    expect(screen.getByText('Revisando: Atlas')).toBeTruthy()
    expect(screen.getAllByText('Exemplo')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Caminho do trabalho' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bilhete de Nina' }))
    expect(within(dialog).getByText('Tom informal, sem emoji')).toBeTruthy()
    expect(moveTicket).not.toHaveBeenCalled()
  })

  it('an example card never reaches the host: moving it does nothing there', async () => {
    on()
    localStorage.setItem('persona.devSeed.v1', '1')
    localStorage.setItem('persona.devSeed.teamwork', '1')
    const { moveTicket } = mountReal()
    await screen.findByText('Pedido por Nina')
    // the example card's own menu, then "Mover para Live"
    const card = screen.getByText('Arte da home').closest('[draggable]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: kanbanPt['a11y.cardMenu'] }))
    fireEvent.click(screen.getByRole('menuitem', { name: kanbanPt['action.moveTo'].replace('{column}', 'Live') }))
    await waitFor(() => { expect(screen.getByText('Arte da home')).toBeTruthy() })
    expect(moveTicket).not.toHaveBeenCalled()
  })
})
