import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { AwayEventLive, AwayLive, ChannelMessageUi } from './map-host-ui.ts'
import { mapAwayEventLive, mapAwayLive, mapMessage, mapPersonaNowRow, mapSortedMessageStream, mapTeamToStrip, resolveHostPersonaId } from './map-host-ui.ts'
import { readClientDevSeedEnabled } from './persona-dev-seed.ts'
import { bootstrapPersonaTenant, hostReportsFirstUse, type TenantBootstrapRemote } from './bootstrap-tenant.ts'
import { shouldWriteCacheComplete } from './onboarding-host.ts'
import {
  rosterGalleryRefs,
  rosterToHostTeam,
  seedDevHarnessScenario,
  type DevHarnessSeedRemote,
  type OnboardingRosterPerson,
} from './seed-default-team.ts'
import type { CompleteOnboardingRequest } from '@deepseek-ai/dsh-persona-host/types'
import { writeOnboardingCacheComplete } from '../shell/onboarding-persistence.ts'
import { applyMessageStreamFrame, type MessageStreamFrame } from './apply-message-stream.ts'
import { enrichKanbanCardsFromHost } from './map-host-ui.ts'
import type { KanbanCardModel } from '../kanban/types.ts'
import { passThroughFollowers } from './derive-pass-through.ts'
import { mapDmList, type DmListItemUi } from './map-dm-list.ts'
import type { TurnContextUi } from './turn-context-ui.ts'
import type { DmView, FirstDeliveryView, OverviewView as HostOverviewView, PersonaTenantScope, TeamView } from './persona-remote-types.ts'
import type { PersonaNowSnapshot } from '../team/persona-work-state.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { markReviewing } from '../team/persona-reviewing.ts'
import type { AutonomyLevel } from '../persona-editor/persona-draft.ts'
import { patchAutonomyMode } from '../persona-editor/autonomy-map.ts'
import type { AttachmentView } from '@deepseek-ai/dsh-persona-host/types'
import { readFileAsBase64 } from '../chat/read-file-as-base64.ts'
import { unwrapPersonaRemote } from './persona-remote-unwrap.ts'
import type {
  AsideAskView,
  DailyBriefNowView,
  ConversationSubjectScope,
  ConversationSubjectsBundleView,
  GestorPlanView,
  SearchRequest,
  StartTeachSessionRequest,
  StopTeachSessionRequest,
  SubmitTeachDraftRequest,
  TeachDraftView,
  TeachSessionIdRequest,
  TeachSessionStartView,
  TeachSessionView,
  TeachStepView,
} from '@deepseek-ai/dsh-persona-host/types'
import {
  approveGestorPlanRemote,
  listGestorPlansRemote,
  rejectGestorPlanRemote,
  type GestorWire,
} from '../data/gestor-remote.ts'
import { mergeArrivingFlags } from './gestor-arriving.ts'
import { isChannelSectionsEnabled } from '../shell/channel-sections-flag.ts'
import { conversationScopeFromStreamKey, conversationStreamKey } from '../chat/conversation-stream-key.ts'
import { mapConversationSubjectsBundle, type MappedConversationSubjects } from '../chat/map-conversation-subjects.ts'
import { PersonaRemoteError } from './persona-remote-unwrap.ts'
import { mapUsedContextRecord } from './map-used-context.ts'
import { mapTurnActivityFolds, type TurnActivityGroupWire } from './map-turn-activity-folds.ts'
import { mapReplyActivity, type ReplyActivityUi } from './map-reply-activity.ts'
import { randomUuid } from './random-id.ts'
import { attachmentRemoteOf, audioMetaOf, audioObjectUrl, durationFromAttachmentName, resolveAudioAttachment } from '../chat/voice-compose/attachment-audio.ts'
import {
  DEFAULT_CONVERSATION_SUBJECT_ID,
  DEFAULT_CONVERSATION_SUBJECTS,
  type ConversationSubjectUi,
} from '../chat/conversation-subjects.ts'
import {
  DEFAULT_CHANNEL_COMPOSER_HINTS,
  loadChannelComposerHints,
  type ChannelComposerHints,
} from './derive-channel-composer-hints.ts'
import { personaScreensRemote } from '../data/persona-screens-remote.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import {
  DECISION_ACCEPT_EXIT_MS,
  DECISION_DECLINE_EXIT_MS,
  type Decision,
  type DecisionState,
} from '../decisions/decision-types.ts'
import { deriveDecisions, type HostApprovalCard } from '../decisions/derive-decisions.ts'
import { openBlockingTitles } from '../decisions/decision-selectors.ts'
import { withRequesterAvatars } from '../decisions/requester-avatars.ts'
import { withoutUnavailableUndo } from '../decisions/undo-availability.ts'

export type { Decision, DecisionState } from '../decisions/decision-types.ts'

const OPTIONAL_BOOT_REMOTE_MS = 1_500

/** Quanto esperar depois de uma mensagem do stream antes de reler planos e decisões. */
const SIDE_REFRESH_DEBOUNCE_MS = 700

/** Gestor/assuntos must not hang dest:desktop first paint (Atlas splash). */
function settleOptionalRemote<T>(work: () => Promise<T>, fallback: T, ms = OPTIONAL_BOOT_REMOTE_MS): Promise<T> {
  const pending = work().catch(() => fallback)
  return Promise.race([
    pending,
    new Promise<T>((resolve) => { setTimeout(() => resolve(fallback), ms) }),
  ])
}

/** O pedido do passo 5 como o host aceita: sem espaços nas pontas, no máximo 500 caracteres; vazio = não manda. */
export const FIRST_REQUEST_MAX = 500
export function firstRequestForHost(text: string | undefined): string | undefined {
  const trimmed = (text ?? '').trim()
  return trimmed === '' ? undefined : trimmed.slice(0, FIRST_REQUEST_MAX)
}

/** Host list/follow: "Geral" includes messages without `topic_id`. */
function hostStreamTopicId(activeTopicId: string | undefined): string | undefined {
  if (activeTopicId === undefined || activeTopicId === '' || activeTopicId === DEFAULT_CONVERSATION_SUBJECT_ID) {
    return undefined
  }
  return activeTopicId
}

export interface PersonaLiveSnapshot {
  readonly ready: boolean
  /** Item 22 (behind `persona.flag.channelSections`): the channel being read and written; `null`/absent = the tenant's own (#geral), as ever. */
  readonly selectedChannelId?: string | null | undefined
  readonly tenant: PersonaTenantScope | null
  readonly team: TeamView | null
  readonly nowRows: readonly PersonaNowSnapshot[]
  readonly stripMembers: readonly ChannelPersonaMember[]
  readonly awayEvents: readonly AwayEventLive[]
  /** P1-7: the host's real "while you were away" (null = nothing to show or already dismissed). Absent in old snapshots. */
  readonly away?: AwayLive | null | undefined
  readonly attentionTitles: readonly string[]
  readonly messages: readonly ChannelMessageUi[]
  /** `id` = o mesmo id que a faixa da equipe usa para abrir o cartão da persona (A-3). */
  readonly passThroughFollowers: readonly { readonly name: string; readonly id?: string | undefined }[]
  readonly dms: readonly DmListItemUi[]
  readonly selectedDmId: string | null
  readonly dmMessages: readonly ChannelMessageUi[]
  readonly projects: readonly { id: string; name: string; kind: string }[]
  readonly kanbanCards: readonly KanbanCardModel[]
  readonly dmUnreadByPersonaId: Readonly<Record<string, number>>
  /** First actionable task for post-onboarding / overview card (C8). */
  readonly suggestedTask: { readonly id: string; readonly title: string } | null
  readonly turnContext: TurnContextUi | null
  /** COLHEITA §6 (Quill): atividade de cada resposta de persona, por id da mensagem respondida (só as que usaram ferramenta). */
  readonly replyActivity?: Readonly<Record<string, ReplyActivityUi>>
  readonly error: string | null
  readonly gestorPlansById: Readonly<Record<string, GestorPlanView>>
  /** Client UX after "Ajustar" until host RPC `commentGestorPlan` (Anvil). */
  readonly gestorPlanAdjustingIds: Readonly<Record<string, true>>
  /** PRO-4 / T3 §12 — coordination autonomy + official quota gate for #geral composer. */
  readonly channelComposerHints: ChannelComposerHints
  readonly arrivingHostPersonaIds: readonly string[]
  /** #geral assuntos — bolinha W2-3 nos cartões do quadro por projeto. */
  readonly channelSubjects: readonly ConversationSubjectUi[]
  /** First delivery status from host overview (V1-P0-2/4). */
  readonly firstDelivery?: FirstDeliveryView | null | undefined
  /** Single source human decisions across Overview and Approvals (DECISIONS-SPEC). */
  readonly decisions?: readonly Decision[] | undefined
  /**
   * P0-30: mensagens que o host recusou ou que não chegaram. Ficam no fio como "Não enviado · Tentar de novo", nunca
   * como se tivessem sido enviadas. `ownerId` = id do canal ou da DM onde a pessoa escreveu.
   */
  readonly failedSends?: readonly FailedSendUi[] | undefined
}

/** Uma mensagem que não foi enviada (P0-30). */
export interface FailedSendUi {
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly message: ChannelMessageUi
}

const EMPTY: PersonaLiveSnapshot = {
  ready: false,
  tenant: null,
  team: null,
  nowRows: [],
  stripMembers: [],
  awayEvents: [],
  attentionTitles: [],
  messages: [],
  passThroughFollowers: [],
  dms: [],
  selectedDmId: null,
  dmMessages: [],
  projects: [],
  kanbanCards: [],
  dmUnreadByPersonaId: {},
  suggestedTask: null,
  turnContext: null,
  replyActivity: {},
  error: null,
  gestorPlansById: {},
  gestorPlanAdjustingIds: {},
  channelComposerHints: DEFAULT_CHANNEL_COMPOSER_HINTS,
  arrivingHostPersonaIds: [],
  channelSubjects: DEFAULT_CONVERSATION_SUBJECTS,
  firstDelivery: null,
  decisions: [],
}

/** Host-backed snapshot for shell panels (production path). */
/** CV-8: what the person chose for ONE message (only present when they chose; the host ignores it without `Config.fanout`). */
export interface ChannelSendOptions {
  readonly fanout?: 'everyone' | 'relevant'
  /** TEAM-8c: esta mensagem é a opinião da PESSOA sobre um pedido de opinião da equipe (`opinion.requestId`); o host a grava como resposta e NÃO a roteia. */
  readonly opinionFor?: string
}

