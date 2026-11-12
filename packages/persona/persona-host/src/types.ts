/** JSON-safe inputs and results of the Persona Remote namespace. */
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type { ComponentFailure } from '@deepseek-ai/dsh-persona-components'
import type {
  LedgerOrigin,
  TurnKind,
  TurnLayerSizes,
} from '@deepseek-ai/dsh-persona-core'
import type { UsageFold, UsageOrigin } from '@deepseek-ai/dsh-persona-usage'
import type { ChannelNotice } from './channel-notices.ts'
import type { RoutineTrigger } from './routine-events.ts'

/** Item 26: the wire types of a routine's trigger live in routine-events.ts and are public through this subpath (Typert reads them here). */
export type { EventFilter, EventSource, RoutineEventTrigger, RoutineTrigger } from './routine-events.ts'

/** Item 22: the wire types of the channel views live in their own files and are public through this subpath (Typert reads them here). */
export type { DirectoryChannelKind } from './channel-directory.ts'
export type { ChannelNotice, EmptyChannelNotice } from './channel-notices.ts'
export type {
  ChannelHeaderMemberView, ChannelHeaderView, ChannelLayoutView, ChannelRowView, ChannelSectionView, MentionOptionsRequest, MentionOptionView,
} from './channel-views.ts'
import type { IndicatorData, Opt8MeasuredEvidence } from '@deepseek-ai/dsh-persona-engine'

export type { OfficialQuota, UsageFold, UsageOrigin, UsageRecord, UsageWindow } from '@deepseek-ai/dsh-persona-usage'
export type { LedgerOrigin, TurnKind, TurnLayerSizes, TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'

/** Result of the liveness probe. */
export interface PingResult {
  readonly ok: true
  readonly product: 'persona'
  readonly protocol: number
}

/** Tenant scope for every read. */
export interface ProjectScopeRequest {
  readonly workspaceId: string
  readonly projectId: string
}

/** System function on a persona card (Bibliotecário = Segundo cérebro). */
export type SystemRoleView = 'coordination' | 'watchdog' | 'librarian' | 'team_manager'

/** One workspace member on the wire. */
export interface MemberView {
  readonly id: string
  readonly workspaceId: string
  readonly displayName: string
  readonly handle: string
  readonly role: 'owner' | 'member' | 'guest'
}

/** One project on the wire. */
export interface ProjectView {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly description: string
  readonly kind: 'personal' | 'shared'
}

/** Compact persona card for the team list. */
export interface PersonaView {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly title: string
  readonly description: string
  readonly avatarKind: 'gallery' | 'upload' | 'silhouette'
  readonly avatarRef: string
  readonly systemRoles: readonly SystemRoleView[]
  readonly canRecruit: boolean
  /** EFF-1: the engine, model and "Capricho" the person chose (Configurações › Personas); `null` = "Padrão do motor". */
  readonly engine?: PersonaEngineChoiceView
  /** HT-6: when the person retired her ("aposentada"); only on `listRetiredPersonas`. */
  readonly retiredAt?: string
  /** D-090: what the person decided about teamwork for this persona. Present only with `Config.teamwork`. */
  readonly teamwork?: PersonaTeamworkView
  /** HT-6: the person lets this persona hire WITHOUT the card in Aprovações. Only for a persona who may hire, and only with the product tools on. */
  readonly hireDirect?: boolean
  /** D-099: “Pode salvar arquivos no rascunho” — the persona saves files into the draft of the project's folder (never with a shell). The host always sends it. */
  readonly canSaveFiles?: boolean
  /** D-099: whether that can take effect now: the persona's project has a folder. Without one she answers in text only. The host always sends it. */
  readonly canSaveFilesAvailable?: boolean
  /** Muse state vocabulary: paused ON PURPOSE ("Pausada"). Present only when `true`; absent = not paused. */
  readonly paused?: true
  /**
   * Muse state vocabulary: resting by silence ("Descansando"): inside the team's Janela de silêncio, the whole team is paused, or her own silence window is on.
   * Present only when `true`; absent = awake.
   */
  readonly quiet?: true
}

/** HT-6: the answer of `retirePersona`. */
export interface RetiredPersonaView {
  readonly personaId: string
  readonly retiredAt: string
}

/** EFF-1: the engine choice of one persona. */
export interface PersonaEngineChoiceView {
  readonly runnerKind: 'dsh' | 'cli'
  readonly runnerCli: string
  readonly runnerModel: string | null
  readonly runnerEffort: PersonaEffortLevel | null
}

/** D-090 / TEAM-3: the person's settings of teamwork for one persona (defaults: on, 6 a day, 2 rounds). */
export interface PersonaTeamworkView {
  /** "Pode pedir ajuda a colegas". */
  readonly canAskColleagues: boolean
  /** "Até {n} pedidos a colegas por dia", 1 to 20. */
  readonly askCapPerDay: number
  /** Asks the persona already made today (the opinion rounds count too). */
  readonly askedToday: number
  /** Rounds of opinion a Task may use, 1 to 3. */
  readonly maxOpinionRounds: number
}

/** The person changes what they decided about teamwork for a persona. Only the named fields change. Responsável or workspace owner. */
export interface SetPersonaTeamworkRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly canAskColleagues?: boolean
  readonly askCapPerDay?: number
  readonly maxOpinionRounds?: number
}

/** "Pode contratar": whether the persona may bring people to the team (with the person's permission each time). */
export interface SetPersonaCanRecruitRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly canRecruit: boolean
}

/** D-099: “Pode salvar arquivos no rascunho” — whether one persona saves files into the draft of the project's folder (never with a shell). Off is always allowed. */
export interface SetPersonaCanSaveFilesRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly canSaveFiles: boolean
}

/** HT-6: “Contratar direto” — the person lets one persona hire without the card (off unless she turned it on). */
export interface SetPersonaHireDirectRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly hireDirect: boolean
}

/** Team roster for one project. */
export interface TeamView {
  readonly members: readonly MemberView[]
  readonly personas: readonly PersonaView[]
}

/** One channel on the wire. */
export interface ChannelView {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly topic: string
  /** CV-6: the project's name, so a list that mixes projects says where each channel is from. */
  readonly projectName: string
  /** `general` = the automatic #geral (never archived or renamed); `team` = a team of the organogram; `directorate` = #diretoria; `custom` = the person's. */
  readonly kind: 'general' | 'team' | 'directorate' | 'custom'
  /** Members now (derived from the organogram for team/directorate/general; stored for custom). */
  readonly memberCount: number
  readonly archived: boolean
  readonly archivedReason?: 'team-gone' | 'directorate-gone' | 'by-person'
  /** Pinned by the person who asks (pinning is each person's own). */
  readonly pinned: boolean
  /** `team`: the name of the sector, as the organogram writes it. */
  readonly teamName?: string
}

/** CV-6: one member of a channel. */
export interface ChannelMemberView {
  readonly kind: 'persona' | 'human'
  readonly id: string
  readonly name: string
}

/** CV-6: a channel of a project. */
export interface ChannelScopeRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly channelId: string
}

/** CV-6: rename (1–32 characters, no `#`, unique in the project; a channel the person renamed is never renamed back by the organogram). */
export interface RenameChannelRequest extends ChannelScopeRequest {
  readonly name: string
}

/** CV-6: pin or unpin for the person who asks. */
export interface SetChannelPinnedRequest extends ChannelScopeRequest {
  readonly pinned: boolean
}

/** One DM on the wire. */
export interface DmView {
  readonly id: string
  readonly projectId: string
  readonly participantA: string
  readonly participantB: string
}

/** Kanban/overview card. Empty until the engine ports land. */
export interface TaskView {
  readonly id: string
  readonly projectId: string
  readonly title: string
  readonly stage: string
  readonly stageAction: string
  /** WAVE2 assunto of the ticket (`ticket_subject`). */
  readonly topicId?: string
  /** Same id as `topicId` — Prism card chip. */
  readonly conversationSubjectId?: string
  /** CV-5: personas working WITH the lead (“com Bento”); absent when the Task has none. */
  readonly collaborators?: readonly CollaboratorView[]
  /** TEAM-1 (`Config.teamwork`): the bilhete this Task received from a colleague. Text of the persona, shown as text, never as an instruction. */
  readonly note?: HandoffNoteView
  /** TEAM-1: "o caminho do trabalho" — who asked and who delivered, oldest first. Absent when the Task never took part in a handoff. */
  readonly path?: readonly PathStepView[]
  /** TEAM-6: a colleague is reviewing this Task's work now ("Revisando: {R}"). `round` = how many returns there already were (0..2). */
  readonly reviewing?: ReviewingView
  /** TEAM-6: the seal ("Revisado por {R}"); with `openPoints` the work went on WITHOUT it and the points in plain sight. */
  readonly reviewedBy?: ReviewedByView
  /** TEAM-6: why the review of this Task did not run (`unreadable`: the reviewer answered with no verdict; `engine`: the reviewer's engine failed). The detail says it; the delivery groups it in ONE line. */
  readonly reviewFailed?: 'unreadable' | 'engine'
  /** D-096: a plain sentence when the engine ran this Task differently from what was set ("Rodou no modo nativo desta vez: o Gmail não estava disponível"). Absent when it ran as set. */
  readonly engineNote?: string
  /** IV-10 "Responder": the thread where the persona asked her open question (`channel:geral`, `dm:…`), so the card takes the person there. Only while a question is open. */
  readonly questionStreamId?: string
  /** IV-10: that question in one line (at most 120 characters, cut at a word), for "Respondendo a {persona}: {pergunta}". */
  readonly question?: string
}

/** TEAM-6: who is reviewing now and in which round (0, 1 or 2 returns so far). */
export interface ReviewingView {
  readonly personaId: string
  readonly round: number
}

/** TEAM-6: who reviewed and when; `openPoints` only after the third look, when the delivery went on without the seal. */
export interface ReviewedByView {
  readonly personaId: string
  readonly at: string
  readonly openPoints?: number
}

/** TEAM-6: how the project reviews its deliveries (Projeto › Configurações › "Revisão antes de entregar"). */
export interface ReviewPolicyView {
  readonly mode: 'off' | 'all' | 'types'
  /** With `mode: 'types'`: the task types that are reviewed. */
  readonly types: readonly string[]
  /** Who reviews: the Coordenação, a colleague of the same function, or one persona. */
  readonly reviewer: { readonly kind: 'coordination' | 'same-role' | 'persona'; readonly personaId?: string }
}

/** Read the review policy of a project (the default of a new project is ON in every delivery, by the Coordenação). */
export interface GetReviewPolicyRequest {
  readonly workspaceId: string
  readonly projectId: string
}

/** Set the review policy of a project. Workspace owner. */
export interface SetReviewPolicyRequest extends GetReviewPolicyRequest {
  readonly mode: 'off' | 'all' | 'types'
  readonly types?: readonly string[]
  readonly reviewer: { readonly kind: 'coordination' | 'same-role' | 'persona'; readonly personaId?: string }
}

/** TEAM-1: what one persona handed to another ("O que já está pronto", "O que falta", "Arquivos", "Decisões tomadas"). */
export interface HandoffNoteView {
  readonly fromPersonaId: string
  readonly toPersonaId: string
  /** The Task that received it. */
  readonly taskId: string
  readonly done: readonly string[]
  readonly needed: readonly string[]
  /** Paths relative to the project. */
  readonly files: readonly string[]
  readonly decisions: readonly string[]
  readonly at: string
}

/** TEAM-1: one step of the path the work took. */
export interface PathStepView {
  readonly personaId: string
  readonly step: 'wrote' | 'asked' | 'handed' | 'delivered' | 'reviewed'
  readonly at: string
}

/** TEAM-1: the chip of a board card that is part of a request between colleagues ("Pedido por {A}" / "Esperando {B}"). */
export interface BoardHandoffView {
  readonly role: 'asked' | 'waiting'
  readonly otherPersonaId: string
}

/** Visão geral: "Precisa de você" first, then in-progress. Healthy work is omitted. */
export interface OverviewView {
  readonly needsYou: readonly TaskView[]
  readonly inProgress: readonly TaskView[]
  readonly firstDelivery?: FirstDeliveryView
  readonly engineStatus?: EngineStatusView
}

/** The thread line of an account switch (ACCOUNT-SWAP-SPEC §1). `undone` flips after Desfazer. */
export interface AccountSwapEventView {
  readonly swapId: string
  readonly personaId: string
  readonly personaName: string
  /** Engine id ("claude"). */
  readonly provider: string
  readonly from: { readonly accountId: string; readonly label: string }
  readonly to: { readonly accountId: string; readonly label: string }
  /** ISO: when the account that ran out resets (absent = the vendor gave none; never an invented hour). */
  readonly until?: string
  /** True when the persona's policy switched it (the person chose "usar a próxima"); false when the person confirmed. */
  readonly auto: boolean
  readonly undone: boolean
}

/** The "Perguntar antes de trocar" Notice in the thread (ACCOUNT-SWAP-SPEC §2); `resolved` once the person chose. */
export interface AccountAskEventView {
  readonly ticketId: string
  readonly personaId: string
  readonly personaName: string
  readonly provider: string
  readonly from: { readonly accountId: string; readonly label: string }
  readonly to: { readonly accountId: string; readonly label: string }
  readonly quota: 'livre' | 'desconhecida'
  readonly until?: string
  readonly resolved?: 'continued' | 'waiting'
}

/** A recent switch, for the "na conta Pessoal" subtitle and the Desfazer (`undoable` while the persona is still on it). */
export interface AccountSwapRecordView extends AccountSwapEventView {
  readonly at: string
  readonly ticketId?: string
  readonly undoable: boolean
}

/** One time an account hit its limit (the book kept for "Uso e limites"). `active` while it is still at the limit. */
export interface AccountLimitRecordView {
  readonly accountId: string
  readonly label: string
  readonly provider: string
  readonly at: string
  /** The vendor's reset clock; absent when it gave none. */
  readonly resetAt?: string
  /** When the limit was cleared; absent while `active`. */
  readonly clearedAt?: string
  readonly active: boolean
}

/** The auditable history of limits and account switches (append-only), newest first. */
export interface AccountLimitBookView {
  readonly limits: readonly AccountLimitRecordView[]
  readonly swaps: readonly AccountSwapRecordView[]
}

export interface GetAccountLimitBookRequest extends ProjectScopeRequest {
  /** How many of each, newest first (default 50, max 200). */
  readonly limit?: number
}

export interface UndoAccountSwapRequest extends ProjectScopeRequest {
  readonly swapId: string
}

export interface UndoAccountSwapResultView {
  readonly undone: boolean
  readonly reason?: 'not-found' | 'already-undone' | 'stale'
}

export interface DeclineAccountSwapRequest extends ProjectScopeRequest {
  readonly ticketId: string
}

/** One account the Task could move to now. `desconhecida` = the vendor published nothing for it: a try, not a promise. */
export interface AccountSwapOptionView {
  readonly accountId: string
  readonly label: string
  readonly quota: 'livre' | 'desconhecida'
}

/** "Usar a conta X e retomar agora?" for a Task the quota window stopped (IV-7, persona-spec/contracts/account-swap.md). */
export interface AccountSwapProposalView {
  readonly ticketId: string
  readonly ticketTitle: string
  readonly personaId: string
  readonly personaName: string
  /** Engine id ("claude"); the client owns the display name. */
  readonly provider: string
  readonly policy: RunnerSwapPolicy
  readonly from: { readonly accountId: string; readonly label: string }
  readonly to: AccountSwapOptionView
  readonly alternatives: readonly AccountSwapOptionView[]
  /** When the account that ran out resets, if the vendor said ("ou esperar até {hora}"). */
  readonly waitUntil?: string
}

export interface ConfirmAccountSwapRequest extends ProjectScopeRequest {
  readonly ticketId: string
  readonly toAccountId: string
}

export interface AccountSwapResultView {
  /** The persona now uses the chosen account. */
  readonly applied: boolean
  /** The stopped Task was run again on it. */
  readonly resumed: boolean
  readonly reason?: 'not-waiting' | 'unknown-account'
  /** The line the team feed shows ("Nina passou para claude · Trabalho"). */
  readonly activity?: string
}

/** What the person is about to send (the composer, or step 5 of onboarding). */
export interface EstimateAskRequest extends ProjectScopeRequest {
  readonly texto: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  /** Step 5: the host routes straight to the executor, with no triage. */
  readonly primeiraEntrega?: boolean
  /** CV-8: estimate the whole team (`everyone`) or the Coordenação's pick (`relevant`) instead of one persona. Several @menções in `texto` are read by the host. */
  readonly audience?: 'everyone' | 'relevant'
}

/** Estimate of one ask (persona-spec/contracts/estimate-ask.md): calls exact, tokens and cost ranges, time only when measured. */
export interface EstimateAskView {
  readonly tipo: 'sem-chamada' | 'conversa' | 'trabalho' | 'nao-sei'
  readonly chamadas: { readonly min: number; readonly max: number } | null
  readonly detalhe: readonly { readonly papel: 'conversa' | 'execucao' | 'triagem'; readonly nivel: 'barato' | 'seu-modelo' }[]
  readonly tokens: { readonly min: number; readonly max: number } | null
  readonly baseDoVendorIncluida: boolean
  /** List-price cost in micro-USD. ONLY with `billing: 'api'`; `null` for a subscription or an unknown account (D-092: no screen can show a dollar by mistake). */
  readonly custo: { readonly microUsd: { readonly min: number; readonly max: number } } | null
  /** USD-1 (contracts/usd-subscription.md): the account type the numbers are shaped for. `unknown` shows no money, like a subscription. */
  readonly billing: 'subscription' | 'api' | 'unknown'
  /**
   * Subscription / unknown: the impact on the window the vendor publishes (`5h` when there is one, otherwise the `week`). `pct` is the share of the whole
   * window the ask uses, or `null` = "cota não medida" (no calibration on this account yet; never 0). `usedPct`/`remainingPct` are the vendor's own reading
   * and can be shown even when `pct` is null. `null` here = the vendor publishes no window (or an API account).
   */
  readonly quota: {
    readonly window: '5h' | 'week'
    readonly pct: { readonly min: number; readonly max: number } | null
    readonly usedPct?: number
    readonly remainingPct?: number
    readonly resetsAt?: string
    readonly origin: 'calibrated' | 'not-measured'
    readonly basis?: string
  } | null
  /** Ready-to-show line (pt-BR) of what the ask uses: a share of the window, "cota não medida", the calls, or (API only) "≈ US$ x–y (estimativa)". */
  readonly impacto: string
  /** Seconds. `null` until a measured calibration exists for EVERY call. `mediana` only from the person's own history (OPT-9). */
  readonly tempo: { readonly segundos: { readonly min: number; readonly max: number }; readonly mediana?: number } | null
  readonly origin: 'estimate' | 'calibrated' | 'unknown'
  /** `historico` = the person's own measured turns; `referencia-dev` = a one-machine development reference. Absent for a plain estimate. */
  readonly fonte?: 'historico' | 'referencia-dev'
  /** Measured turns behind the statement in `motivo`. Only with `fonte: 'historico'`. */
  readonly amostras?: number
  /** Ready-to-show line (pt-BR). */
  readonly rotulo: string
  /** One short reason for a tooltip. */
  readonly motivo: string
  /** CV-8: the numbers of the whole block, when the ask goes to several personas (absent for a plain ask). */
  readonly fanout?: FanoutEstimateView
}

/** Definitive cached reason an addressed request cannot reach a connected engine. */
export type EngineUnavailableReason = 'none_connected' | 'login_required' | 'quota_exhausted'

