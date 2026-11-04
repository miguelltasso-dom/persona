// @vitest-environment jsdom
// SW-8: Projeto › Histórico — by day, "Bia aplicou 3 mudanças · hoje 14:20", Desfazer with a plain confirmation,
// 30 days, read-only until the host can undo, and nothing technical on screen.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

/** Local noon-ish times so "hoje/ontem" do not depend on the machine's zone. */
const NOW = new Date(2026, 10, 4, 16, 0, 0)
const at = (daysAgo: number, hour: number, minute: number): string => new Date(2026, 10, 4 - daysAgo, hour, minute, 0).toISOString()

const entries: HistoryEntryUi[] = [
  { id: 'a', who: 'Bia', at: at(0, 14, 20), files: [{ name: 'cardapio.docx' }, { name: 'precos.xlsx' }, { name: 'logo.png' }] },
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
  it('lists by day with the line the spec asks for, the files, and "e mais N"', () => {
    view()
    expect(screen.getByRole('heading', { level: 2, name: 'Histórico' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Hoje' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Ontem' })).toBeTruthy()
    expect(screen.getByText('Bia aplicou 3 mudanças · hoje 14:20')).toBeTruthy()
    expect(screen.getByText('Bia aplicou 1 mudança · ontem 09:05')).toBeTruthy()
    expect(screen.getByText('cardapio.docx, precos.xlsx, logo.png')).toBeTruthy()
    expect(screen.getByText('a.txt, b.txt, c.txt e mais 2')).toBeTruthy()
    expect(screen.getByText('Guardamos as versões de antes por 30 dias.')).toBeTruthy()
  })

  it('Desfazer asks first, in plain words (count of files and the time), and only then undoes', () => {
    const onUndo = vi.fn()
    view({ onUndo })
    const row = screen.getByText('Bia aplicou 3 mudanças · hoje 14:20').closest('li') as HTMLElement
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
    const single = screen.getByText('Bia aplicou 1 mudança · ontem 09:05').closest('li') as HTMLElement
    fireEvent.click(within(single).getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByText('Volto 1 arquivo para como estava antes de 09:05? O que você mudou depois, nesse arquivo, também volta.')).toBeTruthy()
    const undone = screen.getByText(/Téo aplicou 5 mudanças/u).closest('li') as HTMLElement
    expect(within(undone).getByText('Desfeito')).toBeTruthy()
    expect(within(undone).queryByRole('button')).toBeNull()
  })

  it('entries older than 30 days leave the list; an empty history says what will show up here', () => {
    const old: HistoryEntryUi = { id: 'old', who: 'Bia', at: at(HISTORY_KEEP_DAYS + 2, 10, 0), files: [{ name: 'velho.docx' }] }
    view({ entries: [old] })
    expect(screen.queryByText('velho.docx')).toBeNull()
    expect(screen.getByText('Nada aplicado ainda')).toBeTruthy()
    expect(screen.getByText('Quando você aplicar mudanças de uma persona, elas aparecem aqui.')).toBeTruthy()
  })

  it('read-only when the host cannot undo yet; "Desfazendo…" while one runs, and nothing else can start', () => {
    const { unmount } = view({ canUndo: false })
    expect(screen.getAllByRole('button', { name: 'Desfazer' }).every(button => (button as HTMLButtonElement).disabled)).toBe(true)
    unmount()
    view({ undoingId: 'a' })
    expect(screen.getByRole('button', { name: 'Desfazendo…' })).toBeTruthy()
    expect((screen.getAllByRole('button', { name: 'Desfazer' })[0] as HTMLButtonElement).disabled).toBe(true)
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

describe('restorePointsToEntries / ConnectedProjectHistory', () => {
  it('shows file names only — never a folder outside the project — and falls back to "A persona"', () => {
    const rows = restorePointsToEntries([{ id: 'p1', createdAt: at(0, 10, 0), files: [{ path: 'Cardápio/2026/precos.xlsx' }] }], 'A persona')
    expect(rows).toEqual([{ id: 'p1', who: 'A persona', at: at(0, 10, 0), files: [{ name: 'precos.xlsx' }] }])
  })

  it('without the host Remotes it is an honest empty, read-only history (no false Desfazer)', async () => {
    const persona = {} as unknown as PersonaRemoteClient
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectHistory persona={persona} scope={{ workspaceId: 'ws', projectId: 'p' }} kanbanDict={kanbanPt} onBack={() => {}} onWorkspaceTabChange={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByText('Nada aplicado ainda')).toBeTruthy() })
    expect(screen.getByRole('tab', { name: 'Histórico', selected: true })).toBeTruthy()
  })

  it('with the host: lists restore points, undoes the chosen one and reloads', async () => {
    let undone = false
    const listRestorePoints = vi.fn(async () => ({
      ok: true as const,
      value: [{ id: 'rp1', createdAt: new Date().toISOString(), actorName: 'Bia', files: [{ path: 'cardapio.docx' }], undone }],
    }))
    const undoApply = vi.fn(async () => { undone = true; return { ok: true as const, value: true } })
    const persona = { listRestorePoints, undoApply } as unknown as PersonaRemoteClient
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedProjectHistory persona={persona} scope={{ workspaceId: 'ws', projectId: 'p' }} kanbanDict={kanbanPt} onBack={() => {}} onWorkspaceTabChange={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByText(/Bia aplicou 1 mudança/u)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => { expect(undoApply).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'p', id: 'rp1' }) })
    await waitFor(() => { expect(screen.getByText('Desfeito')).toBeTruthy() })
    expect(listRestorePoints.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
