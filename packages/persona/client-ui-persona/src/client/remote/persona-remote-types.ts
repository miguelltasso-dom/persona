/** Subset of Persona host Remote used by the shell (wire types from host). */
export type {
  AwayEventView,
  ChannelView,
  MessageView,
  OverviewNowView,
  OverviewView,
  PersonaNowView,
  PersonaView,
  PingResult,
  ProjectScopeRequest,
  ProjectView,
  TaskView,
  TeamView,
  WhileAwayView,
} from '@deepseek-ai/dsh-persona-host/types'

export interface PersonaTenantScope {
  readonly workspaceId: string
  readonly projectId: string
  readonly memberId: string
  readonly channelId: string
}