/** Readiness uses cached observations; checking never claims a logout. */
export interface EngineStatusView {
  readonly state: 'ready' | 'checking' | 'unavailable'
  readonly reason: EngineUnavailableReason | null
  readonly pending: number
  /** Tasks the quota window stopped, waiting to run again (IV-7). Absent when none. */
  readonly quotaWaiting?: number
  /** ISO reset clock of the earliest one that has it ("No limite até {hora}"). Absent when the vendor gave none. */
  readonly quotaResetsAt?: string
  /** Other connected engines that still have quota, for "Usar {outro motor} enquanto isso". Only while a Task waits. */
  readonly alternativeEngines?: readonly string[]
}

/** A person's action on one durable, retained message. */
export interface EngineTriggerActionRequest extends ProjectScopeRequest {
  readonly triggerId: string
}

/** Private restore-point metadata safe to show in the project's history. */
export interface RestorePointView {
  readonly id: string
  readonly ticketId: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly state: 'available' | 'undone' | 'expired'
  readonly files: readonly string[]
}

/** Unsupported history and an empty measured history remain distinguishable. */
export interface RestorePointListView {
  readonly status: 'available' | 'unsupported' | 'unconfigured'
  readonly points: readonly RestorePointView[]
}

/** A person's explicit undo action; paths are never accepted from the client. */
export interface UndoApplyRequest extends ProjectScopeRequest {
  readonly restorePointId: string
}

/** File restoration outcome; later user edits can block it without overwriting files. */
export type UndoApplyView =
  | { readonly kind: 'restored'; readonly restorePointId: string }
  | { readonly kind: 'expired'; readonly restorePointId: string }
  | { readonly kind: 'blocked'; readonly explanation: string }

/** Logical bytes in private application files; null means the scan could not complete. */
export interface ProjectStorageUsageView {
  readonly status: 'measured' | 'unavailable'
  readonly historyBytes: number | null
  readonly draftBytes: number | null
  readonly totalBytes: number | null
  readonly retentionDays: number
}

/** Create a workspace and its Pessoal project. */
export interface CreateWorkspaceRequest {
  readonly id: string
  readonly name: string
  readonly personalProjectId: string
}

/** Create a shared project. Optional flow template persists on create. */
export interface CreateProjectRequest {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly description: string
  readonly template?: 'contratacao' | 'site' | 'software' | 'marketing' | 'atendimento' | 'simples' | 'em_branco'
}

/** Create a workspace member. */
export interface CreateMemberRequest {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly displayName: string
  readonly handle: string
  readonly role: 'owner' | 'member' | 'guest'
}

/** Create a customizable persona (Forge schema fields on the wire). */
export interface CreatePersonaRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly name: string
  readonly title: string
  readonly description: string
  readonly personality: string
  readonly instructions: string
  readonly avatarKind: 'gallery' | 'upload' | 'silhouette'
  readonly avatarRef: string
  readonly runnerKind: 'dsh' | 'cli'
  readonly runnerCli: string
  readonly runnerModel: string
  /** EFF-1: absent/null = the engine's default (no `--effort`). */
  readonly runnerEffort?: PersonaEffortLevel | null
  readonly canRecruit: boolean
  readonly createdBy: string
  /** When omitted, the first persona in the project receives Coordenação. */
  readonly systemRoles?: readonly SystemRoleView[]
}

/** Participate in a project or channel. */
export interface ParticipationRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly kind: 'project' | 'channel'
  readonly targetId: string
}

/** Create a channel. */
export interface CreateChannelRequest {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly topic: string
  /** CV-6: who is in a channel the person makes (personas of the project and people of the workspace). */
  readonly memberIds?: readonly { readonly kind: 'persona' | 'human'; readonly id: string }[]
}

/** Create a DM. */
export interface CreateDmRequest {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly participantA: string
  readonly participantB: string
}

/** Post one message onto a channel or DM stream. */
export interface PostMessageRequest {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly body: string
  readonly actorId: string
  readonly subjectId: string
  /** Host clock when omitted; explicit offset ISO timestamp is preserved for remote ordering. */
  readonly occurredAt?: string
  readonly responderId?: string
  /** Uploaded file ids from `attachFile`, bound on post. */
  readonly attachmentIds?: readonly string[]
  readonly replyToId?: string
  readonly topicId?: string
  /** CV-8: send this one message to the whole team (`everyone`) or to whoever the Coordenação picks (`relevant`). Needs the host's `fanout` flag. */
  readonly fanout?: 'everyone' | 'relevant'
  /**
   * TEAM-4 ("Dar minha opinião"): this message is the PERSON's own answer to a round of opinion a persona asked of the team. It is stored as
   * the person's line, shown as `opinion.kind = 'reply'` under the request, and — being an answer, not a new request — it is not routed:
   * it never becomes a Task or wakes a persona. Needs `Config.teamwork`; `requestId` is the `opinion.requestId` of the request line.
   */
  readonly opinionOn?: { readonly requestId: string; readonly mark?: 'liked' | 'suggestion' | 'attention' }
}

/** Page or follow messages. `afterSeq` is 0 to start; `limit` is 1–200. */
export interface ListMessagesRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly actorId: string
  readonly afterSeq: number
  readonly limit: number
  readonly topicId?: string
}

/** One message on the wire. */
export interface MessageView {
  readonly id: string
  readonly streamId: string
  readonly seq: number
  readonly body: string
  readonly actorId: string
  readonly subjectId: string
  readonly occurredAt: string
  readonly type: string
  /** `runner` = model text persisted from a live CLI/DSH turn. */
  readonly source: 'runner' | 'host'
  readonly attachmentIds: readonly string[]
  readonly replyToId: string
  readonly editedAt: string
  readonly pinned: boolean
  readonly reactions: readonly ReactionView[]
  readonly topicId: string
  readonly conversationSubjectId?: string
  /** Typed execution failure (RUN-ERRORS-SPEC). Host sends code, not user-facing text. */
  readonly runError?: RunErrorPayload
  /** The line "A Bia passou para a conta Pessoal…" with its Desfazer (ACCOUNT-SWAP-SPEC §1). */
  readonly accountSwap?: AccountSwapEventView
  /** The Notice "Perguntar antes de trocar" (ACCOUNT-SWAP-SPEC §2). */
  readonly accountAsk?: AccountAskEventView
  /** The reply is still being written: ONE message that grows (same id, `followMessages` re-sends it) until this is absent. */
  readonly streaming?: true
  /** “Direcionar agora”: the persona whose open turn this message was steered into (survives a reload). */
  readonly steeredPersonaId?: string
  /** The line a Parar left in the thread (“Você parou aqui · Continuar”). */
  readonly stopped?: true
  readonly stoppedTicketId?: string
  /** P1-9 “Proposta de {persona}”: the card with Aceitar · Agora não (read from the body marker; the live status is `listTaskProposals`). */
  readonly taskProposal?: TaskProposalCardView
  /** A persona's structured question (chips, “Pergunta n de m”); the live state is `listPersonaAsks`. */
  readonly personaAsk?: PersonaAskCardView
  /** Colheita item 19a: a number or small chart the persona reported (`[[indicador: …]]` read from her message); "Fixar na Visão geral" pins it. */
  readonly indicatorOffer?: IndicatorOfferView
  /** EQUIPE-REAL: a request one persona made to a colleague (“Bia pediu ajuda ao Teo”, “Teo entregou para Bia”); the bilhete is in the Task, never here. */
  readonly handoff?: HandoffCardView
  /** EQUIPE-REAL: a colleague reviewed the work before it reached the person (“Revisado pelo Atlas”, “Atlas pediu ajustes”). */
  readonly review?: ReviewCardView
  /** CV-8: this line is one persona's part of a block (“Toda a equipe”, “Quem tiver algo a dizer”, several @menções). */
  readonly fanout?: FanoutLineView
  /** HT-3: a harness action the host took for the person, with the outcome (the UI writes the words from the fields). */
  readonly harness?: HarnessActionView
  /** CV-5: the status line of a Task several personas were named for (“Bento está com Nina em “…””); the UI writes the words from the fields. */
  readonly taskWith?: TaskWithView
  /** TEAM-7: this message is the morning card (“Bom dia”) of the Coordenação; the body is the same card as plain text. */
  readonly dailyBrief?: DailyBriefView
  /** HT-9: the preview of an external action, when this message IS its card (`action-card:<id>`): the real content, updated in place as the person decides. */
  readonly actionPreview?: ActionPreviewWire
  /** COLHEITA 5: a persona acted inside the product on its own (`activity-line:<id>`): the line "A Bia criou a rotina … · Desfazer" (the Desfazer lasts 5 min). */
  readonly actionEvent?: ActionEventView
  /** TEAM-4: this line is part of a round of OPINION a persona asked of the team (the question, one colleague's answer, or the consolidation). */
  readonly opinion?: OpinionView
  /** EQUIPE-REAL §0: the PLAN of a request done in parts, once; its chips change in place (the stream re-sends the same message). */
  readonly teamPlan?: TeamPlanView
  /** EQUIPE-REAL §0: the ONE delivery card of a request, when every part is ready for the person. */
  readonly deliveryCard?: DeliveryCardView
  /**
   * R1 (EQUIPE-REAL §0): this line is a STATE of a Task, written by the host — not something anybody said. Typed and stored with the event
   * (never read from the words), so the cards (plan, delivery) can take it in and the thread can leave it out. Only with `Config.teamwork`.
   */
  readonly stateLine?: StateLineView
  /**
   * P0-1 (Atlas 07/11, EQUIPE-REAL-SPEC §(e)): the files a persona SAVED in the draft of a Task during ONE turn. ONE typed line per turn that saved something
   * (never one per write), authored by the persona that saved; the same path written many times is one item (its final state, in the order of the first write).
   * `body` is the Portuguese fallback sentence; the screen writes its own. Only with `Config.teamwork`.
   */
  readonly filesSaved?: { readonly files: readonly DraftFileView[] }
  /** Item 22: the line says someone named is not on this channel; the buttons (Pôr no canal, Agora não, Ir para) come from here, the words stay in the body. */
  readonly channelNotice?: readonly ChannelNotice[]
}

/**
 * P0-1 (EQUIPE-REAL-SPEC §(e)): a file a persona saved in the DRAFT of a Task (art as a file, a text, a sheet). The screen opens it in Revisar mudanças
 * (`onOpenDraftFile({ taskId, path })`); the picture comes from `thumb`, never from a new byte RPC.
 */
export interface DraftFileView {
  /** Relative to the root of the draft, with `/`: the SAME string `ReviewFileView.path` has for this file. */
  readonly path: string
  /** What the chip shows (`cartaz.svg`). */
  readonly name: string
  readonly mime: string
  /** The Ticket the Revisar uses. */
  readonly taskId: string
  readonly personaId: string
  readonly size?: number
  /**
   * The picture, as a data URL the host made when the line was written, so the thread keeps it after Aplicar or Descartar (`thumbOf` in `draft-turn-files.ts`; at most `DRAFT_THUMB_MAX_CHARS` = 128 KB
   * of text, and about 384 KB for all the thumbnails of one line). For a SVG file: the SVG ITSELF (`data:image/svg+xml;base64,…`, checked: no script, nothing external, `xmlns` ensured) — vector, the screen scales
   * it with no loss; a SVG too big for the budget falls back to a PNG (one that does not parse, or is not safe, gets no thumbnail). For a raster: a PNG up to 640 px wide (png, gif, webp) or a JPEG
   * (`data:image/jpeg;base64,…`, for a jpg: a photo as a PNG would not fit), never enlarged, narrower/lighter only when needed to fit (down to 96 px). Absent when the file is not an image or the host could not make it (the screen then shows the icon of the type).
   */
  readonly thumb?: string
  /** For an SVG: the PNG sibling the team SAW (models only read raster). */
  readonly pngPath?: string
}

/**
 * The state a host line stands for. `task_progress` = “Em andamento: …” (a Task started); `part_done` = a PART of a request done in parts
 * delivered; `task_done` = a Task that is not a part delivered. `text`: `status` = the host wrote the sentence (“Pronto: …”), `result` = the
 * line is the persona's OWN words (the delivery itself — the cards fold it in, they do not drop it).
 */
export interface StateLineView {
  readonly kind: 'task_progress' | 'part_done' | 'task_done'
  readonly ticketId: string
  /** The request the Task is a part of — the same id the plan card carries (`split-<message>`, or the campaign's). Absent for a lone Task. */
  readonly groupId?: string
  readonly text: 'status' | 'result'
}

/** One part of a request on the plan card. `taskId` is empty while the part is not open yet (it is "queued"). */
export interface TeamPlanPartView {
  readonly taskId: string
  readonly personaId: string
  /** The SHORT name of the part ("Texto", "Arte", "Posts", ≤ 24): what the cards write; the long `title` stays for the board and the Task (tooltip). */
  readonly shortName: string
  /** Short and human (≤ 48), never the raw request. */
  readonly title: string
  readonly status: 'queued' | 'doing' | 'waiting' | 'with-colleague' | 'reviewing' | 'needs-you' | 'done' | 'stopped'
  /** `with-colleague`: with whom. */
  readonly withPersonaId?: string
  /** `needs-you`: the card of Aprovações that asks for the decision (the Task id for a delivery that waits for her review). */
  readonly approvalId?: string
  /** `stopped`: a short human reason ("Ver motivo"). */
  readonly reason?: string
}

/** The plan of a request ("Dividi assim:"). */
export interface TeamPlanView {
  readonly requestId: string
  readonly title: string
  readonly parts: readonly TeamPlanPartView[]
}

/** The delivery of a request: one card, with the seal when a colleague reviewed it. */
export interface DeliveryCardView {
  readonly requestId: string
  readonly title: string
  readonly parts: readonly { readonly taskId: string; readonly personaId: string; readonly shortName: string; readonly title: string }[]
  readonly reviewedBy?: { readonly personaId: string; readonly name: string }
  /** The card of Aprovações that opens the delivery waiting for the person ("Revisar"); without it there is no button. */
  readonly approvalId?: string
}

/** A colleague's mark on a draft: liked, a suggestion, a point of attention, or nothing to add. */
export type OpinionMark = 'liked' | 'suggestion' | 'attention' | 'nothing'

/**
 * TEAM-4 (contracts/team-real.md §3/§7): one line of a round of opinion. `request` carries the question (the body) and the draft;
 * `reply` one colleague's answer (the body is 1–3 lines) with its `mark`; `consolidated` the 1–2 lines of the asker, with the
 * “Antes · Depois” when the text changed. The words around are the UI's; the body is a readable fallback.
 */
export interface OpinionView {
  readonly kind: 'request' | 'reply' | 'consolidated'
  /** Ties the lines of ONE round (the tool call that asked). */
  readonly requestId: string
  /** The Task of the persona that asked. */
  readonly taskId: string
  readonly round: number
  readonly maxRounds: number
  /** `request`: the draft in text. */
  readonly draftText?: string
  /** `request`: the draft's images (attachment ids). */
  readonly attachmentIds?: readonly string[]
  /** `request`: what the asker wrote about the image. */
  readonly alt?: string
  /** `request`: the ART the asker saved in the draft of her Task and put in opinion (`draft.files`); the person's own attachments stay in `attachmentIds`. */
  readonly files?: readonly DraftFileView[]
  readonly audience?: 'team' | 'some'
  /** Only when the Tally measures. */
  readonly estimate?: { readonly responses: number; readonly cost?: string }
  /** `request`: colleagues whose engine does not read the image (not called). */
  readonly noVision?: readonly string[]
  /** `request`: who asked (the prompt of a colleague included by text only names them). */
  readonly askerPersonaId?: string
  /** `request`: the colleagues of `noVision` the PERSON included by text only (`includeOpinionTextOnly`). The card shows `noVision` minus these as "não veem imagens neste motor". */
  readonly textOnlyPersonaIds?: readonly string[]
  /** `request`: the colleagues invited to answer. */
  readonly replierPersonaIds?: readonly string[]
  /** `reply`: the mark. */
  readonly mark?: OpinionMark
  /** `reply`: the turn failed or came back empty (the body says so; this is NOT “nothing to add”). */
  readonly failed?: true
  /** `reply`: the colleague does not see the image and answered by TEXT ONLY. ALWAYS set for such a reply (the chip "Opinou só pelo texto"); the body is her own words, never prefixed. */
  readonly textOnly?: true
  /** The Tally's budget of the round (`contracts/opinion-budget.md`): the footer comes ready. */
  readonly budget?: {
    readonly rodape?: string
    readonly round?: number
    readonly roundsCap?: number
    readonly stop?: string
    readonly skipped?: readonly { readonly id: string; readonly why: string }[]
  }
  /** `consolidated`: the new version, for “Antes · Depois”. */
  readonly version?: {
    readonly k: number
    readonly before: { readonly text?: string; readonly attachmentIds?: readonly string[] }
    readonly after: { readonly text?: string; readonly attachmentIds?: readonly string[] }
  }
}

/** TEAM-7 (contracts/team-real.md §4/§7): the morning meeting, with the real ids. Nothing here comes from a model. */
export interface DailyBriefView {
  /** The person's local day, `YYYY-MM-DD`. */
  readonly day: string
  readonly coordinatorPersonaId: string
  /** Finished yesterday, newest first, at most 3. */
  readonly yesterday: readonly DailyBriefLineView[]
  /** The "e mais {n}" of Ontem. */
  readonly yesterdayMore: number
  /** Who is on what today: one per busy persona. */
  readonly today: readonly DailyBriefLineView[]
  /** What waits for the person ("Precisa de você"). */
  readonly needsYou: { readonly count: number }
  /** The person paused "Resumo da manhã" after this card went out. */
  readonly paused: boolean
  /** For "Pausar o resumo da manhã". */
  readonly routineId: string
  /** `morning` = the automatic "Bom dia" (with the sunrise spot); `on-demand` = asked for by hand after noon, "Resumo do dia · {hora}" (no spot). */
  readonly variant: 'morning' | 'on-demand'
}

/** One line of the morning card: ids and the human title of the Task, never anything else. */
export interface DailyBriefLineView {
  readonly taskId: string
  readonly personaId: string
  readonly title: string
  /**
   * Present when the line stands for a finished REQUEST (every part done): the name of the request, the short names of its parts and the
   * personas who did them, in order — the faces are THEIRS, never the Coordenação's. A line WITHOUT it is the part of a request still open.
   */
  readonly request?: DailyBriefRequestView
}

/** A finished request as the morning card groups it ("Campanha de lançamento ficou pronta (Texto, Arte e Posts)"). */
export interface DailyBriefRequestView {
  readonly requestId: string
  /** The name of the work, short ("Campanha de lançamento"), never the person's own sentence. */
  readonly title: string
  /** The short names of the parts ("Texto", "Arte", "Posts"). */
  readonly parts: readonly string[]
  /** Who did them, in the order of the parts (no repeats). */
  readonly personaIds: readonly string[]
}

/** `postDailyBriefNow` (contracts/team-real.md §7): the card of the day, asked for NOW. `requestId` asks for one more card of its own. */
export interface DailyBriefNowRequest {
  readonly workspaceId: string
  readonly projectId: string
  /** `[A-Za-z0-9_-]`, 1..64: the same key returns the same card, a new key a new card. Omit for the day's card. */
  readonly requestId?: string
}

/** Posted now / was already there / why there is none. The UI writes its own words; `text` is the readable fallback (pt-BR). */
export type DailyBriefNowOutcome = 'posted' | 'already' | 'nothing-to-say' | 'off' | 'no-coordination' | 'no-channel'

export interface DailyBriefNowView {
  readonly outcome: DailyBriefNowOutcome
  /** The thread message that carries the card (`posted`, `already`); its `MessageView.dailyBrief` is the card. */
  readonly messageId?: string
  readonly text: string
}

/** `includeOpinionTextOnly` (contracts/team-real.md §12): the person includes a colleague who does not see images, BY TEXT ONLY. */
export interface IncludeOpinionTextOnlyRequest {
  readonly workspaceId: string
  readonly projectId: string
  /** The `OpinionView.requestId` of the card. */
  readonly requestId: string
  /** A colleague of `noVision` who has no reply yet. */
  readonly personaId: string
}

