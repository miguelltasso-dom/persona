// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowProposalCard } from '../src/client/kanban/WorkflowProposalCard.tsx'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import type { WorkflowProposalView } from '@deepseek-ai/dsh-persona-host/types'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

const PROPOSAL: WorkflowProposalView = {
  template: 'contratacao',
  reason: 'Parece um processo de contratação.',
  workflow: {
    projectId: 'p1',
    template: 'contratacao',
    columns: [
      { id: 'c1', name: 'Triagem', category: 'todo' },
      { id: 'c2', name: 'Entrevista', category: 'doing' },
      { id: 'c3', name: 'Contratado', category: 'done' },
    ],
    fields: [],
  },
  card: {
    question: 'Usar este fluxo?',
    primary: 'Usar este fluxo',
    impact: '3 colunas · modelo Contratação',
  },
}

describe('WorkflowProposalCard', () => {
  it('renders question and accept action', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <WorkflowProposalCard
          dict={pt}
          proposal={PROPOSAL}
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />
      </PreviewFrame>,
    )
    expect(document.querySelector('[data-persona-surface="workflow-proposal"]')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Usar este fluxo?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Usar este fluxo' })).toBeTruthy()
  })
})
