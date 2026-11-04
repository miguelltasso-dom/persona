// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProposalReview, defaultChoice } from '../src/client/primitives/BringContext.tsx'
import type { ContextProposal } from '../src/client/primitives/BringContext.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const PROPOSALS: readonly ContextProposal[] = [{
  id: 'dec-1',
  kind: 'decision',
  text: 'Usar SQLite',
  provenance: 'colado do ChatGPT',
  conflict: 'O Cofre já tem: “Postgres”. A colagem diz: “SQLite”. Qual vale?',
}]

const labels = {
  kinds: {
    brief: pt['byc.review.kind.brief'],
    constraint: pt['byc.review.kind.constraint'],
    decision: pt['byc.review.kind.decision'],
    memory: pt['byc.review.kind.memory'],
  },
  accept: pt['byc.review.accept'],
  discard: pt['byc.review.discard'],
  edit: pt['byc.review.edit'],
  done: pt['byc.review.done'],
  private: pt['byc.review.private'],
  uncertain: pt['byc.review.uncertain'],
  sensitiveBlocked: (why: string) => pt['byc.review.sensitiveBlocked'].replace('{why}', why),
  unblock: pt['byc.review.unblock'],
  conflict: (what: string) => pt['byc.review.conflict'].replace('{what}', what),
  acceptClean: pt['byc.review.acceptClean'],
  save: (n: number) => pt['byc.review.save'].replace('{count}', String(n)),
  summary: (accepted: number, flagged: number, discarded: number) => pt['byc.review.summary']
    .replace('{accepted}', String(accepted))
    .replace('{flagged}', String(flagged))
    .replace('{discarded}', String(discarded)),
}

describe('ProposalReview (BYC-4)', () => {
  it('shows conflict chip and private toggle on accept', () => {
    const onChoice = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <ProposalReview
          proposals={PROPOSALS}
          choices={{ 'dec-1': defaultChoice(PROPOSALS[0]!) }}
          onChoice={onChoice}
          onSave={() => {}}
          labels={labels}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText(/Postgres/u)).toBeTruthy()
    const privateBox = screen.getByRole('checkbox', { name: pt['byc.review.private'] })
    fireEvent.click(privateBox)
    expect(onChoice).toHaveBeenCalledWith('dec-1', expect.objectContaining({ private: true }))
  })

  it('enters edit mode and updates choice text', () => {
    const onChoice = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <ProposalReview
          proposals={PROPOSALS}
          choices={{ 'dec-1': defaultChoice(PROPOSALS[0]!) }}
          onChoice={onChoice}
          onSave={() => {}}
          labels={labels}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['byc.review.edit'] }))
    fireEvent.change(screen.getByLabelText(pt['byc.review.edit']), { target: { value: 'Usar Postgres' } })
    expect(onChoice).toHaveBeenCalledWith('dec-1', expect.objectContaining({ text: 'Usar Postgres' }))
  })

  it('discard marks proposal as discarded in choice state', () => {
    const onChoice = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <ProposalReview
          proposals={PROPOSALS}
          choices={{ 'dec-1': defaultChoice(PROPOSALS[0]!) }}
          onChoice={onChoice}
          onSave={() => {}}
          labels={labels}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['byc.review.discard'] }))
    expect(onChoice).toHaveBeenCalledWith('dec-1', expect.objectContaining({ decision: 'discard' }))
  })
})