/** Her line is in the thread (`MessageView.opinion` with `textOnly: true`); `already` when she had answered before (nothing was asked again). */
export interface IncludeOpinionTextOnlyView {
  readonly replyId: string
  readonly mark: OpinionMark
  readonly failed?: true
  readonly already?: true
}

/**
 * CV-8 (contracts/mentions-fanout.md): one persona's line in a block. TYPED: the UI writes the words (fanout.* keys); the body of the
 * message is only a readable fallback.
 */
export interface FanoutLineView {
  /** Same for every line of the block. */
  readonly id: string
  readonly source: 'everyone' | 'relevant' | 'mentions'
  /** Lines the block will have, and this line's place among them (1-based). */
  readonly total: number
  readonly index: number
  readonly personaId: string
  /** `reply` answered · `nothing` “nada a acrescentar” · `limit` at its limit (no call) · `paused` (no call) · `failed` the turn failed or came back empty. */
  readonly kind: 'reply' | 'nothing' | 'limit' | 'paused' | 'failed'
  /** `limit`: when it lifts (ISO), when known. */
  readonly until?: string
  /** `failed`: a fixed, honest sentence with no jargon (tooltip). */
  readonly message?: string
  /** “Quem tiver algo a dizer” and nobody was picked: the one line of the Coordenação. */
  readonly nobody?: true
}

/** CV-8 “Tentar de novo”: repeat ONE persona of a block whose line says she could not answer. */
export interface RetryFanoutReplyRequest extends ProjectScopeRequest {
  /** The person's message that opened the block. */
  readonly messageId: string
  readonly personaId: string
}

/** Whether the retry started (the line is replaced in place when it finishes) or why not. */
export interface RetryFanoutReplyView {
  readonly started: boolean
  readonly reason?: 'disabled' | 'not-found' | 'not-failed' | 'running' | 'paused' | 'limit'
}

/** CV-8: what the composer chip shows before sending (“Toda a equipe · n respostas · ≈ c chamadas da sua IA”). Calls are EXACT, except “relevant” (1 + 0..5). */
export interface FanoutEstimateView {
  readonly source: 'everyone' | 'relevant' | 'mentions'
  /** Personas that will have a line. */
  readonly replies: number
  /** Personas that make a model call. */
  readonly asked: number
  readonly limited: number
  readonly paused: number
  readonly chamadas: { readonly min: number; readonly max: number }
}

/**
 * HT-3 (contracts/harness-tools.md): what happened when the PERSON moved a card to a “Fazendo” column. `started` = the persona that
 * owns it began working now; `held` = it did not, and `reason` says why (the card stays where the person put it).
 */
export interface HarnessActionView {
  readonly verb: 'board_card_move'
  readonly outcome: 'started' | 'held'
  readonly reason?: 'paused' | 'silence' | 'delivery_pending' | 'no_owner'
  /** For `silence`: the hour the silence ends ("07:00"), when the persona has a window. */
  readonly until?: string
  readonly ticketId: string
  readonly title: string
  readonly persona?: CollaboratorView
}

/**
 * COLHEITA 5: what a persona did inside the product by itself, as the thread line carries it. The UI writes the words from the fields; the
 * Desfazer exists only with `undoable` and a valid `undoUntil` (5 min after the action), and never for e-mail, posts or payments.
 */
export interface ActionEventView {
  /** The harness verb (`board_card_move`, `routine_create`…). */
  readonly verb: string
  /** Always the product itself ("Persona"): these actions never leave it. */
  readonly connectorName: string
  /** The card, sprint or routine the action was about (its human title). */
  readonly target: string
  readonly subject?: string
  readonly undoable?: boolean
  /** ISO instant at which the Desfazer ends. */
  readonly undoUntil?: string
  /** What `undoPersonaAction` takes. */
  readonly activityId: string
  /** Where it went ("Fazendo"), when the host knows. */
  readonly after?: string
  /** The person took it back. */
  readonly undone?: boolean
}

/** COLHEITA 5: take back one thing a persona did inside the product. */
export interface UndoPersonaActionRequest extends ProjectScopeRequest {
  readonly activityId: string
}

export interface UndoPersonaActionView {
  readonly undone: boolean
  /** The same answer a second time: nothing was run again. */
  readonly alreadyUndone?: boolean
}

/** A persona that works WITH the lead of a Task (CV-5, contracts/mentions-fanout.md). */
export interface CollaboratorView {
  readonly personaId: string
  readonly name: string
}

/** The thread line of a Task with collaborators: the lead (first named) and who is with it. */
export interface TaskWithView {
  readonly ticketId: string
  readonly title: string
  readonly lead: CollaboratorView
  readonly with: readonly CollaboratorView[]
}

/** One thing a persona proposes (P1-9, contracts/task-proposals.md). The words are final; the UI draws what comes. */
export interface TaskProposalItemView {
  /** Goes in `decideTaskProposal`. */
  readonly id: string
  readonly personaId: string
  readonly personaName: string
  /** “Posso retomar “Relatório de sexta”?” */
  readonly question: string
  /** One line, only fact. */
  readonly reason: string
}

/** The card as the thread stores it: one item = “Proposta de {persona}”, 2–3 = “Propostas da equipe”. */
export interface TaskProposalCardView {
  readonly kind: 'single' | 'digest'
  readonly items: readonly TaskProposalItemView[]
}

/** A proposal with its live state. `expired`: nobody answered in 3 days (neutral for the acceptance rate). */
export interface TaskProposalView extends TaskProposalItemView {
  readonly status: 'open' | 'accepted' | 'declined' | 'expired'
  /** The message that carries the card. */
  readonly cardId: string
  readonly createdAt: string
  readonly decidedAt?: string
  /** The Ticket an accepted proposal became (may appear a moment after, when the request waited for a free slot). */
  readonly ticketId?: string
  /** Title of that Ticket, for “Aceita · virou a tarefa {título}”. */
  readonly ticketTitle?: string
}

/** Aceitar (`accept: true`) or Agora não (`false`). Deciding again returns the state; it never creates a second Ticket. */
export interface DecideTaskProposalRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly accept: boolean
}

/** Desfazer of “Agora não”: the proposal is open again (only a declined one; an accepted one already is a Ticket). */
export interface ReopenTaskProposalRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
}

/** How each persona's proposals were received (PROACTIVITY §7 “propostas aceitas”). */
export interface ProposalStatsView {
  readonly personaId: string
  readonly personaName: string
  readonly accepted: number
  readonly declined: number
  /** Rolling acceptance 0–1 (starts at 0.5). */
  readonly rate: number
}

/** Machine code for a run-error card. UI owns the human text. */
export type RunErrorCode =
  | 'not_logged_in' | 'cli_not_found' | 'model_unavailable' | 'quota_exhausted'
  | 'budget_exhausted' | 'provider_unreachable' | 'engine_unavailable' | 'app_offline'

/** Wire payload for `MessageView.runError`. */
export interface RunErrorPayload {
  readonly code: RunErrorCode
  readonly provider?: string
  readonly model?: string
  readonly account?: string
  readonly persona?: string
  readonly resetAt?: string
  readonly command?: string
  readonly otherAccount?: boolean
  readonly reason?: EngineUnavailableReason | 'expired'
  readonly triggerId?: string
}

/** Message page plus exclusive cursor. */
export interface MessagePage {
  readonly events: readonly MessageView[]
  readonly nextSeq: number
}

/** Baseline-plus-increment frame for `followMessages`. */
export interface MessageStreamFrame {
  readonly kind: 'baseline' | 'upsert'
  readonly events: readonly MessageView[]
  readonly order: readonly string[]
}

/** Cancel an in-flight conversation reply. */
export interface CancelReplyRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly eventId: string
}

/** JSON diagnostics for support (no secrets). */
export interface DiagnosticsJson {
  readonly json: string
}

/** One file in the Revisar panel. */
export interface ReviewFileView {
  readonly path: string
  readonly added: number
  readonly deleted: number
  /** P0-1: for a PICTURE (png, jpeg, webp, gif, svg), the file in the draft as a data address: what the persona made. Absent when it is not a picture or is too big. */
  readonly afterImage?: string
  /** P0-1: the same picture as it is now in the person's own folder (what Aplicar would replace); absent for a new file. */
  readonly beforeImage?: string
  /** P0-1: the folder's version, for the conflict screen ("yours"); the same address as beforeImage. */
  readonly folderImage?: string
}

/** Diff card for Lumen Revisar. */
export interface ReviewSummaryView {
  readonly ticketId: string
  readonly files: readonly ReviewFileView[]
  readonly added: number
  readonly deleted: number
  readonly patch: string
  readonly patchTruncated: boolean
  readonly secretsRedacted: boolean
  readonly testsClaimed: readonly string[]
  readonly hasWorktree: boolean
}

/** Ticket selected for summary, preparation or discard. */
export interface ReviewTicketRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
  /** Ignored legacy command; review operations require only the ticket identifier. */
  readonly command?: TicketCommandRequest['command']
  readonly reason?: string
}

/** Accept the review (ff or squash). */
export interface AcceptReviewRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
  readonly mode: 'ff' | 'squash'
  readonly conflicts?: readonly ReviewConflictResolutionView[]
}

/** Exact file versions displayed for a person's ordinary-folder conflict choice. */
export interface ReviewFileVersionView {
  readonly hash: string
  readonly mode: '100644' | '100755'
}

/** Missing versions represent deleted files; paths stay relative to the project. */
export interface ReviewFileConflictView {
  readonly path: string
  readonly user: ReviewFileVersionView | null
  readonly persona: ReviewFileVersionView | null
}

/** Choice applies only to the exact file versions shown by the previous review. */
export interface ReviewConflictResolutionView extends ReviewFileConflictView {
  readonly choice: 'keep_mine' | 'keep_persona' | 'keep_both'
}

/** Ask for another assignment round. */
export interface RequestChangesRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
  readonly feedback: string
}

/** Result of accept. */
export interface ReviewAcceptView {
  readonly kind: 'merged' | 'blocked'
  readonly mode: string
  readonly explanation: string
  readonly restorePointId?: string
  readonly conflicts?: readonly ReviewFileConflictView[]
}

/** Update a project's name, description, and file root. Empty `rootPath` clears it. */
export interface UpdateProjectRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly description: string
  readonly rootPath: string
}

/** List, stat, or read one path under the project's file root. `path` is relative (empty = root). */
export interface ProjectFileRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly actorId: string
  readonly path: string
}

/** One directory child. */
export interface ProjectFileEntry {
  readonly name: string
  readonly kind: 'file' | 'directory'
}

/** Directory listing confined to the project root. `need-root` means choose the folder. */
export interface ProjectFileListing {
  readonly status: 'ok' | 'need-root'
  readonly path: string
  readonly entries: readonly ProjectFileEntry[]
  readonly message: string
}

/** Stat of one confined path. */
export interface ProjectFileStat {
  readonly status: 'ok' | 'need-root'
  readonly path: string
  readonly kind: 'file' | 'directory' | 'missing'
  readonly bytes: number
  readonly message: string
}

/** UTF-8 file body confined to the project root. */
export interface ProjectFileText {
  readonly status: 'ok' | 'need-root'
  readonly path: string
  readonly text: string
  readonly bytes: number
  readonly message: string
}

/** Set or clear the project file root. Empty `rootPath` clears it. */
export interface SetProjectRootRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly rootPath: string
}

/** Result of {@link SetProjectRootRequest}. */
export interface ProjectRootView {
  readonly projectId: string
  readonly rootPath: string
  readonly status: 'ok' | 'cleared' | 'invalid' | 'need-root'
  readonly message: string
  readonly isRepo: boolean
  readonly defaultBranch: string
  readonly dirty: boolean
}

/** Rivet OS dialog. Host never opens it; null = cancelled / unavailable. */
export interface PickDirectoryView {
  readonly path: string | null
}

/** One registered project folder (desktop reveal allowlist). */
export interface ProjectRootRow {
  readonly workspaceId: string
  readonly projectId: string
  readonly rootPath: string
}

/** Registered folders for a workspace. Empty rootPath is omitted. */
export interface ProjectRootListView {
  readonly roots: readonly ProjectRootRow[]
}

/** One dead-lettered effect/outbox row. */
export interface DeadLetterView {
  readonly id: string
  readonly projectId: string
  readonly cause: string
  readonly actionRetry: string
  readonly actionDiscard: string
  readonly attempts: number
  readonly at: string
}

/** Markdown zip. `base64` is the archive; never includes secrets in the filename. */
export interface ExportArchiveView {
  readonly filename: string
  readonly base64: string
}

/** Opt-in DMs for {@link ExportArchiveView}. */
export interface ExportRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly includeDmIds: readonly string[]
}

/** Create a routine. Empty silence fields mean no quiet window. */
export interface CreateRoutineRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly name: string
  readonly rrule: string
  readonly timeZone: string
  readonly catchUp: 'skip' | 'run_once' | 'run_all'
  readonly silenceStart: string
  readonly silenceEnd: string
  /**
   * IV-9 “O que fazer”: the request the routine makes to its owner each time it is due (≤ 2000 characters). Absent ⇒ the
   * scheduler's default sentence built from the name. A present value must not be blank.
   */
  readonly prompt?: string
  /** IV-9 “Quem faz”: a persona of the project. Absent or `''` ⇒ the Coordenação decides. */
  readonly ownerPersonaId?: string
  /**
   * Item 26 “Quando”: absent or `{ kind: 'schedule' }` = the clock (`rrule`, `catchUp`). `{ kind: 'event', source, filter }` = when something happens in a source the person
   * connected; `rrule` and `catchUp` are then ignored. Refused when the source is not connected (the team could not read it).
   */
  readonly trigger?: RoutineTrigger
}

/** Routine card. */
export interface RoutineView {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly rrule: string
  readonly timeZone: string
  readonly paused: boolean
  readonly catchUp: 'skip' | 'run_once' | 'run_all'
  /** “O que fazer”; `''` when the routine has none (the scheduler uses its default sentence). */
  readonly prompt: string
  /** “Quem faz”; absent when the Coordenação decides. */
  readonly ownerPersonaId?: string
  /** The schedule in plain pt-BR (“De segunda a sexta, às 9h”); the raw rule when it cannot be read. */
  readonly humanSchedule: string
  /** Next due instant (ISO); `''` when paused or unknown. */
  readonly nextRunAt: string
  /** Item 26: present only when the routine starts by an event (then `humanSchedule` says it in words and `nextRunAt` is `''`). */
  readonly trigger?: RoutineTrigger
  /** `true` on the routines the team keeps for each persona (`initiative:<id>`): they can be paused and edited, never deleted. */
  readonly system?: true
}

/** Pause or resume one routine. */
export interface PauseRoutineRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly paused: boolean
}

/**
 * Edit a routine (IV-9). Every field but the ids is optional: absent = unchanged. `silenceStart`/`silenceEnd`: `''` clears
 * the quiet window (both ends clear together); `ownerPersonaId: ''` hands the routine back to the Coordenação. A new
 * `rrule` or `timeZone` cancels the occurrences still queued for the old one.
 */
export interface UpdateRoutineRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly name?: string
  readonly prompt?: string
  readonly ownerPersonaId?: string
  readonly rrule?: string
  readonly timeZone?: string
  readonly catchUp?: 'skip' | 'run_once' | 'run_all'
  readonly silenceStart?: string
  readonly silenceEnd?: string
  /** Item 26: change when the routine starts (see {@link CreateRoutineRequest.trigger}). Leaving an event for a time needs `rrule` too. Absent = unchanged. */
  readonly trigger?: RoutineTrigger
}

/** Delete a routine with its “what/who” document and its runs. Creating the same id again is allowed (Desfazer). */
export interface DeleteRoutineRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
}

/** Schedule one occurrence. */
export interface ScheduleRoutineRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly runId: string
  readonly scheduledFor: string
}

/** Lease due runs. */
export interface ClaimRoutinesRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly leaseUntil: string
}

/** Run card. */
export interface RoutineRunView {
  readonly id: string
  readonly routineId: string
  readonly scheduledFor: string
  readonly status: 'pending' | 'leased' | 'done' | 'failed' | 'cancelled'
  readonly attempt: number
}

/** Identify one run. */
export interface RoutineRunRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly runId: string
}

/** Natural-language draft of one persona. */
export interface DraftPersonaRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly description: string
  readonly createdBy: string
}

/** Natural-language draft of a team. */
export interface DraftTeamRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly description: string
}

/** Item 18: open the conversation of a Task (the card of the board). */
export interface OpenTaskConversationRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
}

/** Item 18: where the conversation of a Task is. It is a thread of the Task's own stream: list and write with `listMessages`/`postMessage`/`followMessages` using `streamKind`, `ownerId` and `topicId`. */
export interface TaskConversationView {
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly topicId: string
  readonly title: string
  /** Who takes care of the Task (the first one answers a message that names nobody). */
  readonly caring: readonly { readonly personaId: string; readonly name: string }[]
}

/** Item 18: the person read the thread of a Task up to `seq`. */
export interface MarkTaskThreadReadRequest extends OpenTaskConversationRequest {
  readonly seq: number
}

/** Ticket command from the board. */
export interface TicketCommandRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
  readonly command: 'stop' | 'retry' | 'reevaluate' | 'dismiss' | 'complete'
  readonly reason: string
}

/**
 * Answer an Attention question (IV-10). The answer is the person's message in the thread the question was asked in; the text
 * (and any files) go back to the ticket. `text` may be empty when `attachmentIds` has at least one file.
 */
export interface AttentionReplyRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
  readonly text: string
  /** Files uploaded with `attachFile` to the conversation the question was asked in (`channel geral`, or that DM). */
  readonly attachmentIds?: readonly string[]
  /** Chips chosen on a structured question (`PersonaAskCardView.options`); one for a single choice, several for a multiple one. */
  readonly optionIds?: readonly string[]
}

/** An answer chip of a structured question. */
export interface AskOptionView {
  readonly id: string
  readonly label: string
}

/** How a request to a colleague stands: asked, delivered (the colleague's work came back), resumed (the asker went on with it), held (the colleague is paused), blocked. */
export type HandoffStatus = 'asked' | 'delivered' | 'resumed' | 'held' | 'blocked'

/**
 * A request one persona made to a colleague, as the thread line carries it (contracts/team-real.md). `taskId` is the colleague's
 * Task, `fromTaskId` the Task that asked. `mode`: `help` = the colleague helps and hands it back; `handoff` = the work goes on to the
 * colleague. `connector` names the one the colleague lacks when `blocked`. The words are the UI's.
 */
export interface HandoffCardView {
  readonly fromPersonaId: string
  readonly toPersonaId: string
  readonly taskId: string
  readonly fromTaskId: string
  readonly title: string
  readonly mode: 'handoff' | 'help'
  readonly status: HandoffStatus
  readonly reason?: string
  readonly connector?: string
  /** `review`: the request is the review step of the flow (“Bia pediu a revisão ao Atlas”), not a persona's own ask for help. */
  readonly purpose?: 'review'
}

/**
 * The outcome of a review between colleagues, as the thread line carries it (contracts/team-real.md; `[[review:{json}]]`).
 * `reviewed` = approved (the “Revisado pelo {R}” seal); `returned` = sent back to the author (round 1 or 2), or, with `openPoints`,
 * the third time: the work goes on to the person WITHOUT the seal and with the points in plain sight.
 */
export interface ReviewCardView {
  readonly kind: 'reviewed' | 'returned'
  readonly reviewerPersonaId: string
  readonly authorPersonaId: string
  readonly taskId: string
  readonly round: number
  readonly maxRounds: number
  readonly openPoints?: number
  /** `returned`: the first point, one line. */
  readonly summary?: string
}

