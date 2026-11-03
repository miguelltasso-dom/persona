// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pt } from '../src/client/locale/persona-editor/locales.ts'
import { PersonaEditor } from '../src/client/persona-editor/PersonaEditor.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as onboardingPt } from '../src/client/locale/onboarding/locales.ts'

installPreviewTheme()

describe('persona editor preview', () => {
  it('renders customizable fields and system role toggles', () => {
    render(
      <PreviewFrame brandLabel={onboardingPt['brand.name']}>
        <PersonaEditor dict={pt} />
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { level: 1, name: pt['title.edit'] })).toBeTruthy()
    expect(screen.getByLabelText(pt['field.coordination'])).toBeTruthy()
    expect(screen.getByLabelText(pt['field.watchdog'])).toBeTruthy()
    expect(screen.getByText(pt['section.proactivity'])).toBeTruthy()
    expect(screen.getByText(pt['field.autonomyHint'])).toBeTruthy()
    expect(screen.getByText('Luna')).toBeTruthy()
  })
})
