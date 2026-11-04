/**
 * T3 §4/§9/§11/§12: dashed composer queue and turn activity folds.
 * Documents live in `screen_doc` (no extra migration).
 */

import {
  dropQueuedMessage,
  editQueuedMessage,
  enqueueWorkingMessage,
  openAsideAsk,
  type QueuedUserMessage,
  type TurnActivityEvent,
} from '@deepseek-ai/dsh-persona-core'
import { activityFromReport, foldTurnActivity } from '@deepseek-ai/dsh-persona-engine'
import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type {
  ActivityGroupView,
  AsideAskView,
  EditQueuedMessageRequest,
  EnqueueWorkingMessageRequest,
  ListTurnActivityRequest,
  OpenAsideAskRequest,
  QueuedMessageView,
  RecordTurnActivityRequest,
  WorkingQueueRequest,
} from './types.ts'

const QUEUE_KIND = 'working_queue'
const ACTIVITY_KIND = 'turn_activity'
const ASIDE_KIND = 'aside_ask'

/**
 * Persist working-send queue and T3 activity events.
 */
export class WorkingSendHost {
  /**
   * @param docs - Screen documents.
   * @param now - Clock.
   */
  constructor(
    readonly docs: ScreenRepos,
    readonly now: () => string,
  ) {}

  /**
   * @param request - New dashed bubble.
   */
  enqueue(request: EnqueueWorkingMessageRequest): QueuedMessageView {
    const row = enqueueWorkingMessage({
      id: `${request.personaId}:${this.now()}`,
      personaId: request.personaId,
      subjectId: request.subjectId,
      text: request.text,
      createdAt: this.now(),
    })
    this.docs.put(request.projectId, QUEUE_KIND, queueId(request), [...this.queueOf(request), row])
    return row
  }

  /**
   * @param request - Persona + subject.
   */
  list(request: WorkingQueueRequest): QueuedMessageView[] {
    return this.queueOf(request)
  }

  /**
   * @param request - Row id and optional new text.
   */
  edit(request: EditQueuedMessageRequest): QueuedMessageView[] {
    const current = this.queueOf(request)
    const next = request.text === undefined
      ? dropQueuedMessage(current, request.id)
      : editQueuedMessage(current, request.id, request.text)
    this.docs.put(request.projectId, QUEUE_KIND, queueId(request), next)
    return next
  }

  /**
   * @param request - Persona + subject.
   */
  flush(request: WorkingQueueRequest): QueuedMessageView[] {
    const rows = this.queueOf(request)
    this.docs.put(request.projectId, QUEUE_KIND, queueId(request), [])
    return rows
  }

  /**
   * @param request - `/lado` question.
   */
  aside(request: OpenAsideAskRequest): AsideAskView {
    const row = openAsideAsk({
      id: `${request.personaId}:${this.now()}`,
      personaId: request.personaId,
      subjectId: request.subjectId,
      question: request.question,
    })
    this.docs.put(request.projectId, ASIDE_KIND, row.id, row)
    return row
  }

  /**
   * @param request - Event to persist.
   */
  recordActivity(request: RecordTurnActivityRequest): TurnActivityEvent {
    const event = activityFromReport({
      id: request.id,
      personaId: request.personaId,
      threadId: request.subjectId,
      title: request.title,
      at: request.at ?? this.now(),
      tool: request.kind,
      status: request.status,
    })
    this.docs.put(request.projectId, ACTIVITY_KIND, event.id, event)
    return event
  }

  /**
   * @param request - Subject filter.
   */
  listActivity(request: ListTurnActivityRequest): ActivityGroupView[] {
    const events = this.docs.list<TurnActivityEvent>(request.projectId, ACTIVITY_KIND)
      .filter(row => row.threadId === request.subjectId)
      .filter(row => request.personaId === undefined || row.personaId === request.personaId)
    return foldTurnActivity(events).map(fold => ({
      personaId: fold.personaId,
      threadId: fold.threadId,
      items: fold.items,
      shownKinds: [...fold.shownKinds],
      moreCount: fold.moreCount,
      failedCount: fold.failedCount,
      unfinished: fold.unfinished,
    }))
  }

  private queueOf(request: { readonly projectId: string; readonly personaId: string; readonly subjectId: string }): QueuedUserMessage[] {
    return this.docs.get<QueuedUserMessage[]>(request.projectId, QUEUE_KIND, queueId(request)) ?? []
  }
}

function queueId(request: { readonly personaId: string; readonly subjectId: string }): string {
  return `${request.personaId}:${request.subjectId}`
}
