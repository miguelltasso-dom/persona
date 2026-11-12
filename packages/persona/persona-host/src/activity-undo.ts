/**
 * COLHEITA 5 (Prism) — "Agir com Desfazer": what a persona does INSIDE the product on its own (move a card, open a sprint, create or edit a
 * routine, hire) is not asked first. The thread gets one line — "A Bia criou a rotina “Post de sexta” · Desfazer" — and the person can take it
 * back for 5 minutes. After that the line is plain text: no link, and the host refuses the undo.
 *
 * This module owns the record and the undo; it never performs an inverse itself. Each activity (board, routine, hiring) already says how it
 * would be reversed (`undo: { remote, request }`); the stored request is a durable document, so it is parsed again into a typed
 * {@link UndoCall} before anything runs, and the host's own method for it is invoked through the {@link ActivityUndoDeps.run} port.
 *
 * Rules that fail closed:
 *  - only an activity recorded as undoable, with a window, still inside it, and not undone yet, can be undone — once;
 *  - e-mail, posts, payments and deletions outside the product are never here (they go through the preview card, `external-actions.ts`);
 *  - the scope of the inverse is the scope of the record, never what the stored request says;
 *  - an inverse that fails leaves the activity as it was (still undoable until the window ends) and the person is told why.
 */

import type { EventRepos, ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { RemoteFault } from './remote-guard.ts'
import type {
  ActionEventView, DecideApprovalRequest, DeleteRoutineRequest, MoveTicketRequest, PauseRoutineRequest, PersonaScopeRequest, PlanSprintRequest,
  SprintIdRequest, UndoPersonaActionRequest, UndoPersonaActionView, UpdateRoutineRequest,
} from './types.ts'

/** How long the Desfazer of an internal action lasts. */
export const ACTIVITY_UNDO_MS = 5 * 60_000

const KIND = 'harness_activity'

/** What every harness activity (board, routines, hiring) looks like to this module. */
export interface RecordableActivity {
  readonly verb: string
  readonly target: { readonly kind: string; readonly id: string; readonly title: string }
  readonly before?: string
  readonly after?: string
  readonly initiator: string
  readonly requestId?: string
  readonly status: 'done'
  /** Only when there is a safe inverse NOW. */
  readonly undoable: boolean
  readonly undo?: { readonly remote: string; readonly request: Readonly<Record<string, unknown>> }
  readonly at: string
}

/** The run that acted (the harness identity; the persona and project come from the run, never from the tool's arguments). */
export interface ActivityActor {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly callId: string
  readonly requestId?: string | undefined
}

/** What is stored, one document per tool call (`harness_activity`). */
export interface ActivityDoc extends RecordableActivity {
  readonly personaId: string
  readonly workspaceId?: string
  /** The end of the Desfazer window; absent when the activity cannot be undone. */
  readonly undoUntil?: string
  readonly undoneAt?: string
}

/** One inverse, typed. */
export type UndoCall =
  | { readonly remote: 'moveTicket'; readonly request: MoveTicketRequest }
  | { readonly remote: 'deleteSprint'; readonly request: SprintIdRequest }
  | { readonly remote: 'planSprint'; readonly request: PlanSprintRequest }
  | { readonly remote: 'deleteRoutine'; readonly request: DeleteRoutineRequest }
  | { readonly remote: 'pauseRoutine'; readonly request: PauseRoutineRequest }
  | { readonly remote: 'updateRoutine'; readonly request: UpdateRoutineRequest }
  | { readonly remote: 'retirePersona'; readonly request: PersonaScopeRequest }
  | { readonly remote: 'decideApproval'; readonly request: DecideApprovalRequest }

/** Collaborators. */
export interface ActivityUndoDeps {
  readonly screens: Pick<ScreenRepos, 'get' | 'put'>
  readonly now: () => string
  /** Perform one inverse with the host's own method (it checks the person's permission itself). A throw means it did not happen. */
  readonly run: (call: UndoCall) => unknown
  /** A line of this activity must be in the thread (idempotent: the host appends it once, by id). */
  readonly announce?: (projectId: string, activityId: string, doc: ActivityDoc) => void
  /** The activity changed (undone): the host touches the thread line (same id, upsert). */
  readonly changed?: (projectId: string, activityId: string) => void
  /** The name of a persona, for the plain sentence of the line. */
  readonly personaName?: (personaId: string) => string | undefined
}

type Row = Readonly<Record<string, unknown>>
const text = (row: Row, key: string): string | undefined => (typeof row[key] === 'string' && row[key] !== '' ? row[key] : undefined)
const word = (row: Row, key: string): string | undefined => (typeof row[key] === 'string' ? row[key] : undefined)

/**
 * The stored inverse as a typed call, in the scope of the record. Anything the stored request lacks makes it `undefined` (the undo then fails
 * closed instead of running a half-formed request).
 * @param undo - The stored `{ remote, request }`.
 * @param scope - The workspace and project of the record.
 */
export function parseUndoCall(undo: { readonly remote: string; readonly request: Row }, scope: { readonly workspaceId: string; readonly projectId: string }): UndoCall | undefined {
  const { request } = undo
  const base = { workspaceId: scope.workspaceId, projectId: scope.projectId }
  switch (undo.remote) {
    case 'moveTicket': {
      const ticketId = text(request, 'ticketId')
      const columnId = text(request, 'columnId')
      return ticketId === undefined || columnId === undefined ? undefined : { remote: 'moveTicket', request: { ...base, ticketId, columnId } }
    }
    case 'deleteSprint': {
      const sprintId = text(request, 'sprintId')
      return sprintId === undefined ? undefined : { remote: 'deleteSprint', request: { ...base, sprintId } }
    }
    case 'planSprint': {
      const sprintId = text(request, 'sprintId')
      const ids = request.ticketIds
      if (sprintId === undefined || !Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) return undefined
      return { remote: 'planSprint', request: { ...base, sprintId, ticketIds: ids } }
    }
    case 'deleteRoutine': {
      const id = text(request, 'id')
      return id === undefined ? undefined : { remote: 'deleteRoutine', request: { ...base, id } }
    }
    case 'pauseRoutine': {
      const id = text(request, 'id')
      return id === undefined || typeof request.paused !== 'boolean' ? undefined : { remote: 'pauseRoutine', request: { ...base, id, paused: request.paused } }
    }
    case 'updateRoutine': {
      const id = text(request, 'id')
      if (id === undefined) return undefined
      const fields: { -readonly [K in 'name' | 'prompt' | 'ownerPersonaId' | 'rrule' | 'timeZone' | 'silenceStart' | 'silenceEnd']?: string } & { catchUp?: 'skip' | 'run_once' | 'run_all' } = {}
      // An empty string is a value here ("clear the quiet window", "hand it back to the Coordenação"); only a non-string is dropped.
      for (const key of ['name', 'prompt', 'ownerPersonaId', 'rrule', 'timeZone', 'silenceStart', 'silenceEnd'] as const) {
        const value = word(request, key)
        if (value !== undefined) fields[key] = value
      }
      const catchUp = request.catchUp
      if (catchUp === 'skip' || catchUp === 'run_once' || catchUp === 'run_all') fields.catchUp = catchUp
      return { remote: 'updateRoutine', request: { ...base, id, ...fields } }
    }
    case 'retirePersona': {
      const personaId = text(request, 'personaId')
      return personaId === undefined ? undefined : { remote: 'retirePersona', request: { ...base, personaId } }
    }
    case 'decideApproval': {
      const id = text(request, 'id')
      return id === undefined || request.kind !== 'hire' || request.accept !== false ? undefined : { remote: 'decideApproval', request: { ...base, id, kind: 'hire', accept: false } }
    }
    default: return undefined
  }
}

/** What the wiring needs from the host: its own methods for the eight inverses, the thread and the clock. `PersonaHost` fits as it is. */
export interface ActivityUndoHost {
  readonly events: Pick<EventRepos, 'append' | 'has' | 'get' | 'touch'>
  readonly product: Pick<ProductRepos, 'getPersona' | 'getProject'>
  readonly orchestration: { readonly now: () => string }
  /** Puts a card back WITHOUT starting a persona (the person's own `moveTicket` does start one). */
  moveTicketBack(request: MoveTicketRequest): unknown
  deleteSprint(request: SprintIdRequest): unknown
  planSprint(request: PlanSprintRequest): unknown
  deleteRoutine(request: DeleteRoutineRequest): unknown
  pauseRoutine(request: PauseRoutineRequest): unknown
  updateRoutine(request: UpdateRoutineRequest): unknown
  retirePersona(request: PersonaScopeRequest): unknown
  decideApproval(request: DecideApprovalRequest): unknown
}

/** One inverse, performed by the host's own method. @param host - The host. @param call - The typed inverse. */
function runUndoCall(host: ActivityUndoHost, call: UndoCall): unknown {
  switch (call.remote) {
    case 'moveTicket': return host.moveTicketBack(call.request)
    case 'deleteSprint': return host.deleteSprint(call.request)
    case 'planSprint': return host.planSprint(call.request)
    case 'deleteRoutine': return host.deleteRoutine(call.request)
    case 'pauseRoutine': return host.pauseRoutine(call.request)
    case 'updateRoutine': return host.updateRoutine(call.request)
    case 'retirePersona': return host.retirePersona(call.request)
    case 'decideApproval': return host.decideApproval(call.request)
    default: return assertNever(call)
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled inverse: ${JSON.stringify(value)}`)
}

/** Where the line goes: the conversation of the person's request when the run had one, else the general channel. */
function conversationOf(host: ActivityUndoHost, requestId: string | undefined): { streamKind: 'channel' | 'dm'; ownerId: string; subjectId: string; topicId: string } {
  const request = requestId === undefined ? undefined : host.events.get(requestId)
  if (request === undefined) return { streamKind: 'channel', ownerId: 'geral', subjectId: '', topicId: '' }
  const [kind, ...rest] = request.streamId.split(':')
  return { streamKind: kind === 'dm' ? 'dm' : 'channel', ownerId: rest.join(':'), subjectId: request.subjectId, topicId: request.topicId ?? '' }
}

/**
 * The collaborators of an {@link ActivityUndo} wired to the host: the line is appended to the thread once (`activity-line:<id>`, a fixed
 * sentence and no argument), touched when the activity is undone, and each inverse is the host's own method.
 * @param host - The host.
 * @param screens - The screen documents.
 */
export function activityUndoDeps(host: ActivityUndoHost, screens: Pick<ScreenRepos, 'get' | 'put'>): ActivityUndoDeps {
  const lineOf = (activityId: string): string => `activity-line:${activityId}`
  const nameOf = (personaId: string): string | undefined => host.product.getPersona(personaId)?.name
  return {
    screens,
    now: () => host.orchestration.now(),
    run: call => runUndoCall(host, call),
    personaName: nameOf,
    changed: (_projectId, activityId) => { host.events.touch(lineOf(activityId)) },
    announce: (projectId, activityId, doc) => {
      const id = lineOf(activityId)
      const project = host.product.getProject(projectId)
      if (project === undefined || host.events.has(id)) return
      const where = conversationOf(host, doc.requestId)
      host.events.append({
        id, workspaceId: project.workspaceId, projectId, streamKind: where.streamKind, ownerId: where.ownerId, type: 'message',
        body: activitySentence(nameOf(doc.personaId) ?? 'A persona', doc), actorId: doc.personaId, subjectId: where.subjectId, occurredAt: doc.at,
        ...(where.topicId === '' ? {} : { topicId: where.topicId }),
      })
    },
  }
}

/** The word the client writes the line from (`action.did.<verb>`): the host's `routine_update` is the client's `routine_edit`. */
const WIRE_VERB: Readonly<Record<string, string>> = { routine_update: 'routine_edit' }

/** The plain sentence of the line (what a reader without the card sees): fixed words and the title, never a path or an id. */
export function activitySentence(name: string, doc: ActivityDoc): string {
  const title = doc.target.title
  switch (doc.verb) {
    case 'board_card_move': return doc.after === undefined ? `${name} moveu “${title}”.` : `${name} moveu “${title}” para ${doc.after}.`
    case 'board_card_create': return `${name} criou a tarefa “${title}”.`
    case 'sprint_create': return `${name} criou a sprint “${title}”.`
    case 'sprint_plan': return `${name} planejou a sprint “${title}”.`
    case 'sprint_start': return `${name} iniciou a sprint “${title}”.`
    case 'sprint_close': return `${name} encerrou a sprint “${title}”.`
    case 'routine_create': return `${name} criou a rotina “${title}”.`
    case 'routine_update': return `${name} editou a rotina “${title}”.`
    case 'routine_pause': return `${name} mudou a pausa da rotina “${title}”.`
    case 'persona_hire': return `${name} contratou ${title}.`
    case 'browser_login': return `${name} entrou com o login “${title}”.`
    case 'browser_leak': return `${name} fechou a aba do login “${title}”: a senha apareceu no endereço da página.`
    default: return `${name} mexeu em “${title}”.`
  }
}

/** Records what the personas did inside the product and takes it back, for 5 minutes. */
export class ActivityUndo {
  private readonly undoing = new Set<string>()

  /** @param deps - Host parts. */
  constructor(private readonly deps: ActivityUndoDeps) {}

  /**
   * Keep one activity and put its line in the thread. Idempotent on (instant, tool call): the same call again is the same document.
   * @param who - The run that acted.
   * @param activity - What it did and how it would be reversed.
   * @returns The id of the activity (what `undoPersonaAction` takes).
   */
  record(who: ActivityActor, activity: RecordableActivity): string {
    const id = `${activity.at}:${who.callId}`
    if (this.deps.screens.get<ActivityDoc>(who.projectId, KIND, id) !== undefined) return id
    const start = Date.parse(activity.at)
    const until = new Date((Number.isNaN(start) ? Date.parse(this.deps.now()) : start) + ACTIVITY_UNDO_MS).toISOString()
    const doc: ActivityDoc = {
      ...activity, personaId: who.personaId, workspaceId: who.workspaceId,
      ...(activity.undoable && activity.undo !== undefined ? { undoUntil: until } : {}),
    }
    this.deps.screens.put(who.projectId, KIND, id, doc)
    this.deps.announce?.(who.projectId, id, doc)
    return id
  }

  /** @param projectId - Tenant. @param id - The activity. */
  get(projectId: string, id: string): ActivityDoc | undefined {
    return this.deps.screens.get<ActivityDoc>(projectId, KIND, id)
  }

  /**
   * The activity as the thread line carries it (`MessageView.actionEvent`). `undoable`/`undoUntil` only exist while the record says it can be
   * undone; the client counts the window down on its own clock and the host refuses after it anyway.
   * @param projectId - Tenant.
   * @param id - The activity.
   */
  eventOf(projectId: string, id: string): ActionEventView | undefined {
    const doc = this.get(projectId, id)
    if (doc === undefined) return undefined
    const canUndo = doc.undoUntil !== undefined && doc.undoneAt === undefined
    return {
      verb: WIRE_VERB[doc.verb] ?? doc.verb,
      connectorName: 'Persona',
      target: doc.target.title,
      activityId: id,
      ...(doc.after === undefined ? {} : { after: doc.after }),
      ...(canUndo ? { undoable: true, undoUntil: doc.undoUntil } : {}),
      ...(doc.undoneAt === undefined ? {} : { undone: true }),
    }
  }

  /** @param doc - The activity. @returns The line a reader without the card sees. */
  sentenceOf(doc: ActivityDoc): string {
    return activitySentence(this.deps.personaName?.(doc.personaId) ?? 'A persona', doc)
  }

  /**
   * Take one activity back. It works once, inside the window, and only for an activity that recorded an inverse.
   * @param request - The activity.
   * @returns What happened. A refusal is a typed fault with a safe sentence, so the client never shows a false "desfeito".
   */
  undo(request: UndoPersonaActionRequest): UndoPersonaActionView {
    const doc = this.get(request.projectId, request.activityId)
    if (doc === undefined) throw new RemoteFault('not-found', 'Essa ação não existe mais.')
    if (doc.undoneAt !== undefined) return { undone: true, alreadyUndone: true }
    if (doc.undoUntil === undefined || doc.undo === undefined) throw new RemoteFault('invalid-payload', 'Essa ação não dá para desfazer.')
    if (Date.parse(this.deps.now()) > Date.parse(doc.undoUntil)) throw new RemoteFault('invalid-payload', 'O prazo para desfazer passou (5 minutos).')
    if (this.undoing.has(request.activityId)) return { undone: false }
    const call = parseUndoCall(doc.undo, { workspaceId: request.workspaceId, projectId: request.projectId })
    if (call === undefined) throw new RemoteFault('invalid-payload', 'Essa ação não dá para desfazer.')
    this.undoing.add(request.activityId)
    try {
      this.deps.run(call)
    } catch (error: unknown) {
      // The inverse did not happen: the activity stays as it was. The reason is the host's own safe copy when it has one.
      throw error instanceof RemoteFault ? error : new RemoteFault('invalid-payload', 'Não deu para desfazer: algo mudou depois.')
    } finally {
      this.undoing.delete(request.activityId)
    }
    this.deps.screens.put(request.projectId, KIND, request.activityId, { ...doc, undoneAt: this.deps.now() })
    this.deps.changed?.(request.projectId, request.activityId)
    return { undone: true }
  }
}
