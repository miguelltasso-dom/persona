// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KanbanReviewSheet } from '../src/client/review/KanbanReviewSheet.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as reviewPt } from '../src/client/locale/review/locales.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const SCOPE = { workspaceId: 'ws', projectId: 'proj' }

const SUMMARY = {
  ticketId: 't-rev',
  files: [{ path: 'src/hero.tsx', added: 12, deleted: 1 }],
  added: 12,
  deleted: 1,
  patch: '+export function Hero() {}',
  patchTruncated: false,
  secretsRedacted: false,
  testsClaimed: ['vitest hero'],
  hasWorktree: true,
}

describe('KanbanReviewSheet (Revisar wire)', () => {
  it('loads reviewSummary and calls acceptReview on "Aplicar na pasta"', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    const acceptReview = vi.fn(async () => ({ ok: true as const, value: { kind: 'merged' as const, mode: 'ff' as const } }))
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    const onClose = vi.fn()
    const onMutate = vi.fn()
    const onAccepted = vi.fn()

    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet
          persona={persona}
          scope={SCOPE}
          ticketId="t-rev"
          taskTitle="Entrega do hero"
          onClose={onClose}
          onMutate={onMutate}
          onAccepted={onAccepted}
        />
      </PreviewFrame>,
    )

    await waitFor(() => { expect(reviewSummary).toHaveBeenCalled() })
    // The host's ticket commands need a command and a reason (a bare ticketId is refused at the gateway).
    expect(reviewSummary).toHaveBeenCalledWith({
      workspaceId: 'ws',
      projectId: 'proj',
      ticketId: 't-rev',
      command: 'reevaluate',
      reason: expect.stringMatching(/\S/u),
    })
    await waitFor(() => {
      // Plain file: name, short folder and the "Mudou" chip — never a path-with-diff line.
      expect(screen.getByRole('option', { name: /hero.tsx/u })).toBeTruthy()
    })
    expect(screen.getAllByText('src').length).toBeGreaterThan(0)
    expect(screen.getAllByText(reviewPt['kind.changed']).length).toBeGreaterThan(0)
    expect(screen.getByText(reviewPt['question'])).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.accept'] }))
    await waitFor(() => {
      expect(acceptReview).toHaveBeenCalledWith({
        workspaceId: 'ws',
        projectId: 'proj',
        ticketId: 't-rev',
        mode: 'ff',
      })
    })
    expect(onAccepted).toHaveBeenCalledWith('t-rev')
    expect(onMutate).toHaveBeenCalled()
    // The review does not vanish: the person sees the moment first, and leaves from it.
    await screen.findByRole('heading', { name: 'Aplicado na pasta' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao quadro' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('a failed apply is never silent: plain sentence, folded support detail, and "Tentar de novo" tries again', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    let attempts = 0
    const acceptReview = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('EBUSY: resource busy or locked')
      return { ok: true as const, value: { kind: 'merged' as const, mode: 'ff' as const } }
    })
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    const onClose = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Entrega do hero" onClose={onClose} onMutate={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByRole('option', { name: /hero.tsx/u })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.accept'] }))
    await waitFor(() => { expect(screen.getByText(reviewPt['apply.failed'])).toBeTruthy() })
    expect(onClose).not.toHaveBeenCalled() // nothing is closed over a failure
    // the host's own words are only inside the folded "Detalhes para o suporte"
    const details = screen.getByText(reviewPt['apply.details']).closest('details')
    expect(details?.textContent).toContain('EBUSY')
    fireEvent.click(screen.getByRole('button', { name: reviewPt['apply.retry'] }))
    await screen.findByRole('heading', { name: 'Aplicado na pasta' })
    expect(acceptReview).toHaveBeenCalledTimes(2)
  })

  it('a clash after apply says "{persona} e você mudaram o mesmo arquivo"; the host explanation stays folded', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    const acceptReview = vi.fn(async () => ({ ok: true as const, value: { kind: 'blocked' as const, explanation: 'CONFLICT (content): Merge conflict in src/hero.tsx' } }))
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Entrega do hero" personaName="Bia" onClose={() => {}} onMutate={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByRole('option', { name: /hero.tsx/u })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.accept'] }))
    await waitFor(() => { expect(screen.getByText('Bia e você mudaram o mesmo arquivo')).toBeTruthy() })
    const visible = document.body.textContent ?? ''
    // the technical sentence exists only inside the folded details element
    const details = document.querySelector('details')
    expect(details?.textContent).toContain('Merge conflict')
    expect(visible.replace(details?.textContent ?? '', '')).not.toMatch(/merge|conflict \(/iu)
  })

  it('a file the folder and the draft both changed: the host reports it, Aplicar waits for the choice, and the choice goes back as conflicts[] with the versions shown', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    const user = { hash: 'aaa111', mode: '100644' as const }
    const personaVersion = { hash: 'bbb222', mode: '100644' as const }
    const acceptReview = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: { kind: 'blocked' as const, mode: 'ff', explanation: 'CONFLICT in cardapio.docx', conflicts: [{ path: 'cardapio.docx', user, persona: personaVersion }] } })
      .mockResolvedValueOnce({ ok: true as const, value: { kind: 'merged' as const, mode: 'ff', explanation: '' } })
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    const onClose = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Cardápio" personaName="Bia" onClose={onClose} onMutate={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByRole('option', { name: /hero.tsx/u })).toBeTruthy() })
    // 1st Aplicar: a plain apply (nothing to answer yet).
    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.accept'] }))
    await waitFor(() => { expect(screen.getByText('Bia e você mudaram cardapio.docx')).toBeTruthy() })
    expect(acceptReview).toHaveBeenNthCalledWith(1, { workspaceId: 'ws', projectId: 'proj', ticketId: 't-rev', mode: 'ff' })
    expect(onClose).not.toHaveBeenCalled()
    const apply = screen.getByRole('button', { name: reviewPt['action.accept'] }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/Manter os dois/u))
    expect(apply.disabled).toBe(false)
    fireEvent.click(apply)
    await screen.findByRole('heading', { name: 'Aplicado na pasta' })
    // 2nd Aplicar: the person's answer, with the exact versions the host showed — and never the old `choices` field.
    expect(acceptReview).toHaveBeenNthCalledWith(2, {
      workspaceId: 'ws',
      projectId: 'proj',
      ticketId: 't-rev',
      mode: 'ff',
      conflicts: [{ path: 'cardapio.docx', user, persona: personaVersion, choice: 'keep_both' }],
    })
    expect(JSON.stringify(acceptReview.mock.calls)).not.toContain('"choices"')
  })

  it('the three answers map to the host choices: mine → keep_mine, theirs → keep_persona, both → keep_both', async () => {
    const { resolveReviewConflicts } = await import('../src/client/data/adapters/review.ts')
    const v = { hash: 'h', mode: '100644' as const }
    const conflicts = [
      { path: 'a.md', user: v, persona: v },
      { path: 'b.md', user: v, persona: null },
      { path: 'c.md', user: null, persona: v },
    ]
    const resolved = resolveReviewConflicts(conflicts, { 'a.md': 'mine', 'b.md': 'theirs', 'c.md': 'both' })
    expect(resolved?.map(row => [row.path, row.choice])).toEqual([['a.md', 'keep_mine'], ['b.md', 'keep_persona'], ['c.md', 'keep_both']])
    // A clash with no answer is never guessed: the caller keeps asking.
    expect(resolveReviewConflicts(conflicts, { 'a.md': 'mine' })).toBeNull()
  })

  it('"Descartar" sends the host a command and a reason', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    const discardReview = vi.fn(async () => ({ ok: true as const, value: true }))
    const persona = { reviewSummary, discardReview } as unknown as PersonaRemoteClient
    const onClose = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Entrega" onClose={onClose} onMutate={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByRole('option', { name: /hero.tsx/u })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.discard'] }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: reviewPt['discard.confirm'] }))
    await waitFor(() => { expect(discardReview).toHaveBeenCalled() })
    expect(discardReview).toHaveBeenCalledWith({
      workspaceId: 'ws',
      projectId: 'proj',
      ticketId: 't-rev',
      command: 'dismiss',
      reason: expect.stringMatching(/\S/u),
    })
  })

  it('after a successful apply it hands over the way back (restorePointId) so the board can offer Desfazer', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    const acceptReview = vi.fn(async () => ({ ok: true as const, value: { kind: 'merged' as const, mode: 'ff' as const, restorePointId: 'rp-9' } }))
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    const onApplied = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Entrega" onClose={() => {}} onMutate={() => {}} onApplied={onApplied} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByRole('option', { name: /hero.tsx/u })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.accept'] }))
    await waitFor(() => { expect(onApplied).toHaveBeenCalledWith({ ticketId: 't-rev', restorePointId: 'rp-9' }) })
  })

  it('the success moment offers Desfazer with the restore point the host gave, and undoing closes the review', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    const acceptReview = vi.fn(async () => ({ ok: true as const, value: { kind: 'merged' as const, mode: 'ff', explanation: '', restorePointId: 'rp-77' } }))
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    const onUndoApplied = vi.fn()
    const onClose = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Entrega" onClose={onClose} onMutate={() => {}} onUndoApplied={onUndoApplied} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByRole('option', { name: /hero.tsx/u })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.accept'] }))
    await screen.findByRole('heading', { name: 'Aplicado na pasta' })
    expect(screen.getByText('1 arquivo atualizado · dá para desfazer por 30 dias')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(onUndoApplied).toHaveBeenCalledWith('rp-77')
    expect(onClose).toHaveBeenCalled()
  })

  it('without a restore point from the host there is no Desfazer (no false way back)', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    const acceptReview = vi.fn(async () => ({ ok: true as const, value: { kind: 'merged' as const, mode: 'ff', explanation: '' } }))
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Entrega" onClose={() => {}} onMutate={() => {}} onUndoApplied={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByRole('option', { name: /hero.tsx/u })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.accept'] }))
    await screen.findByRole('heading', { name: 'Aplicado na pasta' })
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })
})
