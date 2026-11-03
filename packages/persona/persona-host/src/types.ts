/** JSON-safe inputs and results of the Persona Remote namespace. */
import type {} from '@deepseek-ai/dsh-typert-protocol'

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
  readonly systemRoles: readonly ('coordination' | 'watchdog')[]
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

/** Create a shared project. */
export interface CreateProjectRequest {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly description: string
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
  readonly systemRoles?: readonly ('coordination' | 'watchdog')[]
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

/** Directory listing confined to the project root. */
export interface ProjectFileListing {
  readonly path: string
  readonly entries: readonly ProjectFileEntry[]
}

/** Stat of one confined path. */
export interface ProjectFileStat {
  readonly path: string
  readonly kind: 'file' | 'directory'
  readonly bytes: number
}

/** UTF-8 file body confined to the project root. */
export interface ProjectFileText {
  readonly path: string
  readonly text: string
  readonly bytes: number
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
  readonly command: 'stop' | 'retry' | 'reevaluate' | 'dismiss'
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
}

/** Detected CLI or connection (read-only probe). */
export interface ConnectionView {
  readonly id: string
  readonly kind: 'claude' | 'codex' | 'cursor' | 'opencode' | 'dsh'
  readonly available: boolean
}

/** Context a turn used (ticket origin + latest inputs). */
export interface TurnContextView {
  readonly ticketId: string
  readonly triggerIds: readonly string[]
  readonly title: string
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
  readonly systemRoles: readonly ('coordination' | 'watchdog')[]
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

/** One triage simulation line. */
export interface TriageLogView {
  readonly id: string
  readonly at: string
  readonly summary: string
  readonly mode: 'logOnly' | 'execute'
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

/** Global search that applies stream ACL. */
export interface SearchRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly actorId: string
  readonly query: string
  readonly limit: number
}
