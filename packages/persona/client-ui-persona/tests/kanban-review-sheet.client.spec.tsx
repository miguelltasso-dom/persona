// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    const acceptReview = vi.fn(async () => ({ ok: true as const, value: { kind: 'accepted' as const, mode: 'ff' as const } }))
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

    await waitFor(() => {
      // Plain file: name, short folder and the "Mudou" chip — never a path-with-diff line.
      expect(screen.getByText('hero.tsx')).toBeTruthy()
    })
    expect(screen.getByText('src')).toBeTruthy()
    expect(screen.getByText(reviewPt['kind.changed'])).toBeTruthy()
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
    expect(onClose).toHaveBeenCalled()
  })

  it('a failed apply is never silent: plain sentence, folded support detail, and "Tentar de novo" tries again', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    let attempts = 0
    const acceptReview = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('EBUSY: resource busy or locked')
      return { ok: true as const, value: { kind: 'accepted' as const, mode: 'ff' as const } }
    })
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    const onClose = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Entrega do hero" onClose={onClose} onMutate={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByText('hero.tsx')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.accept'] }))
    await waitFor(() => { expect(screen.getByText(reviewPt['apply.failed'])).toBeTruthy() })
    expect(onClose).not.toHaveBeenCalled() // nothing is closed over a failure
    // the host's own words are only inside the folded "Detalhes para o suporte"
    const details = screen.getByText(reviewPt['apply.details']).closest('details')
    expect(details?.textContent).toContain('EBUSY')
    fireEvent.click(screen.getByRole('button', { name: reviewPt['apply.retry'] }))
    await waitFor(() => { expect(onClose).toHaveBeenCalled() })
    expect(acceptReview).toHaveBeenCalledTimes(2)
  })

  it('a clash after apply says "Você e a persona mudaram o mesmo arquivo"; the host explanation stays folded', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: SUMMARY }))
    const acceptReview = vi.fn(async () => ({ ok: true as const, value: { kind: 'blocked' as const, explanation: 'CONFLICT (content): Merge conflict in src/hero.tsx' } }))
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Entrega do hero" personaName="Bia" onClose={() => {}} onMutate={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByText('hero.tsx')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: reviewPt['action.accept'] }))
    await waitFor(() => { expect(screen.getByText('Você e Bia mudaram o mesmo arquivo')).toBeTruthy() })
    const visible = document.body.textContent ?? ''
    // the technical sentence exists only inside the folded details element
    const details = document.querySelector('details')
    expect(details?.textContent).toContain('Merge conflict')
    expect(visible.replace(details?.textContent ?? '', '')).not.toMatch(/merge|conflict \(/iu)
  })

  it('a file the folder and the draft both changed: Aplicar waits for the person choice, then sends it', async () => {
    const withClash = { ...SUMMARY, files: [{ path: 'cardapio.docx', added: 1, deleted: 1, kind: 'changed', before: 'Pão R$ 12\n', after: 'Pão R$ 14\n', conflict: true }], patch: '' }
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: withClash }))
    const acceptReview = vi.fn(async () => ({ ok: true as const, value: { kind: 'accepted' as const, mode: 'ff' as const } }))
    const persona = { reviewSummary, acceptReview } as unknown as PersonaRemoteClient
    render(
      <PreviewFrame brandLabel="Persona">
        <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId="t-rev" taskTitle="Cardápio" personaName="Bia" onClose={() => {}} onMutate={() => {}} />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByText('Você e Bia mudaram cardapio.docx')).toBeTruthy() })
    const apply = screen.getByRole('button', { name: reviewPt['action.accept'] }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/Manter os dois/u))
    expect(apply.disabled).toBe(false)
    fireEvent.click(apply)
    await waitFor(() => {
      expect(acceptReview).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', ticketId: 't-rev', mode: 'ff', choices: { 'cardapio.docx': 'both' } })
    })
  })
})
