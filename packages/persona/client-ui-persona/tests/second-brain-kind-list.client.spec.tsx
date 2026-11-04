// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { SecondBrainKindListView } from '../src/client/second-brain/SecondBrainKindListView.tsx'
import { pt } from '../src/client/locale/second-brain/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

function page(partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'title'>): BrainPageView {
  return {
    kind: 'rule',
    body: 'Corpo da regra',
    slug: partial.id,
    revision: 1,
    links: [],
    sources: [],
    editorHint: 'person:system',
    updatedAt: '2026-11-04T12:00:00.000Z',
    restricted: false,
    ...partial,
  }
}

describe('SecondBrainKindListView (SB-5)', () => {
  it('lists pages with librarian copy and opens on click', () => {
    const onOpen = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainKindListView
          dict={pt}
          kind="rule"
          pages={[page({ id: 'r1', title: 'Tom de voz' }), page({ id: 'r2', title: 'Privada', restricted: true })]}
          onBack={() => {}}
          onOpenPage={onOpen}
        />
      </PreviewFrame>,
    )
    expect(screen.getAllByText(pt['feed.whoLibrarian']).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Tom de voz'))
    expect(onOpen).toHaveBeenCalledWith('r1')
  })

  it('filters private pages and toggles graph view', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainKindListView
          dict={pt}
          kind="rule"
          pages={[page({ id: 'r1', title: 'Pública' }), page({ id: 'r2', title: 'Privada', restricted: true })]}
          onBack={() => {}}
          onOpenPage={() => {}}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('tab', { name: pt['kindList.tab.private'] }))
    expect(screen.getByRole('button', { name: /Privada/u })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Pública/u })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: pt['kindList.view.graph'] }))
    expect(screen.getByRole('button', { name: pt['graph.showList'] })).toBeTruthy()
  })
})
