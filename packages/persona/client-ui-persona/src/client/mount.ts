/** Mount Persona Remote + shell slot registrations. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import personaRemote from '@deepseek-ai/dsh-persona-host/remote'
import './shell/persona-slots.ts'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { ONBOARDING_NS } from './locale/onboarding/locales.ts'
import { GOVERNANCE_NS } from './locale/governance/locales.ts'
import { localeBindAsDict } from './preview/locale-bind.ts'
import type { BringYourContextBlockProps } from './bring-context/BringYourContextBlock.tsx'
import type { BringContextPreview } from '@deepseek-ai/dsh-persona-core'
import type { ProposalChoice } from './primitives/BringContext.tsx'
import { SHELL_NS } from './locale/shell/locales.ts'
import { readStoredAway, syncAvailability } from './shell/availability-sync.ts'
import type { UserAwayState } from './shell/UserAwayControl.tsx'
import { CHAT_NS } from './locale/chat/locales.ts'
import { createOnboardingStore } from './onboarding/create-onboarding-store.ts'
import { OnboardingShellOverlay } from './onboarding/OnboardingShellOverlay.tsx'
import { installComposerHostCapabilities } from './chat/composer-host-capabilities.ts'
import { registerLumenUi } from './kanban/register-lumen-ui.tsx'
import { createPersonaLiveStore } from './remote/persona-live-store.ts'
import { registerPrismScreens } from './shell/register-prism-screens.tsx'
import { registerPersonaAboutSettings } from './shell/register-persona-about-settings.ts'
import { PersonaAppFrame } from './shell/PersonaAppFrame.tsx'
import { PersonaSidebar } from './shell/PersonaSidebar.tsx'
import { createRailAiObservable, type RailAiRemote } from './shell/rail-ai-status.ts'
import { SettingsLauncher } from './shell/SettingsLauncher.tsx'
import { isPlacesNavEnabled } from './shell/nav-flag.ts'
import { createShellStore, type MainPanelId, type ShellStoreHandle } from './shell/create-shell-store.ts'
import { overlayOpenFromHost } from './remote/onboarding-host.ts'
import { signalPersonaFirstPaint } from './boot/signal-first-paint.ts'
import { rosterFromDrafts } from './onboarding/roster-from-draft.ts'
import { clearOnboardingStepDraft, writeOnboardingCacheComplete } from './shell/onboarding-persistence.ts'
import { applyBringContextRemote, mergeBringOrganizePreview, previewBringVaultFolderRemote } from './data/bring-context-remote.ts'
import { clearOnboardingBycDraft } from './bring-context/onboarding-byc-draft.ts'
import { installPersonaColorScheme } from './theme/install-color-scheme.ts'
import { createLiveRailTeamObservable } from './remote/live-rail-bridge.ts'
import { createPersonaCardBridge } from './remote/persona-card-bridge.ts'
import { PROFILE_NS } from './locale/profile/locales.ts'
import { PersonaEngineOverlay } from './profile/PersonaEngineOverlay.tsx'
import { PersonaTalkAclOverlay } from './profile/PersonaTalkAclOverlay.tsx'
import { TeachPersonaOverlay } from './profile/TeachPersonaOverlay.tsx'
import { TeachPersonaSession } from './profile/TeachPersonaSession.tsx'
import type { PersonaCardShellBridge } from './remote/persona-card-shell-bridge.ts'
import { createApprovalsBadgeObservable } from './decisions/approvals-badge.ts'
import { bindTrayNeedsYou } from './decisions/tray-needs-you-bridge.ts'
import { HIRE_PERSONA_PROFILE_ID } from './shell/create-shell-store.ts'

export const inject = [
  'remote',
  'slots',
  'locale',
]

function registerUi(ctx: Context, shellHandle: ShellStoreHandle): void {
  installPersonaColorScheme()
  installComposerHostCapabilities(ctx.remote.persona as Parameters<typeof installComposerHostCapabilities>[0])
  const { store, actions } = shellHandle
  const live = createPersonaLiveStore(ctx.remote.persona as unknown as Parameters<typeof createPersonaLiveStore>[0])
  // Tray "precisa de você" follows the same count as the chip and the rail badge (no-op outside the desktop shell).
  bindTrayNeedsYou(live)

  void ctx.remote.persona.ping().then((result) => {
    actions.setHostPing(result.ok, result.ok ? result.value.protocol : null)
  }).catch(() => {
    actions.setHostPing(false, null)
  })

  void live.bootstrap((firstUse) => {
    actions.setOnboardingOpen(overlayOpenFromHost(firstUse))
    signalPersonaFirstPaint()
  }).then(() => live.runDevHarnessSeedIfEnabled()).catch((error: unknown) => {
    console.error('[persona] bootstrap ou dev seed falhou', error)
  })

  const onboardingHandle = createOnboardingStore()
  const shellObservable = {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener: () => void) => store.subscribe(listener),
  }
  const railTeamObservable = createLiveRailTeamObservable(live, shellHandle)
  const personaCardBridge = createPersonaCardBridge(ctx.remote.persona, live)
  const cardDict = localeBindAsDict((key, params) => ctx.locale.bind(PROFILE_NS)(key as never, params as never))
  const personaCardShell: PersonaCardShellBridge = {
    cardInfo: personaCardBridge.cardInfo,
    prefetch: personaCardBridge.prefetch,
    cardDict,
    revision: personaCardBridge.revision,
    sendToPersona: (personaId: string, text: string) => {
      actions.selectPanel('directMessages')
      void live.openPersonaDm(personaId).then(() => {
        void live.postDmMessage(text)
      })
    },
    togglePause: (personaId: string) => { void personaCardBridge.togglePause(personaId) },
    switchEngine: (personaId: string) => { actions.openEngineEditor(personaId) },
    editTalk: (personaId: string) => { actions.openTalkAclEditor(personaId) },
    editPersona: (personaId: string) => { actions.openPersonaEditor(personaId) },
    teachPersona: (personaId: string) => { actions.openTeachPersona(personaId) },
  }
  const availabilityTenant = (): { workspaceId: string; memberId: string } | null => {
    const tenant = live.observable.getSnapshot().tenant
    return tenant === null ? null : { workspaceId: tenant.workspaceId, memberId: tenant.memberId }
  }
  // Depois de reabrir o app o rail lembra "Estou fora" (navegador); o host precisa saber de novo, uma vez, assim que o tenant existe.
  let availabilityReconciled = false
  live.observable.subscribe(() => {
    if (availabilityReconciled) return
    const tenant = availabilityTenant()
    if (tenant === null) return
    availabilityReconciled = true
    const stored = readStoredAway()
    if (stored?.isAway === true && (stored.untilAt === undefined || stored.untilAt > Date.now())) {
      void syncAvailability(ctx.remote.persona as never, tenant, stored)
    }
  })

  // A-5: estado real da IA para a pílula do rodapé; só consulta o host enquanto o rail está montado.
  const railAiObservable = createRailAiObservable({
    remote: ctx.remote.persona as unknown as RailAiRemote,
    scope: () => {
      const tenant = live.observable.getSnapshot().tenant
      return tenant === null ? null : { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
    },
    subscribeScope: listener => live.observable.subscribe(listener),
  })
  const sidebarInject = () => ({
    hooks: {
      shell: shellObservable,
      team: railTeamObservable,
      personaCardRevision: personaCardBridge.revision,
      approvals: createApprovalsBadgeObservable(live),
    },
    railAi: railAiObservable,
    cardInfo: personaCardBridge.cardInfo,
    prefetchPersonaCard: personaCardBridge.prefetch,
    cardDict,
    selectPanel: (id: Parameters<typeof actions.selectPanel>[0]) => { actions.selectPanel(id) },
    openPersonaDm: (personaId: string) => {
      actions.selectPanel('directMessages')
      void live.openPersonaDm(personaId)
    },
    openPersonaProfile: (personaId: string) => {
      actions.closePersonaEditor()
      actions.setProfilePersonaId(personaId)
      actions.selectPanel('profile')
    },
    hirePersona: () => {
      actions.closePersonaEditor()
      actions.setProfilePersonaId(HIRE_PERSONA_PROFILE_ID)
      actions.selectPanel('profile')
    },
    sendToPersona: (personaId: string, text: string) => {
      actions.selectPanel('directMessages')
      void live.openPersonaDm(personaId).then(() => {
        void live.postDmMessage(text)
      })
    },
    editPersona: (personaId: string) => {
      actions.openPersonaEditor(personaId)
    },
    togglePersonaPause: (personaId: string) => { void personaCardBridge.togglePause(personaId) },
    switchPersonaEngine: (personaId: string) => { actions.openEngineEditor(personaId) },
    editPersonaTalk: (personaId: string) => { actions.openTalkAclEditor(personaId) },
    onAwayChange: (state: UserAwayState) => { void syncAvailability(ctx.remote.persona as never, availabilityTenant(), state) },
  })
  const frameInject = () => ({ hooks: { shell: shellObservable }, selectPanel: (panel: MainPanelId) => { actions.selectPanel(panel) } })

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

  // "Configurações" do rodapé (D-077, atrás da flag A-1): com a navegação em 6 lugares LIGADA o nosso botão ocupa o gatilho
  // do DSW (uma engrenagem só, abre o lugar) e o slot do DSW segue montado em volta, então os indicadores de conexão e de
  // atualização continuam ao lado. DESLIGADA (padrão) o launcher nem é registrado: o gatilho é o do DSW, como antes.
  if (isPlacesNavEnabled()) {
    ctx.slots.inject('settings.launcher', () => ctx.slots.register({
      name: 'settings.launcher',
      locale: SHELL_NS,
      inject: () => ({
        hooks: { shell: shellObservable },
        selectPanel: (panel: MainPanelId) => { actions.selectPanel(panel) },
      }),
    }, SettingsLauncher))
  }

  registerPrismScreens(ctx, live, shellHandle, (panel) => { actions.selectPanel(panel) }, personaCardShell)
  registerPersonaAboutSettings(ctx)
  registerLumenUi(ctx, live, {
    selectPanel: actions.selectPanel,
    clearBoardsFocusProject: actions.clearBoardsFocusProject,
    clearKanbanFocusTicket: actions.clearKanbanFocusTicket,
    setProjectWorkspaceProjectId: actions.setProjectWorkspaceProjectId,
    openTeamSetup: () => { actions.setOnboardingOpen(true) },
    openHelp: (docId: string) => { actions.openHelp({ docId, tab: 'guias' }) },
    openPersonaProfile: (personaId: string) => {
      actions.closePersonaEditor()
      actions.setProfilePersonaId(personaId)
      actions.selectPanel('profile')
    },
    shell: shellObservable,
    personaCard: personaCardShell,
  })

  ctx.slots.register({
    name: 'shell.overlay',
    id: 'persona.onboarding',
    locale: ONBOARDING_NS,
    inject: () => ({
      hooks: { shell: shellObservable, live: live.observable },
      dict: localeBindAsDict((key, params) => ctx.locale.bind(ONBOARDING_NS)(key as never, params as never)),
      structureDict: localeBindAsDict((key, params) => ctx.locale.bind(GOVERNANCE_NS)(key as never, params as never)),
      shellDict: localeBindAsDict((key, params) => ctx.locale.bind(SHELL_NS)(key as never, params as never)),
      chatDict: localeBindAsDict((key, params) => ctx.locale.bind(CHAT_NS)(key as never, params as never)),
      store: onboardingHandle.store,
      actions: onboardingHandle.actions,
      persona: ctx.remote.persona,
      postChannelMessage: (body: string) => live.postChannelMessage(body),
      selectPanel: (panel: MainPanelId) => { actions.selectPanel(panel) },
      refreshLive: () => live.refresh(),
      finishOnboardingWizard: async (options?: { readonly firstRequest?: string }) => {
        const snapshot = onboardingHandle.store.getSnapshot()
        clearOnboardingBycDraft()
        clearOnboardingStepDraft()
        await live.completeOnboarding(snapshot.displayName, rosterFromDrafts(snapshot.roster), {
          cofreSeed: snapshot.vaultText.trim(),
          templateIds: snapshot.templateId === 'emBranco' ? [] : [snapshot.templateId],
          ...(options?.firstRequest === undefined ? {} : { firstRequest: options.firstRequest }),
        })
        writeOnboardingCacheComplete()
        await live.refresh()
      },
      onScanVaultFolder: async (rootPath: string) => {
        const tenant = live.observable.getSnapshot().tenant
        if (tenant === null) throw new Error('no-tenant')
        return previewBringVaultFolderRemote(ctx.remote.persona, {
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          rootPath,
        })
      },
      onOrganizePreview: async (input: {
        readonly pasted: BringYourContextBlockProps['pasted']
        readonly vaultPreview: BringContextPreview | null
      }) => {
        const tenant = live.observable.getSnapshot().tenant
        if (tenant === null) throw new Error('no-tenant')
        return mergeBringOrganizePreview(ctx.remote.persona, {
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
        }, input.pasted, input.vaultPreview)
      },
      onApplyReview: async (preview: BringContextPreview, choices: Readonly<Record<string, ProposalChoice>>) => {
        const tenant = live.observable.getSnapshot().tenant
        if (tenant === null) throw new Error('no-tenant')
        return applyBringContextRemote(ctx.remote.persona, {
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
        }, preview, choices, tenant.memberId)
      },
      lockOnboardingForFirstDelivery: () => { actions.lockOnboardingForFirstDelivery() },
      dismissOnboarding: () => {
        actions.unlockOnboardingForFirstDelivery()
        actions.dismissOnboarding()
      },
      ...((): { structureRemote?: { client: typeof ctx.remote.persona; workspaceId: string } } => {
        const tenant = live.observable.getSnapshot().tenant
        if (tenant === null) return {}
        return {
          structureRemote: {
            client: ctx.remote.persona,
            workspaceId: tenant.workspaceId,
          },
        }
      })(),
    }),
  }, OnboardingShellOverlay)

  ctx.slots.register({
    name: 'shell.overlay',
    id: 'persona.talkAcl',
    locale: PROFILE_NS,
    inject: () => ({
      hooks: {
        shell: shellObservable,
      },
      dict: cardDict,
      persona: ctx.remote.persona,
      live,
      cardBridge: personaCardBridge,
      closeTalkAclEditor: () => { actions.closeTalkAclEditor() },
    }),
  }, PersonaTalkAclOverlay)

  ctx.slots.register({
    name: 'shell.overlay',
    id: 'persona.engine',
    locale: PROFILE_NS,
    inject: () => ({
      hooks: { shell: shellObservable },
      dict: cardDict,
      persona: ctx.remote.persona,
      cardBridge: personaCardBridge,
      scope: () => {
        const tenant = live.observable.getSnapshot().tenant
        return tenant === null ? null : {
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
        }
      },
      closeEngineEditor: () => { actions.closeEngineEditor() },
    }),
  }, PersonaEngineOverlay)

  ctx.slots.register({
    name: 'shell.overlay',
    id: 'persona.teach',
    locale: PROFILE_NS,
    inject: () => ({
      hooks: { shell: shellObservable, live: live.observable },
      dict: cardDict,
      closeTeachPersona: () => { actions.closeTeachPersona() },
      // Resolves true once the host opened the recording session (the recording screen takes it from there).
      beginTeachCapture: async (personaId: string, consentVersion: string, microphone: boolean): Promise<boolean> => {
        try {
          const start = await live.startTeachPersona(personaId, consentVersion, microphone)
          if (start.sessionId.length === 0) return false
          actions.openTeachCapture({ personaId, sessionId: start.sessionId, microphone })
          actions.closeTeachPersona()
          return true
        } catch {
          return false
        }
      },
    }),
  }, TeachPersonaOverlay)

  ctx.slots.register({
    name: 'shell.overlay',
    id: 'persona.teachCapture',
    locale: PROFILE_NS,
    inject: () => ({
      hooks: { shell: shellObservable },
      dict: cardDict,
      live,
      persona: ctx.remote.persona,
      closeTeachCapture: () => { actions.closeTeachCapture() },
      openTeachPersona: (personaId: string) => { actions.openTeachPersona(personaId) },
    }),
  }, TeachPersonaSession)
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
