/**
 * COLHEITA 18 (Prism) — "A conversa da tarefa" no Quadro: the pure side. A task's conversation is a real thread of the SAME stream the task
 * lives in: a dedicated subject with `topicId = 'task:<ticketId>'` (Forge's wire; no new stream kind). The messages are the usual
 * `MessageView`, so the DM components render them as they are; this file only maps what the host adds around them:
 *
 *  - on the board card: `threadTopicId`, `threadCount`, `threadUnread`, `threadLastSeq` (read-only numbers);
 *  - `openTaskConversation({ ticketId })` → where the thread is (`streamKind`, `ownerId`, `topicId`), its title and who looks after the task;
 *  - the composer placeholder: "Escreva para a Bia sobre esta tarefa".
 *
 * Wire values are checked once here: a shape that is not what the host promised is `undefined`, never a half-open panel.
 */

/** The subject prefix of a task conversation (the host owns it; the client only recognizes it). */
export const TASK_TOPIC_PREFIX = 'task:'

/** @param topicId - A conversation subject id. @returns Whether it is the conversation of a task. */
export const isTaskTopic = (topicId: string | undefined): boolean => topicId !== undefined && topicId.startsWith(TASK_TOPIC_PREFIX)

/** What the host adds to a board card (all optional: a host without the thread sends none). */
export interface TaskThreadFields {
  readonly threadTopicId?: string | undefined
  readonly threadCount?: number | undefined
  readonly threadUnread?: number | undefined
  readonly threadLastSeq?: number | undefined
}

/** The thread of a card as the board draws it. */
export interface TaskThreadUi {
  readonly topicId: string
  /** Messages in the thread. */
  readonly count: number
  /** Messages the person has not read yet (the badge on the card). */
  readonly unread: number
  /** The newest message seq (what `markTaskThreadRead` takes). */
  readonly lastSeq: number
}

const count = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : undefined)

/**
 * @param card - The host's card fields.
 * @returns The thread of the card, or `undefined` when the host sent none (no badge, and the card still opens the panel on a fresh thread).
 */
export function mapTaskThread(card: TaskThreadFields): TaskThreadUi | undefined {
  const topicId = typeof card.threadTopicId === 'string' ? card.threadTopicId.trim() : ''
  if (topicId === '') return undefined
  const total = count(card.threadCount) ?? 0
  const unread = Math.min(count(card.threadUnread) ?? 0, total === 0 ? Number.MAX_SAFE_INTEGER : Math.max(total, 0))
  return { topicId, count: total, unread, lastSeq: count(card.threadLastSeq) ?? 0 }
}

/** @param unread - Unread messages. @returns The number inside the 22 px seal: 1–99, then "99+". */
export const unreadBadgeText = (unread: number): string => (unread > 99 ? '99+' : String(Math.max(0, Math.trunc(unread))))

/** One persona that looks after the task. */
export interface TaskCaringUi {
  readonly personaId: string
  readonly name: string
}

/** Where the thread of a task is, as `openTaskConversation` answers. */
export interface TaskConversationUi {
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly topicId: string
  readonly title: string
  /** The first one is who the composer writes to by default. */
  readonly caring: readonly TaskCaringUi[]
}

/**
 * @param wire - The answer of `openTaskConversation` (a wire value: nothing is trusted).
 * @returns The conversation, or `undefined` when it is not usable (no stream, no task topic): the panel then says it could not open.
 */
export function mapTaskConversation(wire: unknown): TaskConversationUi | undefined {
  if (typeof wire !== 'object' || wire === null) return undefined
  const row = wire as Readonly<Record<string, unknown>>
  const streamKind = row.streamKind
  const ownerId = typeof row.ownerId === 'string' ? row.ownerId.trim() : ''
  const topicId = typeof row.topicId === 'string' ? row.topicId.trim() : ''
  if ((streamKind !== 'channel' && streamKind !== 'dm') || ownerId === '' || !isTaskTopic(topicId)) return undefined
  const caring = Array.isArray(row.caring)
    ? row.caring.flatMap((entry): TaskCaringUi[] => {
      if (typeof entry !== 'object' || entry === null) return []
      const personaId = (entry as Readonly<Record<string, unknown>>).personaId
      const name = (entry as Readonly<Record<string, unknown>>).name
      return typeof personaId === 'string' && personaId !== '' && typeof name === 'string' && name.trim() !== '' ? [{ personaId, name: name.trim() }] : []
    })
    : []
  return { streamKind, ownerId, topicId, title: typeof row.title === 'string' ? row.title.trim() : '', caring }
}

/** "Bia", "Bia e Téo", "Bia, Téo e Luna" in the person's language. */
export function caringNames(caring: readonly TaskCaringUi[]): string {
  const names = caring.map(row => row.name)
  try {
    return new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}