/**
 * A persona's structured question as the thread card carries it (contracts/structured-question.md): chips, single or multiple
 * choice, and where it sits in a sequence asked one at a time (“Pergunta 2 de 3”). Free text and files always answer too.
 */
export interface PersonaAskCardView {
  /**
   * `fimDoTurno` = the end-of-turn choice card (colheita item 11): 2..6 options A..F, no Ticket waits for it, and a tap is a new
   * short message from the person. Absent = the question of a Task that waits (the card above).
   */
  readonly kind?: 'fimDoTurno'
  /** The Attention id: stable for this question (for an end-of-turn card, `choice:` plus the message id). */
  readonly askId: string
  readonly ticketId: string
  readonly personaId: string
  readonly personaName: string
  readonly question: string
  /** 2..8 chips; absent = words only. */
  readonly options?: readonly AskOptionView[]
  readonly multiple: boolean
  readonly step?: { readonly index: number; readonly total: number }
}

/** A structured question with its live state: `open`, `answered` (read-only, with the choices) or `cancelled` (the task ended first). */
export interface PersonaAskView extends PersonaAskCardView {
  readonly status: 'open' | 'answered' | 'cancelled'
  /** The thread message that carries the card. */
  readonly cardId: string
  readonly createdAt: string
  readonly answer?: {
    readonly optionIds: readonly string[]
    readonly text: string
    readonly attachmentIds: readonly string[]
    readonly answeredAt: string
  }
}

/** When a pinned number is refreshed: every hour, or every day at 08:00 (colheita item 19a). */
export type IndicatorSchedule = 'hourly' | 'daily'

/** A number or a small chart a persona reported in a message (`MessageView.indicatorOffer`): what "Fixar na Visão geral" would pin. */
export interface IndicatorOfferView {
  /** The persona's message that carries it. */
  readonly messageId: string
  readonly name: string
  readonly data: IndicatorData
}

/** The result of "Testar agora": the real number, good to pin for a few minutes. */
export interface IndicatorTestView {
  readonly testId: string
  readonly name: string
  readonly data: IndicatorData
}

/** A pinned indicator as the Visão geral draws it ("Seus números"). */
export interface IndicatorView {
  readonly id: string
  readonly name: string
  readonly kind: IndicatorData['kind']
  readonly data: IndicatorData
  readonly schedule: IndicatorSchedule
  /** `updating`: the old value stays. `failed`: the old value stays and `failure` says why. */
  readonly status: 'ok' | 'updating' | 'failed'
  readonly failure?: string
  readonly updatedAt: string
  readonly alertDropPct?: number
  /** The last refresh fell past the alert rule. `seen`: she marked "Já vi" (the notice left the list; the card keeps its border until the next refresh). */
  readonly alert?: { readonly pct: number; readonly text: string; readonly at: string; readonly seen?: true }
  readonly personaId: string
  readonly personaName: string
  readonly sourceMessageId: string
}

/** Test the number of a persona's message with real data (quiet turn). */
export interface TestIndicatorRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly messageId: string
}

/** Pin what a test showed. */
export interface PinIndicatorRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly testId: string
  readonly name: string
  readonly schedule: IndicatorSchedule
  /** "Avisar quando cair mais de N%" (numbers only). */
  readonly alertDropPct?: number
}

/** One pinned indicator. */
export interface IndicatorRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
}

/** A tap on an option of an end-of-turn choice card (`PersonaAskCardView.kind === 'fimDoTurno'`). */
export interface AnswerChoiceRequest {
  readonly workspaceId: string
  readonly projectId: string
  /** The persona's message that carries the card (`PersonaAskView.cardId`). */
  readonly messageId: string
  /** `a`..`f`: the option of the card. */
  readonly optionId: string
}

/** The structured questions of a project (optionally of one Ticket), oldest first. */
export interface ListPersonaAsksRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId?: string
}

/** Create a vault record. */
export interface CreateVaultRecordRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly kind: 'brief' | 'constraint' | 'decision' | 'memory'
  readonly body: string
  readonly authorId: string
}

/** Vault record on the wire. */
export interface VaultRecordView {
  readonly id: string
  readonly projectId: string
  readonly kind: 'brief' | 'constraint' | 'decision' | 'memory'
  readonly body: string
  readonly status: 'active' | 'revoked'
  /** The fact this record states (`company.card` is the company Ficha): absent for an ordinary record. Lets a screen tell the Ficha from the owner's own description (Carbon P1-11). */
  readonly factKey?: string
}

/** Cofre v2: one Login, Chave or the company Ficha (never a secret; `hasSecret` says whether one is kept). */
export type { CofreEntryKind, CofreEntryView } from './cofre-entries.ts'

/** Cofre v2: what a CSV import would do, and what it did (no password in either). */
export type {
  CofreImportDuplicate,
  CofreImportFormat,
  CofreImportIgnored,
  CofreImportPreview,
  CofreImportResult,
  CofreImportRow,
} from './cofre-import.ts'

/** Cofre v2: the six-digit request the owner fills (never the digits). */
export type { CofreCodeRequestView, CofreCodeState } from './cofre-2fa.ts'

/** Item 26.4: the curated business-tool catalog the screen renders (cards with `linked` and `promised` decided by the host). */
export type {
  ConnectorCatalogCardView,
  ConnectorCatalogEntry,
  ConnectorCatalogView,
  ConnectorCategory,
  ConnectorVia,
} from './connector-catalog.ts'

/** Item 26.8: one health line per connector (state, action and the PT sentence the screen shows). */
export type {
  ConnectorHealthAction,
  ConnectorHealthState,
  ConnectorHealthView,
} from './connector-health.ts'

/** Item 13 "Ligar a IA para a equipe toda": what `getTeamAi`, `connectTeam`, `getTeamConnect` and `retryTeamPersona` take and return (contract: persona-spec/contracts/team-connect.md). */
export type {
  AccountChoice,
  ConnectTeamRequest,
  CliName as TeamEngineName,
  RetryTeamPersonaRequest,
  Room as AccountRoom,
  RowStatus as TeamRowStatus,
  StartResult as ConnectTeamResultView,
  TeamAiView,
  TeamConnectRow,
  TeamConnectView,
  WakeFailure as TeamRowReason,
  WithoutAiPerson,
} from './team-connect.ts'

/** Save a Cofre Login; the password goes to the sealed store, never to the record. */
export interface SaveCofreLoginRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly site: string
  readonly username: string
  /** Absent while EDITING (`id` set) keeps the sealed password and changes only the metadata. */
  readonly password?: string
  readonly title?: string
  /** Existing entry to replace; absent creates one. */
  readonly id?: string
}

/** Save a Cofre Chave (API key, token); the secret goes to the sealed store. */
export interface SaveCofreKeyRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly service: string
  /** Absent while EDITING (`id` set) keeps the sealed secret. */
  readonly secret?: string
  readonly title?: string
  readonly id?: string
}

/** Save the company Ficha: the only kind with no secret at all. */
export interface SaveCofreCompanyRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly legalName: string
  readonly document: string
  readonly email?: string
  readonly phone?: string
  readonly address?: string
  readonly id?: string
}

/** Remove a Cofre entry and its sealed secret. */
export interface RemoveCofreEntryRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
}

/** Read a Chrome/Bitwarden CSV: preview first, then commit the same text. */
export interface CofreImportRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly csv: string
}

/** Whether the Cofre can seal secrets on this machine (DPAPI available). */
export interface CofreStatusView {
  readonly sealable: boolean
}

/** Seal a connector token in its own slot (`connector:<provider>`), where the readers look. */
export interface SaveConnectorSecretRequest {
  readonly workspaceId: string
  readonly projectId: string
  /** Vault provider id (`imap`, `telegram`, `slack`, …). */
  readonly provider: string
  readonly secret: string
}

/** Ask whether a connector slot holds a sealed value. */
export interface ConnectorSecretRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly provider: string
}

/** Presence of a connector token, never its value. */
export interface ConnectorSecretStateView {
  readonly hasSecret: boolean
}

/** The owner fills the six digits of a request. */
export interface FillCofreCodeRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly code: string
}

/** Cancel a pending code request. */
export interface CancelCofreCodeRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
}

/** First-use / Pessoal onboarding. */
export interface OnboardingState {
  readonly hasPersonalProject: boolean
  readonly firstUse: boolean
  readonly personalProjectId: string
  readonly completed: boolean
}

/** One persona on the onboarding wire (no hardcoded names). */
export interface OnboardingPersonaSpec {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly personality: string
  readonly instructions: string
  readonly avatarKind: 'gallery' | 'upload' | 'silhouette'
  readonly avatarRef: string
  readonly runnerKind: 'dsh' | 'cli'
  readonly runnerCli: string
  readonly runnerModel: string
  readonly canRecruit: boolean
  readonly systemRoles: readonly SystemRoleView[]
}

/** Result of kicking the first real delivery on #geral. */
export interface FirstDeliveryStartView {
  readonly started: boolean
  readonly eventId: string
  readonly ticketId: string
  readonly idempotent: boolean
}

/** Persisted first-delivery milestone (V1-P0-2). Never a hang / "Carregando…". */
export type FirstDeliveryStatus = 'idle' | 'working' | 'ready' | 'failed'

/** Marco "Primeira entrega" on the Remote. */
export interface FirstDeliveryView {
  readonly status: FirstDeliveryStatus
  readonly eventId: string
  readonly ticketId: string
  readonly title: string
  readonly personaId: string
  readonly personaName: string
  readonly feedEventId: string
}

/** Idempotent first-run. Empty `cofreSeed` skips the vault proposal. */
export interface CompleteOnboardingRequest {
  readonly workspaceId: string
  readonly personalProjectId: string
  readonly displayName: string
  readonly team: readonly OnboardingPersonaSpec[]
  readonly templateIds: readonly string[]
  readonly runnerChoices: readonly string[]
  readonly cofreSeed: string
  /**
   * The person's own first request (step 5), ≤ 500 characters after trimming. The host uses this very text in the #geral
   * message and in the first-delivery assignment. Absent or blank ⇒ the default ask built from `cofreSeed`.
   */
  readonly firstRequest?: string
}

/** Ask for suggested first requests. No workspace is needed: step 5 runs before one exists. */
export interface SuggestFirstRequestsRequest {
  /** “Contexto da empresa” text of step 2. */
  readonly cofreSeed: string
}

/** 0–3 short pt-BR requests derived from what the person wrote; empty when there is nothing to derive from. */
export interface SuggestFirstRequestsView {
  readonly suggestions: readonly string[]
}

/** Typed connection probe failure for the UI (no stack, no secrets). */
export interface ConnectionProbeError {
  readonly code: 'cli_not_found' | 'not_logged_in' | 'quota_exhausted'
  readonly message: string
}

/** Detected CLI or connection (read-only probe). */
export interface ConnectionView {
  readonly id: string
  readonly kind: 'claude' | 'codex' | 'cursor' | 'opencode' | 'dsh'
  readonly available: boolean
  readonly loggedIn: boolean
  readonly loginHint: string
  /** The CLI's version when the probe read it (the host warms the isolation proof once per version). */
  readonly version?: string
  /** `checking` = still probing; UI must not show "desconectado". */
  readonly phase: 'checking' | 'ready'
  /** Item 13: the check ran out of time twice in a row (`phase` stays `checking`). Say "não consegui conferir" with a way to try again, never "sem login": that is only a confirmed logout. */
  readonly unconfirmed?: true
  readonly error?: ConnectionProbeError
  /** EFF-1: the models this ENGINE accepts and the levels of each (absent until the engine said). No "recommended" field exists. */
  readonly models?: readonly EngineModelView[]
  /** EFF-1: the levels that apply to "Padrão do motor" (the engine's own default model); empty/absent = no choice of effort. */
  readonly defaultEffortLevels?: readonly PersonaEffortLevel[]
  /** EFF-1 (EFFORT-SPEC §4.1): where the menu above came from — `cli` (the engine said it) or `static` (the table of what it is known to offer, when the CLI did not answer). Absent when there is no menu. */
  readonly source?: 'cli' | 'static'
}

/** EFF-1: the engine's reasoning-effort levels by the names the CLIs use (Claude: low … max; Codex also `ultra` on some models), lightest first. */
export type PersonaEffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'

/** EFF-1: one model of an engine, as the engine reported it. Empty `effortLevels` = that model has no choice of effort. */
export interface EngineModelView {
  readonly id: string
  readonly label: string
  readonly effortLevels: readonly PersonaEffortLevel[]
  /** What the engine itself runs at when no level is chosen, when it said. Informational only: the screen never pre-selects it. */
  readonly defaultEffort?: PersonaEffortLevel
}

/** WAVE2 — how personas rotate among your accounts on the same provider. */
export type RunnerSwapPolicy = 'fixed' | 'next_on_limit' | 'round_robin' | 'ask_before_swap'

/** Whether swap policy applies workspace-wide or per persona. */
export type RunnerSwapPolicyScope = 'workspace' | 'persona'

/** One logged-in seat on a provider (multiple per kind). */
export interface ConnectionAccountView {
  readonly id: string
  readonly provider: ConnectionView['kind']
  readonly label: string
  readonly available: boolean
  readonly loggedIn: boolean
  readonly loginHint: string
  readonly phase: 'checking' | 'ready'
  /** Item 13: same as `ConnectionView.unconfirmed`. */
  readonly unconfirmed?: true
  readonly error?: ConnectionProbeError
  readonly inUseCount?: number
  readonly loginCommand?: string
}

/** Optional persona selects its effective account rotation policy. */
export interface ListConnectionAccountsRequest extends ProjectScopeRequest {
  readonly personaId?: string
}

/** `listConnectionAccounts` payload. */
export interface ConnectionAccountsBundleView {
  readonly accounts: readonly ConnectionAccountView[]
  readonly swapPolicy: RunnerSwapPolicy
  readonly swapPolicyScope: RunnerSwapPolicyScope
  readonly personaPolicies?: readonly { readonly personaId: string; readonly policy: RunnerSwapPolicy }[]
}

/** Persist swap policy (owner/responsible). */
export interface SetRunnerSwapPolicyRequest extends ProjectScopeRequest {
  readonly policy: RunnerSwapPolicy
  readonly scope: RunnerSwapPolicyScope
  readonly personaId?: string
}

/** Stream identity for colored conversation subjects. */
export interface ConversationSubjectScope {
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
}

/** One colored subject on the wire. */
export interface ConversationSubjectView {
  readonly id: string
  readonly name: string
  readonly colorIndex: number
  readonly unreadCount: number
  readonly workingPersonaIds: readonly string[]
  readonly archived: boolean
}

/** `listConversationSubjects` payload. */
export interface ConversationSubjectsBundleView {
  readonly subjects: readonly ConversationSubjectView[]
  readonly activeSubjectId: string
}

/** Create one subject (max 7 colors). */
export interface CreateConversationSubjectRequest extends ConversationSubjectScope {
  readonly name: string
  readonly colorIndex?: number
}

/** Rename a subject (name never empty). */
export interface RenameConversationSubjectRequest extends ConversationSubjectScope {
  readonly subjectId: string
  readonly name: string
}

/** Archive or activate a subject. */
export interface ArchiveConversationSubjectRequest extends ConversationSubjectScope {
  readonly subjectId: string
}

/** Move a message onto another subject of the same stream. */
export interface MoveMessageToSubjectRequest extends ConversationSubjectScope {
  readonly eventId: string
  readonly subjectId: string
}

/** Add one provider account (no secrets). */
export interface AddConnectionAccountRequest extends ProjectScopeRequest {
  readonly provider: ConnectionView['kind']
  readonly label: string
  readonly homeDir?: string
}

/** Remove one stored account. */
export interface RemoveConnectionAccountRequest extends ProjectScopeRequest {
  readonly accountId: string
}

/** Relabel a stored account. */
export interface UpdateConnectionAccountRequest extends ProjectScopeRequest {
  readonly accountId: string
  readonly label: string
}

/** Start a private teach recording. */
export interface StartTeachSessionRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly consentVersion: string
}

/** Teach session id. */
export interface TeachSessionIdRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly sessionId: string
}

/** Stop capture and begin the local draft. */
export interface StopTeachSessionRequest extends TeachSessionIdRequest {
  readonly includeMicrophone: boolean
  readonly transcript?: string
  readonly frames?: readonly { readonly atMs: number; readonly imageRef: string; readonly changeScore: number }[]
}

/** Review/edit the candidate skill. `activate` stays false unless the person confirms. */
export interface SubmitTeachDraftRequest extends TeachSessionIdRequest {
  readonly steps: readonly TeachStepView[]
  readonly activate: boolean
  /** W2-10: the name the person chose in the review card (1–80 letters, trimmed). Without it the candidate keeps "Skill ensinada". */
  readonly skillTitle?: string
}

/** Enable a taught candidate after review. Tools cannot exceed the persona allow-list. */
export interface ActivateTaughtSkillRequest extends ProjectScopeRequest {
  readonly skillId: string
}

/** Promote a taught skill. Non-persona scope requires `explicit: true`. */
export interface PublishTaughtSkillRequest extends ProjectScopeRequest {
  readonly skillId: string
  readonly scope: 'persona' | 'project' | 'team'
  readonly explicit: boolean
}

/** One numbered teach step. */
export interface TeachStepView {
  readonly order: number
  readonly instruction: string
  readonly thumbnailAssetId?: string
  readonly verifyHint?: string
}

/** `startTeachSession` payload. */
export interface TeachSessionStartView {
  readonly sessionId: string
  readonly retentionDays: number
  readonly storageHintPt: string
}

/** Live teach session. */
export interface TeachSessionView {
  readonly status: 'recording' | 'paused' | 'processing' | 'draft' | 'unsupported' | 'discarded'
  readonly elapsedMs: number
  readonly frameCount?: number
  readonly error?: string
}

/** Candidate skill draft. */
export interface TeachDraftView {
  readonly steps: readonly TeachStepView[]
  readonly skillTitle: string
  readonly candidateSkillId?: string
}

/** Desktop notification policy (Rivet). */
export interface AttentionPolicyView {
  readonly workspaceId: string
  readonly projectId: string
  readonly delivery: 'summary' | 'ping'
  readonly proposalBudget: number
  readonly quietStart: string
  readonly quietEnd: string
}

/** Set the attention policy. */
export interface PutAttentionPolicyRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly delivery: 'summary' | 'ping'
  readonly proposalBudget: number
  readonly quietStart: string
  readonly quietEnd: string
}

/** One grouped attention line for the desktop. */
export interface AttentionEventView {
  readonly id: string
  readonly kind: 'needs-you' | 'review' | 'question' | 'failed' | 'done'
  readonly title: string
  readonly ticketId: string
  readonly at: string
  readonly personaId?: string
  readonly personaName?: string
  /** Gallery resource id; uploaded avatar paths never leave the host here. */
  readonly avatarId?: string
  readonly threadId?: string
  readonly streamId?: string
  readonly question?: string
  /** The question is structured: its chips, whether several may be chosen, and its place in a sequence. */
  readonly ask?: {
    readonly options?: readonly AskOptionView[]
    readonly multiple: boolean
    readonly step?: { readonly index: number; readonly total: number }
  }
  readonly code?: RunErrorCode
}

/** Stream frame for {@link attentionEvents}. */
export interface AttentionStreamFrame {
  readonly kind: 'baseline' | 'upsert' | 'resolved'
  readonly events: readonly AttentionEventView[]
  /** Ids removed from the current pending set, including decisions and acknowledgements elsewhere. */
  readonly eventIds?: readonly string[]
}

/** Desktop toast ack. Acked ids drop out of the next baseline. */
export interface AckAttentionRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly eventIds: readonly string[]
}

/** COLHEITA 17: who drives a browser profile right now. */
export interface BrowserHolderView {
  readonly kind: 'persona' | 'person'
  readonly id: string
}

