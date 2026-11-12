/** Prism main panels + locale-backed Lumen queue-2 surfaces. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { SecondBrainKey } from '../locale/second-brain/locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'persona.secondBrain': SecondBrainKey
  }
}
import { createLiveTenantObservable } from '../data/live-tenant-bridge.ts'
import type { LumenRemoteInjected } from '../data/lumen-inject.ts'
import type { ShellState } from './create-shell-store.ts'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import {
  RemoteCanvasPanel,
  RemoteImportPanel,
  RemoteMembersPanel,
  RemoteProfilePanel,
  RemoteRulesPanel,
  RemoteSecondBrainPanel,
} from '../data/lumen-remote-panels.tsx'
import { APPROVALS_NS } from '../locale/approvals/locales.ts'
import { CANVAS_NS } from '../locale/canvas/locales.ts'
import { IMPORTERS_NS } from '../locale/importers/locales.ts'
import { SECOND_BRAIN_NS } from '../locale/second-brain/locales.ts'
import { MEMBERS_NS } from '../locale/members/locales.ts'
import { PROFILE_NS } from '../locale/profile/locales.ts'
import { RULES_NS } from '../locale/rules/locales.ts'
import { ConnectedGeneralChannelView } from '../remote/ConnectedGeneralChannelView.tsx'
import { ConnectedApprovalsPanel } from '../remote/ConnectedApprovalsPanel.tsx'
import { ConnectedOverviewView } from '../remote/ConnectedOverviewView.tsx'
import { loadCompanySuggestion } from '../overview/company-suggestion.ts'
import type { TeamConnectRemoteWire } from '../team-connect/team-connect-wire.ts'
import { AboutSettingsPanel } from './AboutSettingsPanel.tsx'
import { AppearanceSettingsPanel } from './AppearanceSettingsPanel.tsx'
import { ConnectedPersonasTeamPanel } from '../remote/ConnectedPersonasTeamPanel.tsx'
import { isPlacesNavEnabled } from './nav-flag.ts'
import { createThemeBridge, type ThemeBridge } from '../theme/theme-preference.ts'
import { ConnectedPersonasSettings } from '../settings-personas/ConnectedPersonasSettings.tsx'
import type { PersonaCardShellBridge } from '../remote/persona-card-shell-bridge.ts'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import { HIRE_PERSONA_PROFILE_ID, type MainPanelId, type ShellStoreHandle } from './create-shell-store.ts'
import { createLiveRailTeamObservable } from '../remote/live-rail-bridge.ts'
import { CHAT_NS } from '../locale/chat/locales.ts'
import { GOVERNANCE_NS } from '../locale/governance/locales.ts'
import { activityGroupLabelsFromDict } from '../governance/activity-group-labels.ts'
import { localeBindAsDict } from '../preview/locale-bind.ts'
import { SHELL_NS } from '../locale/shell/locales.ts'
import { ConnectedDirectMessagesView } from '../remote/ConnectedDirectMessagesView.tsx'
import { ConnectedSearchView } from '../remote/ConnectedSearchView.tsx'
import { HELP_NS, HelpPanel, registerHelpLocale } from '../help/register-help.tsx'
import { openPersonaExternalUrl } from './persona-about-host.ts'
import type { RunErrorHandlerContext } from '../chat/run-error-handlers.ts'
import { SEARCH_FOCUS_EVENT } from './nav-groups.ts'

function liveInject(live: PersonaLiveStore): {
  liveStore: PersonaLiveStore
  hooks: { live: PersonaLiveStore['observable'] }
  postChannelMessage(body: string, attachmentIds?: readonly string[], options?: { readonly fanout?: 'everyone' | 'relevant'; readonly opinionFor?: string }): void
  uploadChannelAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  loadTurnContext(ticketId: string): void
  toggleMessageReaction(streamKind: 'channel' | 'dm', eventId: string, stickerId: string): void
} {
  return {
    liveStore: live,
    hooks: { live: live.observable },
    postChannelMessage: (body, attachmentIds, options) => { void live.postChannelMessage(body, attachmentIds, options) },
    uploadChannelAttachment: file => live.uploadChannelAttachment(file),
    loadTurnContext: (ticketId: string) => { void live.loadTurnContext(ticketId) },
    toggleMessageReaction: (streamKind, eventId, stickerId) => {
      void live.toggleMessageReaction(streamKind, eventId, stickerId)
    },
  }
}

function runErrorHandlersFor(live: PersonaLiveStore, shellHandle: ShellStoreHandle): RunErrorHandlerContext {
  return {
    openHelpConnections: () => { shellHandle.actions.openHelp({ docId: 'conexoes', tab: 'guias' }) },
    openEngineForPersona: (personaId) => { shellHandle.actions.openEngineEditor(personaId) },
    selectPanel: (panel) => { shellHandle.actions.selectPanel(panel) },
    swapAccount: () => { shellHandle.actions.selectPanel('connections') },
    retryRun: () => { void live.refresh() },
    resumeWhenQuotaBack: () => { void live.refresh() },
  }
}

/** Register Prism-owned `main` keys (production shell). */
export function registerPrismScreens(
  ctx: Context,
  live: PersonaLiveStore,
  shellHandle: ShellStoreHandle,
  selectPanel?: (panel: 'channels' | 'kanban' | 'approvals') => void,
  personaCard?: PersonaCardShellBridge,
): void {
  registerHelpLocale(ctx)
  const tenantObservable = createLiveTenantObservable(live)
  const shellObservable: HostObservable<ShellState> = {
    getSnapshot: () => shellHandle.store.getSnapshot(),
    subscribe: listener => shellHandle.store.subscribe(listener),
  }
  const remoteInject = (): LumenRemoteInjected => ({
    persona: ctx.remote.persona,
    hooks: { tenant: tenantObservable, shell: shellObservable },
    ...(personaCard?.sendToPersona === undefined
      ? {}
      : { sendToPersona: personaCard.sendToPersona }),
    selectMainPanel: (panel: MainPanelId) => { shellHandle.actions.selectPanel(panel) },
  })

  const turnActivityLabels = activityGroupLabelsFromDict(
    localeBindAsDict((key, params) => ctx.locale.bind(GOVERNANCE_NS)(key as never, params as never)),
  )
  const channelInject = () => ({
    shellT: ctx.locale.bind(SHELL_NS),
    ...liveInject(live),
    openTaskOnBoard: (ticketId: string) => { shellHandle.actions.openKanbanTicket(ticketId) },
    turnActivityLabels,
    onOpenConnections: () => { shellHandle.actions.selectPanel('connections') },
    onOpenUsage: () => { shellHandle.actions.selectPanel('usage') },
    engineRemote: ctx.remote.persona,
    onBuildTeam: () => {
      shellHandle.actions.setProfilePersonaId(HIRE_PERSONA_PROFILE_ID)
      shellHandle.actions.selectPanel('profile')
    },
    onOpenHelp: () => { shellHandle.actions.openHelp({ docId: 'canais', tab: 'guias' }) },
    onOpenApprovals: () => { shellHandle.actions.selectPanel('approvals') },
    // D-090 (TEAM-7): o cartão "Bom dia" leva a Quadros ("e mais n") e a Rotinas ("Pausar o resumo da manhã").
    onOpenBoard: () => { shellHandle.actions.selectPanel('kanban') },
    onOpenRoutines: () => { shellHandle.actions.selectPanel('routines') },
    onOpenApprovalItem: (approvalId: string) => { shellHandle.actions.openApproval(approvalId) },
    // CV-4: clicar no rosto da persona (faixa da equipe) abre a DM com ela.
    onOpenPersonaDm: (personaId: string) => {
      shellHandle.actions.selectPanel('directMessages')
      void live.openPersonaDm(personaId)
    },
    onOpenSearch: () => {
      shellHandle.actions.selectPanel('search')
      window.dispatchEvent(new Event(SEARCH_FOCUS_EVENT))
    },
    runErrorHandlers: runErrorHandlersFor(live, shellHandle),
    ...(personaCard === undefined
      ? {}
      : {
        personaCard,
        openPersonaProfile: (personaId: string) => {
          shellHandle.actions.closePersonaEditor()
          shellHandle.actions.setProfilePersonaId(personaId)
          shellHandle.actions.selectPanel('profile')
        },
      }),
  })

  ctx.slots.register({
    name: 'main',
    key: 'overview',
    locale: SHELL_NS,
    inject: () => ({
      hooks: { live: live.observable },
      navigate: (panel: 'channels' | 'kanban' | 'approvals' | 'team', query?: { focus?: string }) => {
        if (panel === 'approvals' && query?.focus) {
          shellHandle.actions.openApproval(query.focus)
        } else if (panel === 'team') {
          shellHandle.actions.selectPanel('team')
        } else {
          selectPanel?.(panel)
        }
      },
      // "Resumir o dia": o cartão do dia AGORA, sem requestId (idempotente: o do ritual ou de um pedido anterior volta como `already`, sem duplicar).
      ...(live.postDailyBriefNow === undefined ? {} : {
        askDailyBrief: async () => {
          const view = await live.postDailyBriefNow!()
          return { outcome: view.outcome, ...(view.messageId === undefined || view.messageId === '' ? {} : { messageId: view.messageId }) }
        },
      }),
      openAwayTask: (taskId: string) => { shellHandle.actions.openKanbanTicket(taskId) },
      // DESIGN-01 #09 "Pedir a {Coordenação} agora": opens the thread first and sends; a failed send shows up there as "Não enviado · Tentar de novo".
      askCoordination: (text: string) => {
        shellHandle.actions.selectPanel('channels')
        void live.postChannelMessage(text)
      },
      // DESIGN-01 #09: the suggested request comes from the company profile in the Cofre (null = no profile: the block is not drawn).
      loadCompanySuggestion: async () => {
        const tenant = live.observable.getSnapshot().tenant
        return tenant === null ? null : loadCompanySuggestion(ctx.remote.persona, { workspaceId: tenant.workspaceId, projectId: tenant.projectId })
      },
      // Item 13: "Ligar a IA para a equipe toda". The generated client only knows the new methods after the host lib is rebuilt, so the face is typed by what the screen needs.
      teamConnectRemote: ctx.remote.persona as unknown as TeamConnectRemoteWire,
      // Item 19a: "Seus números" talks to the same host Remote (the section only draws when the host has the five calls).
      indicatorsRemote: ctx.remote.persona,
      decideDecision: (decisionId: string, accept: boolean) => { void live.decide?.(decisionId, accept) },
      // IV-10 "Responder": the conversation where the question was asked (the channel, or that DM).
      openConversation: (streamKind: 'channel' | 'dm', ownerId: string) => {
        if (streamKind === 'dm') {
          shellHandle.actions.selectPanel('directMessages')
          void live.selectDm(ownerId)
        } else {
          shellHandle.actions.selectPanel('channels')
        }
      },
      ...(live.dismissWhileAway === undefined ? {} : { dismissAway: () => { void live.dismissWhileAway!() } }),
      ...(live.undoDecision === undefined ? {} : { undoDecision: (decisionId: string) => { void live.undoDecision!(decisionId) } }),
    }),
  }, ConnectedOverviewView)

  ctx.slots.register({
    name: 'main',
    key: 'channels',
    locale: CHAT_NS,
    inject: channelInject,
  }, ConnectedGeneralChannelView)

  // Equipe › Personas (NAV-SPEC; Keel 03:33): com a navegação por lugares (o padrão) a aba é a LISTA de personas; "Membros e convites" fica só em
  // Configurações › Membros (a chave `members`). Com a navegação antiga (flag desligada) o item "Equipe" continua abrindo Membros, como sempre.
  if (isPlacesNavEnabled()) {
    ctx.slots.register({
      name: 'main',
      key: 'team',
      locale: SHELL_NS,
      inject: () => ({
        hooks: { live: live.observable },
        persona: ctx.remote.persona,
        openPersonaProfile: (personaId: string) => {
          shellHandle.actions.closePersonaEditor()
          shellHandle.actions.setProfilePersonaId(personaId)
          shellHandle.actions.selectPanel('profile')
        },
        hirePersona: () => {
          shellHandle.actions.setProfilePersonaId(HIRE_PERSONA_PROFILE_ID)
          shellHandle.actions.selectPanel('profile')
        },
      }),
    }, ConnectedPersonasTeamPanel)
  } else {
    ctx.slots.register({ name: 'main', key: 'team', locale: MEMBERS_NS, inject: remoteInject }, RemoteMembersPanel)
  }

  // Muse (UX-06): Ctrl K / Busca finds every screen and persona even when rail groups are folded.
  const searchT = (key: string, params?: Record<string, string>): string => ctx.locale.bind(SHELL_NS)(key as never, params as never)
  const searchTeam = createLiveRailTeamObservable(live, shellHandle)
  ctx.slots.register({
    name: 'main',
    key: 'search',
    locale: SHELL_NS,
    inject: () => ({
      hooks: { team: searchTeam, live: live.observable },
      navigate: (panel: MainPanelId) => { shellHandle.actions.selectPanel(panel) },
      openPersonaProfile: (personaId: string) => {
        shellHandle.actions.closePersonaEditor()
        shellHandle.actions.setProfilePersonaId(personaId)
        shellHandle.actions.selectPanel('profile')
      },
      liveStore: live,
      // Ctrl K that DOES (T3-UX-HARVEST §2).
      actions: [
        {
          id: 'hire',
          label: searchT('search.action.hire'),
          keywords: ['contratar', 'nova persona', 'hire'],
          icon: 'convidar' as const,
          run: () => {
            shellHandle.actions.setProfilePersonaId(HIRE_PERSONA_PROFILE_ID)
            shellHandle.actions.selectPanel('profile')
          },
        },
        {
          id: 'two-day',
          label: searchT('search.action.twoDay'),
          keywords: ['teste dos 2 dias', 'saude', 'ferias'],
          icon: 'saude' as const,
          run: () => { shellHandle.actions.selectPanel('teamHealth') },
        },
        {
          id: 'help',
          label: searchT('search.action.help'),
          keywords: ['ajuda', 'help', 'guia', 'guias', 'documentacao'],
          icon: 'glossario' as const,
          run: () => { shellHandle.actions.openHelp({ tab: 'guias' }) },
        },
        {
          id: 'release-notes',
          label: searchT('search.action.releaseNotes'),
          keywords: ['novidades', 'versao', 'version', 'release', 'changelog'],
          icon: 'glossario' as const,
          run: () => { shellHandle.actions.openHelp({ tab: 'novidades' }) },
        },
      ],
      personaActions: (persona: { readonly id: string; readonly name: string }) => [
        {
          id: `talk-${persona.id}`,
          label: searchT('search.action.talk', { name: persona.name }),
          icon: 'mensagens-diretas' as const,
          run: () => {
            shellHandle.actions.selectPanel('directMessages')
            void live.openPersonaDm(persona.id)
          },
        },
        {
          id: `teach-${persona.id}`,
          label: searchT('search.action.teach', { name: persona.name }),
          icon: 'ensinar' as const,
          run: () => { shellHandle.actions.openTeachPersona(persona.id) },
        },
      ],
    }),
  }, ConnectedSearchView)

  // `projects` (the grid "Ver todos os projetos") is registered with the board in kanban/register-lumen-ui.tsx: one place, two screens (DESIGN-01 #10).

  ctx.slots.register({
    name: 'main',
    key: 'directMessages',
    locale: CHAT_NS,
    inject: () => ({
      shellT: ctx.locale.bind(SHELL_NS),
      liveStore: live,
      hooks: { live: live.observable },
      selectDm: (dmId: string | null) => { void live.selectDm(dmId) },
      postDmMessage: (body: string, attachmentIds?: readonly string[]) => { void live.postDmMessage(body, attachmentIds) },
      uploadDmAttachment: (file: File) => live.uploadDmAttachment(file),
      loadTurnContext: (ticketId: string) => { void live.loadTurnContext(ticketId) },
      openTaskOnBoard: (ticketId: string) => { shellHandle.actions.openKanbanTicket(ticketId) },
      toggleMessageReaction: (
        streamKind: 'channel' | 'dm',
        eventId: string,
        stickerId: string,
      ) => { void live.toggleMessageReaction(streamKind, eventId, stickerId) },
      startNewConversation: () => { void live.openFirstAvailableDm() },
      turnActivityLabels,
      runErrorHandlers: runErrorHandlersFor(live, shellHandle),
      openTeachPersona: (personaId: string) => { shellHandle.actions.openTeachPersona(personaId) },
      engineRemote: ctx.remote.persona,
      onOpenConnections: () => { shellHandle.actions.selectPanel('connections') },
      // `/contratar` na DM abre o mesmo fluxo do #geral.
      onBuildTeam: () => {
        shellHandle.actions.setProfilePersonaId(HIRE_PERSONA_PROFILE_ID)
        shellHandle.actions.selectPanel('profile')
      },
    }),
  }, ConnectedDirectMessagesView)

  // DECISIONS-SPEC: Aprovações reads the same Decision[] and runs the same cycle as Visão geral (live store).
  ctx.slots.register({
    name: 'main',
    key: 'approvals',
    locale: APPROVALS_NS,
    inject: () => ({
      persona: ctx.remote.persona,
      hooks: { tenant: tenantObservable, shell: shellObservable, live: live.observable },
      decideDecision: (decisionId: string, accept: boolean, choice?: 'once' | 'always' | 'not-now') => live.decide?.(decisionId, accept, choice) ?? Promise.resolve(undefined),
      ...(live.decideActionApproval === undefined ? {} : { decideActionApproval: (decision: Parameters<NonNullable<typeof live.decideActionApproval>>[0]) => live.decideActionApproval!(decision) }),
      ...(live.undoDecision === undefined ? {} : { undoDecision: (decisionId: string) => live.undoDecision!(decisionId) }),
      refreshLive: () => { void live.refresh() },
      clearApprovalFocus: () => { shellHandle.actions.clearFocusedApproval() },
      // The empty inbox's way out: "Ver o que a equipe está fazendo".
      openOverview: () => { shellHandle.actions.selectPanel('overview') },
      // IV-10 "Responder": the conversation where the question was asked (the channel, or that DM).
      openConversation: (streamKind: 'channel' | 'dm', ownerId: string) => {
        if (streamKind === 'dm') {
          shellHandle.actions.selectPanel('directMessages')
          void live.selectDm(ownerId)
        } else {
          shellHandle.actions.selectPanel('channels')
        }
      },
    }),
  }, ConnectedApprovalsPanel)
  ctx.slots.register({ name: 'main', key: 'rules', locale: RULES_NS, inject: remoteInject }, RemoteRulesPanel)
  ctx.slots.register({
    name: 'main',
    key: 'profile',
    locale: PROFILE_NS,
    inject: () => ({
      persona: ctx.remote.persona,
      live,
      openPersonaDm: (personaId: string) => {
        shellHandle.actions.selectPanel('directMessages')
        void live.openPersonaDm(personaId)
      },
      openPersonaEditor: (personaId: string) => { shellHandle.actions.openPersonaEditor(personaId) },
      openTeachPersona: (personaId: string) => { shellHandle.actions.openTeachPersona(personaId) },
      openTalkAclEditor: (personaId: string) => { shellHandle.actions.openTalkAclEditor(personaId) },
      closePersonaEditor: () => { shellHandle.actions.closePersonaEditor() },
      selectMainPanel: (panel: MainPanelId) => { shellHandle.actions.selectPanel(panel) },
      hooks: {
        tenant: tenantObservable,
        shell: {
          getSnapshot: () => shellHandle.store.getSnapshot(),
          subscribe: (listener: () => void) => shellHandle.store.subscribe(listener),
        },
      },
    }),
  }, RemoteProfilePanel)
  ctx.slots.register({ name: 'main', key: 'members', locale: MEMBERS_NS, inject: remoteInject }, RemoteMembersPanel)
  ctx.slots.register({ name: 'main', key: 'about', locale: SHELL_NS }, AboutSettingsPanel)
  // Aparência (TH-1): a ponte com o serviço de tema do host nasce na primeira vez que a tela abre (um só objeto para o painel todo).
  let themeBridge: ThemeBridge | undefined
  ctx.slots.register({
    name: 'main',
    key: 'appearance',
    locale: SHELL_NS,
    inject: () => ({ themeBridge: (themeBridge ??= createThemeBridge(ctx)) }),
  }, AppearanceSettingsPanel)
  ctx.slots.register({
    name: 'main',
    key: 'personas',
    locale: SHELL_NS,
    inject: () => ({
      hooks: { live: live.observable },
      persona: ctx.remote.persona,
      openEngineEditor: (personaId: string) => { shellHandle.actions.openEngineEditor(personaId) },
      refreshLive: () => { void live.refresh() },
    }),
  }, ConnectedPersonasSettings)
  ctx.slots.register({ name: 'main', key: 'importers', locale: IMPORTERS_NS, inject: remoteInject }, RemoteImportPanel)
  ctx.slots.register({ name: 'main', key: 'canvas', locale: CANVAS_NS, inject: remoteInject }, RemoteCanvasPanel)
  ctx.slots.register({ name: 'main', key: 'secondBrain', locale: SECOND_BRAIN_NS, inject: remoteInject }, RemoteSecondBrainPanel)

  ctx.slots.register({
    name: 'main',
    key: 'help',
    locale: HELP_NS,
    inject: () => ({
      hooks: { shell: shellObservable },
      language: ctx.locale.getSnapshot().active,
      askTeam: () => { shellHandle.actions.selectPanel('channels') },
      openExternal: openPersonaExternalUrl,
    }),
  }, HelpPanel)
}
