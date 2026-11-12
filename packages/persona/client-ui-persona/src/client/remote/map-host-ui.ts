import { usableTaskTitle } from './task-title.ts'
import { personaTintIndex } from '../primitives/persona-tint.ts'
import type { PersonaCharacterId } from '../assets/asset-url.ts'
import { poseUrl } from '../assets/asset-url.ts'
import { resolveProjectDisplayName } from '../kanban/resolve-project-name.ts'
import type { KanbanCardModel, KanbanColumnId, KanbanPersonaRef } from '../kanban/types.ts'
import type { ConversationSubjectUi } from '../chat/conversation-subjects.ts'
import { parseGestorPlanId } from '../chat/gestor-plan-message.ts'
import { parseRunErrorMarker } from '../chat/run-error-message.ts'
import { stripWireMarkers } from '../chat/wire-markers.ts'
import { legacyRunErrorFromText, type RunErrorPayload } from '../primitives/run-errors.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot, PersonaWorkUiState } from '../team/persona-work-state.ts'
import { cardSystemRoles } from '../profile/card-system-roles.ts'
import { uiStateToPose } from '../team/persona-work-state.ts'
import type { AwayEventView, MessageView, PersonaNowView, PersonaView, TaskView, TeamPartStatusWire, TeamView, WhileAwayView } from './persona-remote-types.ts'
import { sortPersonasForUi } from '../team/sort-personas.ts'
import { mapPersonaAsk, type PersonaAskUi } from '../ask/persona-ask-model.ts'
import type { IndicatorOfferUi } from '../indicators/indicators-model.ts'
import { mapHandoffLine, mapReviewedBy, mapReviewLine, type HandoffLineUi, type ReviewedByInput, type ReviewLineUi, type StateLineUi, type TeamPersonaUi } from '../teamwork/team-lines-model.ts'
import { mapTaskProposal, type TaskProposalUi } from '../proposal/task-proposal-model.ts'
import { mapOpinion, type OpinionUi } from '../chat/opinion/opinion-model.ts'
import { mapDraftFiles, type DraftFileUi } from '../chat/draft-files/draft-files-model.ts'

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
    ...(task.question === undefined || task.question.trim() === '' ? {} : { question: task.question.trim() }),
    ...(task.questionStreamId === undefined || task.questionStreamId === '' ? {} : { questionStreamId: task.questionStreamId }),
  }
}

/** W2-3 — resolve assunto chip from host `topicId` / `conversationSubjectId` + stream subjects. */
export function conversationSubjectChipForId(
  subjectId: string | undefined,
  subjects: readonly ConversationSubjectUi[],
): KanbanCardModel['conversationSubject'] {
  if (subjectId === undefined || subjectId.length === 0) return undefined
  const subject = subjects.find(row => row.id === subjectId)
  if (subject === undefined) return undefined
  return { name: subject.name, colorIndex: subject.colorIndex }
}