/** COLHEITA 17: one browser profile as the screen shows it. */
export interface BrowserProfileView {
  readonly id: string
  readonly name: string
  /** Absent = free. */
  readonly holder?: BrowserHolderView
  /** Its Chrome is up. */
  readonly running: boolean
  /** Persona ids allowed to drive it. */
  readonly personas: readonly string[]
  /** Persona ids that use it when they do not name one. */
  readonly defaultsFor: readonly string[]
}

/** COLHEITA 17: the browser screen; an absent `chrome` means Chrome is not installed on this machine. */
export interface BrowserScreenView {
  readonly profiles: readonly BrowserProfileView[]
  readonly chrome?: { readonly path: string; readonly version?: string }
  /** Persona ids whose engine cannot carry the browser (Cursor): the screen says so instead of promising it. */
  readonly withoutBrowser?: readonly string[]
}

/** COLHEITA 17: a new profile name. */
export interface BrowserProfileNameRequest extends ProjectScopeRequest {
  readonly name: string
}

/** COLHEITA 17: rename one profile. */
export interface BrowserProfileRenameRequest extends ProjectScopeRequest {
  readonly profileId: string
  readonly name: string
}

/** COLHEITA 17: grant or revoke one profile for a persona. */
export interface BrowserProfileGrantRequest extends ProjectScopeRequest {
  readonly profileId: string
  readonly personaId: string
}

/** COLHEITA 17: act on one profile (take, release, close). */
export interface BrowserProfileRequest extends ProjectScopeRequest {
  readonly profileId: string
}

/** COLHEITA 24: the one-time code that pairs a dedicated station. */
export interface StationPairingCode {
  readonly code: string
  readonly expiresAt: string
}

/** COLHEITA 24: what the screen shows about the dedicated station of this machine. */
export interface StationView {
  readonly paired: boolean
  readonly power: 'segurando' | 'livre'
  readonly running: boolean
  readonly ram: { readonly freeBytes: number; readonly floorBytes: number; readonly perCliBytes: number }
  readonly queue: number
  readonly clis: number
  readonly tailscale: { readonly state: 'ativo' | 'parado' | 'ausente'; readonly address?: string; readonly line: string }
}

/** COLHEITA 24: the code typed on the station. */
export interface StationPairRequest extends ProjectScopeRequest {
  readonly code: string
}

/** COLHEITA 24: turn the station on or off. */
export interface StationRunningRequest extends ProjectScopeRequest {
  readonly running: boolean
}
/** Retention policy (archive-only by default). */
export interface RetentionPolicyView {
  readonly archiveOnly: boolean
  readonly quietStart: string
  readonly quietEnd: string
}

/** Put retention policy. */
export interface PutRetentionPolicyRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly archiveOnly: boolean
  readonly quietStart: string
  readonly quietEnd: string
}

/** One archive/delete log line. */
export interface RetentionLogView {
  readonly id: string
  readonly at: string
  readonly action: 'archived' | 'deleted'
  readonly recordId: string
}

/** Context a turn used (ticket origin + latest inputs). */
export interface UsedContextRecord {
  readonly id: string
  readonly kind: string
  readonly body: string
  readonly required: boolean
  readonly restricted: boolean
  readonly title?: string
  readonly locator?: string
}

/** Triggers a ticket used (origin + later trigger inputs) plus Cofre compilation. */
export interface TurnContextView {
  readonly ticketId: string
  readonly triggerIds: readonly string[]
  readonly title: string
  readonly records: readonly UsedContextRecord[]
}

/** Cofre records that entered (or were restricted from) one turn. */
export interface UsedContextView {
  readonly eventId: string
  readonly records: readonly UsedContextRecord[]
}

/** Look up Contexto usado for a human message. */
export interface UsedContextRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly eventId: string
}

/** Editable persona draft (Forge schema fields). */
export interface PersonaDraft {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly personality: string
  readonly instructions: string
  readonly avatarKind: 'gallery' | 'upload' | 'silhouette'
  readonly avatarRef: string
  readonly runnerKind: 'dsh' | 'cli'
  readonly runnerCli: string
  readonly runnerModel: string
  readonly canRecruit: boolean
  readonly systemRoles: readonly SystemRoleView[]
}

/** Só quando pedido · Propor · Agir dentro de limites. */
export type AutonomyMode = 'asked' | 'propose' | 'act'

/** Autonomy + attention budget for one persona in a project. */
export interface AutonomyConfig {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly mode: AutonomyMode
  readonly proposalBudget: number
  readonly tokenBudget: number
  readonly executionBudget: number
  readonly silenceStart: string
  readonly silenceEnd: string
}

/** Identify one persona in a project. */
export interface PersonaScopeRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
}

/** Scheduler tick (fake-clock friendly). */
export interface TickProactivityRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly leaseUntil: string
  readonly stallAfterMs: number
}

/** Counts from {@link TickProactivityRequest}. */
export interface ProactivityTickView {
  readonly initiatives: number
  readonly skipped: number
  readonly warnings: number
}

/** Event Source (PR, error, deadline). */
export interface FireProactiveEventRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly title: string
  readonly subjectId: string
}

/** One persona on the Visão geral "agora" strip. */
export interface PersonaNowView {
  readonly personaId: string
  readonly name: string
  readonly title: string
  readonly state: 'working' | 'resting' | 'stuck' | 'waiting'
  readonly currentTask: string
  readonly currentTaskId: string
  readonly queueCount: number
  readonly idleMinutes: number
  readonly deliveriesToday: number
  readonly proposalsAcceptedToday: number
  /** Files the persona already changed in the draft of its current task (SW-7). Absent or 0 = no draft: the task stays just “Trabalhando”. */
  readonly draftFiles?: number
  /**
   * Item 7: the step her open turn is on, in plain words ("lendo os arquivos"): never a tool name or a path. Present only while she works and the
   * host knows the step (the last tool the turn called); absent = the line stays just “Trabalhando”. Same vocabulary as the host's status answer.
   */
  readonly sentence?: string
  /** Muse state vocabulary: paused ON PURPOSE ("Pausada"). Present only when `true`; absent = not paused. Same fact as `PersonaView.paused`. */
  readonly paused?: true
  /** Muse state vocabulary: resting by silence ("Descansando"): the team's Janela de silêncio, the whole team paused, or her own silence window. Present only when `true`. Same fact as `PersonaView.quiet`. */
  readonly quiet?: true
}

/** Visão geral — agora. */
export interface OverviewNowView {
  readonly personas: readonly PersonaNowView[]
}

/** One "Enquanto você estava fora" line: something that HAPPENED since the person was last here. */
export interface AwayEventView {
  readonly id: string
  readonly at: string
  readonly body: string
  /** The real Task to open (empty when the event has none, e.g. an initiative that did not become a Task). */
  readonly taskId: string
  /** The Task's real title (empty when unknown; never the raw id). */
  readonly taskTitle: string
  readonly kind: 'delivery' | 'proposal' | 'watchdog'
  /** Who did it, from the team (absent when the host cannot tell). */
  readonly personaId?: string
  readonly personaName?: string
}

/** Something that waits for the person RIGHT NOW (state, not event; it stays until they decide). */
export interface AwayWaitingView {
  readonly id: string
  /** `review`: a result waits for Aplicar/Descartar · `question`: a Task asks something · `approval`: a proposal waits in Aprovações. */
  readonly kind: 'review' | 'question' | 'approval'
  readonly title: string
  /** The real Task (review/question). */
  readonly taskId: string
  /** The Aprovações card: an `approval`, and also a `question` (the card of a Task's question has the Task's id). Same id as `ApprovalView.id`. */
  readonly approvalId?: string
  readonly approvalKind?: 'hire' | 'vault' | 'skill' | 'attention' | 'connector' | 'action'
  readonly personaId: string
  readonly personaName: string
  /** When it started waiting; absent when the host does not record it. */
  readonly at?: string
}

/** What one persona did while the person was away, and what of hers waits for them. */
export interface AwayPersonaView {
  readonly personaId: string
  readonly name: string
  readonly delivered: number
  readonly proposed: number
  readonly waitingOnYou: number
  /** Real Tasks, newest first (at most 5). */
  readonly tasks: readonly { readonly taskId: string; readonly taskTitle: string; readonly kind: AwayEventView['kind'] | AwayWaitingView['kind']; readonly at?: string }[]
}

/**
 * Peak-end summary since the person was last here (P1-7). `events` is the window since then; `waiting` is what is still
 * open now. Reading it does NOT consume it: it stays the same for the whole session until `dismissWhileAway`.
 */
export interface WhileAwayView {
  readonly since: string
  readonly events: readonly AwayEventView[]
  /** Absent on an older host: the client then shows only `events`. */
  readonly waiting?: readonly AwayWaitingView[]
  readonly byPersona?: readonly AwayPersonaView[]
  /**
   * Counts that match the lists above exactly (never a separate estimate). `awayMinutes` is how long the person was away,
   * measured by the host at the moment they came back (it does not grow while they read); absent on a first visit and on a
   * window restarted by `dismissWhileAway`. `since` (above) is when they left, so the header needs no client clock.
   */
  readonly summary?: { readonly deliveries: number; readonly waitingOnYou: number; readonly awayMinutes?: number }
}

/** Invite card. */
export interface InviteView {
  readonly id: string
  readonly workspaceId: string
  readonly token: string
  readonly status: 'open' | 'used' | 'revoked' | 'expired'
  readonly expiresAt: number
}

/** Issue a one-time invite. Empty token is generated. */
export interface IssueInviteRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly inviteId: string
  readonly token: string
  readonly role: 'member' | 'guest'
}

/** Redeem a token as a new member. */
export interface RedeemInviteRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly token: string
  readonly memberId: string
  readonly displayName: string
  readonly handle: string
}

/** Revoke by id. */
export interface InviteIdRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly inviteId: string
}

/** Persisted remote-team routing and cursor metadata, without credentials. */
export interface RemoteTeamState {
  readonly workspaceId: string
  readonly projectId: string
  readonly edgeUrl: string
  readonly actorId: string
  readonly role: 'owner' | 'member' | 'guest'
  readonly channelIds: readonly string[]
  readonly status: 'connected' | 'offline' | 'revoked' | 'vault_unavailable'
  readonly cursors: Record<string, number>
  readonly errorCode: string
  readonly syncedAt?: string
  /** Pending outgoing events plus missing incoming events at the last remote-head measurement. */
  readonly behindBy?: number
  readonly remoteHeads?: Record<string, number>
}

/** Accepted local-edge member metadata; no token or unrelated project grants. */
export interface RemoteMemberView {
  readonly actorId: string
  readonly displayName: string
  readonly role: 'owner' | 'member' | 'guest'
  readonly status: 'active' | 'revoked'
  readonly joinedAt: string
  readonly inviteId: string
}

/** Cofre capability for remote-team controls, without probing or exposing credentials. */
export interface RemoteTeamAvailability {
  readonly vault: 'available' | 'unavailable' | 'test'
}

/** Explicit local edge and channels; the host derives the actor from the session. */
export interface ConnectRemoteTeamRequest extends ProjectScopeRequest {
  readonly edgeUrl: string
  readonly channelIds: readonly string[]
}

/** Single-use token is transient and cannot choose a remote role. */
export interface AcceptRemoteInviteRequest extends ProjectScopeRequest {
  readonly edgeUrl: string
  readonly token: string
}

/** One file handed to an import adapter. */
export interface ImportFileView {
  readonly name: string
  readonly text: string
}

/** Preview files. */
export interface PreviewImportRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly files: readonly ImportFileView[]
}

/** Preview result. */
export interface ImportPreviewView {
  readonly adapterId: string
  readonly accepted: number
  readonly rejected: number
  readonly bodies: readonly string[]
}

/** Confirm a preview into a batch. */
export interface ConfirmImportRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly batchId: string
  readonly files: readonly ImportFileView[]
}

/** Batch progress / rollback. */
export interface ImportBatchRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly batchId: string
}

/** Applied batch. */
export interface ImportBatchView {
  readonly id: string
  readonly adapterId: string
  readonly applied: number
  readonly rolledBack: boolean
}

/**
 * HONEST-1: the kinds of house rule the host OBEYS (a closed list; `getRuleKinds` is the contract). Each one is a hard lock for the whole team:
 * the permission gate / the hire tool ask the person, whatever the persona's autonomy or any permanent permission.
 */
export type HouseRuleKind = 'never-spend' | 'never-send' | 'never-publish' | 'never-delete' | 'never-hire'

/** One kind the host obeys. `gate`: the permission gate asks the person before the call runs. `harness`: the product's own tool takes the shortcut away. */
export interface HouseRuleKindView {
  readonly kind: HouseRuleKind
  readonly enforcedBy: 'gate' | 'harness'
}

/** What the team's quiet window holds back (each one is enforced by the host). */
export type QuietHold = 'initiative' | 'routine' | 'plan' | 'proposal' | 'brief'

/** `getRuleKinds`: everything the host obeys. The screens show ONLY these. */
export interface RuleKindsView {
  readonly kinds: readonly HouseRuleKindView[]
  /** The team's quiet window: what it holds, and that a DIRECT request of the person is still answered. */
  readonly quietWindow: { readonly enforced: true; readonly holds: readonly QuietHold[]; readonly directRequestsAnswered: true }
}

/** How many times a rule or a window really applied ("Barrou 2 gastos esta semana"). */
export interface RuleAppliedView {
  /** Since the rule / window was saved. */
  readonly total: number
  /** In the last 7 days (at most the newest 200 are kept). */
  readonly thisWeek: number
  /** ISO instant of the last application, when there was one. */
  readonly lastAt?: string
  /** A few words about the last one ("pagar pelo Gmail"). */
  readonly lastWhat?: string
}

/**
 * One triage rule. The host always sends `enforced` and `applied`; `kind` is present only on a rule the host obeys. A rule that is only text
 * (`kind` absent) is `enforced: false`: it is noted, not obeyed, and the screen must not promise anything about it.
 */
export interface TriageRuleView {
  readonly id: string
  readonly gateText: string
  readonly assessmentText: string
  readonly logOnly: boolean
  readonly speculativeEnabled: boolean
  readonly kind?: HouseRuleKind
  readonly enforced?: boolean
  readonly applied?: RuleAppliedView
}

/** Put a triage rule. `kind` (a kind of {@link HouseRuleKind}; anything else is refused) is what makes the host obey it. */
export interface PutTriageRuleRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly gateText: string
  readonly assessmentText: string
  readonly logOnly: boolean
  readonly speculativeEnabled: boolean
  readonly kind?: HouseRuleKind
}

/** Quiet window: the whole team's silence. The host always sends `enforced: true` and `applied` (how many things it held back). */
export interface QuietWindowView {
  readonly id: string
  readonly label: string
  readonly start: string
  readonly end: string
  readonly enforced?: true
  readonly applied?: RuleAppliedView
}

/** Put a quiet window. */
export interface PutQuietWindowRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly label: string
  readonly start: string
  readonly end: string
}

/** Project attention limits. */
export interface ProjectLimitsView {
  readonly workspaceId: string
  readonly projectId: string
  readonly maxProposalsPerDay: number
  readonly tokensPerPersonaMonth: number
  readonly tokensPerProjectMonth: number
}

/** One triage trail line (gate + assessment per thread). */
export interface TriageLogView {
  readonly id: string
  readonly at: string
  readonly summary: string
  readonly mode: 'logOnly' | 'execute'
  readonly threadId: string
  readonly gateText: string
  readonly assessmentText: string
  readonly decidedBy: string
  readonly reason: string
}

/** Simulate a triage rule against text. */
export interface SimulateTriageRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ruleId: string
  readonly text: string
}

/** Document id in a project. */
export interface ScreenDocRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
}

/** One inbox card. */
export interface ApprovalView {
  readonly id: string
  readonly kind: 'hire' | 'vault' | 'skill' | 'attention' | 'connector' | 'action'
  readonly title: string
  readonly question: string
  readonly status: 'pending' | 'approved' | 'rejected'
  readonly personaId: string
  readonly personaName: string
  /** D-084/TEAM-3 (`kind: 'connector'`): a persona needs a connector she cannot use yet — the colleague asked, or her own initiative. */
  readonly connector?: ConnectorAskView
  /** What the answer did (only on the reply of `decideApproval` for `kind: 'connector'`). */
  readonly connectorDecision?: ConnectorDecisionView
  /** HT-9 (`kind: 'action'`): the REAL content of an external action the persona wants to take (e-mail, post, payment, delete). */
  readonly actionPreview?: ActionPreviewView
  /** Gallery/upload ref for hire cards (gallery ref only today). */
  readonly hireAvatarRef?: string
  /** The proposer's real motive for the hire. Absent when it gave none (never the persona's description). */
  readonly reason?: string
  /** Function of the proposed persona (hire cards): the card reads “Contratar uma persona para {roleTitle}?”. */
  readonly roleTitle?: string
  /** What the proposed persona is like (hire cards). */
  readonly description?: string
  /** Average tasks per month, only when the host can measure it. The host does not today, so it is never sent. */
  readonly monthlyTasks?: number
  readonly routedToId?: string
  readonly onBehalfOfId?: string
  /** Responsible person represented by the substitute. */
  readonly onBehalfOf?: string
  readonly waitNotice?: string
  readonly permissionAction?: string
  readonly permissionTarget?: string
  readonly permissionGrantId?: string
  readonly permissionAudit?: string
}

/** Daily proactive proposals grouped by persona. */
export interface DailySummaryView {
  readonly personaId: string
  readonly personaName: string
  readonly date: string
  readonly proposals: readonly ApprovalView[]
}

/** Canvas node (spatial graph). */
export interface CanvasNodeView {
  readonly id: string
  readonly kind: 'persona' | 'task' | 'topic' | 'decision'
  readonly label: string
  readonly x: number
  readonly y: number
}

/** Canvas edge. */
export interface CanvasEdgeView {
  readonly id: string
  readonly from: string
  readonly to: string
}

/** Spatial graph for the Canvas surface. */
export interface CanvasGraphView {
  readonly nodes: readonly CanvasNodeView[]
  readonly edges: readonly CanvasEdgeView[]
}

/** Routine plus its scheduler runs (RoutinesView). */
export interface RoutineScheduleView {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly rrule: string
  readonly timeZone: string
  readonly paused: boolean
  readonly catchUp: 'skip' | 'run_once' | 'run_all'
  readonly silenceStart: string
  readonly silenceEnd: string
  /** IV-9 “O que fazer”; `''` when none. */
  readonly prompt: string
  /** IV-9 “Quem faz”; absent when the Coordenação decides. */
  readonly ownerPersonaId?: string
  /** The schedule in plain pt-BR. */
  readonly humanSchedule: string
  /** Next due instant (ISO); `''` when paused or unknown. */
  readonly nextRunAt: string
  /** `true` on the routines the team keeps for each persona; never deletable. */
  readonly system?: true
  /** Item 26: present only when the routine starts by an event (`rrule` is then not a time; `humanSchedule` says it in words). */
  readonly trigger?: RoutineTrigger
  readonly runs: readonly RoutineRunView[]
}

/** Decide an approval. */
export interface DecideApprovalRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly kind: 'hire' | 'vault' | 'skill' | 'attention' | 'connector' | 'action'
  /** Required for every kind but `connector` and `action`. */
  readonly accept?: boolean
  /**
   * Required for `kind: 'connector'`: `once` (only that Task), `always` (permanent read permission), `not-now` (stays blocked, with the reason).
   * Required for `kind: 'action'`: `send` (Enviar · Pagar · Apagar: ONE call with exactly what the card shows), `edit` (with `edited`), `cancel`,
   * `retry` (only for a card that expired unanswered: the persona is told to ask again).
   */
  readonly choice?: ConnectorAskChoice | ActionChoice
  /** `kind: 'action'`, `choice: 'edit'`: what the person wants changed (data for the persona's next request). */
  readonly edited?: string
  /** `kind: 'action'`, `choice: 'send'`: "Não perguntar de novo para a {persona}" — only e-mail/post; the host ignores it for payment and delete. */
  readonly remember?: boolean
}

