import type { PersonaCharacterId } from '../assets/asset-url.ts'
import { poseUrl } from '../assets/asset-url.ts'
import type { KanbanCardModel, KanbanColumnId } from '../kanban/types.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot, PersonaWorkUiState } from '../team/persona-work-state.ts'
import { uiStateToPose } from '../team/persona-work-state.ts'
import type { AwayEventView, MessageView, PersonaNowView, PersonaView, TaskView, TeamView } from './persona-remote-types.ts'

function taskColumn(stage: string): KanbanColumnId {
  if (stage === 'todo') return 'todo'
  if (stage === 'doing') return 'in_progress'
  if (stage === 'review') return 'in_review'
  if (stage === 'blocked') return 'blocked'
  if (stage === 'done') return 'done'
  return 'in_progress'
}

export function mapTaskToKanbanCard(task: TaskView): KanbanCardModel {
  const column = taskColumn(task.stage)
  return {
    id: task.id,
    title: task.title,
    projectId: task.projectId,
    projectName: task.projectId,
    teamId: 'default',
    teamName: 'Equipe',
    column,
    waitingEvent: task.stageAction === 'waiting',
    blocked: column === 'blocked',
    reviewApproved: false,
  }
}

const KNOWN_AVATARS = new Set<string>(['atlas', 'bento', 'nina', 'sol', 'luna'])

function avatarToCharacterId(ref: string): PersonaCharacterId {
  if (KNOWN_AVATARS.has(ref)) return ref as PersonaCharacterId
  return 'atlas'
}

export function mapPersonaNowRow(row: PersonaNowView, team: TeamView): PersonaNowSnapshot {
  const persona = team.personas.find(p => p.id === row.personaId)
  const charId = avatarToCharacterId(persona?.avatarRef ?? row.personaId)
  const pose = uiStateToPose(row.state)
  const hasPose = poseUrl(charId, pose) !== undefined
  const member: ChannelPersonaMember = {
    id: charId,
    name: row.name,
    role: row.title,
    state: row.state,
    silhouette: !hasPose,
  }
  const snap: PersonaNowSnapshot = {
    member,
    queueCount: row.queueCount,
  }
  if (row.currentTask.length > 0) {
    return { ...snap, currentTask: row.currentTask }
  }
  return snap
}

export function mapTeamToStrip(team: TeamView, now: readonly PersonaNowView[]): readonly ChannelPersonaMember[] {
  if (now.length > 0) {
    return now.map(row => mapPersonaNowRow(row, team).member)
  }
  return team.personas.map((persona: PersonaView) => {
    const id = avatarToCharacterId(persona.avatarRef)
    const hasPose = poseUrl(id, 'disponivel') !== undefined
    return {
      id,
      name: persona.name,
      role: persona.title,
      state: 'resting' as PersonaWorkUiState,
      silhouette: !hasPose,
    }
  })
}

/** Dynamic away copy (host body) mapped into overview panel via parallel fields. */
export interface AwayEventLive {
  readonly id: string
  readonly body: string
  readonly taskLabel: string
}

export function mapAwayEventLive(event: AwayEventView): AwayEventLive {
  return {
    id: event.id,
    body: event.body,
    taskLabel: event.taskTitle.length > 0 ? event.taskTitle : event.taskId,
  }
}

export interface ChannelMessageUi {
  readonly id: string
  readonly authorId: string
  readonly authorName: string
  readonly body: string
  readonly timeLabel: string
  readonly reactions: readonly string[]
}

export function mapMessage(event: MessageView, team: TeamView, memberId: string): ChannelMessageUi {
  const persona = team.personas.find(p => p.id === event.actorId)
  const member = team.members.find(m => m.id === event.actorId)
  const authorName = persona?.name ?? member?.displayName ?? (event.actorId === memberId ? 'Você' : event.actorId)
  const authorId = persona !== undefined ? avatarToCharacterId(persona.avatarRef) : event.actorId === memberId ? 'user' : event.actorId
  const time = new Date(event.occurredAt)
  const timeLabel = Number.isNaN(time.getTime())
    ? event.occurredAt.slice(11, 16)
    : time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return {
    id: event.id,
    authorId,
    authorName,
    body: event.body,
    timeLabel,
    reactions: [],
  }
}
