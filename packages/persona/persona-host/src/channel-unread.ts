/**
 * Casa da Equipe (Muse §29/§29b, item 22), H1: what is NEW in a channel for one person. The sidebar shows the unread count in bold and the mention as `@1` in amber; opening a channel with news puts the
 * thread on the first new line ("Novas"); a person who scrolled up gets "↓ 2 mensagens novas". The read mark is a doc of the screens KV (no migration): `{ seq }` per (person, channel), only ever moving forward.
 * Pure: no store, no clock beyond what the caller hands in.
 */

/** A line of a channel as the unread count reads it. */
export interface UnreadEvent {
  readonly seq: number
  readonly actorId: string
  readonly type: string
  readonly body: string
}

/** The person the count is for. */
export interface UnreadMember {
  readonly id: string
  readonly handle: string
  readonly displayName: string
}

/** What the sidebar and the thread need about one channel. */
export interface ChannelUnread {
  readonly channelId: string
  /** Lines from others after the read mark. */
  readonly unread: number
  /** Of those, the ones that call this person by `@handle` or `@name` (the person is expected: amber `@1`). */
  readonly mentions: number
  /** The first new line: the thread opens there. Absent when nothing is new. */
  readonly firstUnreadSeq?: number
  /** The last line of the channel (the mark a person who reached the end writes). */
  readonly lastSeq: number
}

/** The line types that are a message of the thread. A streaming partial is not one yet (it settles under the same id later). */
const COUNTED = new Set(['message', 'runner', 'error'])

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

/**
 * @param body - The text of a line.
 * @param member - Who might be called.
 * @returns Whether the line calls the person by `@handle` or `@name` (accent and case do not count; a longer word is not a call: `@anabela` is not `@ana`).
 */
export function mentionsMember(body: string, member: UnreadMember): boolean {
  const text = fold(body)
  for (const name of [member.handle, member.displayName]) {
    const wanted = fold(name).trim()
    if (wanted === '') continue
    let from = 0
    for (;;) {
      const at = text.indexOf(`@${wanted}`, from)
      if (at < 0) break
      const after = text[at + 1 + wanted.length]
      if (after === undefined || !/[\p{L}\p{N}_]/u.test(after)) return true
      from = at + 1
    }
  }
  return false
}

/**
 * @param channelId - The channel.
 * @param events - Its lines (any order; the caller may pass only those after the mark).
 * @param readSeq - The person's read mark (0 = nothing read).
 * @param me - Who the count is for.
 * @returns The unread figures of that channel for that person.
 */
export function unreadOf(channelId: string, events: readonly UnreadEvent[], readSeq: number, me: UnreadMember): ChannelUnread {
  let unread = 0
  let mentions = 0
  let first: number | undefined
  let lastSeq = 0
  for (const event of events) {
    if (event.seq > lastSeq) lastSeq = event.seq
    if (event.seq <= readSeq || event.actorId === me.id || !COUNTED.has(event.type) || event.body.trim() === '') continue
    unread += 1
    if (mentionsMember(event.body, me)) mentions += 1
    if (first === undefined || event.seq < first) first = event.seq
  }
  return { channelId, unread, mentions, ...(first === undefined ? {} : { firstUnreadSeq: first }), lastSeq }
}

/** The part of the screens KV the read marks use. */
export interface ReadMarkStore {
  get(projectId: string, kind: string, id: string): { readonly seq: number } | undefined
  put(projectId: string, kind: string, id: string, value: { readonly seq: number }): void
}

/** Kind of the screen doc that holds a read mark. */
export const CHANNEL_READ_KIND = 'channel_read'

/** The read marks of the people of a project: one number per (person, channel), only ever moving forward. */
export class ChannelReadBook {
  private readonly store: ReadMarkStore

  /** @param store - The screens KV. */
  constructor(store: ReadMarkStore) {
    this.store = store
  }

  /** @returns The mark, or undefined when this person never opened (or was never counted in) this channel. */
  markOf(projectId: string, memberId: string, channelId: string): number | undefined {
    const doc = this.store.get(projectId, CHANNEL_READ_KIND, keyOf(memberId, channelId))
    return doc === undefined || !Number.isInteger(doc.seq) || doc.seq < 0 ? undefined : doc.seq
  }

  /**
   * The person read the channel up to `seq`. A mark never goes back (a late, out-of-order call changes nothing).
   * @returns The mark that stands.
   */
  mark(projectId: string, memberId: string, channelId: string, seq: number): number {
    const wanted = Number.isInteger(seq) && seq > 0 ? seq : 0
    const current = this.markOf(projectId, memberId, channelId) ?? 0
    if (wanted <= current && this.markOf(projectId, memberId, channelId) !== undefined) return current
    const next = Math.max(wanted, current)
    this.store.put(projectId, CHANNEL_READ_KIND, keyOf(memberId, channelId), { seq: next })
    return next
  }

  /**
   * A channel this person was never counted in starts at its LAST line (the history is not "new": the feature starts counting from here). Does nothing when there is already a mark.
   * @returns The mark that stands.
   */
  baseline(projectId: string, memberId: string, channelId: string, lastSeq: number): number {
    const current = this.markOf(projectId, memberId, channelId)
    if (current !== undefined) return current
    return this.mark(projectId, memberId, channelId, lastSeq)
  }
}

const keyOf = (memberId: string, channelId: string): string => `${memberId}:${channelId}`
