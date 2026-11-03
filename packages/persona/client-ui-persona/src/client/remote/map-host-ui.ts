import type { PersonaCharacterId } from '../assets/asset-url.ts'
import { poseUrl } from '../assets/asset-url.ts'
import { resolveProjectDisplayName } from '../kanban/resolve-project-name.ts'
import type { KanbanCardModel, KanbanColumnId, KanbanPersonaRef } from '../kanban/types.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot, PersonaWorkUiState } from '../team/persona-work-state.ts'
import { uiStateToPose } from '../team/persona-work-state.ts'
import type { AwayEventView, MessageView, PersonaNowView, PersonaView, TaskView, TeamView } from './persona-remote-types.ts'
import { sortPersonasForUi } from '../team/sort-personas.ts'

function taskColumn(stage: string): KanbanColumnId {
  if (stage === 'todo') return 'todo'
  if (stage === 'doing') return 'in_progress'
  if (stage === 'review') return 'in_review'
  if (stage === 'blocked') return 'blocked'
  if (stage === 'done') return 'done'
  return 'in_progress'
}

function deriveCardAssigneeState(task: TaskView, column: KanbanColumnId): PersonaWorkUiState {
  if (column === 'blocked') return 'stuck'
  if (task.stageAction === 'waiting') return 'waiting'
  if (column === 'in_progress' || column === 'in_review') return 'working'
  return 'resting'
}

function personaInitials(name: string): string {
  const parts = name.trim().split(/\s+/u)
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function findAssigneeForTask(
  task: TaskView,
  nowRows: readonly PersonaNowSnapshot[],
): KanbanPersonaRef | undefined {
  for (const row of nowRows) {
    const taskRef = row.currentTask ?? ''
    if (taskRef.length === 0) continue
    if (taskRef === task.id || taskRef === task.title) {
      return {
        id: row.member.id,
        name: row.member.name,
        initials: personaInitials(row.member.name),
      }
    }
  }
  return undefined
}

export function mapTaskToKanbanCard(
  task: TaskView,
  projects: readonly { readonly id: string; readonly name: string }[] = [],
): KanbanCardModel {
  const column = taskColumn(task.stage)
  return {
    id: task.id,
    title: task.title,
    projectId: task.projectId,
    projectName: resolveProjectDisplayName(task.projectId, projects),
    teamId: 'default',
    teamName: 'Equipe',
    column,
    waitingEvent: task.stageAction === 'waiting',
    blocked: column === 'blocked',
    reviewApproved: false,
    assigneeState: deriveCardAssigneeState(task, column),
  }
}

/** Host tasks → cards with project labels and persona assignment from `now` rows. */
export function enrichKanbanCardsFromHost(
  tasks: readonly TaskView[],
  projects: readonly { readonly id: string; readonly name: string }[],
  nowRows: readonly PersonaNowSnapshot[],
): KanbanCardModel[] {
  return tasks.map((task): KanbanCardModel => {
    const card = mapTaskToKanbanCard(task, projects)
    const assignee = findAssigneeForTask(task, nowRows)
    if (assignee === undefined) return card
    const row = nowRows.find(r => r.member.name === assignee.name)
    const assigneeState = row?.member.state ?? card.assigneeState
    return assigneeState === undefined
      ? { ...card, assignee }
      : { ...card, assignee, assigneeState }
  })
}

const KNOWN_AVATARS = new Set<string>(['atlas', 'bento', 'nina', 'sol', 'luna'])

function avatarToCharacterId(ref: string): PersonaCharacterId {
  const lower = ref.toLowerCase()
  if (KNOWN_AVATARS.has(lower)) return lower as PersonaCharacterId
  const head = lower.split(/[-_.]/u)[0] ?? lower
  if (KNOWN_AVATARS.has(head)) return head as PersonaCharacterId
  for (const id of KNOWN_AVATARS) {
    if (lower.includes(id)) return id as PersonaCharacterId
  }
  return 'atlas'
}

function resolveCharacterId(persona: PersonaView | undefined, fallback: string): PersonaCharacterId {
  const fromRef = persona !== undefined ? avatarToCharacterId(persona.avatarRef) : avatarToCharacterId(fallback)
  if (fromRef !== 'atlas' || persona?.avatarRef.toLowerCase() === 'atlas') return fromRef
  if (persona !== undefined) {
    const fromName = avatarToCharacterId(persona.name)
    if (fromName !== 'atlas' || persona.name.toLowerCase() === 'atlas') return fromName
  }
  return avatarToCharacterId(fallback)
}

/** UI character id or label → host persona id for Remote writes (DM, etc.). */
export function resolveHostPersonaId(team: TeamView | null, ref: string): string {
  if (team === null) return ref
  if (team.personas.some(p => p.id === ref)) return ref
  const lower = ref.toLowerCase()
  const byAvatar = team.personas.find(
    p => p.avatarRef.toLowerCase() === lower || p.name.toLowerCase() === lower,
  )
  if (byAvatar !== undefined) return byAvatar.id
  const bySuffix = team.personas.find(p => p.id.toLowerCase().endsWith(`-${lower}`))
  if (bySuffix !== undefined) return bySuffix.id
  return ref
}

function stripMember(
  persona: PersonaView,
  state: PersonaWorkUiState,
): ChannelPersonaMember {
  const id = resolveCharacterId(persona, persona.id)
  const pose = uiStateToPose(state)
  const hasPose = poseUrl(id, pose) !== undefined
  return {
    id,
    name: persona.name,
    role: persona.title,
    state,
    systemRoles: [...persona.systemRoles],
    ...(hasPose ? {} : { silhouette: true as const }),
  }
}

/** Stream order: monotonic seq, then occurredAt (display time is not sort key). */
export function sortMessageStreamEvents(events: readonly MessageView[]): MessageView[] {
  return [...events].sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq
    return a.occurredAt.localeCompare(b.occurredAt)
  })
}

