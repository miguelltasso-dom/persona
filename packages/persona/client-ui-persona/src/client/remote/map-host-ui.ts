import type { PersonaCharacterId } from '../assets/asset-url.ts'
import { poseUrl } from '../assets/asset-url.ts'
import { resolveProjectDisplayName } from '../kanban/resolve-project-name.ts'
import type { KanbanCardModel, KanbanColumnId, KanbanPersonaRef } from '../kanban/types.ts'
import type { ConversationSubjectUi } from '../chat/conversation-subjects.ts'
import { parseGestorPlanId } from '../chat/gestor-plan-message.ts'
import { parseRunErrorMarker } from '../chat/run-error-message.ts'
import type { RunErrorPayload } from '../primitives/run-errors.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot, PersonaWorkUiState } from '../team/persona-work-state.ts'
import { cardSystemRoles } from '../profile/card-system-roles.ts'
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

function attachConversationSubject(
  card: KanbanCardModel,
  task: TaskView,
  subjects: readonly ConversationSubjectUi[],
): KanbanCardModel {
  const subjectId = task.conversationSubjectId ?? task.topicId
  if (subjectId === undefined || subjectId.length === 0) return card
  const subject = subjects.find(row => row.id === subjectId)
  if (subject === undefined) return card
  return { ...card, conversationSubject: { name: subject.name, colorIndex: subject.colorIndex } }
}

/** Host tasks → cards with project labels and persona assignment from `now` rows. */
export function enrichKanbanCardsFromHost(
  tasks: readonly TaskView[],
  projects: readonly { readonly id: string; readonly name: string }[],
  nowRows: readonly PersonaNowSnapshot[],
  channelSubjects: readonly ConversationSubjectUi[] = [],
): KanbanCardModel[] {
  return tasks.map((task): KanbanCardModel => {
    let card = mapTaskToKanbanCard(task, projects)
    const assignee = findAssigneeForTask(task, nowRows)
    if (assignee !== undefined) {
      const row = nowRows.find(r => r.member.name === assignee.name)
      const assigneeState = row?.member.state ?? card.assigneeState
      card = assigneeState === undefined
        ? { ...card, assignee }
        : { ...card, assignee, assigneeState }
    }
    return attachConversationSubject(card, task, channelSubjects)
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
  arriving?: boolean,
): ChannelPersonaMember {
  const id = resolveCharacterId(persona, persona.id)
  const pose = uiStateToPose(state)
  const hasPose = poseUrl(id, pose) !== undefined
  return {
    id,
    name: persona.name,
    role: persona.title,
    state,
    systemRoles: [...cardSystemRoles(persona.systemRoles)],
    ...(arriving === true ? { arriving: true as const } : {}),
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

/**
 * Map stream events in seq order with monotonic display times when `occurredAt` regresses
 * (dev harness batches, idempotent seed).
 */
export function mapSortedMessageStream(
  events: readonly MessageView[],
  team: TeamView | null,
  memberId: string,
  taskTitleById: ReadonlyMap<string, string> = new Map(),
): ChannelMessageUi[] {
  const resolvedTeam: TeamView = team ?? { personas: [], members: [] }
  const sorted = sortMessageStreamEvents(events)
  let lastDisplayMs = Number.NEGATIVE_INFINITY
  return sorted.map((event) => {
    const parsed = Date.parse(event.occurredAt)
    if (Number.isNaN(parsed)) {
      return mapMessage(event, resolvedTeam, memberId, taskTitleById)
    }
    const displayMs = parsed >= lastDisplayMs ? parsed : lastDisplayMs + 60_000
    lastDisplayMs = displayMs
    if (displayMs === parsed) {
      return mapMessage(event, resolvedTeam, memberId, taskTitleById)
    }
    return mapMessage(
      { ...event, occurredAt: new Date(displayMs).toISOString() },
      resolvedTeam,
      memberId,
      taskTitleById,
    )
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

export function mapTeamToStrip(
  team: TeamView,
  now: readonly PersonaNowView[],
  arrivingPersonaIds: ReadonlySet<string> = new Set(),
): readonly ChannelPersonaMember[] {
  const nowByPersona = new Map(now.map(row => [row.personaId, row]))
  if (team.personas.length === 0) {
    return now.map((row) => {
      const member = mapPersonaNowRow(row, team).member
      return arrivingPersonaIds.has(row.personaId) ? { ...member, arriving: true as const } : member
    })
  }
  return sortPersonasForUi(team.personas).map((persona: PersonaView) => {
    const row = nowByPersona.get(persona.id)
    const arriving = arrivingPersonaIds.has(persona.id)
    if (row !== undefined) {
      const member = mapPersonaNowRow(row, team).member
      return arriving ? { ...member, arriving: true as const } : member
    }
    return stripMember(persona, 'resting', arriving)
  })
}

/** Dynamic away copy (host body) mapped into overview panel via parallel fields. */
export interface AwayEventLive {
  readonly id: string
  readonly body: string
  readonly taskLabel: string
  readonly taskId: string
}

export function mapAwayEventLive(event: AwayEventView): AwayEventLive {
  return {
    id: event.id,
    body: event.body,
    taskLabel: event.taskTitle.length > 0 ? event.taskTitle : event.taskId,
    taskId: event.taskId,
  }
}

export interface MessageReactionUi {
  readonly stickerId: string
  readonly count: number
  readonly actorIds: readonly string[]
}

export interface ChannelMessageUi {
  readonly id: string
  readonly authorId: string
  readonly authorName: string
  readonly body: string
  readonly timeLabel: string
  readonly reactions: readonly MessageReactionUi[]
  /** Parsed from `[[gestor-plan:…]]` marker in the host message body. */
  readonly gestorPlanId?: string
  /** WAVE2 assunto tag when host sets `conversationSubjectId` on the message. */
  readonly conversationSubjectId?: string
  /** Ticket/task citation when the host marks the stream event (C5b). */
  readonly taskTitle?: string
  /** Host ticket id when the stream event references work (Contexto usado). */
  readonly ticketId?: string
  /** Host persona id (for engine picker / run-error actions). */
  readonly authorPersonaId?: string
  readonly runError?: RunErrorPayload
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
  const reactions: MessageReactionUi[] = (event.reactions ?? []).map(row => ({
    stickerId: row.stickerId,
    count: row.actorIds.length,
    actorIds: [...row.actorIds],
  }))
  const parsedPlan = parseGestorPlanId(event.body)
  const bodyAfterPlan = parsedPlan?.visibleBody ?? event.body
  const parsedRunError = parseRunErrorMarker(bodyAfterPlan)
  const visibleBody = parsedRunError?.visibleBody ?? bodyAfterPlan
  const runError = event.runError ?? parsedRunError?.payload
  const row: ChannelMessageUi = {
    id: event.id,
    authorId,
    authorName,
    body: visibleBody,
    timeLabel,
    reactions,
    ...(persona !== undefined ? { authorPersonaId: persona.id } : { authorPersonaId: event.actorId }),
    ...(parsedPlan === null ? {} : { gestorPlanId: parsedPlan.planId }),
    ...(runError === undefined ? {} : { runError }),
  }
  const subjectTag = (event.conversationSubjectId ?? event.topicId ?? '').trim()
  const tagged = subjectTag.length > 0 ? { ...row, conversationSubjectId: subjectTag } : row
  if (taskTitle !== undefined && taskTitle.length > 0) {
    return ticketId !== undefined
      ? { ...tagged, taskTitle, ticketId }
      : { ...tagged, taskTitle }
  }
  return tagged
}
