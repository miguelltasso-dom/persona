// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

describe('onboarding theme surfaces', () => {
  afterEach(() => {
    document.body.removeAttribute('data-ds-dark-theme')
  })

  it('renders in light and dark without crashing (Probe screenshots)', () => {
    const { store, actions } = createOnboardingStore()
    const { rerender } = render(
      <PreviewFrame brandLabel={pt['brand.name']}>
        <OnboardingWizard dict={pt} structureDict={governancePt} store={store} actions={actions} />
      </PreviewFrame>,
    )
    expect(document.querySelector('[data-persona-preview]')).toBeTruthy()
    document.body.setAttribute('data-ds-dark-theme', 'true')
    rerender(
      <PreviewFrame brandLabel={pt['brand.name']}>
        <OnboardingWizard dict={pt} structureDict={governancePt} store={store} actions={actions} />
      </PreviewFrame>,
    )
    expect(document.body.getAttribute('data-ds-dark-theme')).toBe('true')
  })
})
