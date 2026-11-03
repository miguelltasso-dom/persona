// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

describe('onboarding preview', () => {
  it('walks five steps with mock harnesses and team templates', () => {
    const { store, actions } = createOnboardingStore()
    render(
      <PreviewFrame brandLabel={pt['brand.name']}>
        <div className="panel">
          <OnboardingWizard dict={pt} store={store} actions={actions} />
        </div>
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { level: 1, name: pt['step1.title'] })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(pt['step1.placeholder']), { target: { value: 'Miguel' } })
    fireEvent.click(screen.getByRole('button', { name: pt['action.continue'] }))
    expect(screen.getByText(pt['step2.vaultBadge'])).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: pt['action.continue'] })[0]!)
    expect(screen.getByText('Claude Code')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: pt['action.continue'] })[0]!)
    expect(screen.getByRole('button', { name: pt['step4.templates.startup'], pressed: false })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['action.continue'] }))
    expect(screen.getByRole('heading', { level: 1, name: pt['step5.title'] })).toBeTruthy()
  })
})