export interface PersonaLiveStore {
  readonly observable: HostObservable<PersonaLiveSnapshot>
  bootstrap(onFirstUse: (firstUse: boolean) => void): Promise<void>
  runDevHarnessSeedIfEnabled(): Promise<void>
  refresh(): Promise<void>
  /** Test/teardown: abort follow streams and drop onboarding sink. */
  dispose(): void
  postChannelMessage(body: string, attachmentIds?: readonly string[], options?: ChannelSendOptions): Promise<void>
  /** P0-30: tenta de novo uma mensagem marcada "Não enviado" (some do fio se der certo; volta se falhar de novo). */
  retryFailedSend?(messageId: string): Promise<void>
  /** HT-3: "Retomar {persona}" na linha de evento "não começou: persona em pausa" (só chama o que o host expõe; recarrega depois). */
  resumePersona?(personaId: string): Promise<void>
  /** D-084 §3: a saída do pedido de iniciativa (`decideApproval({ kind: 'connector', id, choice })`); recarrega depois. */
  decideInitiativeApproval?(approvalId: string, choice: 'once' | 'always' | 'not-now'): Promise<boolean>
  /** D-084 §3: o Desfazer do Toast de "Sempre permitir" (`revokeConnector` da concessão que o `decideApproval` devolveu; idempotente). */
  undoInitiativeGrant?(approvalId: string): Promise<void>
  /** D-084 / HT-7: "Desfazer" de uma ação que a persona fez direto (`undoPersonaAction({ activityId })`); recarrega depois. */
  undoPersonaAction?(activityId: string): Promise<void>
  /** D-084 / HT-9: a decisão da pessoa sobre o cartão de prévia de ação externa (`decideApproval({ kind: 'action', … })`); recarrega depois. */
  decideActionApproval?(decision: { approvalId: string; choice: 'send' | 'edit' | 'cancel' | 'retry'; edited?: { subject?: string; body?: string }; remember?: boolean }): Promise<void>
  /** IV-6: `/lado` — a pergunta guardada já volta com `status: 'asking'`; nada vai para o fio. */
  openAsideAsk?(personaId: string, subjectId: string, question: string): Promise<AsideAskView>
  /** IV-6: `/resumo` — a persona resume a conversa; lê-se como um `/lado` (`getAsideAsk`). */
  summarizeConversation?(input: { personaId: string; subjectId: string; streamKind: 'channel' | 'dm'; ownerId: string; topicId?: string }): Promise<AsideAskView>
  getAsideAsk?(id: string): Promise<AsideAskView>
  listAsideAsks?(personaId: string, subjectId: string): Promise<readonly AsideAskView[]>
  /**
   * "Resumir o dia" (Visão geral, EQUIPE-REAL §(b) "O resumo a pedido"): posta o cartão do dia AGORA, sem modelo. Sem `requestId` é o cartão do DIA
   * (idempotente: o do ritual da manhã ou o de um pedido anterior volta como `already`, sem duplicar); com `requestId`, um cartão extra próprio.
   * O cartão chega pelo fio normal (`MessageView.dailyBrief`).
   */
  postDailyBriefNow?(requestId?: string): Promise<DailyBriefNowView>
  uploadChannelAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  uploadDmAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  selectDm(dmId: string | null): Promise<void>
  openPersonaDm(personaId: string): Promise<void>
  openFirstAvailableDm(): Promise<void>
  loadTurnContext(ticketId: string): Promise<void>
  /** COLHEITA §6 (Quill): pede a atividade de uma resposta (uma vez por resposta). */
  loadReplyActivity?(subjectId: string): Promise<void>
  /** COLHEITA §14 (Quill): figurinha sozinha no composer (sem turno). */
  sendStickerMessage?(stickerId: string): Promise<void>
  /** COLHEITA-S1 P1-05: o anexo é áudio? (só o tipo; quando a mensagem aparece). */
  isAudioAttachment?(attachmentId: string): Promise<number | null>
  /** COLHEITA-S1 P1-05: os bytes do áudio ao tocar; devolve a URL do objeto (ou null). */
  loadAudioAttachment?(attachmentId: string): Promise<string | null>
  postDmMessage(body: string, attachmentIds?: readonly string[]): Promise<void>
  toggleMessageReaction(
    streamKind: 'channel' | 'dm',
    eventId: string,
    stickerId: string,
  ): Promise<void>
  commitOnboardingRoster(
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
  ): Promise<void>
  completeOnboarding(
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
    options?: { readonly cofreSeed?: string; readonly templateIds?: readonly string[]; readonly firstRequest?: string },
  ): Promise<void>
  searchMessages(query: string, topicId?: string): Promise<readonly { readonly id: string; readonly meta: string; readonly text: string }[]>
  setPersonaAutonomyLevel(personaId: string, level: AutonomyLevel): Promise<void>
  conversationScope(streamKind: 'channel' | 'dm', ownerId: string): ConversationSubjectScope | null
  conversationScopeFromKey(streamKey: string): ConversationSubjectScope | null
  fetchConversationSubjects(
    scope: ConversationSubjectScope,
    options?: { readonly force?: boolean },
  ): Promise<MappedConversationSubjects>
  selectConversationSubject(scope: ConversationSubjectScope, subjectId: string): Promise<MappedConversationSubjects>
  createConversationSubject(scope: ConversationSubjectScope, name: string): Promise<{ readonly bundle: MappedConversationSubjects; readonly createdSubjectId: string }>
  renameConversationSubject(scope: ConversationSubjectScope, subjectId: string, name: string): Promise<MappedConversationSubjects>
  archiveConversationSubject(scope: ConversationSubjectScope, subjectId: string): Promise<MappedConversationSubjects>
  reopenConversationSubject(scope: ConversationSubjectScope, name: string, colorIndex: number): Promise<MappedConversationSubjects>
  moveMessageToSubject(scope: ConversationSubjectScope, eventId: string, subjectId: string): Promise<void>
  startTeachPersona(personaId: string, consentVersion: string, microphone: boolean): Promise<TeachSessionStartView>
  pauseTeachSession(sessionId: string): Promise<TeachSessionView>
  resumeTeachSession(sessionId: string): Promise<TeachSessionView>
  stopTeachSession(
    sessionId: string,
    microphone: boolean,
    transcript?: string,
    frames?: StopTeachSessionRequest['frames'],
  ): Promise<TeachSessionView>
  getTeachSession(sessionId: string): Promise<TeachSessionView>
  getTeachDraft(sessionId: string): Promise<TeachDraftView>
  submitTeachDraft(sessionId: string, steps: readonly TeachStepView[], activate: boolean, skillTitle?: string): Promise<TeachDraftView>
  approveGestorPlan(planId: string): Promise<void>
  rejectGestorPlan(planId: string): Promise<void>
  feedbackGestorPlan(planId: string, body: string): Promise<void>
  /**
   * One decision cycle for every screen (DECISIONS-SPEC Regra 2): `deciding` → host → `accepted`/`declined`
   * (stamp holds 750/400 ms, then the card leaves every list and counter together) or `failed` (back with a retry).
   * Resolves with the final state so a caller can chain extra work (e.g. a remembered permission).
   */
  /** `choice` only for a connector card ("Liberar só desta vez" / "Sempre permitir" / "Agora não"); `accept` is then derived from it. */
  decide?(decisionId: string, accept: boolean, choice?: 'once' | 'always' | 'not-now'): Promise<DecisionState | undefined>
  /** Undo a reversible decision (only wired when the host offers `undoApproval`). */
  undoDecision?(decisionId: string): Promise<void>
  /** P1-7: "Entendi" on "Enquanto você estava fora" (hides this window; the host starts the next one). */
  dismissWhileAway?(): Promise<void>
}