export function mapPersonaNowRow(row: PersonaNowView, team: TeamView): PersonaNowSnapshot {
  const persona = team.personas.find(p => p.id === row.personaId)
  const member = persona !== undefined
    ? stripMember(persona, row.state)
    : (() => {
      const id = resolveCharacterId(undefined, row.personaId)
      const pose = uiStateToPose(row.state)
      const hasPose = poseUrl(id, pose) !== undefined
      return {
        id,
        name: row.name,
        role: row.title,
        state: row.state,
        ...(hasPose ? {} : { silhouette: true as const }),
      }
    })()
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
  const nowByPersona = new Map(now.map(row => [row.personaId, row]))
  if (team.personas.length === 0) {
    return now.map(row => mapPersonaNowRow(row, team).member)
  }
  return sortPersonasForUi(team.personas).map((persona: PersonaView) => {
    const row = nowByPersona.get(persona.id)
    if (row !== undefined) return mapPersonaNowRow(row, team).member
    return stripMember(persona, 'resting')
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
  /** Ticket/task citation when the host marks the stream event (C5b). */
  readonly taskTitle?: string
  /** Host ticket id when the stream event references work (Contexto usado). */
  readonly ticketId?: string
}

export function mapMessage(
  event: MessageView,
  team: TeamView,
  memberId: string,
  taskTitleById: ReadonlyMap<string, string> = new Map(),
): ChannelMessageUi {
  const persona = team.personas.find(p => p.id === event.actorId)
  const member = team.members.find(m => m.id === event.actorId)
  const authorName = persona?.name ?? member?.displayName ?? (event.actorId === memberId ? 'Você' : event.actorId)
  const authorId = persona !== undefined
    ? resolveCharacterId(persona, persona.id)
    : event.actorId === memberId ? 'user' : event.actorId
  const time = new Date(event.occurredAt)
  const timeLabel = Number.isNaN(time.getTime())
    ? event.occurredAt.slice(11, 16)
    : time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const citesTask = event.type !== 'message' && event.subjectId.length > 0
  const ticketId = citesTask ? event.subjectId : undefined
  const resolvedTitle = ticketId !== undefined ? taskTitleById.get(ticketId) : undefined
  const taskTitle = resolvedTitle ?? (citesTask ? event.subjectId : undefined)
  const row: ChannelMessageUi = {
    id: event.id,
    authorId,
    authorName,
    body: event.body,
    timeLabel,
    reactions: [],
  }
  if (taskTitle !== undefined && taskTitle.length > 0) {
    return ticketId !== undefined
      ? { ...row, taskTitle, ticketId }
      : { ...row, taskTitle }
  }
  return row
}