/** HT-9: the answers to the preview of an external action. `retry` (COLHEITA 5): ask again for a card that expired unanswered. */
export type ActionChoice = 'send' | 'edit' | 'cancel' | 'retry'

/** HT-9: what kind of external action it is. Payment and delete ALWAYS ask. */
export type ActionClass = 'send' | 'pay' | 'delete' | 'post'

/**
 * HT-9 (contracts/team-real.md §10): the preview of an external action — the real content, as the persona asked for it. The UI writes the
 * words; fields are present only when the connector's call had them.
 */
export type ActionPreviewWire = ActionPreviewView & { readonly approvalId: string; readonly personaId: string }

export interface ActionPreviewView {
  readonly actionClass: ActionClass
  /** The word that decided the class ("send", "post", "pay", "delete"…), for the label. */
  readonly verb: string
  readonly connectorName: string
  readonly to?: string
  /** P0-10: the other recipients and the attachments are SHOWN (a call with a hidden `bcc` or file is never approved blind). */
  readonly cc?: string
  readonly bcc?: string
  readonly attachments?: readonly string[]
  readonly subject?: string
  readonly body?: string
  readonly amount?: string
  readonly payee?: string
  readonly reference?: string
  /** Delete: what would go (up to 20). */
  readonly items?: readonly string[]
  readonly count?: number
  /** The preview is cut: it is NOT all of what would go out, so it cannot be approved blind. */
  readonly truncated: boolean
  /** A part is hidden (a secret): same rule. */
  readonly masked: boolean
  /** The person's own words asked for it ("Você pediu · {persona} confirma antes de enviar"). */
  readonly requestedByPerson: boolean
  readonly status: 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'adjusted'
  /** Only e-mail and post may be waived with "Não perguntar de novo". */
  readonly canRemember: boolean
  readonly sentTo?: string
  readonly sentAt?: string
  readonly failureReason?: string
  /** COLHEITA 5: ISO instant after which an unanswered card is closed (the deadline the card shows). */
  readonly expiresAt?: string
  /** COLHEITA 5: the card was closed because nobody answered in time; it is read-only and may be asked again (`retry`). */
  readonly expired?: boolean
  /** COLHEITA 5: the person already asked again for this expired card (the persona was told once). */
  readonly retried?: boolean
}

/** The answers to "a persona needs a connector". */
export type ConnectorAskChoice = 'once' | 'always' | 'not-now'

/** D-084/TEAM-3: what the card of a connector request says (the words are the UI's; `question` is the host's plain-text fallback). */
export interface ConnectorAskView {
  readonly reason: 'colleague' | 'initiative'
  readonly connectorName: string
  readonly cli: string
  readonly connectorId: string
  readonly access: 'read' | 'write'
  /** `colleague`: who asked. */
  readonly requestedByPersonaId?: string
  readonly requestedByPersonaName?: string
  /** `colleague`: the Task that waits (its id exists once the request was released). */
  readonly taskId?: string
  readonly taskTitle?: string
  /** `initiative`: why, in a human sentence. */
  readonly purpose?: string
  readonly options: readonly ConnectorAskChoice[]
}

/** The result of answering a connector request. `grant` is present only when a NEW permanent permission was made: it is what the Desfazer revokes. */
export interface ConnectorDecisionView {
  readonly choice?: ConnectorAskChoice
  readonly grant?: { readonly personaId: string; readonly cli: string; readonly connectorId: string }
}

/** Hire proposal. */
export interface ProposeHireRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly creatorPersonaId: string
  readonly name: string
  readonly title: string
  readonly description: string
  /** Why the proposer wants this hire; becomes the card's “Por que”. Omit when there is no real motive. */
  readonly reason?: string
}

/** Vault proposal. */
export interface ProposeVaultRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly creatorPersonaId: string
  readonly recordId: string
  readonly nextBody: string
}

/** Skill proposal. */
export interface ProposeSkillRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly skillId: string
  readonly title: string
  readonly creatorPersonaId: string
  /** The question the card asks; "Ativar {title}?" when omitted. A skill a persona learned by herself asks "… Virar skill?". */
  readonly question?: string
}

/** The notes of how a persona works (tab "Como ela trabalha"), or of the whole team. */
export interface ListPlaybookRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId?: string
}

/** One kind of work a persona did and the owner applied, and how far it is from being a skill. */
export interface PlaybookNoteView {
  readonly id: string
  readonly personaId: string
  /** The kind of work, as the Task was titled. */
  readonly title: string
  /** Accepted deliveries that counted. */
  readonly uses: number
  /** When the last one was accepted (ISO); the note's creation when there is none yet. */
  readonly lastAt: string
  /** `learning`: still gathering proof; `ready`: enough uses, waiting for another day or conversation; `offered`: the card "Virar skill?" is in Aprovações; `skill`: it is a skill now. */
  readonly stage: 'learning' | 'ready' | 'offered' | 'skill'
  /** Uses counted toward the next offer (starts again after "Agora não"), and what it takes: "Aprendendo · 1 de 3". */
  readonly progress: number
  readonly goal: number
  /** What the owner asked to change on this kind of work (the last five). */
  readonly adjustments: readonly string[]
  /** The offer in Aprovações, once made. */
  readonly approvalId?: string
}

/** Memory row. */
export interface MemoryView {
  readonly id: string
  readonly body: string
  readonly status: 'pending' | 'active' | 'revoked'
  readonly origin: 'conversation' | 'vault' | 'import'
  /** Harvest item 16: present when the OWNER asked the team to remember it — the proof, word for word. */
  readonly source?: MemorySourceView
  /** Who reads it: the whole team, or only the persona it was said to in a DM. Set with `source`. */
  readonly scope?: 'team' | 'persona'
  /** A rule (mandatory context in every turn) rather than a fact. Set with `source`. */
  readonly rule?: boolean
  /** The persona a DM memory was said to (`scope: 'persona'`). Her name only: the product keeps no gender for a persona, so no copy takes an article for her. */
  readonly to?: { readonly name: string }
}

/** Where a memory came from: the owner's own words. */
export interface MemorySourceView {
  /** The owner's message, word for word. */
  readonly quote: string
  /** Who said it (display name). */
  readonly by: string
  /** It was the person looking at the list who said it ("Você disse…"), not another member. */
  readonly mine: boolean
  /** When (ISO). */
  readonly at: string
  /** Said in a channel or in a DM. */
  readonly where: 'channel' | 'dm'
  /** The channel's name ("geral") when said in a channel; empty in a DM. */
  readonly place: string
}

/** Propose or edit memory. */
export interface MemoryWriteRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly authorId: string
  readonly body: string
}

/** Skill card. */
export interface SkillView {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly status: 'active' | 'candidate'
  readonly body: string
  readonly sharedWithTeam: boolean
  /** Item 26.10: where an imported skill came from (absent for one the person wrote). */
  readonly source?: { readonly url: string; readonly ref: string; readonly hash: string }
  /** Item 26.10: the body came from outside and is DATA, never instructions to the host. */
  readonly untrusted?: boolean
}

/** Create or replace a skill. */
export interface PutSkillRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly name: string
  readonly body: string
  readonly sharedWithTeam: boolean
}

/** Revise a skill body. */
export interface ReviseSkillRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly body: string
}

/** Item 26.10: preview a skill from a GitHub link (nothing is written). */
export interface PreviewSkillImportRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly url: string
}

/** Item 26.10: bring the chosen skills of the preview in. */
export interface ImportSkillsRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly url: string
  readonly names: readonly string[]
  readonly sharedWithTeam: boolean
}

/** Item 26.10/26.11: ask the source for a new version of an imported skill. */
export interface RefreshSkillRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
}

/** What the refresh found: same content changes nothing; a new one waits for approval. */
export interface SkillRefreshView {
  readonly changed: boolean
  readonly pending: boolean
}

/** Item 26.10: what a GitHub link would bring in, before anything is written. */
export type {
  ArchiveFile,
  IgnoredFile,
  SkillCandidate,
  SkillImportPreview,
  SkillLink,
} from './skill-import.ts'

/** Whether `gh` is on PATH. */
export interface GithubAvailableView {
  readonly available: boolean
}

/** Worker-forwarded GitHub webhook (payload is JSON text). */
export interface IngestGithubWebhookRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly deliveryId: string
  readonly event: string
  readonly action: string
  readonly repository: string
  readonly payloadJson: string
  readonly agentLogin: string
}

/** Result of ingesting one webhook or `gh api` issue. */
export interface GithubIngestView {
  readonly kind: 'trigger' | 'threadClosed' | 'ignore' | 'duplicate'
  readonly detail: string
}

/** Fetch one issue/PR through `gh`. */
export interface FetchGithubIssueRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly repository: string
  readonly number: number
  readonly agentLogin: string
}

/** Post a comment through `gh api`. */
export interface PostGithubCommentRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly repository: string
  readonly number: number
  readonly body: string
}

/** Inclusive usage window (ISO instants). A month-crossing range is valid. */
export interface UsagePeriod {
  readonly from: string
  readonly to: string
}

/** `getUsage` — server actor + `can(read, project)`. */
export interface GetUsageRequest {
  readonly workspaceId: string
  readonly projectId?: string
  readonly personaId?: string
  readonly accountId?: string
  readonly period: UsagePeriod
}

/** One canonical turn on the wire (core {@link TurnLedgerEntry}). */
export interface TurnLedgerView {
  readonly id: string
  readonly personaId: string
  readonly engine: string
  readonly kind: TurnKind
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly layers: TurnLayerSizes
  readonly at: string
  readonly ticketId?: string
  readonly accountId?: string
  readonly origin?: LedgerOrigin
  /** Measured wall time of the turn in ms (OPT-9); absent when the runner did not report it. Never a made-up 0. */
  readonly durationMs?: number
  /** D-085: the mode the call ran in, as the runner reports it; absent when it did not. */
  readonly envMode?: 'native' | 'answer-only' | 'needed'
  /** D-096: why the call ran in `envMode` (a code), when the runner said. */
  readonly envModeReason?: string
  /** EFF-1: the model the call was started with (`default` = the engine's own); kept only with a choice or a drop below. */
  readonly model?: string
  /** EFF-1: the model the person chose for the persona; absent = "Padrão do motor" (nothing was sent). */
  readonly modelRequested?: string
  /** EFF-1: the effort ("Capricho") the person chose; absent = none. */
  readonly effortRequested?: string
  /** EFF-1: the chosen model the engine does not offer: the call ran on the engine's default (the Task was not lost). */
  readonly modelDropped?: string
  /** EFF-1: the chosen effort the model refused: the call ran at the engine's default effort. */
  readonly effortDropped?: string
}

/** Persist one core turn. Kinds stay `execution` / `evaluation`. */
export interface RecordTurnLedgerRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly entry: TurnLedgerView
}

/** A connector of the person's CLI, as the desktop bridge names it (ISO-2). `name` is untrusted text from the CLI's config. */
export interface ConnectorRef {
  readonly cli: string
  /** The connector's id in that CLI; for a connector of the ACCOUNT, its proxy URL. Never shown to the person. */
  readonly id: string
  readonly name: string
  /** The bridge's label hint (`user` · `project` · `claudeai` …). A hint only: the runner's port decides what can be granted. */
  readonly source?: string
}

/** One connector a persona may use. A pointer with a level: no command, URL or secret of the connector is kept. */
export interface ConnectorGrantView {
  readonly personaId: string
  readonly cli: string
  readonly connectorId: string
  readonly name: string
  readonly access: 'read' | 'write'
  /**
   * What the person waived, class by class: `never` = that class runs and is reported instead of asking first. `send` comes from the
   * "Não perguntar de novo" box; `pay` and `delete` only from an explicit permission of their own (Configurações, with a warning).
   */
  readonly confirm: { readonly send: 'ask' | 'never'; readonly pay: 'ask' | 'never'; readonly delete: 'ask' | 'never' }
  /** The CLI loads every connector already (it does not isolate, e.g. Codex): the permission is still the host's policy, and the screen says so. */
  readonly loadedAlways: boolean
  readonly grantedBy: string
  readonly grantedAt: string
}

/** List grants of the workspace, or of one persona. */
export interface ListConnectorGrantsRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId?: string
}

/** Give a persona a connector (or change the level). Owner only. */
export interface GrantConnectorRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly connector: ConnectorRef
  readonly access: 'read' | 'write'
  /** Classes to waive; every class not named stays `ask` (pay and delete ask unless waived HERE, explicitly). */
  readonly confirm?: { readonly send?: 'ask' | 'never'; readonly pay?: 'ask' | 'never'; readonly delete?: 'ask' | 'never' }
}

/** Take a connector back from a persona. Owner only; idempotent. */
export interface RevokeConnectorRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly cli: string
  readonly connectorId: string
}

/** What the connector would add to every call of the persona (measured by a control-only pre-flight, zero model). */
export interface EstimateConnectorGrantCostRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly connector: ConnectorRef
}

/** `unknown`: nothing was measured, so the screen writes no number. */
export type ConnectorGrantCostView =
  | { readonly status: 'measured'; readonly extraTokens: number; readonly percent: number; readonly basisTokens: number }
  | { readonly status: 'unknown' }

/** OPT-7 Uso e limites fold. Empty book is `estimate`, never 0% quota. */
export interface GetUsagePanelRequest {
  readonly workspaceId: string
  readonly projectId?: string
  readonly personaId?: string
  readonly period?: UsagePeriod
  readonly successfulTicketIds?: readonly string[]
}

/** One Uso-panel slice (persona or kind). */
export interface UsagePanelSliceView {
  readonly key: string
  readonly tokens: number
  readonly calls: number
  readonly cacheHitRate: number
}

/** `foldUsagePanel` on the wire. */
export interface UsagePanelView {
  readonly origin: LedgerOrigin
  readonly tokensPerSuccessfulTask: number
  readonly byPersona: readonly UsagePanelSliceView[]
  readonly byKind: readonly UsagePanelSliceView[]
  readonly cacheHitRate: number
}

/** PRO-6 / fechamento v1 — Probe chama; o host não remonta flags. */
export interface ProactivityMeasureView {
  readonly passed: number
  readonly total: 6
  readonly failed: readonly string[]
}

/** OPT-3/4/5/6 scripted policy score. Probe does not remount flags. */
export interface OptPolicyMeasureView {
  readonly passed: number
  readonly total: 3
  readonly failed: readonly string[]
}

/** V1-P0-1 engine checklist. Probe does not remount flags. */
export interface FirstDeliveryMeasureView {
  readonly passed: number
  readonly total: 4
  readonly failed: readonly string[]
}

/** GES-6 / fechamento v1 — Probe chama; o host não remonta flags. */
export interface GestorMeasureView {
  readonly passed: number
  readonly total: 3
  readonly failed: readonly string[]
}

/** GES-2 tools score. Probe does not remount flags. */
export interface GestorToolsMeasureView {
  readonly passed: number
  readonly total: 4
  readonly failed: readonly string[]
}

/** Combined v1 close (PRO-6 + GES-6 + OPT-8). Probe calls this; do not remount flags. */
export interface V1CloseMeasureView {
  readonly passed: boolean
  readonly origin?: Opt8MeasuredEvidence['origin']
  readonly baseline?: Opt8MeasuredEvidence['baseline']
  readonly proactivity: ProactivityMeasureView
  readonly gestor: GestorMeasureView
  readonly opt8: Opt8MeasureView
}

/** Faithful estimate evidence plus the separately reported live ledger size and origin. */
export interface Opt8MeasureView {
  readonly passed: number
  readonly total: 4
  readonly failed: readonly string[]
  readonly blocked: readonly string[]
  readonly liveEntries: number
  readonly liveOrigin: LedgerOrigin
  readonly origin?: Opt8MeasuredEvidence['origin']
  readonly baseline?: Opt8MeasuredEvidence['baseline']
  readonly evidence?: Opt8MeasuredEvidence
}

/** Folded spend. Absence is never `usedPercent: 0`. */
export interface UsageView {
  readonly period: UsagePeriod
  readonly folds: readonly UsageFold[]
  readonly tokens: number
  readonly runs: number
  readonly origin: UsageOrigin
  readonly originLabel: string
  readonly tokensPerMonthLimit?: number
}

/** `getOfficialQuota` — labelled official windows or `unavailable`. */
export interface GetOfficialQuotaRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly provider?: string
  readonly accountId?: string
}

/** Official quota on the wire (persona-usage `OfficialQuota`). */
export interface OfficialQuotaView {
  readonly provider: string
  readonly origin: UsageOrigin
  readonly windows: readonly UsageWindowView[]
  readonly detail?: string
  /** WAVE2 — when quota is scoped to one connected account. */
  readonly accountId?: string
  readonly accountLabel?: string
  /** ISO instant this quota was read. Absent on rows saved before the field existed: the UI then shows no "há X min". */
  readonly at?: string
  /** Soonest `windows.resetsAt` (or last refill-history point). */
  readonly nextRefillAt?: string
  /** Short trail of reset clocks for the Lumen «próximo refill» strip. */
  readonly refillHistory?: readonly {
    readonly windowId: string
    readonly resetsAt: string
    readonly recordedAt: string
  }[]
}

/** One official window. `usedPercent` omitted when the vendor did not publish a figure. */
export interface UsageWindowView {
  readonly id: string
  readonly origin: UsageOrigin
  readonly usedPercent?: number
  readonly windowMinutes?: number
  readonly resetsAt?: string
}

/**
 * Harvest 10 — the last 5% of a subscription window. `reserve` = the team's own work is paused and short answers to the
 * owner still run; `exhausted` = nothing runs until the window renews. `queued` counts the conversations waiting.
 */
export interface WindowReserveView {
  readonly state: 'ok' | 'reserve' | 'exhausted'
  readonly provider?: string
  readonly windowId?: string
  readonly usedPercent?: number
  readonly resetsAt?: string
  readonly queued: number
  /** The person chose “Continuar agora” for this window cycle. */
  readonly overridden: boolean
}

/** Global search that applies stream ACL. */
export interface SearchRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly actorId: string
  readonly query: string
  readonly limit: number
  readonly topicId?: string
}

/** One column on the project flow. */
export interface WorkflowColumnView {
  readonly id: string
  readonly name: string
  readonly category: 'todo' | 'doing' | 'review' | 'needs_you' | 'done'
  readonly color?: string
  readonly icon?: string
  readonly wip?: number
}

/** Extra field the flow suggests on each ticket. */
export interface WorkflowFieldView {
  readonly id: string
  readonly name: string
  readonly kind: 'text' | 'link' | 'number' | 'date' | 'select'
  readonly options?: readonly string[]
}

/** Persisted or proposed project flow. */
export interface WorkflowView {
  readonly projectId: string
  readonly template: string
  readonly columns: readonly WorkflowColumnView[]
  readonly fields: readonly WorkflowFieldView[]
}

