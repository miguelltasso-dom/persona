// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { SecondBrainPageView } from '../src/client/second-brain/SecondBrainPageView.tsx'
import { pt } from '../src/client/locale/second-brain/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const PAGE: BrainPageView = {
  id: 'p1',
  kind: 'rule',
  title: 'Tom de voz',
  body: 'Seja direto e amável.',
  slug: 'tom',
  revision: 2,
  links: [],
  sources: ['derived-index', 'tarefa:123'],
  editorHint: 'person:system',
  updatedAt: '2026-11-04T12:00:00.000Z',
  restricted: false,
}

describe('SecondBrainPageView (SB-5)', () => {
  it('localizes derived-index in sources', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainPageView
          dict={pt}
          page={PAGE}
          versions={[]}
          backlinkPages={[]}
          onBack={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText(pt['feed.sourceDerivedIndex'])).toBeTruthy()
    expect(screen.getByText('tarefa:123')).toBeTruthy()
    expect(screen.getByText(pt['page.sources'])).toBeTruthy()
  })
})