function attachConversationSubject(
  card: KanbanCardModel,
  task: TaskView,
  subjects: readonly ConversationSubjectUi[],
): KanbanCardModel {
  const chip = conversationSubjectChipForId(task.conversationSubjectId ?? task.topicId, subjects)
  if (chip === undefined) return card
  return { ...card, conversationSubject: chip }
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

/** O personagem (rosto) de uma persona do time, ou `undefined` para quem não está no time. */
export function characterIdForPersona(team: TeamView | null, personaId: string): PersonaCharacterId | undefined {
  const persona = team?.personas.find(p => p.id === personaId)
  return persona === undefined ? undefined : resolveCharacterId(persona, persona.id)
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

/**
 * Muse state vocabulary (Bolt, host contract house-rules): the host sends `paused` ("Pausada") and `quiet` ("Descansando") ONLY when
 * true; absent = awake. The client copies exactly that and never invents `false`. `PersonaNowView` and `PersonaView` carry the same
 * facts, so either source may be given and a `true` from any of them counts. Both can be true (paused inside the window):
 * `derivePersonaState` decides which word wins (Pausada).
 */
function stateFlagsOf(...sources: readonly ({ readonly paused?: true; readonly quiet?: true } | undefined)[]): { readonly paused?: true; readonly quiet?: true } {
  const paused = sources.some(source => source?.paused === true)
  const quiet = sources.some(source => source?.quiet === true)
  return { ...(paused ? { paused: true as const } : {}), ...(quiet ? { quiet: true as const } : {}) }
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
    ...stateFlagsOf(persona),
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
  const reviewedByTask = new Map<string, ReviewedByInput>()
  let lastDisplayMs = Number.NEGATIVE_INFINITY
  return sorted.map((event) => {
    const rev = event.review
    if (rev !== undefined && rev.taskId.trim() !== '') {
      if (rev.kind === 'reviewed' && (rev.openPoints === undefined || rev.openPoints <= 0)) {
        reviewedByTask.set(rev.taskId, { personaId: rev.reviewerPersonaId, at: event.occurredAt })
      }
      else if (rev.kind === 'returned') {
        reviewedByTask.delete(rev.taskId)
      }
    }
    const parsed = Date.parse(event.occurredAt)
    if (Number.isNaN(parsed)) {
      return mapMessage(event, resolvedTeam, memberId, taskTitleById, reviewedByTask)
    }
    const displayMs = parsed >= lastDisplayMs ? parsed : lastDisplayMs + 60_000
    lastDisplayMs = displayMs
    if (displayMs === parsed) {
      return mapMessage(event, resolvedTeam, memberId, taskTitleById, reviewedByTask)
    }
    return mapMessage(
      { ...event, occurredAt: new Date(displayMs).toISOString() },
      resolvedTeam,
      memberId,
      taskTitleById,
      reviewedByTask,
    )
  })
}

export function mapPersonaNowRow(row: PersonaNowView, team: TeamView): PersonaNowSnapshot {
  const persona = team.personas.find(p => p.id === row.personaId)
  const member: ChannelPersonaMember = persona !== undefined
    ? { ...stripMember(persona, row.state), ...stateFlagsOf(persona, row) }
    : (() => {
      const id = resolveCharacterId(undefined, row.personaId)
      const pose = uiStateToPose(row.state)
      const hasPose = poseUrl(id, pose) !== undefined
      return {
        id,
        name: row.name,
        role: row.title,
        state: row.state,
        ...stateFlagsOf(row),
        ...(hasPose ? {} : { silhouette: true as const }),
      }
    })()
  // SW-7: o host só manda `draftFiles` quando há rascunho de verdade; o cliente nunca o inventa.
  const draftFiles = row.state === 'working' && typeof row.draftFiles === 'number' && Number.isFinite(row.draftFiles) && row.draftFiles >= 1
    ? Math.trunc(row.draftFiles)
    : undefined
  // COLHEITA §6 (Quill): a frase do passo só vem com `working` e quando o host sabe o passo; o cliente nunca a inventa.
  const step = row.state === 'working' && typeof row.sentence === 'string' && row.sentence.trim() !== '' ? row.sentence.trim() : undefined
  const withStep: ChannelPersonaMember = step === undefined ? member : { ...member, step }
  const snap: PersonaNowSnapshot = {
    member: draftFiles === undefined ? withStep : { ...withStep, draftFiles },
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
  /** O título real da tarefa; ausente quando o host não manda um (nunca o id). */
  readonly taskLabel?: string | undefined
  readonly taskId: string
}

export function mapAwayEventLive(event: AwayEventView): AwayEventLive {
  return {
    id: event.id,
    body: event.body,
    taskLabel: usableTaskTitle(event.taskTitle, [event.taskId]),
    taskId: event.taskId,
  }
}

/** Who did it, for the face on a row: `personaId` can come empty (a question with no matching persona): then there is no face. */
export interface AwayPersonaRef {
  readonly name: string
  /** Gallery key of the portrait (`avatarRef`), when the persona is on the team. */
  readonly characterId?: string | undefined
}

export interface AwayDoneLive {
  readonly id: string
  readonly kind: AwayEventView['kind']
  /** What the persona did, written by the host. */
  readonly body: string
  /** A delivery's host text IS the Task's title (no sentence): the card writes "{persona} entregou …" around it. */
  readonly deliveredTitle?: string | undefined
  /** The real Task title; absent when unknown (then only the body is shown, never the raw id). */
  readonly taskLabel?: string | undefined
  readonly taskId?: string | undefined
  readonly persona?: AwayPersonaRef | undefined
}

export interface AwayWaitingLive {
  readonly id: string
  readonly kind: 'review' | 'question' | 'approval'
  readonly title?: string | undefined
  readonly taskId?: string | undefined
  /** The Aprovações card (same id as the approval): approvals and questions open it. */
  readonly approvalId?: string | undefined
  readonly persona?: AwayPersonaRef | undefined
}

/** "Enquanto você estava fora" with the host's real records (P1-7). The host does not consume it when read. */
export interface AwayLive {
  /** ISO: when the person left. Also the identity of this window (it changes when the host restarts it). */
  readonly since: string
  /** How long they were away, measured by the host on their return; absent on a first visit. */
  readonly awayMinutes?: number | undefined
  readonly done: readonly AwayDoneLive[]
  readonly waiting: readonly AwayWaitingLive[]
}

function awayPersona(team: TeamView | null, personaId: string | undefined, personaName: string | undefined): AwayPersonaRef | undefined {
  const id = personaId ?? ''
  const row = id === '' ? undefined : team?.personas.find(persona => persona.id === id)
  const name = (row?.name ?? personaName ?? '').trim()
  if (name === '') return undefined
  return { name, ...(row === undefined ? {} : { characterId: row.avatarRef }) }
}

/**
 * Host `WhileAwayView` → what the card shows. A task title that is empty (or looks like an id) is dropped, so the row says
 * only what the host wrote; an older host without `waiting` simply has nothing waiting.
 */
export function mapAwayLive(view: WhileAwayView, team: TeamView | null): AwayLive {
  return {
    since: view.since,
    ...(view.summary?.awayMinutes === undefined ? {} : { awayMinutes: view.summary.awayMinutes }),
    done: view.events.map((event): AwayDoneLive => ({
      id: event.id,
      kind: event.kind,
      body: event.body,
      ...(event.kind === 'delivery' && event.body.trim() === event.taskTitle.trim() && usableTaskTitle(event.taskTitle, [event.taskId]) !== undefined
        ? { deliveredTitle: event.taskTitle.trim() }
        : {}),
      taskLabel: usableTaskTitle(event.taskTitle, [event.taskId]),
      taskId: event.taskId === '' ? undefined : event.taskId,
      persona: awayPersona(team, event.personaId, event.personaName),
    })),
    waiting: (view.waiting ?? []).map((row): AwayWaitingLive => ({
      id: row.id,
      kind: row.kind,
      title: usableTaskTitle(row.title, [row.taskId, row.approvalId]),
      taskId: row.taskId === '' ? undefined : row.taskId,
      approvalId: row.approvalId === undefined || row.approvalId === '' ? undefined : row.approvalId,
      persona: awayPersona(team, row.personaId, row.personaName),
    })),
  }
}

export interface MessageReactionUi {
  readonly stickerId: string
  readonly count: number
  readonly actorIds: readonly string[]
}

/** Uma linha do resumo da manhã na tela: a persona (nome e rosto, quando está no time) e o título real da tarefa. */
export interface DailyBriefItemUi {
  readonly taskId: string
  readonly title: string
  /** Um pedido terminado (Ontem): "Campanha de Natal ficou pronta · Texto, Arte e Posts", com os rostos de quem fez (nunca o da Coordenação). */
  readonly request?: DailyBriefRequestUi
  readonly personaId?: string
  readonly personaName?: string
  readonly characterId?: PersonaCharacterId
}

/** O pedido terminado agrupado em UM item do "Ontem" (Muse 05/11 01:07). */
export interface DailyBriefRequestUi {
  readonly title: string
  readonly parts: readonly string[]
  /** Os rostos de quem fez, só os que o host mandou e que estão no time (sem ids, nenhum rosto). */
  readonly faces: readonly { readonly name: string; readonly characterId: PersonaCharacterId }[]
}

/** D-090 (EQUIPE-REAL-SPEC §(b)): o cartão "Bom dia" do #geral. Sem nada a dizer, a seção não existe (e sem seção nenhuma, o cartão também não). */
export interface DailyBriefUi {
  /** "YYYY-MM-DD". */
  readonly day: string
  /** O rosto e o nome da Coordenação que abre o resumo (quando ela está no time). */
  readonly coordinatorName?: string
  readonly coordinatorCharacterId?: PersonaCharacterId
  readonly yesterday: readonly DailyBriefItemUi[]
  /** O "e mais n" de "Ontem" (o que o host cortou, somado ao que passar de 3 aqui). */
  readonly yesterdayMore: number
  readonly today: readonly DailyBriefItemUi[]
  readonly waitingCount: number
  readonly routineId?: string
  /**
   * O instante em que o cartão foi postado (ISO, o `occurredAt` da mensagem). O resumo A PEDIDO depois das 12:00 diz "Resumo do dia · {hora}", sem o spot do
   * sol nascendo; o automático da manhã segue "Bom dia · {dia}". Sem o instante (ou inválido), vale o da manhã.
   */
  readonly postedAt?: string
  /** O tipo que o motor deu ao cartão (`morning` | `on-demand`); ausente = a tela decide pelo `postedAt`. */
  readonly variant?: 'morning' | 'on-demand'
}

/**
 * D-084 / PERSONA-POWERS §1: o cartão de prévia de uma ação externa (email, post, pagamento, apagar). TUDO o que sai da empresa é visto antes:
 * sem prévia completa (`blind`), a tela não deixa enviar ("não dá para enviar às cegas", falha fechada como o host).
 */
export interface ActionPreviewUi {
  readonly approvalId: string
  readonly actionClass: 'send' | 'post' | 'pay' | 'delete'
  readonly verb: 'email' | 'post' | 'pay' | 'delete'
  readonly connectorName: string
  readonly personaId: string
  readonly personaName?: string
  readonly characterId?: PersonaCharacterId
  readonly to?: string
  /** P0-10: os outros destinatários e os anexos aparecem na prévia (o host manda; nada fica escondido na hora de aprovar). */
  readonly cc?: string
  readonly bcc?: string
  readonly attachments?: readonly string[]
  readonly subject?: string
  readonly body?: string
  readonly amount?: string
  readonly payee?: string
  readonly reference?: string
  readonly items: readonly string[]
  readonly count: number
  /** A prévia está cortada OU faltam os campos que a ação precisa para ser conferida: não se aprova às cegas. */
  readonly blind: boolean
  /** A ação veio SEM nenhuma prévia (nenhum campo para conferir, e não é a prévia cortada): "A prévia não chegou…" + só Cancelar (Muse 04:37). */
  readonly missing?: true
  /** Para quem de fato foi (a linha "Enviado para …"); sem ele vale o `to`. */
  readonly sentTo?: string
  readonly requestedByPerson: boolean
  readonly status: 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'adjusted'
  readonly sentAt?: string
  readonly failureReason?: string
  /** COLHEITA 5: até quando o cartão vale (o selo de prazo); sem ele não há selo. */
  readonly expiresAt?: string
  /** COLHEITA 5: o cartão fechou sem resposta: só leitura, com "Pedir de novo". */
  readonly expired?: true
  /** COLHEITA 5: a pessoa já pediu de novo; a persona manda outro cartão. */
  readonly retried?: true
}

/** PERSONA-POWERS §3: o pedido de iniciativa ("A Nina quer usar o Drive para buscar o contrato"). */
export interface InitiativeAskUi {
  readonly approvalId: string
  readonly personaId: string
  readonly personaName?: string
  readonly characterId?: PersonaCharacterId
  readonly connectorName: string
  readonly purpose: string
  readonly status: 'pending' | 'decided'
  readonly choice?: 'once' | 'always' | 'not-now'
}

/**
 * O título de uma parte no cartão: curto e humano, sem o "@nome" do começo, e cortado SÓ no espaço com "…" (nunca no meio da palavra).
 * O host (Forge) já manda <= 48; isto é a defesa do cliente (EQUIPE-REAL §0).
 */
export function shortPartTitle(title: string, max = 48): string {
  const cleaned = title.trim().replace(/^(@\S+\s*)+/u, '').replace(/\s+/gu, ' ')
  if (cleaned.length <= max) return cleaned
  const cut = cleaned.slice(0, max + 1)
  const space = cut.lastIndexOf(' ')
  // sem espaço dentro do limite (uma palavra só, enorme): mostra a palavra inteira em vez de cortá-la
  if (space <= 0) return cleaned.split(' ')[0] ?? cleaned
  return `${cut.slice(0, space).trimEnd()}…`
}

/** Uma parte do plano na tela. */
export interface TeamPlanPartUi {
  readonly taskId: string
  /** O que aparece no cartão: o nome curto da parte ("Texto"); sem ele, o título cortado no espaço. */
  readonly title: string
  /** O título completo (tooltip), só quando difere do que aparece. */
  readonly fullTitle?: string
  readonly status: TeamPartStatusWire
  readonly personaId: string
  readonly personaName?: string
  readonly characterId?: PersonaCharacterId
  readonly withName?: string
  readonly withCharacterId?: PersonaCharacterId
  readonly approvalId?: string
  readonly reason?: string
}

/** O cartão vivo do plano (EQUIPE-REAL §0). */
export interface TeamPlanUi {
  readonly requestId: string
  readonly title: string
  readonly parts: readonly TeamPlanPartUi[]
}

/** O cartão de entrega por pedido (EQUIPE-REAL §0). */
export interface DeliveryCardUi {
  readonly requestId: string
  readonly title: string
  readonly parts: readonly { readonly taskId: string; readonly title: string; readonly fullTitle?: string; readonly personaName?: string; readonly characterId?: PersonaCharacterId }[]
  readonly reviewedByName?: string
  readonly reviewedByCharacterId?: PersonaCharacterId
  /** EQUIPE-REAL §0 (TEAM-8): quantas partes tiveram falha técnica de revisão (>= 1); quando presente, a entrega sai sem o selo e mostra UMA linha agrupada. */
  readonly reviewSkippedCount?: number
  readonly reviewSkippedTaskId?: string
  readonly approvalId?: string
}

/** O conteúdo de uma ação externa já limpo: o que a prévia mostra e o que o "Ver" mostra depois (só leitura). */
export interface ActionContentUi {
  readonly to?: string
  readonly cc?: string
  readonly bcc?: string
  readonly attachments?: readonly string[]
  readonly subject?: string
  readonly body?: string
  readonly amount?: string
  readonly payee?: string
  readonly reference?: string
  readonly items: readonly string[]
  readonly count: number
}

/** PERSONA-POWERS §2: "{persona} enviou um email para … · assunto" (e o Desfazer só quando o host diz que dá). */
export interface ActionEventUi {
  readonly verb: 'email' | 'post' | 'pay' | 'delete' | 'other'
  readonly connectorName: string
  readonly target: string
  readonly subject?: string
  readonly activityId: string
  /** COLHEITA 5: a pessoa já desfez: a linha vira texto simples com "Desfeito" (sem Desfazer). */
  readonly undone?: true
  /** O Desfazer: só existe com `undoable` E um prazo (`undoUntil`) válido; `undoUntilMs` é o instante em que ele acaba. */
  readonly undoUntilMs?: number
  /** O verbo que o host mandou (HT-1: `board_card_move`, `sprint_start`…) quando não é email/post/pagamento/apagar. */
  readonly harnessVerb?: string
  /** O "para onde" do verbo (ex.: a coluna "Fazendo"). */
  readonly after?: string
  /** O que saiu, para o "Ver" (só leitura). Sem conteúdo completo o evento não tem "Ver" (nada sem destino). */
  readonly content?: ActionContentUi
}

/**
 * HT-3 (contracts/harness-tools.md §8): a PESSOA moveu um cartão para "Fazendo" e o host diz o que aconteceu. A UI escreve as
 * palavras a partir dos campos; o título é sempre o da tarefa (nunca um id).
 */
export interface HarnessLineUi {
  readonly outcome: 'started' | 'held'
  readonly reason?: 'paused' | 'silence' | 'delivery_pending' | 'no_owner'
  /** Para `silence`: a hora em que o silêncio acaba ("07:00"), quando a persona tem janela. */
  readonly until?: string
  readonly ticketId: string
  readonly title: string
  readonly personaId?: string
  readonly personaName?: string
  readonly characterId?: PersonaCharacterId
}

/**
 * CV-8 (contracts/mentions-fanout.md §9): one persona's line of a "Respostas da equipe" block. TYPED: the UI writes the words from the fields;
 * the message body is only a readable fallback. Every line of a block shares `id`; `index` is 1-based among `total` lines.
 */
export interface FanoutLineUi {
  readonly id: string
  readonly source: 'everyone' | 'relevant' | 'mentions'
  readonly total: number
  readonly index: number
  readonly personaId: string
  readonly kind: 'reply' | 'nothing' | 'limit' | 'paused' | 'failed'
  /** `limit`: when the window opens again (ISO), when the host knows. */
  readonly until?: string
  /** `failed`: a fixed, honest sentence (tooltip). */
  readonly message?: string
  /** "Quem tiver algo a dizer" picked nobody: the one line of the Coordenação. */
  readonly nobody?: true
}

/** Valid host lines only: a line that does not say who/what is never drawn as a block (its body stays an ordinary message). */
export function mapFanoutLine(event: MessageView): FanoutLineUi | undefined {
  const line = event.fanout
  if (line === undefined || line === null) return undefined
  const kinds = ['reply', 'nothing', 'limit', 'paused', 'failed']
  const sources = ['everyone', 'relevant', 'mentions']
  if (typeof line.id !== 'string' || line.id === '' || typeof line.personaId !== 'string' || line.personaId === '') return undefined
  if (!kinds.includes(line.kind) || !sources.includes(line.source)) return undefined
  if (!Number.isFinite(line.total) || !Number.isFinite(line.index) || line.total < 1) return undefined
  return {
    id: line.id,
    source: line.source,
    total: Math.floor(line.total),
    index: Math.floor(line.index),
    personaId: line.personaId,
    kind: line.kind,
    ...(typeof line.until === 'string' && line.until.trim() !== '' ? { until: line.until.trim() } : {}),
    ...(typeof line.message === 'string' && line.message.trim() !== '' ? { message: line.message.trim() } : {}),
    ...(line.nobody === true ? { nobody: true as const } : {}),
  }
}

export interface ChannelMessageUi {
  /** COLHEITA-S1 P1-05: anexos da mensagem (só os ids). A bolha de áudio pede o tipo quando a mensagem aparece e os bytes só ao tocar. */
  readonly attachments?: readonly { readonly id: string }[]
  readonly id: string
  readonly authorId: string
  readonly authorName: string
  readonly body: string
  readonly timeLabel: string
  /** Instante ISO do host: o agrupamento dos balões (< 5 min entre mensagens do mesmo autor) usa este valor; sem ele, o `timeLabel`. */
  readonly occurredAt?: string
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
  readonly steeredPersonaName?: string
  /** IV-5: a resposta ainda está sendo escrita (UMA mensagem que cresce; o host reenvia o mesmo id até isto sumir). */
  readonly streaming?: true
  /** IV-5: a pessoa apertou Parar; o balão ficou com o que já veio ("Você parou aqui · Continuar"). */
  readonly stopped?: true
  /** A mensagem da pessoa a que esta responde (o `eventId` do Parar); ausente quando o host manda vazio. */
  readonly replyToId?: string
  /** P0-30: a pessoa escreveu e o host não recebeu: o balão mostra "Não enviado · Tentar de novo". */
  readonly sendFailed?: boolean
  /** HT-3: a linha "{persona} começou “{tarefa}” porque você moveu para Fazendo" (ou o porquê de não ter começado). */
  readonly harness?: HarnessLineUi
  /** CV-8: this line is one persona's part of a "Respostas da equipe" block (only with the host's `Config.fanout`). */
  readonly fanout?: FanoutLineUi
  /** D-090: o resumo da manhã ("Bom dia") como cartão estruturado; só aparece com a flag `persona.flag.teamwork`. */
  readonly dailyBrief?: DailyBriefUi
  /** D-090 (TEAM-8c): o pedido de opinião ao time; só vira bloco com a flag `persona.flag.teamwork` (sem ela a mensagem aparece como texto, como antes). */
  readonly opinion?: OpinionUi
  /** D-084: o cartão de prévia de ação externa; só aparece com a flag `persona.flag.actionPreview`. */
  readonly actionPreview?: ActionPreviewUi
  /** D-084 §2: a linha de uma ação que a persona fez direto; só aparece com a flag `persona.flag.actionPreview`. */
  readonly actionEvent?: ActionEventUi
  /** D-084 §3: o pedido de iniciativa; só aparece com a flag `persona.flag.actionPreview`. */
  readonly initiativeAsk?: InitiativeAskUi
  /** EQUIPE-REAL §0: o cartão vivo do plano; só aparece com a flag `persona.flag.teamwork`. */
  readonly teamPlan?: TeamPlanUi
  /** EQUIPE-REAL §0: o cartão de entrega por pedido; só aparece com a flag `persona.flag.teamwork`. */
  readonly deliveryCard?: DeliveryCardUi
  /** EQUIPE-REAL-SPEC §(e): a linha "{persona} salvou {file} no rascunho" (uma por turno); só vira linha com `persona.flag.teamwork`, e QUEBRA o grupo de balões. */
  readonly filesSaved?: { readonly files: readonly DraftFileUi[] }
  /** R1: a linha de estado tipada do host ("Em andamento" / "Pronto"); o fio a esconde ou a absorve pelos cartões. Só com `Config.teamwork`. */
  readonly stateLine?: StateLineUi
  /** IV-10: a pergunta estruturada da persona (chips); só vira cartão com a flag `persona.flag.personaAsk` (sem ela, o corpo simples do host segue). */
  readonly personaAsk?: PersonaAskUi
  /** Colheita item 19a: o número que a persona trouxe na conversa ("Fixar na Visão geral"); o host manda os dados, as palavras são do cliente. */
  readonly indicatorOffer?: IndicatorOfferUi
  /** TEAM-8: uma passagem de trabalho entre duas personas ("{A} pediu ajuda para {B}", "{B} entregou para {A}"); só vira linha com `persona.flag.teamwork`. */
  readonly teamHandoff?: HandoffLineUi
  /** TEAM-8: o resultado de uma revisão entre colegas ("{R} aprovou", "{R} pediu ajustes"); só vira linha com `persona.flag.teamwork`. */
  readonly teamReview?: ReviewLineUi
  /** TEAM-8: o selo "Revisado por {R}" no cartão de entrega da tarefa quando um colega aprovou sem pontos em aberto. */
  readonly taskReviewedBy?: TeamPersonaUi
  /** P1-9: "Proposta de {persona}" (1 item) ou "Propostas da equipe" (2–3); só vira cartão com `persona.flag.taskProposal`. */
  readonly taskProposal?: TaskProposalUi
}

const ACTION_VERB_CLASS: Readonly<Record<'email' | 'post' | 'pay' | 'delete', 'send' | 'post' | 'pay' | 'delete'>> = {
  email: 'send', post: 'post', pay: 'pay', delete: 'delete',
}

/** As palavras que o host usa para o verbo (a que decidiu a classe) → o verbo da tela. Palavra desconhecida cai para a classe (a classe é do host e tipada). */
const WIRE_VERB: Readonly<Record<string, ActionPreviewUi['verb']>> = { email: 'email', send: 'email', mail: 'email', post: 'post', publish: 'post', pay: 'pay', payment: 'pay', delete: 'delete', remove: 'delete' }
const CLASS_VERB: Readonly<Record<'send' | 'post' | 'pay' | 'delete', ActionPreviewUi['verb']>> = { send: 'email', post: 'post', pay: 'pay', delete: 'delete' }

/** A prévia do host vira a do cartão. Falha fechada: classe que não combina com o verbo, ou ação sem o que conferir, vira `blind` (sem Enviar). */
export function mapActionPreview(event: MessageView, team: TeamView): ActionPreviewUi | undefined {
  const preview = event.actionPreview
  if (preview === undefined || preview.approvalId.trim() === '' || preview.connectorName.trim() === '') return undefined
  const clean = (value: string | undefined): string | undefined => {
    const trimmed = (value ?? '').trim()
    return trimmed === '' ? undefined : trimmed
  }
  const items = (preview.items ?? []).map(item => item.trim()).filter(item => item !== '')
  const count = typeof preview.count === 'number' && Number.isFinite(preview.count) ? Math.max(0, Math.trunc(preview.count)) : items.length
  const to = clean(preview.to)
  const body = clean(preview.body)
  const amount = clean(preview.amount)
  const payee = clean(preview.payee)
  // O host manda a palavra que decidiu a classe ("send" para email): normaliza; palavra de OUTRA classe ("pay" com classe send) continua não combinando = cego (falha fechada).
  const verb = WIRE_VERB[preview.verb.trim().toLowerCase()] ?? CLASS_VERB[preview.actionClass]
  const ready = verb === 'email' ? to !== undefined && body !== undefined
    : verb === 'post' ? body !== undefined
      : verb === 'pay' ? amount !== undefined && payee !== undefined
        : count > 0 || items.length > 0
  const classMatches = ACTION_VERB_CLASS[verb] === preview.actionClass
  const missing = !preview.truncated && to === undefined && body === undefined && amount === undefined && payee === undefined && clean(preview.subject) === undefined
    && clean(preview.reference) === undefined && items.length === 0 && count === 0
  const persona = team.personas.find(p => p.id === preview.personaId)
  const personaName = (persona?.name ?? preview.personaName ?? '').trim()
  const subject = clean(preview.subject)
  const reference = clean(preview.reference)
  const failureReason = clean(preview.failureReason)
  const sentAt = clean(preview.sentAt)
  const expiresAt = clean(preview.expiresAt)
  const cc = clean(preview.cc)
  const bcc = clean(preview.bcc)
  const attachments = (preview.attachments ?? []).map(name => name.trim()).filter(name => name !== '')
  return {
    approvalId: preview.approvalId,
    actionClass: preview.actionClass,
    verb,
    connectorName: preview.connectorName.trim(),
    personaId: preview.personaId,
    ...(personaName === '' ? {} : { personaName }),
    ...(persona === undefined ? {} : { characterId: resolveCharacterId(persona, persona.id) }),
    ...(to === undefined ? {} : { to }),
    ...(cc === undefined ? {} : { cc }),
    ...(bcc === undefined ? {} : { bcc }),
    ...(attachments.length === 0 ? {} : { attachments }),
    ...(subject === undefined ? {} : { subject }),
    ...(body === undefined ? {} : { body }),
    ...(amount === undefined ? {} : { amount }),
    ...(payee === undefined ? {} : { payee }),
    ...(reference === undefined ? {} : { reference }),
    items,
    count,
    blind: preview.truncated || preview.masked === true || !ready || !classMatches,
    ...(missing ? { missing: true as const } : {}),
    requestedByPerson: preview.requestedByPerson,
    status: preview.status,
    ...(sentAt === undefined ? {} : { sentAt }),
    ...(failureReason === undefined ? {} : { failureReason }),
    ...(clean(preview.sentTo) === undefined ? {} : { sentTo: clean(preview.sentTo)! }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(preview.expired === true ? { expired: true as const } : {}),
    ...(preview.retried === true ? { retried: true as const } : {}),
  }
}

/**
 * R1 (team-real.md §9): a linha de estado que o host tipou (`MessageView.stateLine`). Sem tipo conhecido ou sem `ticketId`, não há linha de
 * estado e a mensagem segue como veio; nunca se deduz o estado do texto.
 */
export function mapStateLine(event: MessageView): StateLineUi | undefined {
  // Fronteira de wire: cada campo é conferido antes de virar o tipo da tela (o texto nunca decide o estado).
  const line: { readonly kind?: unknown; readonly ticketId?: unknown; readonly groupId?: unknown; readonly text?: unknown } | undefined = event.stateLine
  if (line === undefined) return undefined
  const { kind, text } = line
  if (kind !== 'task_progress' && kind !== 'part_done' && kind !== 'task_done') return undefined
  if (text !== 'status' && text !== 'result') return undefined
  const ticketId = typeof line.ticketId === 'string' ? line.ticketId.trim() : ''
  if (ticketId === '') return undefined
  const groupId = typeof line.groupId === 'string' ? line.groupId.trim() : ''
  return { kind, ticketId, text, ...(groupId === '' ? {} : { groupId }) }
}

/** O plano vivo. Sem partes com título usável não há cartão; a persona fora do time fica sem rosto (nunca o id). */
export function mapTeamPlan(event: MessageView, team: TeamView): TeamPlanUi | undefined {
  const plan = event.teamPlan
  if (plan === undefined || plan.requestId.trim() === '') return undefined
  const parts = plan.parts.flatMap((part): TeamPlanPartUi[] => {
    const full = shortPartTitle(part.title)
    // `shortName` ainda não está no tipo do host (Anvil vai mandar): lido como dado opcional.
    const short = shortPartTitle((part as { readonly shortName?: string }).shortName ?? '', 24)
    const title = short === '' ? full : short
    if (title === '') return []
    const persona = team.personas.find(p => p.id === part.personaId)
    const other = part.withPersonaId === undefined ? undefined : team.personas.find(p => p.id === part.withPersonaId)
    const approvalId = (part.approvalId ?? '').trim()
    const reason = (part.reason ?? '').trim()
    return [{
      taskId: part.taskId,
      title,
      ...(full !== '' && full !== title ? { fullTitle: full } : {}),
      status: part.status,
      personaId: part.personaId,
      ...(persona === undefined ? {} : { personaName: persona.name, characterId: resolveCharacterId(persona, persona.id) }),
      ...(other === undefined ? {} : { withName: other.name, withCharacterId: resolveCharacterId(other, other.id) }),
      ...(part.status === 'needs-you' && approvalId !== '' ? { approvalId } : {}),
      ...(part.status === 'stopped' && reason !== '' ? { reason } : {}),
    }]
  })
  if (parts.length === 0) return undefined
  return { requestId: plan.requestId, title: shortPartTitle(plan.title), parts }
}

/** O cartão de entrega. Sem partes não há entrega; "Revisar" só com o item a abrir. */
export function mapDeliveryCard(event: MessageView, team: TeamView): DeliveryCardUi | undefined {
  const card = event.deliveryCard
  if (card === undefined || card.requestId.trim() === '') return undefined
  const parts = card.parts.flatMap((part) => {
    const full = shortPartTitle(part.title)
    // `shortName` ainda não está no tipo do host (Anvil vai mandar): lido como dado opcional.
    const short = shortPartTitle((part as { readonly shortName?: string }).shortName ?? '', 24)
    const title = short === '' ? full : short
    if (title === '') return []
    const persona = team.personas.find(p => p.id === part.personaId)
    return [{ taskId: part.taskId, title, ...(full !== '' && full !== title ? { fullTitle: full } : {}), ...(persona === undefined ? {} : { personaName: persona.name, characterId: resolveCharacterId(persona, persona.id) }) }]
  })
  if (parts.length === 0) return undefined
  const reviewer = card.reviewedBy === undefined ? undefined : team.personas.find(p => p.id === card.reviewedBy?.personaId)
  const reviewerName = (reviewer?.name ?? card.reviewedBy?.name ?? '').trim()
  const approvalId = (card.approvalId ?? '').trim()
  const rawSkipped = card.reviewSkippedCount ?? card.reviewFailedCount
  const reviewSkippedCount = typeof rawSkipped === 'number' && Number.isFinite(rawSkipped) && rawSkipped > 0 ? Math.floor(rawSkipped) : undefined
  const reviewSkippedTaskId = (card.reviewSkippedTaskId ?? parts[0]?.taskId ?? '').trim()
  return {
    requestId: card.requestId,
    title: shortPartTitle(card.title),
    parts,
    ...(reviewSkippedCount !== undefined || reviewerName === '' ? {} : { reviewedByName: reviewerName }),
    ...(reviewSkippedCount === undefined ? {} : { reviewSkippedCount }),
    ...(reviewSkippedCount === undefined || reviewSkippedTaskId === '' ? {} : { reviewSkippedTaskId }),
    ...(reviewer === undefined ? {} : { reviewedByCharacterId: resolveCharacterId(reviewer, reviewer.id) }),
    ...(approvalId === '' ? {} : { approvalId }),
  }
}

/** O pedido de iniciativa. Sem id, conector ou motivo não há cartão (nada de "quer usar o  para ."). */
export function mapInitiativeAsk(event: MessageView, team: TeamView): InitiativeAskUi | undefined {
  const ask = event.initiativeAsk
  if (ask === undefined || ask.approvalId.trim() === '' || ask.connectorName.trim() === '' || ask.purpose.trim() === '') return undefined
  const persona = team.personas.find(p => p.id === ask.personaId)
  const personaName = (persona?.name ?? ask.personaName ?? '').trim()
  return {
    approvalId: ask.approvalId,
    personaId: ask.personaId,
    ...(personaName === '' ? {} : { personaName }),
    ...(persona === undefined ? {} : { characterId: resolveCharacterId(persona, persona.id) }),
    connectorName: ask.connectorName.trim(),
    purpose: ask.purpose.trim(),
    status: ask.status,
    ...(ask.choice === undefined ? {} : { choice: ask.choice }),
  }
}

/** O conteúdo que saiu, só se der para CONFERIR (o mesmo critério da prévia): email = para + mensagem; post = texto; pagamento = valor + quem recebe;
 *  apagar = a lista (ou a contagem). Incompleto = sem conteúdo = sem "Ver". */
export function mapActionContent(verb: ActionEventUi['verb'], raw: { to?: string; subject?: string; body?: string; amount?: string; payee?: string; reference?: string; items?: readonly string[]; count?: number } | undefined): ActionContentUi | undefined {
  if (raw === undefined) return undefined
  const clean = (value: string | undefined): string | undefined => {
    const trimmed = (value ?? '').trim()
    return trimmed === '' ? undefined : trimmed
  }
  const items = (raw.items ?? []).map(item => item.trim()).filter(item => item !== '')
  const count = typeof raw.count === 'number' && Number.isFinite(raw.count) ? Math.max(0, Math.trunc(raw.count)) : items.length
  const to = clean(raw.to)
  const body = clean(raw.body)
  const amount = clean(raw.amount)
  const payee = clean(raw.payee)
  const subject = clean(raw.subject)
  const reference = clean(raw.reference)
  const ready = verb === 'email' ? to !== undefined && body !== undefined
    : verb === 'post' ? body !== undefined
      : verb === 'pay' ? amount !== undefined && payee !== undefined
        : verb === 'delete' ? count > 0 || items.length > 0
          : false
  if (!ready) return undefined
  return {
    ...(to === undefined ? {} : { to }),
    ...(subject === undefined ? {} : { subject }),
    ...(body === undefined ? {} : { body }),
    ...(amount === undefined ? {} : { amount }),
    ...(payee === undefined ? {} : { payee }),
    ...(reference === undefined ? {} : { reference }),
    items,
    count,
  }
}

/** A linha da ação direta. Sem destino ou sem id da atividade não há linha; o Desfazer só com `undoable` e prazo válido (nunca um Desfazer falso). */
export function mapActionEvent(event: MessageView): ActionEventUi | undefined {
  const action = event.actionEvent
  if (action === undefined || action.connectorName.trim() === '' || action.target.trim() === '' || action.activityId.trim() === '') return undefined
  const verb = action.verb === 'email' || action.verb === 'post' || action.verb === 'pay' || action.verb === 'delete' ? action.verb : 'other'
  const until = action.undoUntil === undefined ? Number.NaN : Date.parse(action.undoUntil)
  const subject = (action.subject ?? '').trim()
  const after = (action.after ?? '').trim()
  const content = mapActionContent(verb, action.content)
  // Email, post e pagamento não voltam (PERSONA-POWERS §2): mesmo que o host marque `undoable` por engano, a UI não promete.
  const canUndo = action.undoable === true && !Number.isNaN(until) && verb !== 'email' && verb !== 'post' && verb !== 'pay' && action.undone !== true
  return {
    ...(action.undone === true ? { undone: true as const } : {}),
    verb,
    connectorName: action.connectorName.trim(),
    target: action.target.trim(),
    ...(subject === '' ? {} : { subject }),
    activityId: action.activityId,
    ...(verb === 'other' ? { harnessVerb: action.verb } : {}),
    ...(after === '' ? {} : { after }),
    ...(content === undefined ? {} : { content }),
    ...(canUndo ? { undoUntilMs: until } : {}),
  }
}

/** O resumo da manhã do host vira o do cartão: só linhas com título real de tarefa (nunca id), e só o que existe. */
export function mapDailyBrief(event: MessageView, team: TeamView): DailyBriefUi | undefined {
  const brief = event.dailyBrief
  if (brief === undefined) return undefined
  const line = (item: { personaId: string; taskId: string; title: string; request?: { title: string; parts: readonly string[]; personaIds?: readonly string[] } }): DailyBriefItemUi | undefined => {
    // Um pedido terminado vem agrupado (Anvil): o título do PEDIDO e as partes curtas; os rostos são só os de quem participou e está no time.
    const request = item.request
    const requestTitle = request === undefined ? '' : shortPartTitle(request.title)
    if (request !== undefined && requestTitle !== '') {
      const parts = request.parts.map(part => shortPartTitle(part, 24)).filter(part => part !== '')
      const faces = (request.personaIds ?? []).flatMap((id) => {
        const member = team.personas.find(p => p.id === id)
        return member === undefined ? [] : [{ name: member.name, characterId: resolveCharacterId(member, member.id) }]
      })
      return { taskId: item.taskId, title: requestTitle, request: { title: requestTitle, parts, faces } }
    }
    const title = usableTaskTitle(item.title, [item.taskId])
    if (title === undefined) return undefined
    const row = team.personas.find(p => p.id === item.personaId)
    return {
      taskId: item.taskId,
      title,
      ...(row === undefined ? {} : { personaId: row.id, personaName: row.name, characterId: resolveCharacterId(row, row.id) }),
    }
  }
  const yesterday = brief.yesterday.flatMap((item) => { const mapped = line(item); return mapped === undefined ? [] : [mapped] })
  const today = brief.today.flatMap((item) => { const mapped = line(item); return mapped === undefined ? [] : [mapped] })
  const count = brief.needsYou?.count
  const waitingCount = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
  const more = typeof brief.yesterdayMore === 'number' && Number.isFinite(brief.yesterdayMore) ? Math.max(0, Math.trunc(brief.yesterdayMore)) : 0
  if (yesterday.length === 0 && today.length === 0 && waitingCount === 0) return undefined
  const coordinator = team.personas.find(p => p.id === brief.coordinatorPersonaId)
  return {
    day: brief.day,
    ...(coordinator === undefined ? {} : { coordinatorName: coordinator.name, coordinatorCharacterId: resolveCharacterId(coordinator, coordinator.id) }),
    yesterday,
    yesterdayMore: yesterday.length === 0 ? 0 : more,
    today,
    waitingCount,
    ...(brief.routineId === undefined || brief.routineId === '' ? {} : { routineId: brief.routineId }),
    ...(typeof event.occurredAt === 'string' && !Number.isNaN(Date.parse(event.occurredAt)) ? { postedAt: event.occurredAt } : {}),
    ...(brief.variant === 'morning' || brief.variant === 'on-demand' ? { variant: brief.variant } : {}),
  }
}

/** A linha do HT-3 só existe com o TÍTULO real da tarefa (nunca o id): sem ele o corpo legível do host fica como fallback. */
export function mapHarnessLine(event: MessageView, team: TeamView): HarnessLineUi | undefined {
  const action = event.harness
  if (action === undefined || action.verb !== 'board_card_move') return undefined
  const title = usableTaskTitle(action.title, [action.ticketId])
  if (title === undefined) return undefined
  const personaId = action.persona?.personaId
  const row = personaId === undefined ? undefined : team.personas.find(p => p.id === personaId)
  const personaName = (row?.name ?? action.persona?.name ?? '').trim()
  return {
    outcome: action.outcome,
    ...(action.reason === undefined ? {} : { reason: action.reason }),
    ...(action.until === undefined || action.until.trim() === '' ? {} : { until: action.until.trim() }),
    ticketId: action.ticketId,
    title,
    ...(personaId === undefined || personaId === '' ? {} : { personaId }),
    ...(personaName === '' ? {} : { personaName }),
    ...(row === undefined ? {} : { characterId: resolveCharacterId(row, row.id) }),
  }
}

/** P1-9: o cartão da proposta (`MessageView.taskProposal`), com o retrato do elenco em cada item quando a persona é conhecida. */
export function mapMessageTaskProposal(event: MessageView, team: TeamView): TaskProposalUi | undefined {
  const mapped = mapTaskProposal(event.taskProposal)
  if (mapped === undefined) return undefined
  return {
    ...mapped,
    items: mapped.items.map((item) => {
      const row = team.personas.find(p => p.id === item.personaId)
      if (row === undefined) return item
      return { ...item, personaName: row.name.trim() === '' ? item.personaName : row.name, characterId: resolveCharacterId(row, row.id) }
    }),
  }
}

/** TEAM-8: quem é a persona para a linha do fio: o elenco sabe o NOME e o retrato; sem elenco, sem linha (nunca um id na tela). */
function teamPersonaLookup(team: TeamView): (personaId: string) => TeamPersonaUi | undefined {
  return (personaId) => {
    const row = team.personas.find(p => p.id === personaId)
    if (row === undefined || row.name.trim() === '') return undefined
    // O anel do rosto é o tom da ORDEM DE CONTRATAÇÃO (a ordem em que o host lista a equipe), a mesma fonte do tom da moldura do Avatar.
    const tint = personaTintIndex(row.id, team.personas.map(persona => persona.id))
    return { id: row.id, name: row.name.trim(), characterId: resolveCharacterId(row, row.id), ...(tint === undefined ? {} : { tint }) }
  }
}

/** TEAM-8: a passagem de trabalho do host (`MessageView.handoff`) como a linha do fio a desenha. */
export function mapMessageHandoff(event: MessageView, team: TeamView): HandoffLineUi | undefined {
  return mapHandoffLine(event.handoff, teamPersonaLookup(team))
}

/** TEAM-8: o resultado da revisão (`MessageView.review`); o título da tarefa sai do mapa título-por-tarefa (o host não o manda aqui). */
export function mapMessageReview(event: MessageView, team: TeamView, taskTitleById: ReadonlyMap<string, string>): ReviewLineUi | undefined {
  return mapReviewLine(event.review, teamPersonaLookup(team), taskId => taskTitleById.get(taskId))
}

/** IV-10: o cartão da pergunta estruturada, com o nome e o retrato do elenco quando a persona é conhecida. */
export function mapMessagePersonaAsk(event: MessageView, team: TeamView): PersonaAskUi | undefined {
  const mapped = mapPersonaAsk(event.personaAsk)
  if (mapped === undefined) return undefined
  const row = team.personas.find(p => p.id === mapped.personaId)
  if (row === undefined) return mapped
  return { ...mapped, personaName: row.name.trim() === '' ? mapped.personaName : row.name, characterId: resolveCharacterId(row, row.id) }
}

export function mapMessage(
  event: MessageView,
  team: TeamView,
  memberId: string,
  taskTitleById: ReadonlyMap<string, string> = new Map(),
  taskReviewedById: ReadonlyMap<string, ReviewedByInput> = new Map(),
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
  // A ficha da tarefa só existe com o TÍTULO real da tarefa (do quadro). Em eventos que não são mensagem, `subjectId`
  // pode ser o assunto da conversa ("subject-geral") e não uma tarefa: sem título conhecido, sem ficha — nunca o id.
  const citesTask = event.type !== 'message' && event.subjectId.length > 0
  const candidateTicketId = citesTask ? event.subjectId : undefined
  const taskTitle = candidateTicketId === undefined
    ? undefined
    : usableTaskTitle(taskTitleById.get(candidateTicketId), [candidateTicketId, event.subjectId, event.conversationSubjectId, event.topicId])
  const ticketId = taskTitle === undefined ? undefined : candidateTicketId
  const reactions: MessageReactionUi[] = (event.reactions ?? []).map(row => ({
    stickerId: row.stickerId,
    count: row.actorIds.length,
    actorIds: [...row.actorIds],
  }))
  const parsedPlan = parseGestorPlanId(event.body)
  const bodyAfterPlan = parsedPlan?.visibleBody ?? event.body
  const parsedRunError = parseRunErrorMarker(bodyAfterPlan)
  // LEAK-1: o marcador de cartão do host ([[task-proposal:…]], [[persona-ask:…]]…) nunca vai à tela, nem com a flag do cartão desligada.
  const visibleBody = stripWireMarkers(parsedRunError?.visibleBody ?? bodyAfterPlan)
  const runErrorFromWire = event.runError ?? parsedRunError?.payload
  const runError = runErrorFromWire
    ?? (persona !== undefined ? legacyRunErrorFromText(visibleBody, authorName) ?? undefined : undefined)
  const harness = mapHarnessLine(event, team)
  const fanout = mapFanoutLine(event)
  const dailyBrief = mapDailyBrief(event, team)
  const opinion = mapOpinion(event)
  const actionPreview = mapActionPreview(event, team)
  const actionEvent = mapActionEvent(event)
  const initiativeAsk = mapInitiativeAsk(event, team)
  const teamPlan = mapTeamPlan(event, team)
  const deliveryCard = mapDeliveryCard(event, team)
  const savedFiles = mapDraftFiles(event.filesSaved?.files)
  const personaAsk = mapMessagePersonaAsk(event, team)
  const teamHandoff = mapMessageHandoff(event, team)
  const teamReview = mapMessageReview(event, team, taskTitleById)
  const stateLine = mapStateLine(event)
  const taskProposal = mapMessageTaskProposal(event, team)
  const steeredName = event.steeredPersonaId === undefined || event.steeredPersonaId === ''
    ? undefined
    : team.personas.find(p => p.id === event.steeredPersonaId)?.name
  const row: ChannelMessageUi = {
    id: event.id,
    authorId,
    authorName,
    body: visibleBody,
    timeLabel,
    ...(Number.isNaN(time.getTime()) ? {} : { occurredAt: event.occurredAt }),
    reactions,
    ...(persona !== undefined ? { authorPersonaId: persona.id } : { authorPersonaId: event.actorId }),
    ...(parsedPlan === null ? {} : { gestorPlanId: parsedPlan.planId }),
    ...(runError === undefined ? {} : { runError }),
    ...(harness === undefined ? {} : { harness }),
    ...(fanout === undefined ? {} : { fanout }),
    ...(dailyBrief === undefined ? {} : { dailyBrief }),
    ...(opinion === undefined ? {} : { opinion }),
    ...(actionPreview === undefined ? {} : { actionPreview }),
    ...(actionEvent === undefined ? {} : { actionEvent }),
    ...(initiativeAsk === undefined ? {} : { initiativeAsk }),
    ...(teamPlan === undefined ? {} : { teamPlan }),
    ...(deliveryCard === undefined ? {} : { deliveryCard }),
    ...(savedFiles.length === 0 ? {} : { filesSaved: { files: savedFiles } }),
    ...(stateLine === undefined ? {} : { stateLine }),
    ...(personaAsk === undefined ? {} : { personaAsk }),
    ...(event.indicatorOffer === undefined ? {} : { indicatorOffer: event.indicatorOffer }),
    ...(teamHandoff === undefined ? {} : { teamHandoff }),
    ...(teamReview === undefined ? {} : { teamReview }),
    ...(taskProposal === undefined ? {} : { taskProposal }),
    ...(steeredName === undefined ? {} : { steeredPersonaName: steeredName }),
    ...((event.attachmentIds ?? []).length === 0 ? {} : { attachments: (event.attachmentIds ?? []).map(id => ({ id })) }),
    ...(event.streaming === true ? { streaming: true as const } : {}),
    ...(event.stopped === true ? { stopped: true as const } : {}),
    ...(typeof event.replyToId === 'string' && event.replyToId !== '' ? { replyToId: event.replyToId } : {}),
  }
  const subjectTag = (event.conversationSubjectId ?? event.topicId ?? '').trim()
  const tagged = subjectTag.length > 0 ? { ...row, conversationSubjectId: subjectTag } : row
  if (taskTitle !== undefined && taskTitle.length > 0) {
    const rawReviewedBy = (event as { readonly reviewedBy?: ReviewedByInput }).reviewedBy
      ?? (ticketId === undefined ? undefined : taskReviewedById.get(ticketId))
    const taskReviewedBy = rawReviewedBy === undefined
      ? undefined
      : mapReviewedBy(rawReviewedBy, teamPersonaLookup(team))
    return {
      ...tagged,
      taskTitle,
      ...(ticketId !== undefined ? { ticketId } : {}),
      ...(taskReviewedBy !== undefined ? { taskReviewedBy } : {}),
    }
  }
  return tagged
}