/** Ticket card on a project board. */
export interface BoardCardView {
  readonly ticketId: string
  readonly title: string
  readonly category: 'todo' | 'doing' | 'review' | 'needs_you' | 'done'
  readonly columnId?: string
  readonly columnName?: string
  readonly blocked: boolean
  readonly chip?: 'waiting'
  /** WAVE2 assunto (`ticket_subject`). */
  readonly topicId?: string
  /**
   * FLOW-1: a result still waits for Aplicar/Descartar in Revisar. Only present when `true`; moving the card to a Concluído
   * column is refused with the typed error `delivery_pending` until the person decides.
   */
  readonly deliveryPending?: boolean
  /** CV-5: personas working WITH the lead (“com Bento”); absent when the Task has none. */
  readonly collaborators?: readonly CollaboratorView[]
  /** TEAM-1 (`Config.teamwork`): "Pedido por {A}" on the colleague's card, "Esperando {B}" on the card of whoever asked. */
  readonly handoff?: BoardHandoffView
  /** TEAM-6: "Revisando: {R}" while a colleague reviews this card's work. */
  readonly reviewing?: ReviewingView
  /** TEAM-6: the seal "Revisado por {R}". */
  readonly reviewedBy?: ReviewedByView
  /**
   * ISO instant the result began to wait for the person's review (its worker reported `ready`); present only while the Task is in the person's review.
   * Lets the screen say "entregas em revisão há mais de 2 dias" without guessing from `updatedAt`.
   */
  readonly inReviewSince?: string
  /** Item 18: the conversation of this card is a thread of the Task's stream (`listMessages` with this `topicId`); how many messages it has, how many the person has not read, and the last seq (what `markTaskThreadRead` takes). */
  readonly threadTopicId?: string
  readonly threadCount?: number
  readonly threadUnread?: number
  readonly threadLastSeq?: number
}

/** Counts by category for Quadros. */
export interface BoardCountsView {
  readonly todo: number
  readonly doing: number
  readonly review: number
  readonly needs_you: number
  readonly done: number
  readonly blocked: number
}

/** One sprint row. */
export interface SprintView {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly objective: string
  readonly status: 'planejado' | 'ativo' | 'encerrado'
  readonly ticketIds: readonly string[]
  readonly goalId: string
  readonly startsAt?: string
  readonly endsAt?: string
  readonly daysLeft?: number
}

/** Coordination goal bound to a sprint (`startSprint` / restart hydrate). */
export interface SprintGoalView {
  readonly id: string
  readonly projectId: string
  readonly objective: string
  readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
  readonly activation: 'armed' | 'disarmed'
}

/** Full project board. */
export interface ProjectBoardView {
  readonly projectId: string
  readonly projectName: string
  readonly workflow: WorkflowView
  readonly persisted: boolean
  readonly cards: readonly BoardCardView[]
  readonly counts: BoardCountsView
  readonly currentSprint?: SprintView
}

/** Mini-summary for the Quadros list. */
export interface BoardSummaryView {
  readonly projectId: string
  readonly projectName: string
  readonly counts: BoardCountsView
  readonly currentSprintName?: string
  readonly workingNow: readonly string[]
}

/** Instantiate a built-in template. */
export interface CreateWorkflowRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly template: 'contratacao' | 'site' | 'software' | 'marketing' | 'atendimento' | 'simples' | 'em_branco'
}

/** Replace columns; tickets on a removed column need a destination. */
export interface UpdateWorkflowRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly columns: readonly WorkflowColumnView[]
  readonly fields: readonly WorkflowFieldView[]
  readonly destByRemoved?: Readonly<Record<string, string>>
}

/** Move a ticket onto a column. */
export interface MoveTicketRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
  readonly columnId: string
}

/** Result of a move. */
export interface MoveTicketView {
  readonly card: BoardCardView
  readonly wipWarning: boolean
}

/** Open a sprint. */
export interface CreateSprintRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly name: string
  readonly objective: string
  readonly startsAt?: string
  readonly endsAt?: string
}

/** Plan the sprint set. */
export interface PlanSprintRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly sprintId: string
  readonly ticketIds: readonly string[]
}

/** Sprint id in a project. */
export interface SprintIdRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly sprintId: string
}

/** Close a sprint after the person confirms leftover destination. */
export interface CloseSprintRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly sprintId: string
  readonly leftover: 'next' | 'backlog'
  readonly confirmed: boolean
}

/** Close result, including the peak-end summary. */
export interface CloseSprintView {
  readonly summary: string
  readonly closed: SprintView
  readonly rolledIds: readonly string[]
  readonly next?: SprintView
  readonly pending?: true
}

/** Coordination proposal from the project description. Never applies alone. */
export interface ProposeWorkflowRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly description: string
}

/** Built-in flow catalog row. */
export interface WorkflowTemplateView {
  readonly id: string
  readonly name: string
  readonly columns: readonly WorkflowColumnView[]
  readonly fields: readonly WorkflowFieldView[]
}

/** Rename / redate a sprint. */
export interface UpdateSprintRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly sprintId: string
  readonly name?: string
  readonly objective?: string
  readonly startsAt?: string
  readonly endsAt?: string
}

/** "Usar este fluxo?" card. `degraded` when the model blob was unusable. */
export interface WorkflowProposalView {
  readonly template: string
  readonly reason: string
  readonly workflow: WorkflowView
  readonly card: { readonly question: string; readonly primary: string; readonly impact: string }
  readonly degraded?: true
}

/** Accept the Coordination flow card. `template` from the proposal when known. */
export interface AcceptWorkflowProposalRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly columns: readonly WorkflowColumnView[]
  readonly fields: readonly WorkflowFieldView[]
  readonly destByRemoved?: Readonly<Record<string, string>>
  readonly template?: string
}

/** PB-5: project conversation channel (`#geral` of that project). */
export interface ProjectConversationView {
  readonly projectId: string
  readonly channelId: string
  readonly name: string
}

/** Upload one file onto a channel or DM (not yet bound to a message). */
export interface AttachFileRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly name: string
  readonly bytesBase64: string
}

/** List attachments of one message, or of a stream when `messageId` is empty. */
export interface ListAttachmentsRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly messageId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
}

/** Fetch one attachment. */
export interface AttachmentIdRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly attachmentId: string
}

/** Attachment metadata on the wire. */
export interface AttachmentView {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly bytes: number
  readonly hash: string
  readonly credentialWarning: boolean
  readonly messageId: string
}

/** Attachment bytes as base64 (JSON-safe). */
export interface AttachmentBytesView {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly bytesBase64: string
  readonly credentialWarning: boolean
}

/** Upload a PNG/JPEG/WebP avatar (SCOPE §1). */
export interface UploadAvatarRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly name: string
  readonly bytesBase64: string
}

/** Result of an avatar upload. */
export interface AvatarUploadView {
  readonly personaId: string
  readonly avatarKind: 'upload'
  readonly avatarRef: string
  readonly mime: string
}

/** Remove an uploaded avatar (silhouette; unused blob deleted). */
export interface RemoveAvatarRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
}

/** Who may DM or @mention a persona. */
export interface TalkAclPrincipalView {
  readonly kind: 'person' | 'group'
  readonly id: string
  readonly name: string
}

/** Talk ACL on the wire. */
export interface TalkAclView {
  readonly mode: 'workspace' | 'chosen'
  readonly principals: readonly TalkAclPrincipalView[]
}

/** Set talk ACL. Responsável or workspace owner. */
export interface SetPersonaTalkAclRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly mode: 'workspace' | 'chosen'
  readonly principals: readonly TalkAclPrincipalView[]
}

/** Set responsável / substituto. Responsável or workspace owner. */
export interface PutPersonaChargeRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly responsibleHumanId: string
  readonly substituteHumanId: string
}

/** Change the persona runner. */
export interface SetPersonaEngineRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly runnerKind: 'dsh' | 'cli'
  readonly runnerCli: string
  /** EFF-1: `null` = "Padrão do motor" (no `--model`). */
  readonly runnerModel: string | null
  /**
   * EFF-1: `null` = "Padrão do motor" (no `--effort`). Left out = keep the current level while the engine and model stay the same;
   * clear it when either changes. The host stores any level; the engine decides at run time.
   */
  readonly runnerEffort?: PersonaEffortLevel | null
}

/** Live now-line kind (Muse i18n). */
export type PersonaNowKind =
  | 'working'
  | 'reviewing'
  | 'waiting-approval'
  | 'waiting-reply'
  | 'quota'
  | 'resting'
  | 'stuck'
  | 'offline'

/** Official quota slice for the card. Omitted when vendor data is missing. Never 0. */
export interface CardQuotaView {
  readonly fiveHourPct?: number
  readonly weekPct?: number
  readonly limitedUntil?: string
}

/** Aggregated Muse card. Optional names omitted when GOV charge is absent. */
export interface PersonaCardView {
  readonly personaId: string
  readonly handle: string
  readonly name: string
  readonly title: string
  readonly systemRoles: readonly SystemRoleView[]
  readonly nowKind: PersonaNowKind
  readonly nowText: string
  readonly presence: { readonly online: boolean; readonly lastActiveAt: string }
  readonly engine: {
    readonly runnerLabel: string
    readonly modelLabel: string
    /** EFF-1: what the person chose; `null` = "Padrão do motor" (`modelLabel` keeps the stored name, `default`). */
    readonly runnerModel?: string | null
    readonly runnerEffort?: PersonaEffortLevel | null
  }
  /** WAVE2 — CLI account label in use (e.g. Trabalho). */
  readonly activeAccount?: { readonly provider: string; readonly label: string }
  readonly sectorName?: string
  readonly ownerName?: string
  readonly substituteName?: string
  readonly currentProjectName?: string
  readonly quota?: CardQuotaView
  /** GES-5 — latest Gestor audit reason on this persona's profile. */
  readonly gestorAuditReason?: string
}

/** Workspace-only read. */
export interface WorkspaceScopeRequest {
  readonly workspaceId: string
}

/** Organogram grouping. */
export type OrgChartGroupBy = 'person' | 'sector'

/** Live stamp on a hanging persona card. */
export type OrgPersonaStateView = 'working' | 'reviewing' | 'waiting' | 'resting' | 'stuck' | 'offline'

/** One hanging persona on the organogram. */
export interface OrgPersonaView {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly characterId?: string
  readonly state: OrgPersonaStateView
}

/** One human or sector group. */
export interface OrgGroupView {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly kind: 'person' | 'sector'
  readonly sectorId?: string
  readonly away?: boolean
  readonly members: readonly OrgPersonaView[]
}

/** `getOrgChart` result. */
export interface OrgChartView {
  readonly workspaceId: string
  readonly groupBy: OrgChartGroupBy
  readonly rightHand?: OrgPersonaView
  readonly rightHandCaption?: string
  readonly groups: readonly OrgGroupView[]
  readonly personaCount: number
  readonly humanCount: number
}

/** `getOrgChart` input. */
export interface GetOrgChartRequest {
  readonly workspaceId: string
  readonly groupBy: OrgChartGroupBy
}

/** Health band. */
export type HealthLevelView = 'good' | 'attention' | 'risk'

/** One actionable finding. */
export interface HealthFindingView {
  readonly id: string
  readonly level: HealthLevelView
  readonly title: string
  readonly detail?: string
  readonly fixKind?: 'set_substitute' | 'set_responsible' | 'set_routine_owner' | 'raise_autonomy' | 'delegate_coordination'
  readonly fixTargetId?: string
}

/** `getTeamHealth` result. */
export interface TeamHealthView {
  readonly workspaceId: string
  readonly level: HealthLevelView
  readonly title: string
  readonly body?: string
  readonly score: number
  readonly findings: readonly HealthFindingView[]
  readonly gestorAudit: readonly GestorAuditView[]
}

/** One slot on the 2-day timeline. */
export type TwoDayOutcomeView = 'runs' | 'waits' | 'stops'

/** One routine across the 48h walk. */
export interface TwoDayRowView {
  readonly id: string
  readonly label: string
  readonly slots: readonly TwoDayOutcomeView[]
  readonly reason?: string
  readonly fixKind?: HealthFindingView['fixKind']
  readonly fixTargetId?: string
}

/** `runTwoDayTest` result. */
export interface TwoDayTestView {
  readonly workspaceId: string
  readonly slotLabels: readonly string[]
  readonly rows: readonly TwoDayRowView[]
}

/** 1-click correction. */
export interface ApplyGovernanceFixRequest {
  readonly workspaceId: string
  readonly findingId: string
  readonly fixKind: NonNullable<HealthFindingView['fixKind']>
  readonly targetId?: string
}

/** Set responsável. */
export interface SetResponsibleRequest {
  readonly workspaceId: string
  readonly personaId: string
  readonly humanId: string
}

/** Set substituto. Empty `humanId` clears. */
export interface SetSubstituteRequest {
  readonly workspaceId: string
  readonly personaId: string
  readonly humanId: string
}

/** Assign a sector. Empty `sectorId` clears. */
export interface SetSectorRequest {
  readonly workspaceId: string
  readonly personaId: string
  readonly sectorId: string
}

/** Mark a human away / available. `kind: available` clears windows. */
export interface SetAvailabilityRequest {
  readonly workspaceId: string
  readonly humanId: string
  readonly kind: 'away' | 'absent' | 'available'
  readonly from: string
  readonly until: string
}

/** Combined editor write (Prism). Empty substitute/sector clears. */
export interface SetPersonaGovernanceRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly sectorId: string
  readonly responsibleMemberId: string
  readonly substituteMemberId: string
}

/** Structure assistant ask. `company` accepts core or UI ids. */
export interface RecommendStructureRequest {
  readonly workspaceId: string
  readonly company: string
  readonly sectorNames: readonly string[]
  readonly recurring: readonly string[]
}

/** One recommended persona on the wire. */
export interface StructurePersonaView {
  readonly id: string
  readonly title: string
  readonly sectorName: string
}

/** `recommendStructure` / `applyStructure` result. */
export interface StructureRecommendationView {
  readonly company: string
  readonly explanation: string
  readonly personas: readonly StructurePersonaView[]
  readonly routines: readonly { readonly title: string; readonly ownerTitle: string }[]
  readonly tasks: readonly string[]
  readonly org: OrgChartView
  readonly health: TeamHealthView
  readonly twoDay: TwoDayTestView
}

/** One audit row. */
export interface GovernanceAuditView {
  readonly id: string
  readonly at: string
  readonly action: string
  readonly actorId: string
  readonly body: string
}

/** Poll Rivet-mapped sources into the project engine (X-3). */
export interface PollExternalRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personId: string
}

/** Intake results for one poll batch. */
export interface PollExternalView {
  readonly results: readonly ('stored' | 'duplicate' | 'filtered')[]
}

/** Reply on the inbound origin. No token on the wire. */
export interface ReplyExternalRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personId: string
  readonly source: 'telegram' | 'email' | 'slack' | 'discord' | 'calendar'
  readonly text: string
  readonly chat?: string
  readonly channel?: string
  readonly to?: string
  readonly subject?: string
}

/** Whether the outbound send succeeded. */
export interface ReplyExternalView {
  readonly ok: boolean
}

/**
 * Harvest 19b — what the person asked to hear about in the inbox. Empty list = any; `skipBulk` drops newsletters.
 * The filter runs at the origin, before a Trigger exists, so an irrelevant message never wakes a model.
 */
export interface EmailFilterView {
  readonly to: readonly string[]
  readonly from: readonly string[]
  readonly subject: readonly string[]
  readonly skipBulk: boolean
  /** Mailbox preset id (locaweb, hostinger…), when the person picked one. */
  readonly preset?: string
}

/** Harvest 19b — the mailbox credential state. The password is never part of it. */
export interface EmailConnectionView {
  readonly connected: boolean
  readonly host?: string
  readonly port?: number
  readonly secure?: boolean
  readonly user?: string
}

/** Harvest 19b — one read-only login test; absent fields use the stored credential. */
export interface TestEmailConnectionRequest extends ProjectScopeRequest {
  readonly host?: string
  readonly port?: number
  readonly secure?: boolean
  readonly user?: string
  readonly password?: string
}

/** Harvest 19b — what “Testar conexão” found. */
export interface EmailConnectionTestView {
  readonly ok: boolean
  /** Messages in the folder (EXAMINE), when the login worked. */
  readonly messages?: number
  /** Why it failed, in categories the screen turns into one honest sentence. */
  readonly error?: 'login' | 'network' | 'tls' | 'no-credential' | 'unknown'
}

/** Save the inbox rule of one project. */
export interface PutEmailFilterRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly filter: EmailFilterView
}

/** One mailbox preset the connection screen offers (host/port/TLS already filled in). */
export interface EmailPresetView {
  readonly id: string
  readonly label: string
  readonly host: string
  readonly port: number
  readonly secure: boolean
}

/** One on-disk `VACUUM INTO` copy. */
export interface BackupView {
  readonly filename: string
  readonly path: string
  readonly at: string
}

/** Irreversible workspace wipe. `confirmed` must be true. */
export interface DeleteWorkspaceRequest {
  readonly workspaceId: string
  readonly confirmed: boolean
}

/** Irreversible shared-project wipe. `confirmed` must be true. */
export interface DeleteSharedProjectRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly confirmed: boolean
}

/** One Brush sticker the composer may send. */
export interface StickerView {
  readonly id: string
  readonly asset: string
}

/** One sticker tally on a message. */
export interface ReactionView {
  readonly stickerId: string
  readonly actorIds: readonly string[]
}

/** Identify one stored message. */
export interface MessageIdRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly eventId: string
}

/** React or remove a sticker. */
export interface ReactMessageRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly eventId: string
  readonly stickerId: string
}

/** Reply quoting another message. */
export interface ReplyMessageRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly eventId: string
  readonly body: string
  readonly id: string
}

/** Replace the body of the caller's own message. */
export interface EditMessageRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly eventId: string
  readonly body: string
}

/** Autocomplete query for @mentions. */
export interface SuggestMentionsRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly query: string
}

/** One persona the actor may @mention. */
export interface MentionSuggestionView {
  readonly personaId: string
  readonly name: string
  readonly title: string
}

/** One edit/delete/pin/react audit row. */
export interface MessageAuditView {
  readonly id: string
  readonly eventId: string
  readonly actorId: string
  readonly action: string
  readonly at: string
  readonly detail: string
}

/** WAL checkpoint counters. */
export interface WalCheckpointView {
  readonly busy: number
  readonly log: number
  readonly checkpointed: number
}

/** Shareable persona spec on the wire (Forge domain, no private memory). */
export interface PersonaSpecView {
  readonly name: string
  readonly avatar: { readonly kind: 'gallery' | 'upload' | 'silhouette'; readonly ref: string }
  readonly title: string
  readonly description: string
  readonly personality: string
  readonly instructions: string
  readonly runner: { readonly kind: 'dsh'; readonly model: string } | {
    readonly kind: 'cli'
    readonly cli: string
    readonly model: string
  }
  readonly tools: Readonly<Record<string, 'none' | 'read' | 'write'>>
  readonly skills: readonly string[]
  readonly limits: {
    readonly tokensPerMonth?: number
    readonly tokensPerResponse?: number
    readonly concurrency?: number
  }
  readonly systemRoles: readonly SystemRoleView[]
  readonly canRecruit: boolean
}

/** Exported `.persona.json` / `.team.json` text. */
export interface ShareFileView {
  readonly filename: string
  readonly json: string
}

/** Export one persona. */
export interface ExportPersonaRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
}

/** Import a `.persona.json` document. */
export interface ImportPersonaRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly json: string
}

/** Result of `importPersona` — proposal only. */
export interface ImportPersonaView {
  readonly spec: PersonaSpecView
}

/** Export a team file. */
export interface ExportTeamRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaIds?: readonly string[]
  readonly templateId?: string
}

/** Import a `.team.json` document. */
export interface ImportTeamRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly json: string
}

/** Result of `importTeam` — pending proposals. */
export interface ImportTeamView {
  readonly personas: readonly PersonaSpecView[]
}

/** CLI skill candidate (never auto-enabled). */
export interface CliSkillCandidateView {
  readonly name: string
  readonly body: string
  readonly origin: 'learned'
  readonly enabled: false
  readonly source: 'claude' | 'codex'
  readonly skillKey: string
}

/** Persist selected CLI skill candidates as disabled. */
export interface ProposeCliSkillsRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly skillKeys: readonly string[]
}

