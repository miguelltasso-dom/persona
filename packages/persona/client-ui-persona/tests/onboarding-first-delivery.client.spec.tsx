// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

describe('onboarding step 5 first delivery (V1-P0-4)', () => {
  it('Pedir agora calls onRequest; structure assistant hides duplicate Continuar', () => {
    const onRequest = vi.fn()
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 5, displayName: 'Miguel', vaultText: 'Acme Corp' })
    render(
      <OnboardingWizard
        dict={pt}
        structureDict={pt}
        store={store}
        actions={actions}
        harnesses={[{ id: 'claude', label: 'Claude', ready: true }]}
        firstDelivery={{
          shellT: key => shellPt[key as keyof typeof shellPt] as string,
          phase: 'intro',
          onRequest,
          onEnterApp: () => undefined,
          onCelebrateContinue: () => undefined,
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    expect(onRequest).toHaveBeenCalledTimes(1)
  })

  it('step 3 without ready harness hides skip connect', () => {
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 3 })
    render(
      <OnboardingWizard
        dict={pt}
        structureDict={pt}
        store={store}
        actions={actions}
        harnesses={[{ id: 'claude', label: 'Claude', ready: false }]}
      />,
    )
    expect(screen.queryByRole('button', { name: pt['action.skipHarness'] })).toBeNull()
    expect(screen.getByText(pt['step3.connectRequired'])).toBeTruthy()
  })
})
