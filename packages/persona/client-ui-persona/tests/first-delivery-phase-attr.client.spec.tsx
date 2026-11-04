// @vitest-environment jsdom
// D-069 (Muse/Probe): cada fase do passo 5 se anuncia por atributo, para medir sem depender de texto.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import type { FirstDeliveryPhase } from '../src/client/onboarding/OnboardingFirstDeliveryStep.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const PHASES: readonly FirstDeliveryPhase[] = ['intro', 'needsEngine', 'working', 'slow', 'failed', 'celebrate']

describe('data-first-delivery-phase', () => {
  it.each(PHASES)('a fase %s marca a section com o próprio nome (e só uma section marcada)', (phase) => {
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 5, displayName: 'Miguel' })
    const { container } = render(
      <OnboardingWizard
        dict={pt}
        structureDict={pt}
        store={store}
        actions={actions}
        harnesses={[{ id: 'claude', label: 'Claude', ready: true }]}
        firstDelivery={{
          shellT: key => shellPt[key as keyof typeof shellPt] as string,
          phase,
          milestone: { taskId: 't1', title: 'Resumo', personaName: 'Nina', characterId: 'nina' },
          onRequest: () => undefined,
          onEnterApp: () => undefined,
          onCelebrateContinue: () => undefined,
        }}
      />,
    )
    const marked = container.querySelectorAll('[data-first-delivery-phase]')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.getAttribute('data-first-delivery-phase')).toBe(phase)
  })
})
