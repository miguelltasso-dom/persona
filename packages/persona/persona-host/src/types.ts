/** JSON-safe inputs and results of the Persona Remote namespace. */
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type {
  LedgerOrigin,
  TurnKind,
  TurnLayerSizes,
} from '@deepseek-ai/dsh-persona-core'
import type { UsageFold, UsageOrigin } from '@deepseek-ai/dsh-persona-usage'

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
}

/** Visão geral: "Precisa de você" first, then in-progress. Healthy work is omitted. */
export interface OverviewView {
  readonly needsYou: readonly TaskView[]
  readonly inProgress: readonly TaskView[]
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
  readonly occurredAt: string
  readonly responderId?: string
  /** Uploaded file ids from `attachFile`, bound on post. */
  readonly attachmentIds?: readonly string[]
  readonly replyToId?: string
  readonly topicId?: string
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

/** Accept the review (ff or squash). */
export interface AcceptReviewRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
  readonly mode: 'ff' | 'squash'
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
}

/** Pause or resume one routine. */
export interface PauseRoutineRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly paused: boolean
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

/** Ticket command from the board. */
export interface TicketCommandRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
  readonly command: 'stop' | 'retry' | 'reevaluate' | 'dismiss' | 'complete'
  readonly reason: string
}

/** Answer an Attention question; the text returns to the ticket. */
export interface AttentionReplyRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly ticketId: string
  readonly text: string
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

/** Idempotent first-run. Empty `cofreSeed` skips the vault proposal. */
export interface CompleteOnboardingRequest {
  readonly workspaceId: string
  readonly personalProjectId: string
  readonly displayName: string
  readonly team: readonly OnboardingPersonaSpec[]
  readonly templateIds: readonly string[]
  readonly runnerChoices: readonly string[]
  readonly cofreSeed: string
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
  /** `checking` = still probing; UI must not show "desconectado". */
  readonly phase: 'checking' | 'ready'
  readonly error?: ConnectionProbeError
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
  readonly error?: ConnectionProbeError
  readonly inUseCount?: number
}

/** `listConnectionAccounts` payload. */
export interface ConnectionAccountsBundleView {
  readonly accounts: readonly ConnectionAccountView[]
  readonly swapPolicy: RunnerSwapPolicy
  readonly swapPolicyScope: RunnerSwapPolicyScope
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
  readonly kind: 'needs-you' | 'review'
  readonly title: string
  readonly ticketId: string
  readonly at: string
}

/** Stream frame for {@link attentionEvents}. */
export interface AttentionStreamFrame {
  readonly kind: 'baseline' | 'upsert'
  readonly events: readonly AttentionEventView[]
}

/** Desktop toast ack. Acked ids drop out of the next baseline. */
export interface AckAttentionRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly eventIds: readonly string[]
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
}

/** Visão geral — agora. */
export interface OverviewNowView {
  readonly personas: readonly PersonaNowView[]
}

/** One "Enquanto você estava fora" line. */
export interface AwayEventView {
  readonly id: string
  readonly at: string
  readonly body: string
  readonly taskId: string
  readonly taskTitle: string
  readonly kind: 'delivery' | 'proposal' | 'watchdog'
}

/** Peak-end summary since the last visit. */
export interface WhileAwayView {
  readonly since: string
  readonly events: readonly AwayEventView[]
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

/** One triage rule. */
export interface TriageRuleView {
  readonly id: string
  readonly gateText: string
  readonly assessmentText: string
  readonly logOnly: boolean
  readonly speculativeEnabled: boolean
}

/** Put a triage rule. */
export interface PutTriageRuleRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly gateText: string
  readonly assessmentText: string
  readonly logOnly: boolean
  readonly speculativeEnabled: boolean
}

/** Quiet window. */
export interface QuietWindowView {
  readonly id: string
  readonly label: string
  readonly start: string
  readonly end: string
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
  readonly kind: 'hire' | 'vault' | 'skill' | 'attention'
  readonly title: string
  readonly question: string
  readonly status: 'pending' | 'approved' | 'rejected'
  readonly personaId: string
  readonly personaName: string
  /** Gallery/upload ref for hire cards (gallery ref only today). */
  readonly hireAvatarRef?: string
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
  readonly runs: readonly RoutineRunView[]
}

/** Decide an approval. */
export interface DecideApprovalRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
  readonly kind: 'hire' | 'vault' | 'skill' | 'attention'
  readonly accept: boolean
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
}

/** Memory row. */
export interface MemoryView {
  readonly id: string
  readonly body: string
  readonly status: 'pending' | 'active' | 'revoked'
  readonly origin: 'conversation' | 'vault' | 'import'
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
}

/** Persist one core turn. Kinds stay `execution` / `evaluation`. */
export interface RecordTurnLedgerRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly entry: TurnLedgerView
}

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

/** OPT-8 scripted + live book size (cut-40 stays blocked until enough live rows). */
export interface Opt8MeasureView {
  readonly passed: number
  readonly total: 4
  readonly failed: readonly string[]
  readonly blocked: readonly string[]
  readonly liveEntries: number
  readonly liveOrigin: LedgerOrigin
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
  /** Soonest `windows.resetsAt` (or last refill-history point). */
  readonly nextRefillAt?: string
  /** Short trail of reset clocks for the Lumen «próximo refill» strip. */
  readonly refillHistory?: readonly {
    readonly windowId: string
    readonly resetsAt: string
    readonly recordedAt: string
  }[]
}

/** One official window. `usedPercent` omitted when the vendor did not publish it. */
export interface UsageWindowView {
  readonly id: string
  readonly origin: UsageOrigin
  readonly usedPercent?: number
  readonly windowMinutes?: number
  readonly resetsAt?: string
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
  readonly runnerModel: string
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
  readonly engine: { readonly runnerLabel: string; readonly modelLabel: string }
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
}

/** One-way (default) or two-way folder sync. */
export interface BrainVaultFolderRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly folderPath: string
  readonly twoWay?: boolean
}

/** Export/import counts. */
export interface BrainVaultFolderView {
  readonly files: number
  readonly created: number
  readonly skipped: number
  readonly direction: 'export' | 'import'
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
}

/** One queued composer row. */
export interface QueuedMessageView {
  readonly id: string
  readonly personaId: string
  readonly subjectId: string
  readonly text: string
  readonly createdAt: string
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
  readonly question: string
}

/** Aside view. */
export interface AsideAskView {
  readonly id: string
  readonly personaId: string
  readonly subjectId: string
  readonly question: string
  readonly onThread: false
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
