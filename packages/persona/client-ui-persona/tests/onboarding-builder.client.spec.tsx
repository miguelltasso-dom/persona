// @vitest-environment jsdom
/** Keep isolated: BYC step re-rendered in a loop when `t` was in BringYourContextBlock effect deps. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

describe('onboarding wizard', () => {
  it('walks five steps with mock harnesses and team templates', () => {
    const { store, actions } = createOnboardingStore()
    render(
      <PreviewFrame brandLabel={pt['brand.name']}>
        <div className="panel">
          <OnboardingWizard dict={pt} structureDict={governancePt} store={store} actions={actions} />
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
    expect(screen.getByRole('heading', { level: 1, name: pt['step5.title'] })).toBeTruthy() // legacy preview without firstDelivery prop
  }, 15_000)
})

describe('onboarding builder thread', () => {
  it('shows coordinator reply after generate draft', () => {
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 4 })
    render(<OnboardingWizard dict={pt} structureDict={governancePt} store={store} actions={actions} />)
    // UX-17: descrever com as próprias palavras é caminho secundário, aberto sob demanda
    expect(screen.queryByPlaceholderText(pt['step4.builderPlaceholder'])).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: pt['step4.builderToggle'] }))
    fireEvent.change(screen.getByPlaceholderText(pt['step4.builderPlaceholder']), {
      target: { value: 'Revisor de contratos' },
    })
    fireEvent.click(screen.getByRole('button', { name: pt['step4.builderApply'] }))
    expect(screen.getByText(pt['step4.coordinatorName'])).toBeTruthy()
    expect(screen.getByText(pt['step4.coordinatorName'])).toBeTruthy()
  }, 10_000)
})
