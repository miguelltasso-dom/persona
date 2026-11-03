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

/** Global search that applies stream ACL. */
export interface SearchRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly actorId: string
  readonly query: string
  readonly limit: number
}
