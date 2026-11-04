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
  it('loads reviewSummary and calls acceptReview on Aceitar', async () => {
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
      expect(screen.getByText('src/hero.tsx')).toBeTruthy()
    })

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
})
