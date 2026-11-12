// @vitest-environment jsdom
// SW-8: Projeto › Histórico — by day, "Bia aplicou 3 mudanças · 14:20" (the group title already says the day), Desfazer
// with a plain confirmation, 30 days, the host contract of SW-6, and nothing technical on screen.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RestorePointView } from '@deepseek-ai/dsh-persona-host/types'
import { ProjectHistoryView, HISTORY_KEEP_DAYS, type HistoryEntryUi } from '../src/client/review/simple/ProjectHistoryView.tsx'
import { ConnectedProjectHistory } from '../src/client/remote/ConnectedProjectHistory.tsx'
import { restorePointsToEntries } from '../src/client/data/history-remote.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { en as reviewEn, pt as reviewPt } from '../src/client/locale/review/locales.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const JARGON = /\b(git|worktree|branch|diff|patch|merge|commit|push|rollback|reset|snapshot|integrar|reverter|linhas?|lines?|reposit[oó]rio|repository|ponto de restaura[cç][aã]o|restore point)\b/iu

/** Local times so "hoje/ontem" do not depend on the machine's zone. */
const NOW = new Date(2026, 10, 4, 16, 0, 0)
const at = (daysAgo: number, hour: number, minute: number): string => new Date(2026, 10, 4 - daysAgo, hour, minute, 0).toISOString()

const entries: HistoryEntryUi[] = [
  { id: 'a', who: 'Bia', at: at(0, 14, 20), files: [{ name: 'cardapio.docx' }, { name: 'precos.xlsx' }, { name: 'logo.png' }], taskTitle: 'Atualizar o cardápio' },
  { id: 'b', who: 'Bia', at: at(1, 9, 5), files: [{ name: 'notas.md' }] },
  { id: 'c', who: 'Téo', at: at(3, 18, 40), files: [{ name: 'a.txt' }, { name: 'b.txt' }, { name: 'c.txt' }, { name: 'd.txt' }, { name: 'e.txt' }], undone: true },
]

function view(props: Partial<React.ComponentProps<typeof ProjectHistoryView>> = {}) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ProjectHistoryView entries={entries} now={NOW} onUndo={() => {}} {...props} />
    </PreviewFrame>,
  )
}

