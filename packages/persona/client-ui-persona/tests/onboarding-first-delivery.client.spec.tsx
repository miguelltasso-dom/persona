// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

describe('onboarding step 5 first delivery (V1-P0-4 / FIRST-DELIVERY-SPEC)', () => {
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

  it('needsEngine phase shows prompt to connect an engine and navigates to step 3', () => {
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 5, displayName: 'Miguel' })
    render(
      <OnboardingWizard
        dict={pt}
        structureDict={pt}
        store={store}
        actions={actions}
        harnesses={[{ id: 'claude', label: 'Claude', ready: false }]}
        firstDelivery={{
          shellT: key => shellPt[key as keyof typeof shellPt] as string,
          phase: 'needsEngine',
          onRequest: () => undefined,
          onEnterApp: () => undefined,
          onCelebrateContinue: () => undefined,
        }}
      />,
    )
    expect(screen.getByText(pt['step5.needsEngineTitle'])).toBeTruthy()
    expect(screen.getByText(pt['step5.needsEngineBody'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.connectEngine'] }))
    expect(store.getSnapshot().step).toBe(3)
  })

  it('working phase displays honest progress and enterAndFollow button', () => {
    const onEnterApp = vi.fn()
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 5, displayName: 'Miguel' })
    render(
      <OnboardingWizard
        dict={pt}
        structureDict={pt}
        store={store}
        actions={actions}
        harnesses={[{ id: 'claude', label: 'Claude', ready: true }]}
        firstDelivery={{
          shellT: key => shellPt[key as keyof typeof shellPt] as string,
          phase: 'working',
          workingPersonaName: 'Nina',
          onRequest: () => undefined,
          onEnterApp,
          onCelebrateContinue: () => undefined,
        }}
      />,
    )
    expect(screen.getByText(pt['step5.workingTitle'])).toBeTruthy()
    expect(screen.getByText(/Nina está no pedido/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.enterAndFollow'] }))
    expect(onEnterApp).toHaveBeenCalledTimes(1)
  })

  it('slow phase displays slowBody notice and keepWaiting option', () => {
    const onEnterApp = vi.fn()
    const onKeepWaiting = vi.fn()
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 5, displayName: 'Miguel' })
    render(
      <OnboardingWizard
        dict={pt}
        structureDict={pt}
        store={store}
        actions={actions}
        harnesses={[{ id: 'claude', label: 'Claude', ready: true }]}
        firstDelivery={{
          shellT: key => shellPt[key as keyof typeof shellPt] as string,
          phase: 'slow',
          workingPersonaName: 'Nina',
          onRequest: () => undefined,
          onEnterApp,
          onCelebrateContinue: () => undefined,
          onKeepWaiting,
        }}
      />,
    )
    expect(screen.getByText(pt['step5.slowBody'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.keepWaiting'] }))
    expect(onKeepWaiting).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: pt['step5.enterAndFollow'] }))
    expect(onEnterApp).toHaveBeenCalledTimes(1)
  })

  it('failed phase displays RunErrorCard with retry and enter app escape', () => {
    const onRetry = vi.fn()
    const onEnterApp = vi.fn()
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 5, displayName: 'Miguel' })
    render(
      <OnboardingWizard
        dict={pt}
        structureDict={pt}
        store={store}
        actions={actions}
        harnesses={[{ id: 'claude', label: 'Claude', ready: true }]}
        firstDelivery={{
          shellT: key => shellPt[key as keyof typeof shellPt] as string,
          chatT: (k, p) => bindLocale(chatPt, k, p),
          phase: 'failed',
          workingPersonaName: 'Nina',
          runError: {
            code: 'not_logged_in',
            provider: 'Claude',
            persona: 'Nina',
            command: 'claude login',
          },
          onRequest: () => undefined,
          onEnterApp,
          onCelebrateContinue: () => undefined,
          onRetry,
        }}
      />,
    )
    expect(screen.getByText(/O Claude não está conectado neste computador/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: pt['step5.enterAppPlain'] }))
    expect(onEnterApp).toHaveBeenCalledTimes(1)
  })

  it('celebrate phase shows MilestoneCard with acceptAndEnter action', () => {
    const onCelebrateContinue = vi.fn()
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 5, displayName: 'Miguel' })
    render(
      <OnboardingWizard
        dict={pt}
        structureDict={pt}
        store={store}
        actions={actions}
        harnesses={[{ id: 'claude', label: 'Claude', ready: true }]}
        firstDelivery={{
          shellT: (key, p) => bindLocale(shellPt, key, p),
          phase: 'celebrate',
          milestone: {
            taskId: 'task-1',
            title: 'Resumo do Cofre',
            personaName: 'Nina',
            characterId: 'nina',
          },
          onRequest: () => undefined,
          onEnterApp: () => undefined,
          onCelebrateContinue,
        }}
      />,
    )
    expect(screen.getByText(shellPt['overview.firstDelivery.title'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.acceptAndEnter'] }))
    expect(onCelebrateContinue).toHaveBeenCalledTimes(1)
  })
})
