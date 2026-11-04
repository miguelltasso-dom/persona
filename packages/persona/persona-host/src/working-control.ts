/**
 * IV-5: “Direcionar agora”, the dashed queue and “Parar” for real.
 *
 * Before this, the queue was React state (and later only a stored list nobody delivered), there was no way to steer an open
 * turn and no Stop. Now:
 *  - **steer**: the text becomes the person's message in the thread and, when the persona has a turn open, goes into that
 *    turn right away (`Runner.deliver(…, 'steer')`); with no open turn it is just a normal send. The message is flagged so
 *    the “Direcionou {persona}” chip survives a reload;
 *  - **queue**: each dashed bubble is a stored row (survives a reload). `flush` really sends them (all, or just one) in order
 *    as the person's messages; the scheduler flushes by itself when the persona is idle — except after Parar, which keeps the
 *    queue until the person says “Enviar agora” or writes something new;
 *  - **stop**: the open turn is cancelled (the queue is kept), the ticket ends as stopped by the person and the thread says
 *    so, with a flagged line the UI can turn into “Você parou aqui · Continuar”.
 * Nothing here is silent: each action leaves a visible line, and a bubble that is gone answers `not-found`.
 */

import type { QueuedUserMessage } from '@deepseek-ai/dsh-persona-core'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { EventRepos, ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { MessageFlags } from './message-flags.ts'
import { RemoteFault } from './remote-guard.ts'
import type {
  EditQueuedMessageRequest,
  EnqueueWorkingMessageRequest,
  FlushWorkingQueueRequest,
  MessageView,
  PostMessageRequest,
  QueuedMessageView,
  RestoreQueuedMessageRequest,
  StopTurnRequest,
  StopTurnView,
  SteerWorkingTurnRequest,
  SteerWorkingTurnView,
  WorkingQueueRequest,
} from './types.ts'
import type { WorkingSendHost } from './working-send-host.ts'

const META_KIND = 'working_queue_meta'
const STOP_KIND = 'working_queue_stop'
const QUEUE_KIND = 'working_queue'

/** Where a queued bubble goes when it is sent. */
interface QueueMeta {
  readonly actorId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly reason?: 'quota'
}

/** What the controller reads and drives in the orchestration. */
export interface WorkingOrchestration {
  now(): string
  runtime(projectId: string): {
    readonly repo: {
      readonly tickets: { get(id: string): Ticket | undefined }
      readonly triggers: { get(id: string): { readonly threads: ReadonlyArray<{ readonly source: string; readonly id: string }> } | undefined }
    }
  }
  runningTicketOf(projectId: string, personaId: string): Ticket | undefined
  steerTicket(projectId: string, ticketId: string, requestId: string, text: string): Promise<boolean>
  stopTicketRun(projectId: string, ticketId: string, reason: string): Promise<boolean>
  stopReply(projectId: string, eventId: string): Promise<boolean>
  isPersonaPaused(projectId: string, personaId: string): boolean
}

/** What the controller needs from the host. */
export interface WorkingControlDeps {
  readonly product: Pick<ProductRepos, 'getPersona'>
  readonly events: Pick<EventRepos, 'append' | 'has'>
  readonly screens: ScreenRepos
  readonly workingSend: WorkingSendHost
  readonly flags: MessageFlags
  readonly orchestration: WorkingOrchestration
  /** Append a message as the person and let the orchestration route it (the host's `postMessage`). */
  send(request: PostMessageRequest): MessageView
  /** The person at the keyboard (session actor), when there is one. */
  actorOf(workspaceId: string): { readonly id: string } | undefined
}

/** Steer, queue delivery and stop for the composer. */
export class WorkingControl {
  readonly deps: WorkingControlDeps

  /**
   * @param deps - Host parts.
   */
  constructor(deps: WorkingControlDeps) {
    this.deps = deps
  }

  /**
   * Queue a dashed bubble and remember where and for whom it goes.
   * @param request - Persona, subject, text and (optionally) the conversation.
   */
  enqueue(request: EnqueueWorkingMessageRequest): QueuedMessageView {
    if (request.text.trim() === '') throw new RemoteFault('invalid-payload', 'Escreva a mensagem antes de colocá-la na fila.')
    const row = this.deps.workingSend.enqueue(request)
    const meta: QueueMeta = {
      actorId: this.deps.actorOf(request.workspaceId)?.id ?? '',
      streamKind: request.streamKind ?? 'channel',
      ownerId: request.ownerId ?? 'geral',
      ...(request.reason === undefined ? {} : { reason: request.reason }),
    }
    this.deps.screens.put(request.projectId, META_KIND, row.id, meta)
    return { ...row, streamKind: meta.streamKind, ownerId: meta.ownerId, ...(meta.reason === undefined ? {} : { reason: meta.reason }) }
  }

  /**
   * The stored queue of one persona and conversation, oldest first, with where each bubble goes.
   * @param request - Persona and subject.
   */
  list(request: WorkingQueueRequest): QueuedMessageView[] {
    return this.deps.workingSend.list(request).map(row => this.withMeta(request.projectId, row))
  }

  /**
   * Take one bubble out of the queue.
   * @param request - Row id.
   * @returns The queue after the removal.
   * @throws RemoteFault `not-found` when the bubble already left the queue.
   */
  drop(request: EditQueuedMessageRequest): QueuedMessageView[] {
    this.require(request, request.id)
    const rows = this.deps.workingSend.edit(dropArgs(request, request.id))
    this.deps.screens.delete(request.projectId, META_KIND, request.id)
    return rows.map(row => this.withMeta(request.projectId, row))
  }

  /**
   * Put a removed bubble back where it was (the “Desfazer” of Tirar).
   * @param request - The removed row.
   */
  restore(request: RestoreQueuedMessageRequest): QueuedMessageView[] {
    const rows = this.deps.workingSend.restore(request, request.item)
    this.deps.screens.put(request.projectId, META_KIND, request.item.id, {
      actorId: this.deps.actorOf(request.workspaceId)?.id ?? '',
      streamKind: request.item.streamKind ?? 'channel',
      ownerId: request.item.ownerId ?? 'geral',
      ...(request.item.reason === undefined ? {} : { reason: request.item.reason }),
    } satisfies QueueMeta)
    return rows.map(row => this.withMeta(request.projectId, row))
  }

  /**
   * “Direcionar agora”: the text is the person's message and, with a turn open, it goes into that turn.
   * @param request - Persona, subject, text, conversation.
   * @throws RemoteFault `invalid-payload` for a blank text.
   */
  async steer(request: SteerWorkingTurnRequest): Promise<SteerWorkingTurnView> {
    const text = request.text.trim()
    if (text === '') throw new RemoteFault('invalid-payload', 'Escreva o que quer direcionar.')
    const actorId = this.deps.actorOf(request.workspaceId)?.id ?? ''
    const id = `steer:${request.personaId}:${this.deps.orchestration.now()}`
    const sent = this.sendAs(request, actorId, id, text)
    // A fresh message after Parar is a new decision: the stored queue may flow again.
    this.deps.screens.delete(request.projectId, STOP_KIND, queueKey(request))
    const turn = this.deps.orchestration.runningTicketOf(request.projectId, request.personaId)
    if (turn === undefined) return { mode: 'sent', messageId: sent.id }
    const steered = await this.deps.orchestration.steerTicket(request.projectId, turn.id, id, text)
    if (!steered) return { mode: 'sent', messageId: sent.id, ticketId: turn.id }
    this.deps.flags.set(request.projectId, sent.id, { steeredPersonaId: request.personaId })
    return { mode: 'steer', messageId: sent.id, ticketId: turn.id }
  }

  /**
   * Send the dashed bubbles now, in order, as the person's messages (one of them with `queueItemId`). A bubble leaves the
   * queue only after it was sent.
   * @param request - Persona and subject, optionally one bubble.
   * @returns The rows that were sent.
   * @throws RemoteFault `not-found` when `queueItemId` already left the queue.
   */
  flush(request: FlushWorkingQueueRequest): QueuedMessageView[] {
    const itemId = request.queueItemId ?? ''
    if (itemId !== '') this.require(request, itemId)
    const sent: QueuedMessageView[] = []
    for (const row of this.deps.workingSend.list(request)) {
      if (itemId !== '' && row.id !== itemId) continue
      const meta = this.deps.screens.get<QueueMeta>(request.projectId, META_KIND, row.id)
      const actorId = meta?.actorId ?? this.deps.actorOf(request.workspaceId)?.id ?? ''
      this.sendAs(
        { ...request, streamKind: meta?.streamKind ?? 'channel', ownerId: meta?.ownerId ?? 'geral' },
        actorId, `queued:${row.id}`, row.text,
      )
      this.deps.workingSend.edit(dropArgs(request, row.id))
      this.deps.screens.delete(request.projectId, META_KIND, row.id)
      sent.push(row)
    }
    this.deps.screens.delete(request.projectId, STOP_KIND, queueKey(request))
    return sent
  }

  /**
   * Called by the scheduler: send the queue of every idle persona, unless the person pressed Parar after queuing.
   * @param projectId - Tenant.
   * @returns How many bubbles were sent.
   */
  autoFlush(projectId: string): number {
    let total = 0
    for (const rows of this.deps.screens.list<QueuedUserMessage[]>(projectId, QUEUE_KIND)) {
      const first = rows[0]
      if (first === undefined) continue
      const persona = this.deps.product.getPersona(first.personaId)
      if (persona === undefined) continue
      if (this.deps.orchestration.runningTicketOf(projectId, first.personaId) !== undefined) continue
      if (this.deps.orchestration.isPersonaPaused(projectId, first.personaId)) continue
      // The head waits for the quota (the quota owner releases it with “Enviar agora”); the order of the queue is kept.
      if (this.deps.screens.get<QueueMeta>(projectId, META_KIND, first.id)?.reason === 'quota') continue
      const stop = this.deps.screens.get<{ at: string }>(projectId, STOP_KIND, `${first.personaId}:${first.subjectId}`)
      if (stop !== undefined && first.createdAt <= stop.at) continue // queued before Parar: waits for “Enviar agora”
      total += this.flush({ workspaceId: persona.workspaceId, projectId, personaId: first.personaId, subjectId: first.subjectId }).length
    }
    return total
  }

  /**
   * Parar: cancel the open turn (queue kept), end the ticket as stopped by the person, and say so in the thread.
   * @param request - Persona and, optionally, the ticket or the reply in flight.
   * @returns What was stopped; `none` (not an error) when nothing was running.
   */
  async stop(request: StopTurnRequest): Promise<StopTurnView> {
    const { orchestration } = this.deps
    let stopped: StopTurnView['stopped'] = 'none'
    let ticketId = ''
    let title = ''
    if (request.eventId !== undefined && request.eventId !== '') {
      await orchestration.stopReply(request.projectId, request.eventId)
      stopped = 'reply'
    }
    const ticket = request.ticketId !== undefined && request.ticketId !== ''
      ? orchestration.runtime(request.projectId).repo.tickets.get(request.ticketId)
      : orchestration.runningTicketOf(request.projectId, request.personaId)
    if (ticket !== undefined && ticket.ended === undefined) {
      ticketId = ticket.id
      title = ticket.title
      if (await orchestration.stopTicketRun(request.projectId, ticket.id, 'Parado por você')) stopped = 'ticket'
    }
    if (stopped === 'none') return { stopped, ticketId: '', line: '' }
    const subjectId = request.subjectId ?? ''
    const queued = this.deps.workingSend.list({ ...request, subjectId }).length
    // The queue stays; it only leaves with “Enviar agora” or after a new message.
    this.deps.screens.put(request.projectId, STOP_KIND, `${request.personaId}:${subjectId}`, { at: orchestration.now() })
    // A stopped reply keeps its own bubble (flagged `stopped`): no extra line. A stopped task gets one.
    const line = stopped === 'ticket'
      ? `Parado. “${title}” ficou parada${queued > 0 ? '; a fila ficou guardada' : ''}. É só pedir de novo.`
      : ''
    if (line === '') return { stopped, ticketId, line }
    const lineId = `stop:${ticketId || request.eventId || request.personaId}:${orchestration.now()}`
    this.postLine(request, ticket, lineId, line)
    this.deps.flags.set(request.projectId, lineId, { stopped: true, ...(ticketId === '' ? {} : { stoppedTicketId: ticketId }) })
    return { stopped, ticketId, line }
  }

  private require(request: WorkingQueueRequest, itemId: string): void {
    if (!this.deps.workingSend.list(request).some(row => row.id === itemId)) {
      throw new RemoteFault('not-found', 'Essa mensagem já saiu da fila.')
    }
  }

  private withMeta(projectId: string, row: QueuedMessageView): QueuedMessageView {
    const meta = this.deps.screens.get<QueueMeta>(projectId, META_KIND, row.id)
    return {
      ...row, streamKind: meta?.streamKind ?? 'channel', ownerId: meta?.ownerId ?? 'geral',
      ...(meta?.reason === undefined ? {} : { reason: meta.reason }),
    }
  }

  private sendAs(
    request: { readonly workspaceId: string; readonly projectId: string; readonly personaId: string; readonly subjectId: string; readonly streamKind?: 'channel' | 'dm' | undefined; readonly ownerId?: string | undefined },
    actorId: string,
    id: string,
    body: string,
  ): MessageView {
    const ownerId = request.ownerId ?? 'geral'
    const topic = request.subjectId === '' || request.subjectId === ownerId || request.subjectId === 'geral' ? undefined : request.subjectId
    return this.deps.send({
      id, workspaceId: request.workspaceId, projectId: request.projectId, streamKind: request.streamKind ?? 'channel', ownerId,
      body, actorId, subjectId: '', responderId: request.personaId, ...(topic === undefined ? {} : { topicId: topic }),
    })
  }

  private postLine(request: StopTurnRequest, ticket: Ticket | undefined, id: string, body: string): void {
    if (this.deps.events.has(id)) return
    const thread = ticket === undefined ? undefined : this.deps.orchestration.runtime(request.projectId).repo.triggers.get(ticket.origin.triggerId)?.threads[0]
    this.deps.events.append({
      id, workspaceId: request.workspaceId, projectId: request.projectId,
      streamKind: thread?.source.startsWith('dm') === true ? 'dm' : 'channel', ownerId: thread?.id ?? 'geral',
      type: 'message', body, actorId: request.personaId, subjectId: '', occurredAt: this.deps.orchestration.now(),
    })
  }
}

function dropArgs(request: { readonly workspaceId: string; readonly projectId: string; readonly personaId: string; readonly subjectId: string }, id: string): EditQueuedMessageRequest {
  return { workspaceId: request.workspaceId, projectId: request.projectId, personaId: request.personaId, subjectId: request.subjectId, id }
}

function queueKey(request: { readonly personaId: string; readonly subjectId: string }): string {
  return `${request.personaId}:${request.subjectId}`
}
