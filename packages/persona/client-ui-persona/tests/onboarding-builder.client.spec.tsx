// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

describe('onboarding builder thread', () => {
  it('shows coordinator reply after generate draft', () => {
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 4 })
    render(<OnboardingWizard dict={pt} store={store} actions={actions} />)
    fireEvent.change(screen.getByPlaceholderText(pt['step4.builderPlaceholder']), {
      target: { value: 'Revisor de contratos' },
    })
    fireEvent.click(screen.getByRole('button', { name: pt['step4.builderApply'] }))
    expect(screen.getByText(pt['step4.coordinatorName'])).toBeTruthy()
    expect(screen.getByText(pt['step4.coordinatorName'])).toBeTruthy()
  })
})
