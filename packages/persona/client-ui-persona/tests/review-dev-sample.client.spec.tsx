// @vitest-environment jsdom
// The capture-only sample of "Revisar mudanças" (Muse, 04/11): it exists ONLY behind its own flag on top of the dev seed,
// it never calls the host, and it always says "Exemplo". Without the flags nothing of it appears (IV-8: no mock in the real app).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { KanbanReviewSheet } from '../src/client/review/KanbanReviewSheet.tsx'
import { REVIEW_DEV_TICKET_ID, reviewDevSampleEnabled } from '../src/client/review/review-dev-sample.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

const SCOPE = { workspaceId: 'ws', projectId: 'proj' }
const EMPTY_SUMMARY = { ticketId: REVIEW_DEV_TICKET_ID, files: [], added: 0, deleted: 0, patch: '', patchTruncated: false, secretsRedacted: false, testsClaimed: [], hasWorktree: false }

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

function sheet(persona: PersonaRemoteClient, extra: Partial<React.ComponentProps<typeof KanbanReviewSheet>> = {}) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <KanbanReviewSheet persona={persona} scope={SCOPE} ticketId={REVIEW_DEV_TICKET_ID} taskTitle="Atualizar o cardápio de novembro" personaName="Bia" onClose={() => {}} onMutate={() => {}} {...extra} />
    </PreviewFrame>,
  )
}

describe('the review sample is capture-only', () => {
  it('needs BOTH flags: the dev seed and persona.devSeed.review', () => {
    expect(reviewDevSampleEnabled()).toBe(false)
    localStorage.setItem('persona.devSeed.v1', '1')
    expect(reviewDevSampleEnabled()).toBe(false)
    localStorage.removeItem('persona.devSeed.v1')
    localStorage.setItem('persona.devSeed.review', '1')
    expect(reviewDevSampleEnabled()).toBe(false)
    localStorage.setItem('persona.devSeed.v1', '1')
    expect(reviewDevSampleEnabled()).toBe(true)
  })

  it('WITHOUT the flags nothing of the sample appears: the host answers, no sample file, no "Exemplo"', async () => {
    const reviewSummary = vi.fn(async () => ({ ok: true as const, value: EMPTY_SUMMARY }))
    // even the sample's own ticket id is just a ticket to the real host
    sheet({ reviewSummary } as unknown as PersonaRemoteClient)
    await waitFor(() => { expect(reviewSummary).toHaveBeenCalled() })
    const text = document.body.textContent ?? ''
    for (const needle of ['cardapio.md', 'precos.xlsx', 'logo.png', 'contrato.pdf', 'promocao-de-natal.docx', 'Exemplo']) {
      expect(text).not.toContain(needle)
    }
  })

  it('WITH the flags: 5 sample files, the "Exemplo" chip, the host never called, a clash and then the moment', async () => {
    localStorage.setItem('persona.devSeed.v1', '1')
    localStorage.setItem('persona.devSeed.review', '1')
    const reviewSummary = vi.fn()
    const acceptReview = vi.fn()
    const onUndoApplied = vi.fn()
    sheet({ reviewSummary, acceptReview } as unknown as PersonaRemoteClient, { onUndoApplied })
    await screen.findByRole('option', { name: /cardapio\.md/u })
    expect(screen.getAllByRole('option')).toHaveLength(5)
    expect(screen.getByText('Exemplo')).toBeTruthy()
    // 1st Aplicar: one file changed in the folder meanwhile → the focused clash moment
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar na pasta' }))
    await screen.findByRole('heading', { level: 4, name: 'Você e Bia mudaram promocao-de-natal.docx' })
    fireEvent.click(screen.getByLabelText(/Manter os dois/u))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar na pasta' }))
    await screen.findByRole('heading', { name: 'Aplicado na pasta' })
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy()
    expect(reviewSummary).not.toHaveBeenCalled()
    expect(acceptReview).not.toHaveBeenCalled()
  })
})