describe('Projeto › Histórico', () => {
  it('lists by day; inside a day the line says only the time, the group title says the day', () => {
    view()
    expect(screen.getByRole('heading', { level: 2, name: 'Histórico' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Hoje' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Ontem' })).toBeTruthy()
    expect(screen.getByText('Bia aplicou 3 mudanças · 14:20')).toBeTruthy()
    expect(screen.getByText('Bia aplicou 1 mudança · 09:05')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/hoje \d|ontem \d/u) // the day is not repeated in the line
    expect(screen.getByText('Atualizar o cardápio')).toBeTruthy() // the Tarefa's name, from its id
    expect(screen.getByText('cardapio.docx, precos.xlsx, logo.png')).toBeTruthy()
    expect(screen.getByText('a.txt, b.txt, c.txt e mais 2')).toBeTruthy()
    expect(screen.getByText('Guardamos as versões de antes por 30 dias.')).toBeTruthy()
  })

  it('Desfazer asks first, in plain words (count of files and the time), and only then undoes', () => {
    const onUndo = vi.fn()
    view({ onUndo })
    const row = screen.getByText('Bia aplicou 3 mudanças · 14:20').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Desfazer' }))
    expect(onUndo).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Volto 3 arquivos para como estavam antes de 14:20? O que você mudou depois, nesses arquivos, também volta.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(onUndo).not.toHaveBeenCalled()
    fireEvent.click(within(row).getByRole('button', { name: 'Desfazer' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desfazer' }))
    expect(onUndo).toHaveBeenCalledWith('a')
  })

  it('one file uses the singular; an undone entry says "Desfeito" and offers nothing else', () => {
    view()
    const single = screen.getByText('Bia aplicou 1 mudança · 09:05').closest('li') as HTMLElement
    fireEvent.click(within(single).getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByText('Volto 1 arquivo para como estava antes de 09:05? O que você mudou depois, nesse arquivo, também volta.')).toBeTruthy()
    const undone = screen.getByText(/Téo aplicou 5 mudanças/u).closest('li') as HTMLElement
    expect(within(undone).getByText('Desfeito')).toBeTruthy()
    expect(within(undone).queryByRole('button')).toBeNull()
  })

  it('entries older than 30 days leave; an empty history says what will show up here, with no stray footer', () => {
    const old: HistoryEntryUi = { id: 'old', who: 'Bia', at: at(HISTORY_KEEP_DAYS + 2, 10, 0), files: [{ name: 'velho.docx' }] }
    view({ entries: [old] })
    expect(screen.queryByText('velho.docx')).toBeNull()
    expect(screen.getByText('Nada aplicado ainda')).toBeTruthy()
    expect(screen.getByText('Quando você aplicar mudanças de uma persona, elas aparecem aqui.')).toBeTruthy()
    // the "30 dias" footer sits under a list, not under an empty state
    expect(screen.queryByText('Guardamos as versões de antes por 30 dias.')).toBeNull()
  })

  it('a project with no private history says so (never "Nada aplicado ainda")', () => {
    view({ entries: [], unavailable: true })
    expect(screen.getByText('O histórico fica disponível quando a pasta do projeto tem a Persona ativa.')).toBeTruthy()
    expect(screen.queryByText('Nada aplicado ainda')).toBeNull()
  })

  it('read-only when the host cannot undo; "Desfazendo…" while one runs, and nothing else can start', () => {
    const { unmount } = view({ canUndo: false })
    expect(screen.getAllByRole('button', { name: 'Desfazer' }).every(button => button.hasAttribute('disabled'))).toBe(true)
    unmount()
    view({ undoingId: 'a' })
    expect(screen.getByRole('button', { name: 'Desfazendo…' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Desfazer' })[0]?.hasAttribute('disabled')).toBe(true)
  })

  it('loading and error say so in plain words; error retries', () => {
    const onRetry = vi.fn()
    const { unmount } = view({ state: 'loading' })
    expect(screen.getByText('Carregando o histórico…')).toBeTruthy()
    unmount()
    view({ state: 'error', onRetry })
    expect(screen.getByText('Não consegui abrir o histórico agora.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('no technical word on screen, in either language of the copy', () => {
    view()
    expect(JARGON.test(document.body.textContent ?? '')).toBe(false)
    for (const dict of [reviewPt, reviewEn]) {
      for (const [key, value] of Object.entries(dict)) {
        if (key.startsWith('history.') || key.startsWith('undo.')) expect({ key, hit: JARGON.test(value) }).toMatchObject({ hit: false })
      }
    }
  })
})

const point = (partial: Partial<RestorePointView> & Pick<RestorePointView, 'id'>): RestorePointView => ({
  ticketId: 't1',
  createdAt: at(0, 10, 0),
  expiresAt: at(-30, 10, 0),
  state: 'available',
  files: ['Cardápio/2026/precos.xlsx'],
  ...partial,
})

describe('restorePointsToEntries (host contract SW-6)', () => {
  it('shows file names only, the Tarefa name and who did it from the board, and drops expired points', () => {
    const tasks = new Map([['t1', { title: 'Atualizar o cardápio', personaName: 'Bia' }]])
    const rows = restorePointsToEntries([
      point({ id: 'p1' }),
      point({ id: 'p2', ticketId: 'unknown', files: ['a/b/c.docx', 'd.md'] }),
      point({ id: 'p3', state: 'expired' }),
      point({ id: 'p4', state: 'undone' }),
    ], 'A persona', tasks)
    expect(rows.map(row => row.id)).toEqual(['p1', 'p2', 'p4'])
    expect(rows[0]).toMatchObject({ who: 'Bia', taskTitle: 'Atualizar o cardápio', files: [{ name: 'precos.xlsx' }] })
    expect(rows[1]).toMatchObject({ who: 'A persona', files: [{ name: 'c.docx' }, { name: 'd.md' }] })
    expect(rows[1]?.taskTitle).toBeUndefined()
    expect(rows[2]?.undone).toBe(true)
    expect(JSON.stringify(rows)).not.toMatch(/Cardápio\/2026|a\/b/u) // never a folder path
  })

  it('with nobody to name, the entry names nobody (the line never says "A persona aplicou")', () => {
    const rows = restorePointsToEntries([point({ id: 'p1', ticketId: 'unknown' })], undefined)
    expect(rows[0]?.who).toBeUndefined()
  })
})

describe('the entry line with no name (Muse 05:51)', () => {
  it('says "1 mudança aplicada · hora" and "{n} mudanças aplicadas · hora", never a stand-in name', () => {
    view({
      entries: [
        { id: 'u1', who: undefined, at: at(0, 14, 20), files: [{ name: 'a.docx' }] },
        { id: 'u2', who: undefined, at: at(0, 10, 5), files: [{ name: 'b.docx' }, { name: 'c.docx' }, { name: 'd.docx' }] },
      ],
    })
    expect(screen.getByText('1 mudança aplicada · 14:20')).toBeTruthy()
    expect(screen.getByText('3 mudanças aplicadas · 10:05')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/A persona|O rascunho aplicou/u)
  })
})

function connected(persona: PersonaRemoteClient, tasks: React.ComponentProps<typeof ConnectedProjectHistory>['tasks'] = []) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ConnectedProjectHistory persona={persona} scope={{ workspaceId: 'ws', projectId: 'p' }} kanbanDict={kanbanPt} tasks={tasks} onBack={() => {}} />
    </PreviewFrame>,
  )
}

describe('ConnectedProjectHistory', () => {
  it('a host without the history Remotes: honest "unavailable", no false Desfazer', async () => {
    connected({} as unknown as PersonaRemoteClient)
    await waitFor(() => { expect(screen.getByText('O histórico fica disponível quando a pasta do projeto tem a Persona ativa.')).toBeTruthy() })
    // the history is a view of the board (DESIGN-01 #10): one link back to it, no tab rail of its own
    expect(screen.getByRole('button', { name: 'Voltar ao quadro' })).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })

  it('a project with no private history (status unsupported) says so', async () => {
    const listRestorePoints = vi.fn(async () => ({ ok: true as const, value: { status: 'unsupported' as const, points: [] } }))
    connected({ listRestorePoints, undoApply: vi.fn() } as unknown as PersonaRemoteClient)
    await waitFor(() => { expect(screen.getByText('O histórico fica disponível quando a pasta do projeto tem a Persona ativa.')).toBeTruthy() })
  })

  it('lists the points by Tarefa, undoes the chosen one and reloads', async () => {
    let undone = false
    const listRestorePoints = vi.fn(async () => ({
      ok: true as const,
      value: { status: 'available' as const, points: [point({ id: 'rp1', createdAt: new Date().toISOString(), state: undone ? 'undone' : 'available' })] },
    }))
    const undoApply = vi.fn(async () => { undone = true; return { ok: true as const, value: { kind: 'restored' as const, restorePointId: 'rp1' } } })
    connected({ listRestorePoints, undoApply } as unknown as PersonaRemoteClient, [{ id: 't1', title: 'Atualizar o cardápio', assignee: { name: 'Bia' } }])
    await waitFor(() => { expect(screen.getByText(/Bia aplicou 1 mudança/u)).toBeTruthy() })
    expect(screen.getByText('Atualizar o cardápio')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => { expect(undoApply).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'p', restorePointId: 'rp1' }) })
    await waitFor(() => { expect(screen.getByText('Desfeito')).toBeTruthy() })
    expect(listRestorePoints.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('blocked: the host sentence is shown and nothing is restored; expired: the 30-day sentence', async () => {
    const results = [
      { kind: 'blocked' as const, explanation: 'Você mudou precos.xlsx depois. Não vou sobrescrever o seu arquivo.' },
      { kind: 'expired' as const, restorePointId: 'rp1' },
    ]
    const listRestorePoints = vi.fn(async () => ({ ok: true as const, value: { status: 'available' as const, points: [point({ id: 'rp1', createdAt: new Date().toISOString() })] } }))
    const undoApply = vi.fn(async () => ({ ok: true as const, value: results.shift()! }))
    connected({ listRestorePoints, undoApply } as unknown as PersonaRemoteClient)
    // No assignee on the board here: the line names nobody ("1 mudança aplicada", Muse 05:51).
    await waitFor(() => { expect(screen.getByText(/1 mudança aplicada/u)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('Não vou sobrescrever') })
    expect(screen.queryByText('Desfeito')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('30 dias') })
  })
})
