// @vitest-environment jsdom
// "Revisar mudanças" → Aplicar na pasta: the board reloads right after the host accepts (onMutate → reload). That reload must not tear the review
// sheet down: the person has to SEE "pronto" (and the Desfazer), not a fresh sheet asking the same thing again. Found in the real shell capture
// of bundle 3: after "Manter os dois" + Aplicar the sheet came back as the first screen of the review.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectBoardView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { ConnectedProjectFlowBoard } from '../src/client/remote/ConnectedProjectFlowBoard.tsx'

installPreviewTheme()
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('persona.devSeed.v1', '1')
  localStorage.setItem('persona.devSeed.review', '1')
})
afterEach(() => { cleanup(); localStorage.clear() })

const COLUMNS = [
  { id: 'c-doing', name: 'Fazendo', category: 'doing' },
  { id: 'c-review', name: 'Em revisão', category: 'review' },
] as const

const BOARD: ProjectBoardView = {
  projectId: 'proj-site',
  projectName: 'Site da agência',
  persisted: true,
  counts: { todo: 0, doing: 1, review: 0, needs_you: 0, done: 0, blocked: 0 },
  workflow: { projectId: 'proj-site', template: 'site', columns: COLUMNS.map(column => ({ ...column })), fields: [] },
  cards: [{ ticketId: 't-hero', title: 'Hero da home', category: 'doing', columnId: 'c-doing', blocked: false }],
}

function mountBoard(getProjectBoard: ReturnType<typeof vi.fn>) {
  const persona = { getProjectBoard } as unknown as PersonaRemoteClient
  return render(
    <PreviewFrame brandLabel="Persona">
      <ConnectedProjectFlowBoard persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onBack={() => {}} onMutate={() => {}} />
    </PreviewFrame>,
  )
}

describe('the review sheet across a board reload', () => {
  it('Aplicar → (clash) → Manter os dois → Aplicar: the success stays on screen after the board reloads', async () => {
    let calls = 0
    const getProjectBoard = vi.fn(async () => {
      calls += 1
      // a real round trip: the reload is "carregando" for a moment
      await new Promise<void>((resolve) => { setTimeout(resolve, 40) })
      return { ok: true as const, value: BOARD }
    })
    mountBoard(getProjectBoard)

    await screen.findByTestId('review-panel', undefined, { timeout: 4000 })
    fireEvent.click(screen.getByTestId('review-apply'))
    await screen.findByTestId('review-conflict', undefined, { timeout: 4000 })
    fireEvent.click(document.querySelector('input[type="radio"][value="both"]') as HTMLInputElement)
    const callsBeforeApply = calls
    fireEvent.click(screen.getByTestId('review-apply'))

    await screen.findByTestId('review-applied', undefined, { timeout: 4000 })
    // the board is reloaded by the accept (onMutate): wait for it to start AND to finish, then look again
    await waitFor(() => { expect(calls).toBeGreaterThan(callsBeforeApply) }, { timeout: 4000 })
    await new Promise<void>((resolve) => { setTimeout(resolve, 250) })
    expect(screen.getByTestId('review-applied')).toBeTruthy()
    expect(screen.queryByTestId('review-conflict')).toBeNull()
  })

  it('the "Aplicado na pasta" toast waits for the sheet to close: it sat over "Voltar ao quadro" at 200 % zoom, and the moment already says it', async () => {
    const getProjectBoard = vi.fn(async () => ({ ok: true as const, value: BOARD }))
    mountBoard(getProjectBoard)

    await screen.findByTestId('review-panel', undefined, { timeout: 4000 })
    fireEvent.click(screen.getByTestId('review-apply'))
    await screen.findByTestId('review-conflict', undefined, { timeout: 4000 })
    fireEvent.click(document.querySelector('input[type="radio"][value="both"]') as HTMLInputElement)
    fireEvent.click(screen.getByTestId('review-apply'))
    await screen.findByTestId('review-applied', undefined, { timeout: 4000 })
    await new Promise<void>((resolve) => { setTimeout(resolve, 150) })

    // while the moment is on screen the words appear once (its own heading), not twice (heading + toast over the buttons)
    expect(screen.getAllByText('Aplicado na pasta')).toHaveLength(1)

    fireEvent.click(screen.getByTestId('review-leave'))
    await waitFor(() => { expect(screen.queryByTestId('review-applied')).toBeNull() }, { timeout: 4000 })
    // the sheet is gone: now the board confirms it, for 6 s
    expect(screen.getAllByText('Aplicado na pasta')).toHaveLength(1)
  })

  it('the first load still says "carregando" (nothing stale to show yet)', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const getProjectBoard = vi.fn(async () => { await gate; return { ok: true as const, value: BOARD } })
    mountBoard(getProjectBoard)
    expect(screen.queryByText('Hero da home')).toBeNull()
    expect(screen.queryByTestId('review-panel')).toBeNull()
    release()
    await screen.findByText('Hero da home', undefined, { timeout: 4000 })
  })
})
