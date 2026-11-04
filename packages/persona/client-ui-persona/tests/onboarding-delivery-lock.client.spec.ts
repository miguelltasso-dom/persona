import { describe, expect, it } from 'vitest'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'

describe('onboarding delivery lock (V1-P0-4)', () => {
  it('setOnboardingOpen(false) is ignored while delivery lock is on', () => {
    const { store, actions } = createShellStore()
    actions.lockOnboardingForFirstDelivery()
    expect(store.getSnapshot().onboardingOpen).toBe(true)
    actions.setOnboardingOpen(false)
    expect(store.getSnapshot().onboardingOpen).toBe(true)
    actions.dismissOnboarding()
    expect(store.getSnapshot().onboardingOpen).toBe(false)
    expect(store.getSnapshot().onboardingDeliveryLock).toBe(false)
  })
})
