import { useCallback, useEffect, useSyncExternalStore, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import type { createOnboardingStore } from './create-onboarding-store.ts'
import type { OnboardingActions } from './create-onboarding-store.ts'
import { OnboardingWizard } from './OnboardingWizard.tsx'
import type { FirstDeliveryPhase } from './OnboardingFirstDeliveryStep.tsx'
import { MOCK_HARNESSES, type HarnessRow } from './mock-data.ts'
import { harnessRowsFromConnections } from './harness-from-connections.ts'
import { deriveFirstDeliveryMilestone } from '../overview/derive-first-delivery.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import styles from './OnboardingShellOverlay.module.css'

export interface OnboardingShellOverlayInjected {
  hooks: {
    shell: HostObservable<ShellState>
    live: HostObservable<PersonaLiveSnapshot>
  }
  readonly dict: LocaleDict
  readonly structureDict: LocaleDict
  readonly shellDict: LocaleDict
  readonly store: ReturnType<typeof createOnboardingStore>['store']
  readonly actions: OnboardingActions
  dismissOnboarding(): void
  lockOnboardingForFirstDelivery(): void
  finishOnboardingWizard(): Promise<void>
  postChannelMessage(body: string): Promise<void>
  selectPanel(panel: ShellState['activePanel']): void
  readonly persona: PersonaRemoteClient
  readonly onScanVaultFolder?: ((rootPath: string) => Promise<import('@deepseek-ai/dsh-persona-core').BringContextPreview>) | undefined
  readonly onOrganizePreview?: import('../bring-context/BringYourContextBlock.tsx').BringYourContextBlockProps['onOrganizePreview']
  readonly onApplyReview?: import('../bring-context/BringYourContextBlock.tsx').BringYourContextBlockProps['onApplyReview']
  readonly structureRemote?: {
    readonly client: PersonaRemoteClient
    readonly workspaceId: string
  } | undefined
}

export type OnboardingShellOverlayProps = InjectFace<OnboardingShellOverlayInjected>

/** Full-screen onboarding overlay on `shell.overlay` (first-run). */
export function OnboardingShellOverlay({
  dict,
  structureDict,
  shellDict,
  store,
  actions,
  useShell,
  useLive,
  dismissOnboarding,
  lockOnboardingForFirstDelivery,
  finishOnboardingWizard,
  postChannelMessage,
  selectPanel,
  persona,
  onScanVaultFolder,
  onOrganizePreview,
  onApplyReview,
  structureRemote,
}: OnboardingShellOverlayProps): ReactNode {
  const open = useShell(state => state.onboardingOpen)
  const step = useSyncExternalStore(
    listener => store.subscribe(listener),
    () => store.getSnapshot().step,
    () => store.getSnapshot().step,
  )
  const live = useLive(state => state)
  const [deliveryPhase, setDeliveryPhase] = useState<FirstDeliveryPhase>('intro')
  const [harnesses, setHarnesses] = useState<readonly HarnessRow[]>(MOCK_HARNESSES)

  const shellT = useCallback(
    (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellDict, key, params),
    [shellDict],
  )

  useEffect(() => {
    if (!open || step !== 3) return
    const tenant = live.tenant
    if (tenant === null || persona.listConnections === undefined) {
      setHarnesses(MOCK_HARNESSES)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const connections: readonly ConnectionView[] = await unwrapRemote(
          await persona.listConnections({
            workspaceId: tenant.workspaceId,
            projectId: tenant.projectId,
          }) as Parameters<typeof unwrapRemote>[0],
        ) as readonly ConnectionView[]
        if (!cancelled) setHarnesses(harnessRowsFromConnections(connections))
      } catch {
        if (!cancelled) setHarnesses(MOCK_HARNESSES)
      }
    })()
    return () => { cancelled = true }
  }, [open, step, live.tenant, persona])

  useEffect(() => {
    if (deliveryPhase !== 'working') return
    const milestone = deriveFirstDeliveryMilestone(live.kanbanCards)
    if (milestone !== undefined) setDeliveryPhase('celebrate')
  }, [deliveryPhase, live.kanbanCards])

  const activationPrompt = (): string => {
    const vaultReady = store.getSnapshot().vaultText.trim().length > 0
    return bindLocale(dict, vaultReady ? 'step5.activationPrompt' : 'step5.activationPromptEmpty')
  }

  const enterApp = (): void => {
    void finishOnboardingWizard().finally(() => { dismissOnboarding() })
  }

  const requestFirstDelivery = (): void => {
    lockOnboardingForFirstDelivery()
    setDeliveryPhase('working')
    void finishOnboardingWizard()
      .then(() => postChannelMessage(activationPrompt()))
      .catch(() => { setDeliveryPhase('intro') })
  }

  const celebrateContinue = (): void => {
    dismissOnboarding()
    selectPanel('overview')
  }

  const workingMember = live.stripMembers.find(member => member.state === 'working')

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
          structureDict={structureDict}
          store={store}
          actions={actions}
          harnesses={harnesses}
          firstDelivery={{
            shellT,
            phase: deliveryPhase,
            milestone: deliveryPhase === 'celebrate'
              ? deriveFirstDeliveryMilestone(live.kanbanCards)
              : undefined,
            workingPersonaName: workingMember?.name,
            onRequest: requestFirstDelivery,
            onEnterApp: enterApp,
            onCelebrateContinue: celebrateContinue,
          }}
          {...(onScanVaultFolder === undefined ? {} : { onScanVaultFolder })}
          {...(onOrganizePreview === undefined ? {} : { onOrganizePreview })}
          {...(onApplyReview === undefined ? {} : { onApplyReview })}
          {...(structureRemote === undefined ? {} : { structureRemote })}
        />
      </div>
    </div>
  )
}
