import type { ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { LocaleDict } from '../preview/locale-bind.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import type { createOnboardingStore } from './create-onboarding-store.ts'
import type { OnboardingActions } from './create-onboarding-store.ts'
import { OnboardingWizard } from './OnboardingWizard.tsx'
import styles from './OnboardingShellOverlay.module.css'

export interface OnboardingShellOverlayInjected {
  hooks: { shell: HostObservable<ShellState> }
  readonly dict: LocaleDict
  readonly store: ReturnType<typeof createOnboardingStore>['store']
  readonly actions: OnboardingActions
  dismissOnboarding(): void
}

export type OnboardingShellOverlayProps = InjectFace<OnboardingShellOverlayInjected>

/** Full-screen onboarding overlay on `shell.overlay` (first-run). */
export function OnboardingShellOverlay({
  dict,
  store,
  actions,
  useShell,
  dismissOnboarding,
}: OnboardingShellOverlayProps): ReactNode {
  const open = useShell(state => state.onboardingOpen)
  if (!open) return null

  return (
    <div className={styles.scrim} role="presentation">
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-onboarding-title"
      >
        <OnboardingWizard
          dict={dict}
          store={store}
          actions={actions}
          onComplete={dismissOnboarding}
        />
      </div>
    </div>
  )
}
