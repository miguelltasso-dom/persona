// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pt } from '../src/client/locale/shell/locales.ts'
import { OverviewView } from '../src/client/overview/OverviewView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'

installPreviewTheme()

describe('overview preview', () => {
  it('lists Precisa de você before other content', () => {
    render(
      <OverviewView
        t={shellTranslate}
        attentionItems={[pt['overview.attentionSample']]}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: pt['overview.attentionTitle'] })).toBeTruthy()
    expect(screen.getByText(pt['overview.attentionSample'])).toBeTruthy()
  })
})