/** Activation funnel (local only). */
export interface ActivationFunnelView {
  readonly onboarded: boolean
  readonly firstUsefulReply: boolean
  readonly firstTaskDone: boolean
  readonly returnedIn7Days: boolean
  readonly stage: 'empty' | 'onboarding' | 'first_reply' | 'first_task' | 'returned'
}

/** Impact for one persona (hours labeled `estimativa`). */
export interface PersonaImpactView {
  readonly personaId: string
  readonly tasksCompleted: number
  readonly timeToReadyMs: number
  readonly proposalsAccepted: number
  readonly hoursSavedEstimate: number
  readonly hoursSavedLabel: 'estimativa'
}

/** One persona's impact. */
export interface PersonaImpactRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
}

/** Live store health after open / restore. */
export interface StoreHealthView {
  readonly schemaVersion: number
  readonly safeMode: boolean
  readonly recovered: boolean
  readonly recoveredFrom: string
  readonly recoveryMessage: string
  readonly backups: readonly BackupView[]
}

/** Choose a backup filename from `listBackups`. */
export interface RestoreBackupRequest {
  readonly filename: string
}

/** Upload a file into the Cofre (local extract). */
export interface IngestVaultDocumentRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly name: string
  readonly bytesBase64: string
  readonly visibility?: 'workspace' | 'project' | 'persona'
  readonly personaId?: string
}

/** Replace the file of an existing Cofre document. */
export interface ReplaceVaultDocumentRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly documentId: string
  readonly name: string
  readonly bytesBase64: string
}

/** Cofre document card. */
export interface VaultDocumentView {
  readonly id: string
  readonly title: string
  readonly filename: string
  readonly mime: string
  readonly bytes: number
  readonly revision: number
  readonly chunks: number
}

/** One FTS hit with citation locator. */
export interface VaultChunkHitView {
  readonly id: string
  readonly documentId: string
  readonly title: string
  readonly locator: string
  readonly body: string
  readonly restricted: boolean
}

/** Search Cofre chunks. */
export interface SearchVaultDocumentsRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly query: string
}

/** Delete a Cofre document and its chunks. */
export interface DeleteVaultDocumentRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly documentId: string
}

/** Second-brain page type. */
export type BrainKindView =
  | 'company' | 'person' | 'client' | 'project' | 'process' | 'rule'
  | 'decision' | 'permission' | 'tool' | 'glossary' | 'learning'

/** Create or edit a markdown page. */
export interface PutBrainPageRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly kind: BrainKindView
  readonly title: string
  readonly body: string
  readonly editorKind: 'person' | 'persona'
  readonly editorId: string
  readonly visibility?: 'workspace' | 'project' | 'persona' | 'members'
  readonly personaId?: string
  readonly memberIds?: readonly string[]
  readonly sources?: readonly string[]
  readonly properties?: Readonly<Record<string, string>>
}

/** One page id. */
export interface BrainPageIdRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly pageId: string
}

/** List/search second-brain pages. */
export interface ListBrainPagesRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly kind?: BrainKindView
  readonly query?: string
}

/** Card for Empresa › Segundo cérebro. */
export interface BrainPageView {
  readonly id: string
  readonly kind: BrainKindView
  readonly title: string
  readonly body: string
  readonly slug: string
  readonly revision: number
  readonly links: readonly string[]
  readonly sources: readonly string[]
  readonly editorHint: string
  readonly updatedAt: string
  readonly restricted: boolean
  /** Visibility classification; readable private pages still have restricted:false. */
  readonly audience?: 'workspace' | 'project' | 'private' | 'persona'
}

/** One immutable revision. */
export interface BrainVersionView {
  readonly revision: number
  readonly title: string
  readonly editorKind: 'person' | 'persona'
  readonly editorId: string
  readonly createdAt: string
}

/** Remembered approval. */
export interface GrantBrainPermissionRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly personaId: string
  readonly action: string
  readonly target: string
  readonly validity: 'once' | '7d' | 'until-revoke'
}

/** Grant id. */
export interface BrainGrantIdRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly grantId: string
}

/** Restore an immutable revision (writes a new version). */
export interface RestoreBrainPageRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly pageId: string
  readonly revision: number
}

/** Count a remembered-permission use (exact scope only). */
export interface UseBrainGrantRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly grantId: string
  readonly personaId: string
  readonly action: string
  readonly target: string
}

/** Active or revoked grant. */
export interface BrainGrantView {
  readonly id: string
  readonly pageId: string
  readonly personaId: string
  readonly action: string
  readonly target: string
  readonly validity: 'once' | '7d' | 'until-revoke'
  readonly expiresAt?: string
  readonly revokedAt?: string
  readonly useCount: number
}

/** Home of Empresa › Segundo cérebro. */
export interface BrainHomeView {
  readonly startHereId: string
  readonly changedToday: readonly BrainPageView[]
  readonly activeGrants: readonly BrainGrantView[]
  readonly contradictions: readonly BrainPageView[]
  /** Dest extras from the last vault sync. Never deleted. */
  readonly leftover: readonly string[]
}

/** One-way (default) or two-way folder sync. */
export interface BrainVaultFolderRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly folderPath: string
  readonly twoWay?: boolean
}

/** Export/import counts. Dest extras stay on disk. */
export interface BrainVaultFolderView {
  readonly files: number
  readonly created: number
  readonly skipped: number
  readonly direction: 'export' | 'import'
  readonly leftover: readonly string[]
}

/** BYC paste organize request. */
export interface PreviewBringContextPasteRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly text: string
  readonly provider: 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'other'
}

/** BYC vault folder scan request (absolute path from desktop picker). */
export interface PreviewBringContextVaultFolderRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly rootPath: string
}

/** One BYC proposal row (review before apply). */
export interface BringContextProposalView {
  readonly id: string
  readonly kind: string
  readonly section: string
  readonly body: string
  readonly provenance: string
  readonly uncertain: boolean
  readonly sensitive: boolean
  readonly blocked: boolean
  readonly sensitiveWhy: string
  readonly duplicateOf: string
  readonly conflictQuestion: string
  readonly status: string
  readonly path: string
  readonly hash: string
}

export interface BringIgnoredView {
  readonly path: string
  readonly why: string
}

/** BYC organize preview (paste or vault folder). */
export interface BringContextPreviewView {
  readonly source: 'paste' | 'vault'
  readonly proposals: readonly BringContextProposalView[]
  readonly ignored: readonly BringIgnoredView[]
}

/** One review choice. */
export interface ApplyContextItemView {
  readonly id: string
  readonly action: 'accept' | 'edit' | 'discard' | 'private'
  readonly body?: string
}

/** Persist accepted BYC items into the Cofre. */
export interface ApplyContextProposalsRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly preview: BringContextPreviewView
  readonly items: readonly ApplyContextItemView[]
}

/** How many Cofre rows were written. */
export interface ApplyContextProposalsView {
  readonly written: number
  readonly skipped: number
  readonly ids: readonly string[]
}

/** Gestor de equipe approval mode. */
export type GestorApprovalView = 'always_ask' | 'auto_within_limits' | 'auto_and_notify'

/** Limits + identity for one Gestor de equipe. */
export interface GestorMandateView {
  readonly personaId: string
  readonly workspaceId: string
  readonly approval: GestorApprovalView
  readonly maxPersonas: number
  readonly budgetTokens: number
  readonly allowedTools: readonly string[]
  readonly allowedEngines: readonly string[]
  readonly sectorIds: readonly string[]
  readonly projectIds: readonly string[]
  readonly canGrantGestor: boolean
}

/** Open or applied Gestor plan. */
export interface GestorPlanView {
  readonly id: string
  readonly workspaceId: string
  readonly gestorId: string
  readonly action: string
  readonly scopeKey: string
  readonly summary: string
  readonly reason: string
  readonly status: string
  readonly createdAt: string
  readonly commentOnId?: string
}

/** Audit line. */
export interface GestorAuditView {
  readonly id: string
  readonly gestorId: string
  readonly action: string
  readonly summary: string
  readonly reason: string
  readonly at: string
}

/** `getGestorMandate`. */
export interface GetGestorMandateRequest {
  readonly workspaceId: string
  readonly personaId: string
}

/** Owner writes the ceiling. */
export interface SetGestorLimitsRequest extends GestorMandateView {}

/** Hire spec on the wire. */
export interface GestorHireSpecView {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly personality: string
  readonly instructions: string
  readonly runnerKind: 'dsh' | 'cli'
  readonly runnerCli: string
  readonly runnerModel: string
  readonly tools: Readonly<Record<string, 'none' | 'read' | 'write'>>
  readonly systemRoles: readonly SystemRoleView[]
  readonly canRecruit: boolean
  readonly tokensPerMonth: number
}

/** Propose a hire. */
export interface ProposeGestorHireRequest {
  readonly workspaceId: string
  readonly id: string
  readonly gestorId: string
  readonly spec: GestorHireSpecView
  readonly reason: string
  readonly projectId?: string
  readonly sectorId?: string
}

/** Human accept. */
export interface ApproveGestorPlanRequest {
  readonly workspaceId: string
  readonly planId: string
}

/** Human decline. */
export interface RejectGestorPlanRequest {
  readonly workspaceId: string
  readonly planId: string
}

/** Assemble team for a goal. */
export interface AssembleTeamRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly sprintId: string
  readonly goal: string
}

/** Preview of structure + flow + sprint 1. */
export interface AssembleTeamView {
  readonly company: string
  readonly explanation: string
  readonly personaTitles: readonly string[]
  readonly workflowId: string
  readonly sprintName: string
  readonly hire?: readonly { readonly function: string }[]
  readonly reuse?: readonly { readonly function: string; readonly personaId: string }[]
}

/** `listGestorAudit`. */
export interface ListGestorAuditRequest {
  readonly workspaceId: string
}

/** Natural-language goal → assemble preview + pending plan. */
export interface ProposeGestorAssembleRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly gestorId: string
  readonly id: string
  readonly goal: string
}

/** Plan row + structure preview for the chat card. */
export interface ProposeGestorAssembleView {
  readonly plan: GestorPlanView
  readonly preview: AssembleTeamView
}

/** Open plans awaiting a human. */
export interface ListGestorPlansRequest {
  readonly workspaceId: string
}

/** Second Gestor comments on an open plan (GES-3). */
export interface CommentGestorPlanRequest {
  readonly workspaceId: string
  readonly planId: string
  readonly commenterId: string
  readonly comment: string
}

/** Human picks the winner on a tied scope. */
export interface ResolveGestorTieRequest {
  readonly workspaceId: string
  readonly chosenId: string
}

/** Propose placing a persona on projects. */
export interface ProposeGestorAllocateRequest {
  readonly workspaceId: string
  readonly id: string
  readonly gestorId: string
  readonly personaId: string
  readonly projectIds: readonly string[]
  readonly reason: string
  readonly sectorId?: string
}

/** Propose a reorganize (move / pause / autonomy). */
export interface ProposeGestorReorganizeRequest {
  readonly workspaceId: string
  readonly id: string
  readonly gestorId: string
  readonly kind: 'move_work' | 'pause_idle' | 'set_autonomy'
  readonly targetPersonaId: string
  readonly notice: string
  readonly reason: string
  readonly ticketIds?: readonly string[]
  readonly nextAutonomy?: 'on_request' | 'propose' | 'act'
  readonly projectId?: string
}

/** Queue a dashed composer bubble (T3 §4). */
export interface EnqueueWorkingMessageRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly subjectId: string
  readonly text: string
  /** Conversation the bubble is sent to; default the project channel #geral. */
  readonly streamKind?: 'channel' | 'dm'
  readonly ownerId?: string
  /** `quota`: queued because the AI quota is used up. It does not leave by itself when the persona is idle; it waits for the quota. */
  readonly reason?: 'quota'
}

/** One queued composer row. */
export interface QueuedMessageView {
  readonly id: string
  readonly personaId: string
  readonly subjectId: string
  readonly text: string
  readonly createdAt: string
  /** Where the bubble goes when it is sent (filled by the host). */
  readonly streamKind?: 'channel' | 'dm'
  readonly ownerId?: string
  /** Why it waits beyond the persona being busy: `quota` = until the quota is back. */
  readonly reason?: 'quota'
}

/** List or flush the dashed queue. */
export interface WorkingQueueRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly subjectId: string
}

/** Edit or drop one queued row. */
export interface EditQueuedMessageRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly subjectId: string
  readonly id: string
  readonly text?: string
}

/** `/lado` aside — never a thread message. */
export interface OpenAsideAskRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly subjectId: string
  /** What the persona is asked. For a `summary` this is the host's own prompt and is NEVER stored as the question the person sees. */
  readonly question: string
  /** What kind of side question it is (default `aside`: the person typed it). */
  readonly kind?: 'aside' | 'summary'
  /** What the person sees as the question, when it is not what was asked (`summary`: "Resumo desta conversa"). */
  readonly shown?: string
}

/** Aside view. */
export interface AsideAskView {
  readonly id: string
  readonly personaId: string
  readonly subjectId: string
  /** The question as the PERSON sees it: what she typed (`aside`) or a short title (`summary`: "Resumo desta conversa") — never the host's prompt. */
  readonly question: string
  /** `aside` (/lado: she asked) or `summary` (/resumo: the host asked for her). Absent only on asks stored before it existed (read as `aside`). */
  readonly kind?: 'aside' | 'summary'
  readonly onThread: false
  /** `asking` while the persona answers, then `answered` or `failed`. Absent on asks stored before the answer existed. */
  readonly status?: 'asking' | 'answered' | 'failed'
  /** The answer (3 sentences at most), outside the thread. */
  readonly answer?: string
  readonly answeredAt?: string
  /** Why it failed: `paused` · `no_engine` · `failed`. */
  readonly error?: 'paused' | 'no_engine' | 'failed'
  /** Safe sentence for `error`. */
  readonly message?: string
}

/** One side question. */
export interface GetAsideAskRequest extends ProjectScopeRequest {
  readonly id: string
}

/** Side questions of one persona in one subject, oldest first. */
export interface ListAsideAsksRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly subjectId: string
}

/** `/resumo`: a persona summarises a conversation, off the thread (answered like a `/lado`; read it with `getAsideAsk`). */
export interface SummarizeConversationRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly subjectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly topicId?: string
}

/** One T3 §9 activity event on the wire. */
export interface TurnActivityView {
  readonly id: string
  readonly personaId: string
  readonly threadId: string
  readonly kind: 'command' | 'file' | 'hire' | 'message' | 'read' | 'check'
  readonly title: string
  readonly status: 'done' | 'failed' | 'running' | 'waiting'
  readonly at: string
}

/** Persist one T3 §9 activity event. */
export interface RecordTurnActivityRequest extends ProjectScopeRequest {
  readonly id: string
  readonly personaId: string
  readonly subjectId: string
  readonly kind: 'command' | 'file' | 'hire' | 'message' | 'read' | 'check'
  readonly title: string
  readonly status: 'done' | 'failed' | 'running' | 'waiting'
  readonly at?: string
}

/** Fold activity for a subject. */
export interface ListTurnActivityRequest extends ProjectScopeRequest {
  readonly subjectId: string
  readonly personaId?: string
}

/** One ActivityGroup fold on the wire. */
export interface ActivityGroupView {
  readonly personaId: string
  readonly threadId: string
  readonly items: readonly TurnActivityView[]
  readonly shownKinds: readonly string[]
  readonly moreCount: number
  readonly failedCount: number
  readonly unfinished: boolean
}

/** Editor: assign system roles (incl. `team_manager`). */
export interface SetPersonaSystemRolesRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly systemRoles: readonly SystemRoleView[]
}

/** Incremental subject fold. */
export interface GetSubjectSummaryRequest extends ProjectScopeRequest {
  readonly topicId: string
}

/** Stored subject summary. */
export interface SubjectSummaryView {
  readonly topicId: string
  readonly summary: string
  readonly lastSeq: number
  readonly messageCount: number
}

/** Bibliotecário lote sobre o que mudou. */
export interface LibrarianBatchView {
  readonly scanned: number
  readonly duplicates: number
  readonly reminders: number
  readonly since: string
}

/** One harvest report (Rivet / T3). */
export interface LimitAccountReportView {
  readonly accountId: string
  readonly provider: string
  readonly label: string
  readonly checkedAt: string
  readonly windows: readonly {
    readonly id: string
    readonly kind: 'session' | 'weekly' | 'monthly' | 'other'
    readonly usedPercent?: number
    readonly resetsAt?: string
  }[]
  readonly email?: string
  readonly credentialFingerprint?: string
  readonly workspaceId?: string
  readonly environmentId?: string
  readonly environmentLabel?: string
  readonly resetCredits?: { readonly remaining: number; readonly nextCreditId?: string }
}

/** Persist harvest reports. */
export interface PutProviderLimitReportsRequest extends ProjectScopeRequest {
  readonly reports: readonly LimitAccountReportView[]
}

/** Read folded pool. */
export interface GetProviderLimitPoolRequest extends ProjectScopeRequest {
  readonly provider?: string
}

/** One provider pool on the wire. */
export interface ProviderLimitPoolView {
  readonly provider: string
  readonly accountCount: number
  readonly nextResetAt: string
  readonly windows: readonly {
    readonly id: string
    readonly kind: string
    readonly remainingPercent?: number
    readonly nextResetAt?: string
  }[]
}

// ---- IV-1: the team acts on its own (Bolt) --------------------------------------------------------------------
export type { ProactivityStatusView, SchedulerActionView, SchedulerEventKind, SchedulerState } from './proactivity-scheduler.ts'
export type { TeamStateView } from './team-state.ts'

// ---- IV-5: steer, queue and Parar for real (Bolt) -------------------------------------------------------------
/** “Direcionar agora”: send now; steers the persona's open turn when there is one. */
export interface SteerWorkingTurnRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly subjectId: string
  readonly text: string
  readonly streamKind?: 'channel' | 'dm'
  readonly ownerId?: string
}

/** `steer` = the open turn took it; `sent` = no turn was open, it went as a normal message. */
export interface SteerWorkingTurnView {
  readonly mode: 'steer' | 'sent'
  readonly messageId: string
  readonly ticketId?: string
}

/** Send the dashed queue now: all of it, or only `queueItemId`. */
export interface FlushWorkingQueueRequest extends WorkingQueueRequest {
  readonly queueItemId?: string
}

/** Put a removed bubble back (the “Desfazer” of Tirar) at its old place. */
export interface RestoreQueuedMessageRequest extends WorkingQueueRequest {
  readonly item: QueuedMessageView
}

/** Parar: the open task turn (`ticketId` or the persona's running one) and/or the reply in flight (`eventId`). */
export interface StopTurnRequest extends ProjectScopeRequest {
  readonly personaId: string
  readonly subjectId?: string
  readonly ticketId?: string
  readonly eventId?: string
}

/** `none` is not an error: nothing was running. */
export interface StopTurnView {
  readonly stopped: 'ticket' | 'reply' | 'none'
  readonly ticketId: string
  readonly line: string
}

/**
 * Item 20: the voice model archive the renderer's worker loads. The Host owns the download (official zip, pinned sha256) and the
 * `model.tar.gz`; the renderer only asks for the bytes after the person consents.
 */
export type VoiceModelBytesView =
  | { readonly state: 'ready'; readonly version: string; readonly base64: string; readonly bytes: number }
  | { readonly state: 'unavailable' }
  | { readonly state: 'failed'; readonly reason: ComponentFailure }

/** Item 20: what the Host has installed for the voice model, without touching the network. */
export type VoiceModelStateView =
  | { readonly state: 'installed'; readonly version: string }
  | { readonly state: 'absent' }
  | { readonly state: 'unavailable' }
  | { readonly state: 'failed'; readonly reason: ComponentFailure }
export type { OAuthCredentialView } from './oauth-vault.ts'
export type { SendStickerRequest } from './sticker-send.ts'
