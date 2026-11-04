// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainHomeView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { SecondBrainHome } from '../src/client/second-brain/SecondBrainHome.tsx'
import { pt } from '../src/client/locale/second-brain/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

function brainPage(partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'title'>): BrainPageView {
  return {
    kind: 'company',
    body: 'Corpo',
    slug: partial.id,
    revision: 1,
    links: [],
    sources: [],
    editorHint: 'persona:atlas',
    updatedAt: '2026-11-04T12:00:00.000Z',
    restricted: false,
    ...partial,
  }
}

const HOME: BrainHomeView = {
  startHereId: 'start',
  changedToday: [brainPage({ id: 'p1', title: 'Missão da empresa' })],
  activeGrants: [{
    id: 'g1',
    pageId: 'p1',
    personaId: 'atlas',
    action: 'editar',
    target: 'Missão',
    validity: '7d',
    useCount: 2,
  }],
  contradictions: [],
  leftover: [],
}

describe('SecondBrainHome (SB-5)', () => {
  it('renders home sections and revokes a grant', () => {
    const onRevoke = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainHome
          dict={pt}
          home={HOME}
          pages={[brainPage({ id: 'p1', title: 'Missão da empresa' }), brainPage({ id: 'p2', title: 'Processo de vendas', kind: 'process' })]}
          personaNames={{ atlas: 'Atlas' }}
          onRevokeGrant={onRevoke}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { name: pt['title'] })).toBeTruthy()
    expect(screen.getByText(pt['sections.changedToday'])).toBeTruthy()
    expect(screen.getByText(pt['sections.permissions'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['permissions.revoke'] }))
    fireEvent.click(screen.getByRole('button', { name: pt['permissions.confirmRevoke'] }))
    expect(onRevoke).toHaveBeenCalledWith('g1')
  })

  it('shows sparse hero when the vault is nearly empty', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainHome
          dict={pt}
          home={{ startHereId: 'start', changedToday: [], activeGrants: [], contradictions: [], leftover: [] }}
          pages={[brainPage({ id: 'start', title: 'Índice da empresa' })]}
          onBringContext={vi.fn()}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText(pt['empty.title'])).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['empty.action.byc'] })).toBeTruthy()
  })

  it('filters pages from the search field', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainHome
          dict={pt}
          home={HOME}
          pages={[
            brainPage({ id: 'p1', title: 'Missão da empresa' }),
            brainPage({ id: 'p2', title: 'Processo de vendas', kind: 'process' }),
          ]}
        />
      </PreviewFrame>,
    )
    fireEvent.change(screen.getByPlaceholderText(pt['search.placeholder']), { target: { value: 'vendas' } })
    const results = screen.getByRole('region', { name: pt['search.results'].replace('{count}', '1') })
    expect(within(results).getByRole('button', { name: 'Processo de vendas' })).toBeTruthy()
  })
})