type PersonaRemote = Omit<TenantBootstrapRemote, 'listProjects'> & {
  ping(): unknown
  getOverviewNow(request: PersonaTenantScope): { personas: readonly import('./persona-remote-types.ts').PersonaNowView[] }
  getWhileAway(request: PersonaTenantScope): import('./persona-remote-types.ts').WhileAwayView
  /** The person saw it: the host starts the next window now. Absent on an older host. */
  dismissWhileAway?(request: PersonaTenantScope): unknown
  getOverview(request: PersonaTenantScope): HostOverviewView
  listTeam(request: { readonly workspaceId: string; readonly projectId: string }): TeamView
  listProjects(request: PersonaTenantScope): readonly { id: string; name: string; kind: string }[]
  listTasks(request: PersonaTenantScope): readonly import('./persona-remote-types.ts').TaskView[]
  listApprovals?(request: PersonaTenantScope): readonly HostApprovalCard[]
  listDailySummaries?(request: PersonaTenantScope): readonly import('@deepseek-ai/dsh-persona-host/types').DailySummaryView[]
  decideApproval?(request: {
    readonly workspaceId: string
    readonly projectId: string
    readonly id: string
    readonly kind: 'hire' | 'vault' | 'skill' | 'attention' | 'connector' | 'action'
    readonly accept: boolean
    /** Connector cards only (contracts/team-real.md §9). */
    readonly choice?: 'once' | 'always' | 'not-now'
  }): unknown
  /** Takes back a permanent connector grant (the "Desfazer" of "Sempre permitir"). */
  revokeConnector?(request: { readonly workspaceId: string; readonly projectId: string; readonly personaId: string; readonly cli: string; readonly connectorId: string }): unknown
  /** Optional host undo for decisions the host marks `reversible` (DECISIONS-SPEC Regra 2). */
  undoApproval?(request: {
    readonly workspaceId: string
    readonly projectId: string
    readonly id: string
  }): unknown
  listDms?(request: PersonaTenantScope): readonly DmView[]
  createDm?(request: {
    id: string
    workspaceId: string
    projectId: string
    participantA: string
    participantB: string
  }): unknown
  listMessages(request: {
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    actorId: string
    afterSeq: number
    limit: number
    topicId?: string
  }): { events: readonly import('./persona-remote-types.ts').MessageView[] }
  followMessages?(
    request: {
      workspaceId: string
      projectId: string
      streamKind: 'channel' | 'dm'
      ownerId: string
      actorId: string
      afterSeq: number
      limit: number
      topicId?: string
    },
    signal: AbortSignal,
  ): AsyncIterable<MessageStreamFrame>
  postMessage(request: {
    id: string
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    actorId: string
    subjectId: string
    body: string
    attachmentIds?: readonly string[]
    topicId?: string
    /** CV-8: send this one message to the whole team or to whoever the Coordenação picks (host flag `fanout`). */
    fanout?: 'everyone' | 'relevant'
    /** TEAM-8c: a opinião da pessoa sobre o pedido `requestId` (Anvil: volta como `MessageView.opinion` kind `reply`; nenhuma Tarefa nasce). */
    opinionOn?: { requestId: string }
  }): unknown
  listConversationSubjects?(scope: ConversationSubjectScope): ConversationSubjectsBundleView
  setActiveConversationSubject?(scope: ConversationSubjectScope & { subjectId: string }): ConversationSubjectsBundleView
  createConversationSubject?(scope: ConversationSubjectScope & { name: string; colorIndex?: number }): ConversationSubjectsBundleView
  renameConversationSubject?(scope: ConversationSubjectScope & { subjectId: string; name: string }): ConversationSubjectsBundleView
  archiveConversationSubject?(scope: ConversationSubjectScope & { subjectId: string }): ConversationSubjectsBundleView
  moveMessageToSubject?(scope: ConversationSubjectScope & { eventId: string; subjectId: string }): boolean
  /** IV-6 (contracts/aside.md): `/lado` e `/resumo` respondem fora do fio e da Tarefa; o estado sai de `asking` por `getAsideAsk`. */
  openAsideAsk?(request: { workspaceId: string; projectId: string; personaId: string; subjectId: string; question: string }): AsideAskView | Promise<AsideAskView>
  getAsideAsk?(request: { workspaceId: string; projectId: string; id: string }): AsideAskView | Promise<AsideAskView>
  listAsideAsks?(request: { workspaceId: string; projectId: string; personaId: string; subjectId: string }): readonly AsideAskView[] | Promise<readonly AsideAskView[]>
  summarizeConversation?(request: {
    workspaceId: string
    projectId: string
    personaId: string
    subjectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    topicId?: string
  }): AsideAskView | Promise<AsideAskView>
  postDailyBriefNow?(request: { workspaceId: string; projectId: string; requestId?: string }): DailyBriefNowView | Promise<DailyBriefNowView>
  startTeachSession?(request: StartTeachSessionRequest): TeachSessionStartView
  pauseTeachSession?(request: TeachSessionIdRequest): TeachSessionView
  resumeTeachSession?(request: TeachSessionIdRequest): TeachSessionView
  stopTeachSession?(request: StopTeachSessionRequest): TeachSessionView | Promise<TeachSessionView>
  getTeachSession?(request: TeachSessionIdRequest): TeachSessionView
  getTeachDraft?(request: TeachSessionIdRequest): TeachDraftView
  submitTeachDraft?(request: SubmitTeachDraftRequest): TeachDraftView
  attachFile?(request: {
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    name: string
    bytesBase64: string
  }): AttachmentView
  reactToMessage?(request: {
    workspaceId: string
    projectId: string
    eventId: string
    stickerId: string
  }): import('./persona-remote-types.ts').MessageView
  sendSticker?(request: {
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    id: string
    stickerId: string
    actorId?: string | undefined
    topicId?: string | undefined
    subjectId?: string | undefined
  }): import('./persona-remote-types.ts').MessageView
  unreactToMessage?(request: {
    workspaceId: string
    projectId: string
    eventId: string
    stickerId: string
  }): import('./persona-remote-types.ts').MessageView
  createPersona(request: {
    workspaceId: string
    projectId: string
    id: string
    name: string
    title: string
    description: string
    personality: string
    instructions: string
    avatarKind: 'gallery'
    avatarRef: string
    runnerKind: 'dsh'
    runnerCli: string
    runnerModel: string
    canRecruit: boolean
    createdBy: string
    systemRoles?: readonly ('coordination' | 'watchdog')[]
  }): unknown
  markVisit(request: PersonaTenantScope): boolean
  createMember(request: {
    id: string
    workspaceId: string
    projectId: string
    displayName: string
    handle: string
    role: 'owner'
  }): unknown
  getTurnContext?(request: {
    workspaceId: string
    projectId: string
    ticketId: string
    command: 'stop'
    reason: string
  }): {
    ticketId: string
    title: string
    triggerIds: readonly string[]
    records: readonly import('@deepseek-ai/dsh-persona-host/types').UsedContextRecord[]
  }
  listTurnActivity?(request: {
    workspaceId: string
    projectId: string
    subjectId: string
    personaId?: string
  }):
    | readonly import('@deepseek-ai/dsh-persona-host/types').ActivityGroupView[]
    | Promise<readonly import('@deepseek-ai/dsh-persona-host/types').ActivityGroupView[]>
  getAutonomy?(request: {
    workspaceId: string
    projectId: string
    personaId: string
  }): {
    workspaceId: string
    projectId: string
    personaId: string
    mode: 'asked' | 'propose' | 'act'
    proposalBudget: number
    tokenBudget: number
    executionBudget: number
    silenceStart: string
    silenceEnd: string
  }
  setAutonomy?(request: {
    workspaceId: string
    projectId: string
    personaId: string
    mode: 'asked' | 'propose' | 'act'
    proposalBudget: number
    tokenBudget: number
    executionBudget: number
    silenceStart: string
    silenceEnd: string
  }): {
    workspaceId: string
    projectId: string
    personaId: string
    mode: 'asked' | 'propose' | 'act'
    proposalBudget: number
    tokenBudget: number
    executionBudget: number
    silenceStart: string
    silenceEnd: string
  }
  completeOnboarding?(request: CompleteOnboardingRequest): unknown
  search?(request: SearchRequest): { readonly id: string; readonly body: string; readonly streamId: string; readonly actorId: string; readonly occurredAt: string }[]
}

function formatSearchTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function slugId(name: string, index: number): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'persona'
  return `${base}-${index}`
}

