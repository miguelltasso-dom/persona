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
import { SHELL_NS, type ShellKey } from './locale/shell/locales.ts'
import { createOnboardingStore } from './onboarding/create-onboarding-store.ts'
import { OnboardingShellOverlay } from './onboarding/OnboardingShellOverlay.tsx'
import { GeneralChannelView } from './chat/GeneralChannelView.tsx'
import { CHAT_NS } from './locale/chat/locales.ts'
import { OverviewView } from './overview/OverviewView.tsx'
import { MOCK_AWAY_SUMMARY, MOCK_OVERVIEW_NOW } from './overview/mock-overview-proactivity.ts'
import { SearchPlaceholderView } from './shell/SearchPlaceholderView.tsx'
import { PersonaAppFrame } from './shell/PersonaAppFrame.tsx'
import { PersonaSidebar } from './shell/PersonaSidebar.tsx'
import { registerLumenUi } from './kanban/register-lumen-ui.tsx'
import { createShellStore, type ShellStoreHandle } from './shell/create-shell-store.ts'

const ATTENTION_KEYS: readonly ShellKey[] = ['overview.attentionSample']

export const inject = [
  'remote',
  'slots',
  'locale',
]

function registerUi(ctx: Context, shellHandle: ShellStoreHandle): void {
  const { store, actions } = shellHandle
  void ctx.remote.persona.ping().then((result) => {
    actions.setHostPing(result.ok, result.ok ? result.value.protocol : null)
  }).catch(() => {
    actions.setHostPing(false, null)
  })
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
  const tShell = ctx.locale.bind(SHELL_NS)
  const overviewInject = () => ({
    attentionItems: ATTENTION_KEYS.map(key => tShell(key)),
    nowRows: MOCK_OVERVIEW_NOW,
    awayEvents: MOCK_AWAY_SUMMARY,
  })

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

  ctx.slots.register({
    name: 'main',
    key: 'overview',
    locale: SHELL_NS,
    inject: overviewInject,
  }, OverviewView)

  const channelInject = () => ({ shellT: ctx.locale.bind(SHELL_NS) })
  ctx.slots.register({
    name: 'main',
    key: 'channels',
    locale: CHAT_NS,
    inject: channelInject,
  }, GeneralChannelView)
  ctx.slots.register({
    name: 'main',
    key: 'team',
    locale: CHAT_NS,
    inject: channelInject,
  }, GeneralChannelView)

  ctx.slots.register({
    name: 'main',
    key: 'search',
    locale: SHELL_NS,
  }, SearchPlaceholderView)

  ctx.slots.register({
    name: 'shell.overlay',
    id: 'persona.onboarding',
    locale: ONBOARDING_NS,
    inject: () => ({
      hooks: { shell: shellObservable },
      dict: onboardingPt,
      store: onboardingHandle.store,
      actions: onboardingHandle.actions,
      dismissOnboarding: () => { actions.dismissOnboarding() },
    }),
  }, OnboardingShellOverlay)

  registerLumenUi(ctx)
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
