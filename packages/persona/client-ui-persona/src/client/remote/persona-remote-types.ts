/** Subset of Persona host Remote used by the shell (wire types from host). */
import type { MessageView as HostMessageView, ReactionView } from '@deepseek-ai/dsh-persona-host/types'
import type { RunErrorPayload } from '../primitives/run-errors.ts'

export type {
  AwayEventView,
  ChannelView,
  DmView,
  OverviewNowView,
  OverviewView,
  PersonaNowView,
  PersonaView,
  PingResult,
  ProjectScopeRequest,
  ProjectView,
  ReactionView,
  TaskView,
  TeamView,
  WhileAwayView,
} from '@deepseek-ai/dsh-persona-host/types'

/**
 * Host message row for mappers. `reactions` is optional so fake/older hosts in tests (e.g. remote-unwrap) stay valid.
 */
export type MessageView = Omit<HostMessageView, 'reactions' | 'conversationSubjectId'> & {
  readonly reactions?: readonly ReactionView[]
  readonly conversationSubjectId?: string
  readonly topicId?: string
  /** Typed execution failure (RUN-ERRORS-SPEC); host sends code, not user-facing text. */
  readonly runError?: RunErrorPayload
}

export interface PersonaTenantScope {
  readonly workspaceId: string
  readonly projectId: string
  readonly memberId: string
  readonly channelId: string
}
