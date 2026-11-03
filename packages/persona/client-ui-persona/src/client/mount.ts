/** Mount Persona Remote + shell slot registrations. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import personaRemote from '@deepseek-ai/dsh-persona-host/remote'
import './shell/persona-slots.ts'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { ONBOARDING_NS } from './locale/onboarding/locales.ts'
import { pt as onboardingPt } from './locale/onboarding/locales.ts'
import { SHELL_NS } from './locale/shell/locales.ts'
import { createOnboardingStore } from './onboarding/create-onboarding-store.ts'
import { OnboardingShellOverlay } from './onboarding/OnboardingShellOverlay.tsx'
import { registerLumenUi } from './kanban/register-lumen-ui.tsx'
import { createPersonaLiveStore } from './remote/persona-live-store.ts'
import { registerPrismScreens } from './shell/register-prism-screens.tsx'
import { PersonaAppFrame } from './shell/PersonaAppFrame.tsx'
import { PersonaSidebar } from './shell/PersonaSidebar.tsx'
import { createShellStore, type ShellStoreHandle } from './shell/create-shell-store.ts'
import { overlayOpenFromHost } from './remote/onboarding-host.ts'
import { writeOnboardingCacheComplete } from './shell/onboarding-persistence.ts'
import { installPersonaColorScheme } from './theme/install-color-scheme.ts'

export const inject = [
  'remote',
  'slots',
  'locale',
]

function registerUi(ctx: Context, shellHandle: ShellStoreHandle): void {
  installPersonaColorScheme()
  const { store, actions } = shellHandle
  const live = createPersonaLiveStore(ctx.remote.persona as unknown as Parameters<typeof createPersonaLiveStore>[0])

  void ctx.remote.persona.ping().then((result) => {
    actions.setHostPing(result.ok, result.ok ? result.value.protocol : null)
  }).catch(() => {
    actions.setHostPing(false, null)
  })

  void live.bootstrap((firstUse) => {
    actions.setOnboardingOpen(overlayOpenFromHost(firstUse))
  }).then(() => live.runDevHarnessSeedIfEnabled())

  const onboardingHandle = createOnboardingStore()
  const shellObservable = {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener: () => void) => store.subscribe(listener),
  }
  const sidebarInject = () => ({
    hooks: { shell: shellObservable },
    selectPanel: (id: Parameters<typeof actions.selectPanel>[0]) => { actions.selectPanel(id) },
  })
  const frameInject = () => ({ hooks: { shell: shellObservable } })

  ctx.slots.register({
    name: 'root',
    locale: SHELL_NS,
    children: {
      sidebar: { kind: 'single', scope: 'root' },
      main: { kind: 'keyed', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
    inject: frameInject,
  }, PersonaAppFrame)

  ctx.slots.register({
    name: 'sidebar',
    locale: SHELL_NS,
    children: {
      'sidebar.settings': { kind: 'single', scope: 'root' },
    },
    inject: sidebarInject,
  }, PersonaSidebar)

  registerPrismScreens(ctx, live, (panel) => { actions.selectPanel(panel) })
  registerLumenUi(ctx, live)

  ctx.slots.register({
    name: 'shell.overlay',
    id: 'persona.onboarding',
    locale: ONBOARDING_NS,
    inject: () => ({
      hooks: { shell: shellObservable },
      dict: onboardingPt,
      store: onboardingHandle.store,
      actions: onboardingHandle.actions,
      dismissOnboarding: () => {
        const snapshot = onboardingHandle.store.getSnapshot()
        actions.dismissOnboarding()
        void live.completeOnboarding(snapshot.displayName, snapshot.roster).then(() => {
          writeOnboardingCacheComplete()
          void live.refresh()
        })
      },
    }),
  }, OnboardingShellOverlay)
}

/**
 * Mount persona-host Remote, ping, then register shell UI.
 * @param ctx - client plugin context.
 * @param contribution - Typert remote descriptor from persona-host.
 */
export async function mountPersonaUi(
  ctx: Context,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const shellHandle = createShellStore()
  const ui = ctx.inject(['remote.persona', ...inject.slice(1)], (c) => { registerUi(c, shellHandle) })
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmountRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmountRemote()
  }
}

/** Default remote contribution for the plugin entry. */
export { personaRemote }
