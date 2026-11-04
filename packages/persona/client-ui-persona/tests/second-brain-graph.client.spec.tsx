// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SecondBrainGraphView } from '../src/client/second-brain/SecondBrainGraphView.tsx'
import { pt } from '../src/client/locale/second-brain/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

describe('SecondBrainGraphView (SB-5 optional)', () => {
  it('lists pages and opens on click', () => {
    const onOpen = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainGraphView
          dict={pt}
          pages={[{
            id: 'pg-1',
            title: 'Processo de vendas',
            kind: 'process',
            body: '',
            slug: 'processo-vendas',
            revision: 1,
            links: [],
            sources: [],
            editorHint: '',
            updatedAt: '2026-01-01',
            restricted: false,
          }]}
          onOpenPage={onOpen}
          onShowList={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByLabelText(pt['graph.label'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Processo de vendas' }))
    expect(onOpen).toHaveBeenCalledWith('pg-1')
  })
})