export function createPersonaLiveStore(rawRemote: PersonaRemote): PersonaLiveStore {
  // Unwrap policy (Keel P0): `unwrapPersonaRemote` is the only unwrap for refresh/RPC/seed on `remote`.
  // Bootstrap uses `rawRemote` (wire RemoteResult) + `unwrapRemote` inside bootstrap-tenant.ts — never both on the same call path.
  const remote = unwrapPersonaRemote(rawRemote)
  const bootstrapWire = rawRemote as unknown as TenantBootstrapRemote
  const store = createSnapshotStore<PersonaLiveSnapshot>(EMPTY)
  /** Item 22: the channel being read and written. Without the flag (or with none chosen) it is the tenant's own, exactly as before. */
  const channelOf = (scope: { readonly channelId: string }): string =>
    (isChannelSectionsEnabled() ? store.getSnapshot().selectedChannelId : null) ?? scope.channelId
  let tenant: PersonaTenantScope | null = null
  let hostOnboardingSink: ((firstUse: boolean) => void) | null = null
  let messageStreamAbort: AbortController | null = null
  let dmStreamAbort: AbortController | null = null
  const streamTopicKey = conversationStreamKey
  const activeTopicByStream = new Map<string, string>()
  const subjectsCache = new Map<string, MappedConversationSubjects>()
  const subjectsInflight = new Map<string, Promise<MappedConversationSubjects>>()
  let arrivingUntil: Record<string, number> = {}
  const decisionStates = new Map<string, DecisionState>()
  /** Decisions the host confirmed (id → ms): a refresh that STARTED before that moment may carry the old list. */
  const settledDecisions = new Map<string, number>()
  const decisionTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const activeArrivingIds = (nowMs: number = Date.now()): Set<string> => {
    const ids = new Set<string>()
    for (const [id, until] of Object.entries(arrivingUntil)) {
      if (until > nowMs) ids.add(id)
      else delete arrivingUntil[id]
    }
    return ids
  }

  const markPersonasArriving = (personaIds: readonly string[]): void => {
    const merged = mergeArrivingFlags(personaIds, arrivingUntil)
    arrivingUntil = { ...merged.untilById }
  }

  /** Re-read `getOnboarding.firstUse` after refresh/seed (localStorage is first-paint only). */
  const publishHostOnboardingState = async (): Promise<void> => {
    if (tenant === null || hostOnboardingSink === null) return
    try {
      const firstUse = await hostReportsFirstUse(bootstrapWire, tenant)
      if (shouldWriteCacheComplete(firstUse)) writeOnboardingCacheComplete()
      hostOnboardingSink(firstUse)
    } catch {
      /* keep overlay state */
    }
  }

  const stopMessageStream = (): void => {
    messageStreamAbort?.abort()
    messageStreamAbort = null
  }

  const stopDmStream = (): void => {
    dmStreamAbort?.abort()
    dmStreamAbort = null
  }

  /**
   * A mensagem chega pelo stream, mas planos do Gestor e propostas de aprovação só vêm no `refresh`.
   * Sem isto o cartão do plano e a decisão nova só apareciam depois de F5 (Gauge, SB-7/GES-6).
   * Junta várias mensagens seguidas numa leitura só.
   */
  let sideRefreshTimer: ReturnType<typeof setTimeout> | undefined
  let sideRefreshRunning = false
  let sideRefreshAgain = false
  const scheduleSideRefresh = (): void => {
    if (sideRefreshRunning) { sideRefreshAgain = true; return }
    if (sideRefreshTimer !== undefined) return
    sideRefreshTimer = setTimeout(() => {
      sideRefreshTimer = undefined
      sideRefreshRunning = true
      void refresh().finally(() => {
        sideRefreshRunning = false
        if (sideRefreshAgain) { sideRefreshAgain = false; scheduleSideRefresh() }
      })
    }, SIDE_REFRESH_DEBOUNCE_MS)
  }

  const followStream = (
    streamKind: 'channel' | 'dm',
    ownerId: string,
    apply: (snap: PersonaLiveSnapshot, frame: MessageStreamFrame) => PersonaLiveSnapshot,
    setAbort: (ac: AbortController | null) => void,
  ): void => {
    if (tenant === null || remote.followMessages === undefined) return
    const scope = tenant
    const ac = new AbortController()
    setAbort(ac)
    void (async () => {
      try {
        const wireTopicId = hostStreamTopicId(activeTopicByStream.get(streamTopicKey(streamKind, ownerId)))
        const stream = remote.followMessages!({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          streamKind,
          ownerId,
          actorId: scope.memberId,
          afterSeq: 0,
          limit: 200,
          ...(wireTopicId === undefined ? {} : { topicId: wireTopicId }),
        }, ac.signal)
        for await (const frame of stream) {
          if (ac.signal.aborted) break
          const snap = store.getSnapshot()
          if (snap.team === null) continue
          store.set(apply(snap, frame))
          if (frame.kind !== 'baseline' && frame.events.length > 0) scheduleSideRefresh()
        }
      } catch {
        /* stream closed */
      }
    })()
  }

  const startMessageStream = (): void => {
    stopMessageStream()
    if (tenant === null) return
    const memberId = tenant.memberId
    followStream('channel', channelOf(tenant), (snap, frame) => {
      if (snap.team === null) return snap
      const taskTitleById = new Map(snap.kanbanCards.map(card => [card.id, card.title]))
      return {
        ...snap,
        messages: applyMessageStreamFrame(snap.messages, frame, snap.team, memberId, taskTitleById),
      }
    }, (ac) => { messageStreamAbort = ac })
  }

  const startDmStream = (dmId: string): void => {
    stopDmStream()
    if (tenant === null) return
    const memberId = tenant.memberId
    followStream('dm', dmId, (snap, frame) => {
      if (snap.team === null) return snap
      const taskTitleById = new Map(snap.kanbanCards.map(card => [card.id, card.title]))
      return {
        ...snap,
        dmMessages: applyMessageStreamFrame(snap.dmMessages, frame, snap.team, memberId, taskTitleById),
      }
    }, (ac) => { dmStreamAbort = ac })
  }

  const refresh = async (): Promise<void> => {
    if (tenant === null) return
    const refreshStartedAt = Date.now()
    try {
      const scope = tenant
      const prior = store.getSnapshot()
      const channelWireTopicId = hostStreamTopicId(activeTopicByStream.get(streamTopicKey('channel', channelOf(scope))))
      const [now, away, overview, team, projects, tasks, page, dmRows] = await Promise.all([
        Promise.resolve(remote.getOverviewNow(scope)),
        Promise.resolve(remote.getWhileAway(scope)),
        Promise.resolve(remote.getOverview(scope)),
        Promise.resolve(remote.listTeam({ workspaceId: scope.workspaceId, projectId: scope.projectId })),
        Promise.resolve(remote.listProjects(scope)),
        Promise.resolve(remote.listTasks(scope)),
        Promise.resolve(remote.listMessages({
          ...scope,
          streamKind: 'channel',
          ownerId: channelOf(scope),
          actorId: scope.memberId,
          afterSeq: 0,
          limit: 200,
          ...(channelWireTopicId === undefined ? {} : { topicId: channelWireTopicId }),
        })),
        remote.listDms !== undefined
          ? Promise.resolve(remote.listDms(scope))
          : Promise.resolve([] as readonly DmView[]),
      ])
      const nowRows = now.personas.map(row => mapPersonaNowRow(row, team))
      let gestorPlans: readonly GestorPlanView[] = []
      try {
        gestorPlans = await settleOptionalRemote(
          () => listGestorPlansRemote(remote as unknown as GestorWire, scope.workspaceId),
          [],
        )
      } catch (gestorError) {
        const detail = gestorError instanceof Error ? gestorError.message : String(gestorError)
        if (detail !== 'unknown' && !/not supported|unavailable|gestor-not-supported/i.test(detail)) {
          console.error('[persona] listGestorPlans falhou (refresh continua)', gestorError)
        }
      }
      const gestorPlansById: Record<string, GestorPlanView> = {}
      for (const plan of gestorPlans) gestorPlansById[plan.id] = plan
      const gestorPlanAdjustingIds = { ...prior.gestorPlanAdjustingIds }
      for (const planId of Object.keys(gestorPlanAdjustingIds)) {
        const plan = gestorPlansById[planId]
        if (plan === undefined || plan.status !== 'proposed') delete gestorPlanAdjustingIds[planId]
      }
      const screens = personaScreensRemote(remote as unknown as PersonaRemoteClient)
      const channelComposerHints = await loadChannelComposerHints(
        {
          ...(remote.getAutonomy === undefined
            ? {}
            : { getAutonomy: request => Promise.resolve(remote.getAutonomy!(request)) }),
          getOfficialQuota: async request => unwrapRemote(await screens.getOfficialQuota(request)),
        },
        scope,
        team,
      )
      const arrivingIds = activeArrivingIds()
      const arrivingHostPersonaIds = [...arrivingIds]
      const stripMembers = mapTeamToStrip(team, now.personas, arrivingIds)
      const awayEvents = away.events.map(mapAwayEventLive)
      const awayLive = mapAwayLive(away, team)
      const [rawApprovals, rawSummaries] = await Promise.all([
        remote.listApprovals !== undefined
          ? Promise.resolve(remote.listApprovals(scope))
          : Promise.resolve([] as readonly HostApprovalCard[]),
        remote.listDailySummaries !== undefined
          ? settleOptionalRemote(() => Promise.resolve(remote.listDailySummaries!(scope)), [])
          : Promise.resolve([]),
      ])
      // A confirmation newer than this refresh means its list may be the old one: keep those cards out. Older ones are
      // already in the host's answer, so their marker can go.
      const staleIds = new Set<string>()
      for (const [id, settledAt] of settledDecisions) {
        if (settledAt >= refreshStartedAt) staleIds.add(id)
        else settledDecisions.delete(id)
      }
      const decisions = withoutUnavailableUndo(
        withRequesterAvatars(
          deriveDecisions({
            needsYou: overview.needsYou,
            approvals: rawApprovals,
            dailySummaries: rawSummaries,
            statesById: decisionStates,
            settledIds: staleIds,
          }),
          team.personas,
        ),
        remote.undoApproval !== undefined,
      )
      // One list, one count: what blocks the team is derived from the same Decision[] every screen reads.
      const attentionTitles = openBlockingTitles(decisions)
      const taskTitleById = new Map(tasks.map(task => [task.id, task.title]))
      const suggestedPick = overview.inProgress[0] ?? overview.needsYou[0] ?? null
      const suggestedTask = suggestedPick !== null
        ? { id: suggestedPick.id, title: suggestedPick.title }
        : null
      const messages = mapSortedMessageStream(page.events, team, scope.memberId, taskTitleById)
      const dms = mapDmList(dmRows, team, scope.memberId)
      let dmMessages = prior.dmMessages
      const selectedDmId = prior.selectedDmId
      if (selectedDmId !== null) {
        const dmWireTopicId = hostStreamTopicId(activeTopicByStream.get(streamTopicKey('dm', selectedDmId)))
        const dmPage = await Promise.resolve(remote.listMessages({
          ...scope,
          streamKind: 'dm',
          ownerId: selectedDmId,
          actorId: scope.memberId,
          afterSeq: 0,
          limit: 200,
          ...(dmWireTopicId === undefined ? {} : { topicId: dmWireTopicId }),
        }))
        dmMessages = mapSortedMessageStream(dmPage.events, team, scope.memberId, taskTitleById)
      }
      let channelSubjects: ConversationSubjectUi[] = [...DEFAULT_CONVERSATION_SUBJECTS]
      if (remote.listConversationSubjects !== undefined) {
        try {
          const bundle = await settleOptionalRemote(
            () => Promise.resolve(remote.listConversationSubjects!({
              workspaceId: scope.workspaceId,
              projectId: scope.projectId,
              streamKind: 'channel',
              ownerId: channelOf(scope),
            })),
            null,
          )
          if (bundle !== null) channelSubjects = [...mapConversationSubjectsBundle(bundle).subjects]
        } catch {
          /* assuntos opcionais para bolinha no quadro */
        }
      }
      const dmUnreadByPersonaId: Record<string, number> = {}
      for (const dm of dmRows) {
        const peerId = dm.participantA === scope.memberId ? dm.participantB : dm.participantA
        if (selectedDmId === dm.id) {
          dmUnreadByPersonaId[peerId] = 0
          continue
        }
        try {
          const dmPage = await Promise.resolve(remote.listMessages({
            ...scope,
            streamKind: 'dm',
            ownerId: dm.id,
            actorId: scope.memberId,
            afterSeq: 0,
            limit: 80,
          }))
          const count = dmPage.events.filter(event => event.actorId === peerId).length
          if (count > 0) dmUnreadByPersonaId[peerId] = Math.min(99, count)
        } catch {
          /* unread best-effort */
        }
      }
      const kanbanCardsNow = enrichKanbanCardsFromHost(tasks, projects, nowRows, channelSubjects)
      const reviewingFlagged = markReviewing(nowRows, stripMembers, kanbanCardsNow)
      store.set({
        ready: true,
        tenant,
        team,
        // "Revisando" is read from the board once, so the stage, "Agora" and the rail agree (team/persona-reviewing.ts).
        nowRows: reviewingFlagged.rows,
        stripMembers: reviewingFlagged.members,
        awayEvents,
        // The same window stays hidden after "Entendi" until the host starts a new one (its `since` changes).
        away: awayHiddenSince === awayLive.since || (awayLive.done.length === 0 && awayLive.waiting.length === 0) ? null : awayLive,
        attentionTitles,
        decisions,
        messages,
        passThroughFollowers: passThroughFollowers(nowRows),
        dms,
        selectedDmId,
        dmMessages,
        projects,
        kanbanCards: kanbanCardsNow,
        dmUnreadByPersonaId,
        suggestedTask,
        turnContext: prior.turnContext,
        error: null,
        gestorPlansById,
        gestorPlanAdjustingIds,
        channelComposerHints,
        arrivingHostPersonaIds,
        channelSubjects,
        firstDelivery: overview.firstDelivery ?? null,
      })
      await publishHostOnboardingState()
    } catch (error) {
      console.error('[persona] refresh falhou', error)
      const prior = store.getSnapshot()
      if (tenant !== null) {
        store.set({
          ...prior,
          ready: true,
          tenant,
          team: prior.team ?? { personas: [], members: [] },
          error: null,
        })
      } else {
        store.set({
          ...prior,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  const bootstrap = async (onFirstUse: (firstUse: boolean) => void): Promise<void> => {
    hostOnboardingSink = onFirstUse
    try {
      tenant = await bootstrapPersonaTenant(bootstrapWire)
      // dest:desktop splash/onboarding must not wait on Gestor/assuntos (Atlas 04/11).
      await publishHostOnboardingState()
      await refresh()
      if (tenant !== null && readClientDevSeedEnabled()) {
        let seeded = false
        try {
          seeded = await seedDevHarnessScenario(remote as unknown as DevHarnessSeedRemote, tenant)
        } catch (seedError) {
          console.error('[persona] dev seed falhou no bootstrap', seedError)
        }
        console.info('[persona] dev seed', { tenant, seeded, devSeedFlag: true })
        if (seeded) await refresh()
      }
      await publishHostOnboardingState()
      startMessageStream()
      if (tenant !== null) {
        try {
          void Promise.resolve(remote.markVisit(tenant)).catch(() => undefined)
        } catch {
          /* visit marker best-effort */
        }
      }
    } catch (error) {
      console.error('[persona] bootstrap do live store falhou', error)
      tenant = null
      store.set({
        ...EMPTY,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  const attachStreamFile = async (
    streamKind: 'channel' | 'dm',
    ownerId: string,
    file: File,
  ): Promise<{ id: string; name: string }> => {
    if (tenant === null || remote.attachFile === undefined) throw new Error('attachments-unavailable')
    const bytesBase64 = await readFileAsBase64(file)
    const view = await Promise.resolve(remote.attachFile({
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      streamKind,
      ownerId,
      name: file.name,
      bytesBase64,
    }))
    return { id: view.id, name: view.name }
  }

  const uploadChannelAttachment = async (file: File): Promise<{ id: string; name: string }> => {
    if (tenant === null) throw new Error('no-tenant')
    return attachStreamFile('channel', channelOf(tenant), file)
  }

  const uploadDmAttachment = async (file: File): Promise<{ id: string; name: string }> => {
    const dmId = store.getSnapshot().selectedDmId
    if (dmId === null) throw new Error('no-dm')
    return attachStreamFile('dm', dmId, file)
  }

  const postChannelMessage = async (body: string, attachmentIds: readonly string[] = [], options: ChannelSendOptions = {}): Promise<void> => {
    if (tenant === null) return
    const trimmed = body.trim()
    if (trimmed.length === 0 && attachmentIds.length === 0) return
    const scope = tenant
    const snap = store.getSnapshot()
    const optimisticId = `local-${Date.now()}`
    const timeLabel = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const optimistic: ChannelMessageUi = {
      id: optimisticId,
      authorId: 'user',
      authorName: 'Você',
      body: trimmed,
      timeLabel,
      reactions: [],
    }
    store.set({ ...snap, messages: [...snap.messages, optimistic] })
    const topicId = activeTopicByStream.get(streamTopicKey('channel', channelOf(scope)))
    try {
      await Promise.resolve(remote.postMessage({
        id: `msg-${Date.now()}`,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        streamKind: 'channel',
        ownerId: channelOf(scope),
        actorId: scope.memberId,
        subjectId: scope.memberId,
        body: trimmed,
        attachmentIds: [...attachmentIds],
        ...(topicId === undefined || topicId === '' ? {} : { topicId }),
        ...(options.fanout === undefined ? {} : { fanout: options.fanout }),
        ...(options.opinionFor === undefined ? {} : { opinionOn: { requestId: options.opinionFor } }),
      }))
    } catch {
      // P0-30: o host não recebeu. A mensagem não fica no fio como se tivesse sido enviada: vira "Não enviado · Tentar de novo".
      markSendFailed('channel', channelOf(scope), optimistic, attachmentIds, options.fanout, options.opinionFor)
      return
    }
    await refresh()
  }

  /** P0-30: guarda o que não foi enviado (com os anexos, para tentar de novo) e tira a mensagem otimista do fio normal. */
  const failedSendAttachments = new Map<string, readonly string[]>()
  /** CV-8: a retry goes to the same audience the person chose (they already confirmed it). */
  const failedSendFanout = new Map<string, 'everyone' | 'relevant'>()
  /** TEAM-8c: a retry of a person's opinion goes to the same request. */
  const failedSendOpinion = new Map<string, string>()
  const markSendFailed = (
    streamKind: 'channel' | 'dm',
    ownerId: string,
    optimistic: ChannelMessageUi,
    attachmentIds: readonly string[],
    fanout?: 'everyone' | 'relevant',
    opinionFor?: string,
  ): void => {
    failedSendAttachments.set(optimistic.id, attachmentIds)
    if (fanout !== undefined) failedSendFanout.set(optimistic.id, fanout)
    if (opinionFor !== undefined) failedSendOpinion.set(optimistic.id, opinionFor)
    const snap = store.getSnapshot()
    store.set({
      ...snap,
      ...(streamKind === 'channel' ? { messages: snap.messages.filter(row => row.id !== optimistic.id) } : {}),
      ...(streamKind === 'dm' ? { dmMessages: snap.dmMessages.filter(row => row.id !== optimistic.id) } : {}),
      failedSends: [...(snap.failedSends ?? []), { streamKind, ownerId, message: { ...optimistic, sendFailed: true } }],
    })
  }

  const selectDm = async (dmId: string | null): Promise<void> => {
    if (tenant === null) return
    if (dmId === null) {
      stopDmStream()
      store.set({ ...store.getSnapshot(), selectedDmId: null, dmMessages: [] })
      return
    }
    const scope = tenant
    const team = store.getSnapshot().team
    if (team === null) return
    const subjectScope = conversationScope('dm', dmId)
    if (subjectScope !== null) {
      await fetchConversationSubjects(subjectScope)
    }
    const dmWireTopicId = hostStreamTopicId(activeTopicByStream.get(streamTopicKey('dm', dmId)))
    const page = await Promise.resolve(remote.listMessages({
      ...scope,
      streamKind: 'dm',
      ownerId: dmId,
      actorId: scope.memberId,
      afterSeq: 0,
      limit: 200,
      ...(dmWireTopicId === undefined ? {} : { topicId: dmWireTopicId }),
    }))
    const snap = store.getSnapshot()
    const taskTitleById = new Map(snap.kanbanCards.map(card => [card.id, card.title]))
    const dmMessages = mapSortedMessageStream(page.events, team, scope.memberId, taskTitleById)
    const peerId = store.getSnapshot().dms.find(row => row.id === dmId)?.peerId
    const nextUnread = { ...store.getSnapshot().dmUnreadByPersonaId }
    if (peerId !== undefined) nextUnread[peerId] = 0
    store.set({
      ...store.getSnapshot(),
      selectedDmId: dmId,
      dmMessages,
      dmUnreadByPersonaId: nextUnread,
    })
    startDmStream(dmId)
  }

  // COLHEITA §6 (Quill): a atividade de UMA resposta de persona (turno de conversa; `subjectId` = id da mensagem respondida).
  // Pede uma vez por resposta. Turno sem ferramenta não guarda nada: sem resumo.
  const replyActivityAsked = new Set<string>()
  const loadReplyActivity = async (subjectId: string): Promise<void> => {
    if (tenant === null || remote.listTurnActivity === undefined) return
    if (replyActivityAsked.has(subjectId)) return
    replyActivityAsked.add(subjectId)
    let groups: readonly import('@deepseek-ai/dsh-persona-host/types').ActivityGroupView[] = []
    try {
      groups = await Promise.resolve(remote.listTurnActivity({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, subjectId }))
    } catch {
      replyActivityAsked.delete(subjectId)
      return
    }
    const mapped = mapReplyActivity(groups.map(group => ({
      moreCount: group.moreCount,
      items: group.items.map(item => ({ id: item.id, kind: item.kind, title: item.title, status: item.status, at: item.at })),
    })))
    if (mapped === undefined) return
    const current = store.getSnapshot()
    store.set({ ...current, replyActivity: { ...current.replyActivity, [subjectId]: mapped } })
  }

  const loadTurnContext = async (ticketId: string): Promise<void> => {
    if (tenant === null || remote.getTurnContext === undefined) return
    try {
      const scope = {
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
      }
      const rowPromise = Promise.resolve(remote.getTurnContext({
        ...scope,
        ticketId,
        command: 'stop',
        reason: '',
      }))
      const foldsPromise = remote.listTurnActivity === undefined
        ? Promise.resolve([] as readonly TurnActivityGroupWire[])
        : Promise.resolve(remote.listTurnActivity({ ...scope, subjectId: ticketId })).then(raw => raw.map(fold => ({
          personaId: fold.personaId,
          moreCount: fold.moreCount,
          items: fold.items.map(item => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            status: item.status,
            ...(item.at === undefined ? {} : { at: item.at }),
          })),
        })))
      const [row, wireFolds] = await Promise.all([rowPromise, foldsPromise])
      const team = store.getSnapshot().team
      const activityFolds = mapTurnActivityFolds(wireFolds, team)
      store.set({
        ...store.getSnapshot(),
        turnContext: {
          ticketId: row.ticketId,
          title: row.title,
          triggerIds: [...row.triggerIds],
          records: row.records.map(mapUsedContextRecord),
          ...(activityFolds.length === 0 ? {} : { activityFolds }),
        },
      })
    } catch {
      store.set({ ...store.getSnapshot(), turnContext: null })
    }
  }

  const openPersonaDm = async (personaId: string): Promise<void> => {
    if (tenant === null) return
    const snap = store.getSnapshot()
    const hostPersonaId = resolveHostPersonaId(snap.team, personaId)
    let dm = snap.dms.find(row => row.peerId === hostPersonaId)
    if (dm === undefined && remote.createDm !== undefined) {
      const dmId = `dm-${hostPersonaId}`.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 48)
      try {
        await Promise.resolve(remote.createDm({
          id: dmId,
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          participantA: tenant.memberId,
          participantB: hostPersonaId,
        }))
      } catch {
        /* existing dm */
      }
      await refresh()
      dm = store.getSnapshot().dms.find(row => row.peerId === hostPersonaId)
    }
    if (dm !== undefined) await selectDm(dm.id)
  }

  const openFirstAvailableDm = async (): Promise<void> => {
    const peer = store.getSnapshot().stripMembers.find(m => !m.systemRoles?.includes('coordination'))
    if (peer === undefined) return
    await openPersonaDm(peer.id)
  }

  const patchMessageReactions = (
    streamKind: 'channel' | 'dm',
    eventId: string,
    team: TeamView,
    memberId: string,
    taskTitleById: ReadonlyMap<string, string>,
    view: import('./persona-remote-types.ts').MessageView,
  ): void => {
    const snap = store.getSnapshot()
    const mapped = mapMessage(view, team, memberId, taskTitleById)
    if (streamKind === 'channel') {
      store.set({
        ...snap,
        messages: snap.messages.map(row => row.id === eventId ? mapped : row),
      })
      return
    }
    store.set({
      ...snap,
      dmMessages: snap.dmMessages.map(row => row.id === eventId ? mapped : row),
    })
  }

  const toggleMessageReaction = async (
    streamKind: 'channel' | 'dm',
    eventId: string,
    stickerId: string,
  ): Promise<void> => {
    if (tenant === null) return
    if (remote.reactToMessage === undefined || remote.unreactToMessage === undefined) return
    const snap = store.getSnapshot()
    const team = snap.team
    if (team === null) return
    const rows = streamKind === 'channel' ? snap.messages : snap.dmMessages
    const row = rows.find(item => item.id === eventId)
    const existing = row?.reactions.find(item => item.stickerId === stickerId)
    const userReacted = existing?.actorIds.includes(tenant.memberId) === true
    const scope = {
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      eventId,
      stickerId,
    }
    const taskTitleById = new Map(snap.kanbanCards.map(card => [card.id, card.title]))
    const view = await Promise.resolve(
      userReacted ? remote.unreactToMessage(scope) : remote.reactToMessage(scope),
    )
    patchMessageReactions(streamKind, eventId, team, tenant.memberId, taskTitleById, view)
  }

  // COLHEITA §14 (Quill): figurinha sozinha no composer. Vai ao fio como mensagem da pessoa; o host não acorda turno nenhum.
  const sendStickerMessage = async (stickerId: string): Promise<void> => {
    if (tenant === null || remote.sendSticker === undefined) return
    const scope = tenant
    const topicId = activeTopicByStream.get(streamTopicKey('channel', channelOf(scope)))
    try {
      await Promise.resolve(remote.sendSticker({
        id: `sticker-${randomUuid()}`,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        streamKind: 'channel',
        ownerId: channelOf(scope),
        actorId: scope.memberId,
        stickerId,
        ...(topicId === undefined || topicId === '' ? {} : { topicId }),
      }))
    } catch {
      return
    }
    await refresh()
  }

  // COLHEITA-S1 P1-05: o áudio de um anexo do fio. Ao aparecer, só o tipo; ao tocar, os bytes viram uma URL de objeto.
  // Devolve null se não for áudio; senão a duração escrita no nome da gravação (0 quando o nome não traz).
  const isAudioAttachment = async (attachmentId: string): Promise<number | null> => {
    if (tenant === null) return null
    const meta = await audioMetaOf(attachmentRemoteOf(remote), { workspaceId: tenant.workspaceId, projectId: tenant.projectId }, attachmentId)
    if (meta === null) return null
    return durationFromAttachmentName(meta.name) ?? 0
  }
  const loadAudioAttachment = async (attachmentId: string): Promise<string | null> => {
    if (tenant === null) return null
    const audio = await resolveAudioAttachment(attachmentRemoteOf(remote), { workspaceId: tenant.workspaceId, projectId: tenant.projectId }, attachmentId)
    return audio === null ? null : audioObjectUrl(audio)
  }

  const postDmMessage = async (body: string, attachmentIds: readonly string[] = []): Promise<void> => {
    if (tenant === null) return
    const dmId = store.getSnapshot().selectedDmId
    if (dmId === null) return
    const trimmed = body.trim()
    if (trimmed.length === 0 && attachmentIds.length === 0) return
    const scope = tenant
    const snap = store.getSnapshot()
    const timeLabel = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const optimistic: ChannelMessageUi = {
      id: `local-dm-${Date.now()}`,
      authorId: 'user',
      authorName: 'Você',
      body: trimmed,
      timeLabel,
      reactions: [],
    }
    store.set({ ...snap, dmMessages: [...snap.dmMessages, optimistic] })
    const topicId = activeTopicByStream.get(streamTopicKey('dm', dmId))
    try {
      await Promise.resolve(remote.postMessage({
        id: `msg-dm-${Date.now()}`,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        streamKind: 'dm',
        ownerId: dmId,
        actorId: scope.memberId,
        subjectId: scope.memberId,
        body: trimmed,
        attachmentIds: [...attachmentIds],
        ...(topicId === undefined || topicId === '' ? {} : { topicId }),
      }))
    } catch {
      // P0-30: o host não recebeu: "Não enviado · Tentar de novo", nunca como se tivesse sido enviada.
      markSendFailed('dm', dmId, optimistic, attachmentIds)
      return
    }
    await refresh()
  }

  /** IV-6: o escopo do projeto para as chamadas de lado; sem tenant (host fora) ou sem a chamada no host, a promessa recusa e a UI diz "não consegui". */
  const asideScope = (): { workspaceId: string; projectId: string } => {
    if (tenant === null) throw new Error('aside: no tenant')
    return { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
  }
  const openAsideAsk = async (personaId: string, subjectId: string, question: string): Promise<AsideAskView> => {
    if (typeof remote.openAsideAsk !== 'function') throw new Error('aside: unavailable')
    return await remote.openAsideAsk({ ...asideScope(), personaId, subjectId, question })
  }
  const summarizeConversation = async (
    input: { personaId: string; subjectId: string; streamKind: 'channel' | 'dm'; ownerId: string; topicId?: string },
  ): Promise<AsideAskView> => {
    if (typeof remote.summarizeConversation !== 'function') throw new Error('aside: unavailable')
    return await remote.summarizeConversation({ ...asideScope(), ...input })
  }
  const postDailyBriefNow = async (requestId?: string): Promise<DailyBriefNowView> => {
    if (typeof remote.postDailyBriefNow !== 'function') throw new Error('daily brief: unavailable')
    return await remote.postDailyBriefNow({ ...asideScope(), ...(requestId === undefined ? {} : { requestId }) })
  }
  const getAsideAsk = async (id: string): Promise<AsideAskView> => {
    if (typeof remote.getAsideAsk !== 'function') throw new Error('aside: unavailable')
    return await remote.getAsideAsk({ ...asideScope(), id })
  }
  const listAsideAsks = async (personaId: string, subjectId: string): Promise<readonly AsideAskView[]> => {
    if (typeof remote.listAsideAsks !== 'function') return []
    return await remote.listAsideAsks({ ...asideScope(), personaId, subjectId })
  }

  /** A concessão permanente que o host devolveu por pedido (`connectorDecision.grant`), para o Desfazer do Toast. */
  const initiativeGrants = new Map<string, { personaId: string; cli: string; connectorId: string }>()
  const decideInitiativeApproval = async (approvalId: string, choice: 'once' | 'always' | 'not-now'): Promise<boolean> => {
    if (tenant === null || typeof remote.decideApproval !== 'function') throw new Error('initiative: unavailable')
    const host = remote.decideApproval as unknown as (request: Record<string, unknown>) => unknown
    const answer = await Promise.resolve(host({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, kind: 'connector', id: approvalId, choice })) as
      { connectorDecision?: { grant?: { personaId?: string; cli?: string; connectorId?: string } } } | undefined
    const grant = answer?.connectorDecision?.grant
    const undoable = choice === 'always' && grant?.personaId !== undefined && grant.cli !== undefined && grant.connectorId !== undefined
    if (undoable) initiativeGrants.set(approvalId, { personaId: grant.personaId!, cli: grant.cli!, connectorId: grant.connectorId! })
    await refresh()
    return undoable
  }

  const undoInitiativeGrant = async (approvalId: string): Promise<void> => {
    const grant = initiativeGrants.get(approvalId)
    if (tenant === null || grant === undefined) throw new Error('initiative: no grant')
    const host = remote as unknown as { revokeConnector?: (request: Record<string, unknown>) => unknown }
    if (typeof host.revokeConnector !== 'function') throw new Error('initiative: unavailable')
    await Promise.resolve(host.revokeConnector({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, ...grant }))
    initiativeGrants.delete(approvalId)
  }

  const undoPersonaAction = async (activityId: string): Promise<void> => {
    if (tenant === null) throw new Error('action: unavailable')
    const host = remote as unknown as { undoPersonaAction?: (request: { workspaceId: string; projectId: string; activityId: string }) => unknown }
    if (typeof host.undoPersonaAction !== 'function') throw new Error('action: unavailable')
    const answer = await Promise.resolve(host.undoPersonaAction({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, activityId })) as { undone?: unknown } | undefined
    // P0-10: só um Desfazer que o host de fato fez (ou já tinha feito) vira "Desfeito"; `undone: false` (outro Desfazer em curso) é falha, nunca um "Desfeito" falso.
    if (answer?.undone === false) throw new Error('action: not undone')
    await refresh()
  }

  const decideActionApproval = async (
    decision: { approvalId: string; choice: 'send' | 'edit' | 'cancel' | 'retry'; edited?: { subject?: string; body?: string }; remember?: boolean },
  ): Promise<void> => {
    if (tenant === null || typeof remote.decideApproval !== 'function') throw new Error('action: unavailable')
    // O contrato do HT-9 estende o `decideApproval` com `kind: 'action'` (connector-grants.md); a forma tipada de hoje só tem os 4 tipos antigos.
    const host = remote.decideApproval as unknown as (request: Record<string, unknown>) => unknown
    await Promise.resolve(host({
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      kind: 'action',
      id: decision.approvalId,
      choice: decision.choice,
      ...(decision.edited === undefined ? {} : { edited: decision.edited }),
      ...(decision.remember === true ? { remember: true } : {}),
    }))
    await refresh()
  }

  const resumePersona = async (personaId: string): Promise<void> => {
    if (tenant === null) return
    const host = remote as unknown as { resumePersona?: (scope: { workspaceId: string; projectId: string; personaId: string }) => Promise<unknown> }
    if (typeof host.resumePersona !== 'function') return
    await host.resumePersona({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, personaId })
    await refresh()
  }

  const retryFailedSend = async (messageId: string): Promise<void> => {
    const snap = store.getSnapshot()
    const failed = snap.failedSends?.find(row => row.message.id === messageId)
    if (failed === undefined) return
    const attachmentIds = failedSendAttachments.get(messageId) ?? []
    failedSendAttachments.delete(messageId)
    const fanout = failedSendFanout.get(messageId)
    failedSendFanout.delete(messageId)
    const opinionFor = failedSendOpinion.get(messageId)
    failedSendOpinion.delete(messageId)
    store.set({ ...snap, failedSends: (snap.failedSends ?? []).filter(row => row.message.id !== messageId) })
    if (failed.streamKind === 'channel') {
      await postChannelMessage(failed.message.body, attachmentIds, {
        ...(fanout === undefined ? {} : { fanout }),
        ...(opinionFor === undefined ? {} : { opinionFor }),
      })
      return
    }
    // A DM só recebe a retentativa na conversa onde a pessoa escreveu (nunca em outra DM).
    if (store.getSnapshot().selectedDmId !== failed.ownerId) await selectDm(failed.ownerId)
    await postDmMessage(failed.message.body, attachmentIds)
  }

  const commitOnboardingRoster = async (
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
  ): Promise<void> => {
    if (tenant === null) return
    if (displayName.trim().length > 0) {
      try {
        await Promise.resolve(remote.createMember({
          id: tenant.memberId,
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          displayName: displayName.trim(),
          handle: tenant.memberId,
          role: 'owner',
        }))
      } catch {
        /* update not supported — ignore */
      }
    }
    let index = 0
    // Muse (D-069): quem não escolheu um bicho ganha o 1º livre da galeria (nunca o slug do nome, que cai nas iniciais).
    const avatarRefs = rosterGalleryRefs(roster)
    for (const person of roster) {
      const id = slugId(person.name, index)
      const avatarRef = avatarRefs[index] ?? 'capivara'
      index += 1
      const systemRoles = person.systemRoles ?? []
      const canRecruit = systemRoles.includes('coordination')
      try {
        await Promise.resolve(remote.createPersona({
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          id,
          name: person.name,
          title: person.role,
          description: person.role,
          personality: 'Proativo e claro.',
          instructions: 'Trabalhe até concluir; reporte com evidência.',
          avatarKind: 'gallery',
          avatarRef,
          runnerKind: 'dsh',
          runnerCli: '',
          runnerModel: 'default',
          canRecruit,
          createdBy: tenant.memberId,
          systemRoles: [...systemRoles],
        }))
      } catch {
        /* duplicate persona */
      }
    }
    await refresh()
  }

  /** Probe/gates only: `PERSONA_DEV_SEED=1` initScript; never invoked from {@link bootstrap}. */
  const runDevHarnessSeedIfEnabled = async (): Promise<void> => {
    const devSeedFlag = readClientDevSeedEnabled()
    if (tenant === null || !devSeedFlag) {
      console.info('[persona] dev seed', { tenant: tenant === null ? null : { ...tenant }, seeded: false, devSeedFlag })
      return
    }
    let seeded = false
    try {
      seeded = await seedDevHarnessScenario(remote as unknown as DevHarnessSeedRemote, tenant)
    } catch (seedError) {
      console.error('[persona] dev seed falhou', seedError)
    }
    console.info('[persona] dev seed', { tenant, seeded, devSeedFlag })
    if (seeded) await refresh()
  }

  const completeOnboarding = async (
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
    options?: { readonly cofreSeed?: string; readonly templateIds?: readonly string[]; readonly firstRequest?: string },
  ): Promise<void> => {
    if (tenant === null) return
    writeOnboardingCacheComplete()
    if (remote.completeOnboarding !== undefined) {
      try {
        const onboardingRaw = await Promise.resolve(remote.getOnboarding({
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
        }))
        let personalProjectId = tenant.projectId
        if (typeof onboardingRaw === 'object' && onboardingRaw !== null && 'ok' in onboardingRaw) {
          const wrapped = onboardingRaw as { ok: boolean; value?: { personalProjectId?: string } }
          if (wrapped.ok && wrapped.value?.personalProjectId !== undefined && wrapped.value.personalProjectId.length > 0) {
            personalProjectId = wrapped.value.personalProjectId
          }
        } else if (typeof onboardingRaw === 'object' && onboardingRaw !== null && 'personalProjectId' in onboardingRaw) {
          const pid = (onboardingRaw as { personalProjectId: string }).personalProjectId
          if (pid.length > 0) personalProjectId = pid
        }
        const firstRequest = firstRequestForHost(options?.firstRequest)
        const request: CompleteOnboardingRequest = {
          workspaceId: tenant.workspaceId,
          personalProjectId,
          displayName: displayName.trim(),
          team: rosterToHostTeam(roster),
          templateIds: options?.templateIds === undefined ? [] : [...options.templateIds],
          runnerChoices: ['dsh'],
          cofreSeed: options?.cofreSeed ?? '',
          // A-6: o texto do passo 5 é o pedido de verdade (o host usa o MESMO texto no #geral e na tarefa). Vazio = padrão do host.
          ...(firstRequest === undefined ? {} : { firstRequest }),
        }
        await Promise.resolve(remote.completeOnboarding(request))
        await refresh()
        await publishHostOnboardingState()
        return
      } catch {
        /* fall through to legacy roster RPCs */
      }
    }
    await commitOnboardingRoster(displayName, roster)
  }

  const conversationScope = (streamKind: 'channel' | 'dm', ownerId: string): ConversationSubjectScope | null => {
    if (tenant === null) return null
    return {
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      streamKind,
      ownerId,
    }
  }

  const conversationScopeFromKey = (streamKey: string): ConversationSubjectScope | null => {
    if (tenant === null) return null
    return conversationScopeFromStreamKey(streamKey, tenant.workspaceId, tenant.projectId)
  }

  const putSubjectsCache = (scope: ConversationSubjectScope, mapped: MappedConversationSubjects): MappedConversationSubjects => {
    subjectsCache.set(streamTopicKey(scope.streamKind, scope.ownerId), mapped)
    return mapped
  }

  /** Host list/follow topic filter — only after explicit subject selection or stream reload RPCs. */
  const applyHostTopicFilter = (scope: ConversationSubjectScope, subjectId: string): void => {
    activeTopicByStream.set(streamTopicKey(scope.streamKind, scope.ownerId), subjectId)
  }

  const reloadStreamMessages = async (scope: ConversationSubjectScope): Promise<void> => {
    if (tenant === null) return
    const scopeTenant = tenant
    const snap = store.getSnapshot()
    if (snap.team === null) return
    const wireTopicId = hostStreamTopicId(activeTopicByStream.get(streamTopicKey(scope.streamKind, scope.ownerId)))
    const page = await Promise.resolve(remote.listMessages({
      workspaceId: scopeTenant.workspaceId,
      projectId: scopeTenant.projectId,
      streamKind: scope.streamKind,
      ownerId: scope.ownerId,
      actorId: scopeTenant.memberId,
      afterSeq: 0,
      limit: 200,
      ...(wireTopicId === undefined ? {} : { topicId: wireTopicId }),
    }))
    const taskTitleById = new Map(snap.kanbanCards.map(card => [card.id, card.title]))
    const mapped = mapSortedMessageStream(page.events, snap.team!, scopeTenant.memberId, taskTitleById)
    if (scope.streamKind === 'channel') {
      store.set({ ...snap, messages: mapped })
      stopMessageStream()
      startMessageStream()
      return
    }
    store.set({ ...snap, dmMessages: mapped })
    stopDmStream()
    startDmStream(scope.ownerId)
  }

  const fetchConversationSubjects = async (
    scope: ConversationSubjectScope,
    options?: { readonly force?: boolean },
  ): Promise<MappedConversationSubjects> => {
    const key = streamTopicKey(scope.streamKind, scope.ownerId)
    const force = options?.force === true
    if (!force) {
      const cached = subjectsCache.get(key)
      if (cached !== undefined) return cached
      const inflight = subjectsInflight.get(key)
      if (inflight !== undefined) return inflight
    } else {
      subjectsCache.delete(key)
      subjectsInflight.delete(key)
    }

    const listConversationSubjects = remote.listConversationSubjects
    if (listConversationSubjects === undefined) {
      const fallback = {
        subjects: [...DEFAULT_CONVERSATION_SUBJECTS],
        activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID,
      }
      return putSubjectsCache(scope, fallback)
    }

    const run = (async (): Promise<MappedConversationSubjects> => {
      const loadOnce = async (): Promise<MappedConversationSubjects> => {
        const bundle = await Promise.resolve(listConversationSubjects(scope))
        return putSubjectsCache(scope, mapConversationSubjectsBundle(bundle))
      }
      try {
        return await loadOnce()
      } catch (error) {
        if (
          error instanceof PersonaRemoteError
          && error.code === 'rate-limited'
          && error.method === 'listConversationSubjects'
        ) {
          const waitMs = Math.min(Math.max(error.retryAfterMs ?? 400, 100), 2_000)
          await new Promise<void>((resolve) => { setTimeout(resolve, waitMs) })
          return loadOnce()
        }
        throw error
      }
    })()
    subjectsInflight.set(key, run)
    try {
      return await run
    } finally {
      subjectsInflight.delete(key)
    }
  }

  const selectConversationSubject = async (
    scope: ConversationSubjectScope,
    subjectId: string,
  ): Promise<MappedConversationSubjects> => {
    if (remote.setActiveConversationSubject === undefined) {
      applyHostTopicFilter(scope, subjectId)
      await reloadStreamMessages(scope)
      return fetchConversationSubjects(scope)
    }
    const bundle = await Promise.resolve(remote.setActiveConversationSubject({ ...scope, subjectId }))
    const mapped = putSubjectsCache(scope, mapConversationSubjectsBundle(bundle))
    applyHostTopicFilter(scope, subjectId)
    await reloadStreamMessages(scope)
    return mapped
  }

  const createConversationSubject = async (
    scope: ConversationSubjectScope,
    name: string,
  ): Promise<{ readonly bundle: MappedConversationSubjects; readonly createdSubjectId: string }> => {
    if (remote.createConversationSubject === undefined) {
      const bundle = await fetchConversationSubjects(scope)
      return { bundle, createdSubjectId: bundle.activeSubjectId }
    }
    const bundle = await Promise.resolve(remote.createConversationSubject({ ...scope, name }))
    const mapped = putSubjectsCache(scope, mapConversationSubjectsBundle(bundle))
    applyHostTopicFilter(scope, mapped.activeSubjectId)
    await reloadStreamMessages(scope)
    return { bundle: mapped, createdSubjectId: mapped.activeSubjectId }
  }

  const renameConversationSubject = async (
    scope: ConversationSubjectScope,
    subjectId: string,
    name: string,
  ): Promise<MappedConversationSubjects> => {
    if (remote.renameConversationSubject === undefined) return fetchConversationSubjects(scope)
    const bundle = await Promise.resolve(remote.renameConversationSubject({ ...scope, subjectId, name }))
    return putSubjectsCache(scope, mapConversationSubjectsBundle(bundle))
  }

  const archiveConversationSubject = async (
    scope: ConversationSubjectScope,
    subjectId: string,
  ): Promise<MappedConversationSubjects> => {
    if (remote.archiveConversationSubject === undefined) return fetchConversationSubjects(scope)
    const bundle = await Promise.resolve(remote.archiveConversationSubject({ ...scope, subjectId }))
    const mapped = putSubjectsCache(scope, mapConversationSubjectsBundle(bundle))
    applyHostTopicFilter(scope, mapped.activeSubjectId)
    await reloadStreamMessages(scope)
    return mapped
  }

  const reopenConversationSubject = async (
    scope: ConversationSubjectScope,
    name: string,
    colorIndex: number,
  ): Promise<MappedConversationSubjects> => {
    if (remote.createConversationSubject === undefined) return fetchConversationSubjects(scope)
    const bundle = await Promise.resolve(remote.createConversationSubject({ ...scope, name, colorIndex }))
    const mapped = putSubjectsCache(scope, mapConversationSubjectsBundle(bundle))
    applyHostTopicFilter(scope, mapped.activeSubjectId)
    await reloadStreamMessages(scope)
    return mapped
  }

  const moveMessageToSubject = async (
    scope: ConversationSubjectScope,
    eventId: string,
    subjectId: string,
  ): Promise<void> => {
    if (remote.moveMessageToSubject !== undefined) {
      await Promise.resolve(remote.moveMessageToSubject({ ...scope, eventId, subjectId }))
    }
    await refresh()
  }

  const teachScope = (): { workspaceId: string; projectId: string } | null => {
    if (tenant === null) return null
    return { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
  }

  const startTeachPersona = async (
    personaId: string,
    consentVersion: string,
    microphone: boolean,
  ): Promise<TeachSessionStartView> => {
    void microphone
    const scope = teachScope()
    if (scope === null || remote.startTeachSession === undefined) {
      return { sessionId: '', retentionDays: 30, storageHintPt: '' }
    }
    return Promise.resolve(remote.startTeachSession({ ...scope, personaId, consentVersion }))
  }

  const pauseTeachSession = async (sessionId: string): Promise<TeachSessionView> => {
    const scope = teachScope()
    if (scope === null || remote.pauseTeachSession === undefined) return { status: 'unsupported', elapsedMs: 0 }
    return Promise.resolve(remote.pauseTeachSession({ ...scope, sessionId }))
  }

  const resumeTeachSession = async (sessionId: string): Promise<TeachSessionView> => {
    const scope = teachScope()
    if (scope === null || remote.resumeTeachSession === undefined) return { status: 'unsupported', elapsedMs: 0 }
    return Promise.resolve(remote.resumeTeachSession({ ...scope, sessionId }))
  }

  const stopTeachSession = async (
    sessionId: string,
    microphone: boolean,
    transcript?: string,
    frames?: StopTeachSessionRequest['frames'],
  ): Promise<TeachSessionView> => {
    const scope = teachScope()
    if (scope === null || remote.stopTeachSession === undefined) return { status: 'unsupported', elapsedMs: 0 }
    return Promise.resolve(remote.stopTeachSession({
      ...scope,
      sessionId,
      includeMicrophone: microphone,
      ...(transcript === undefined ? {} : { transcript }),
      // W2-10: the key frames the desktop kept (imageRef + change score); empty when nothing was recorded.
      frames: frames ?? [],
    }))
  }

  const getTeachSession = async (sessionId: string): Promise<TeachSessionView> => {
    const scope = teachScope()
    if (scope === null || remote.getTeachSession === undefined) return { status: 'unsupported', elapsedMs: 0 }
    return Promise.resolve(remote.getTeachSession({ ...scope, sessionId }))
  }

  const getTeachDraft = async (sessionId: string): Promise<TeachDraftView> => {
    const scope = teachScope()
    if (scope === null || remote.getTeachDraft === undefined) return { steps: [], skillTitle: '' }
    return Promise.resolve(remote.getTeachDraft({ ...scope, sessionId }))
  }

  const submitTeachDraft = async (
    sessionId: string,
    steps: readonly TeachStepView[],
    activate: boolean,
    skillTitle?: string,
  ): Promise<TeachDraftView> => {
    const scope = teachScope()
    if (scope === null || remote.submitTeachDraft === undefined) return { steps: [], skillTitle: '' }
    // The name the person chose goes along (the host names a taught skill "Skill ensinada" until it takes this field).
    const named = skillTitle !== undefined && skillTitle.trim() !== '' ? { skillTitle: skillTitle.trim() } : {}
    return Promise.resolve(remote.submitTeachDraft({ ...scope, sessionId, steps, activate, ...named }))
  }

  const searchMessages = async (
    query: string,
    topicId?: string,
  ): Promise<readonly { readonly id: string; readonly meta: string; readonly text: string }[]> => {
    const trimmed = query.trim()
    if (tenant === null || trimmed.length < 2 || remote.search === undefined) return []
    try {
      const searchTopic = hostStreamTopicId(topicId)
      const hits = await Promise.resolve(remote.search({
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        actorId: tenant.memberId,
        query: trimmed,
        limit: 20,
        ...(searchTopic === undefined ? {} : { topicId: searchTopic }),
      }))
      return hits.map(row => ({
        id: row.id,
        meta: row.streamId.startsWith('dm:')
          ? `${row.actorId} · DM · ${formatSearchTime(row.occurredAt)}`
          : `${row.actorId} · #geral · ${formatSearchTime(row.occurredAt)}`,
        text: row.body,
      }))
    } catch {
      return []
    }
  }

  const approveGestorPlan = async (planId: string): Promise<void> => {
    if (tenant === null) return
    const before = new Set((store.getSnapshot().team?.personas ?? []).map(row => row.id))
    await approveGestorPlanRemote(remote as unknown as GestorWire, { workspaceId: tenant.workspaceId, planId })
    await refresh()
    const newcomers = (store.getSnapshot().team?.personas ?? [])
      .filter(row => !before.has(row.id))
      .map(row => row.id)
    if (newcomers.length > 0) {
      markPersonasArriving(newcomers)
      await refresh()
      window.setTimeout(() => { void refresh() }, 4_100)
    }
  }

  const rejectGestorPlan = async (planId: string): Promise<void> => {
    if (tenant === null) return
    await rejectGestorPlanRemote(remote as unknown as GestorWire, { workspaceId: tenant.workspaceId, planId })
    await refresh()
  }

  const feedbackGestorPlan = async (planId: string, body: string): Promise<void> => {
    if (tenant === null) return
    const trimmed = body.trim()
    if (trimmed.length === 0) return
    const prior = store.getSnapshot()
    store.set({
      ...prior,
      gestorPlanAdjustingIds: { ...prior.gestorPlanAdjustingIds, [planId]: true },
    })
    try {
      await postChannelMessage(trimmed)
      await refresh()
    } catch (error) {
      const next = store.getSnapshot()
      const { [planId]: _removed, ...rest } = next.gestorPlanAdjustingIds
      store.set({ ...next, gestorPlanAdjustingIds: rest })
      throw error
    }
  }

  const setPersonaAutonomyLevel = async (personaId: string, level: AutonomyLevel): Promise<void> => {
    if (tenant === null || remote.getAutonomy === undefined || remote.setAutonomy === undefined) return
    const scope = {
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      personaId,
    }
    const current = await Promise.resolve(remote.getAutonomy(scope))
    await Promise.resolve(remote.setAutonomy(patchAutonomyMode(current, level)))
  }

  /** Put one decision in a new lifecycle state; every list and counter derives from this one array. */
  const setDecisionState = (decisionId: string, state: DecisionState): void => {
    decisionStates.set(decisionId, state)
    const snap = store.getSnapshot()
    const next = (snap.decisions ?? []).map(d => (d.id === decisionId ? { ...d, state } : d))
    store.set({ ...snap, decisions: next, attentionTitles: openBlockingTitles(next) })
  }

  const dropDecision = (decisionId: string): void => {
    decisionStates.delete(decisionId)
    decisionTimers.delete(decisionId)
    const snap = store.getSnapshot()
    const next = (snap.decisions ?? []).filter(d => d.id !== decisionId)
    store.set({ ...snap, decisions: next, attentionTitles: openBlockingTitles(next) })
  }

  /** The permanent grants a connector decision made ("Sempre permitir"), kept so its Desfazer can take exactly that back. */
  const connectorGrants = new Map<string, { readonly personaId: string; readonly cli: string; readonly connectorId: string }>()

  const decide = async (decisionId: string, acceptRequested: boolean, choice?: 'once' | 'always' | 'not-now'): Promise<DecisionState | undefined> => {
    // A connector card is decided by its three-way choice; "accept" follows from it (once/always grant, not-now does not).
    const accept = choice === undefined ? acceptRequested : choice !== 'not-now'
    const current = (store.getSnapshot().decisions ?? []).find(d => d.id === decisionId)
    if (current === undefined) return undefined
    // A second click while the host is answering, or while the stamp is leaving, must not decide twice.
    if (current.state === 'deciding' || current.state === 'accepted' || current.state === 'declined') return current.state

    // Optimistic and single: the card leaves "pending" in every list at once.
    setDecisionState(decisionId, 'deciding')
    try {
      if (remote.decideApproval !== undefined) {
        if (tenant === null) throw new Error('no-tenant')
        const answer = await Promise.resolve(remote.decideApproval({
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          id: current.id,
          kind: current.targetApprovalKind ?? (current.kind === 'blocker' ? 'attention' : (current.kind as 'hire' | 'vault' | 'skill')),
          accept,
          ...(choice === undefined ? {} : { choice }),
        }))
        // "Sempre permitir": the host returns the grant; with it the toast's Desfazer is real (it revokes exactly that).
        const grant = (answer as { connectorDecision?: { grant?: { personaId?: unknown; cli?: unknown; connectorId?: unknown } } } | null | undefined)?.connectorDecision?.grant
        if (choice === 'always' && grant !== undefined && typeof grant.personaId === 'string' && typeof grant.cli === 'string' && typeof grant.connectorId === 'string') {
          connectorGrants.set(decisionId, { personaId: grant.personaId, cli: grant.cli, connectorId: grant.connectorId })
          // The grant makes the decision reversible: the toast's "Desfazer" exists only now (a "só desta vez" has nothing to take back).
          const snapshot = store.getSnapshot()
          const connectorName = current.approval?.connector?.connectorName
          store.set({
            ...snapshot,
            decisions: (snapshot.decisions ?? []).map(d => (d.id === decisionId
              ? { ...d, reversible: true, ...(connectorName === undefined ? {} : { connectorGrant: { personaName: current.requester.name, connectorName } }) }
              : d)),
          })
        }
      }
    } catch {
      setDecisionState(decisionId, 'failed')
      return 'failed'
    }
    const nextState: DecisionState = accept ? 'accepted' : 'declined'
    settledDecisions.set(decisionId, Date.now())
    setDecisionState(decisionId, nextState)
    const existingTimer = decisionTimers.get(decisionId)
    if (existingTimer !== undefined) clearTimeout(existingTimer)
    decisionTimers.set(decisionId, setTimeout(() => {
      dropDecision(decisionId)
      // The host already moved on (new task, new card): pick it up once the stamp is gone.
      void refresh()
    }, accept ? DECISION_ACCEPT_EXIT_MS : DECISION_DECLINE_EXIT_MS))
    return nextState
  }

  // "Entendi" on the away card: hide this window now, tell the host so the next one starts, then read again.
  let awayHiddenSince: string | null = null
  const dismissWhileAway = async (): Promise<void> => {
    const current = store.getSnapshot().away
    if (current === null || current === undefined || tenant === null) return
    awayHiddenSince = current.since
    store.set({ ...store.getSnapshot(), away: null })
    if (remote.dismissWhileAway !== undefined) await Promise.resolve(remote.dismissWhileAway(tenant)).catch(() => undefined)
    await refresh()
  }

  const undoDecision = async (decisionId: string): Promise<void> => {
    // A permanent connector grant is undone by revoking exactly that grant (there is no separate undo call for it).
    const grant = connectorGrants.get(decisionId)
    if (grant !== undefined && remote.revokeConnector !== undefined && tenant !== null) {
      connectorGrants.delete(decisionId)
      await Promise.resolve(remote.revokeConnector({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, ...grant }))
      settledDecisions.delete(decisionId)
      await refresh()
      return
    }
    if (remote.undoApproval === undefined || tenant === null) return
    await Promise.resolve(remote.undoApproval({
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      id: decisionId,
    }))
    settledDecisions.delete(decisionId)
    await refresh()
  }

  const dispose = (): void => {
    stopMessageStream()
    stopDmStream()
    if (sideRefreshTimer !== undefined) clearTimeout(sideRefreshTimer)
    sideRefreshTimer = undefined
    hostOnboardingSink = null
    subjectsInflight.clear()
    for (const timer of decisionTimers.values()) clearTimeout(timer)
    decisionTimers.clear()
    decisionStates.clear()
    settledDecisions.clear()
  }

  return {
    observable: {
      getSnapshot: () => store.getSnapshot(),
      subscribe: listener => store.subscribe(listener),
    },
    bootstrap,
    runDevHarnessSeedIfEnabled,
    refresh,
    dispose,
    postChannelMessage,
    retryFailedSend,
    resumePersona,
    decideActionApproval,
    undoPersonaAction,
    decideInitiativeApproval,
    undoInitiativeGrant,
    openAsideAsk,
    summarizeConversation,
    postDailyBriefNow,
    getAsideAsk,
    listAsideAsks,
    uploadChannelAttachment,
    uploadDmAttachment,
    selectDm,
    openPersonaDm,
    openFirstAvailableDm,
    loadTurnContext,
    loadReplyActivity,
    sendStickerMessage,
    isAudioAttachment,
    loadAudioAttachment,
    postDmMessage,
    toggleMessageReaction,
    commitOnboardingRoster,
    completeOnboarding,
    searchMessages,
    setPersonaAutonomyLevel,
    conversationScope,
    conversationScopeFromKey,
    fetchConversationSubjects,
    selectConversationSubject,
    createConversationSubject,
    renameConversationSubject,
    archiveConversationSubject,
    reopenConversationSubject,
    moveMessageToSubject,
    startTeachPersona,
    pauseTeachSession,
    resumeTeachSession,
    stopTeachSession,
    getTeachSession,
    getTeachDraft,
    submitTeachDraft,
    approveGestorPlan,
    rejectGestorPlan,
    feedbackGestorPlan,
    decide,
    undoDecision,
    dismissWhileAway,
  }
}
