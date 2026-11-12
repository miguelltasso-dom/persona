/**
 * Casa da Equipe (Muse §29/§29b, item 22): the host side that puts the pure pieces together (`channel-unread`, `channel-here`, `channel-origins`, `channel-suggestions`) over what the host knows, so the
 * Remotes in `index.ts` stay a few lines each. Reads are scoped to ONE project by the caller (the project fence); the only write is the person's own read mark.
 */

import type { DirectoryChannel, DirectoryTeam } from './channel-directory.ts'
import { hereGroups, type HereGroup, type HereOwner, type HerePersona } from './channel-here.ts'
import { originOfMessage, type MessageOrigin, type OriginLookups } from './channel-origins.ts'
import { suggestionsFor, type ChannelSuggestion, type SuggestionPersona } from './channel-suggestions.ts'
import { unreadOf, type ChannelReadBook, type ChannelUnread, type UnreadEvent, type UnreadMember } from './channel-unread.ts'

/** The most lines one count reads (a count past this is "plenty": the badge says so). */
export const UNREAD_SCAN_MAX = 1000
const PAGE = 200

/** What the host hands in. */
export interface HouseDeps {
  readonly reads: ChannelReadBook
  /** The channels of the project as the directory lists them (archived ones included; the house skips them). */
  readonly channels: (projectId: string) => readonly DirectoryChannel[]
  /** The lines of a channel stream after a mark, as the person may read them (hidden ones dropped). `nextSeq` is the cursor of the RAW page: a short page is not the end. */
  readonly linesAfter: (streamId: string, actorId: string, afterSeq: number, limit: number) => { readonly events: readonly UnreadEvent[]; readonly nextSeq: number }
  /** The last line of a stream (0 when empty). */
  readonly lastSeqOf: (streamId: string) => number
  readonly teams: (projectId: string) => readonly DirectoryTeam[]
  /** Who is on a channel (persona ids, stable order); undefined = the directory does not know it. */
  readonly membersOf: (projectId: string, channelId: string) => readonly string[] | undefined
  /** What is known of each persona of the project right now. */
  readonly personas: (projectId: string) => readonly (HerePersona & SuggestionPersona)[]
  readonly origin: (projectId: string) => OriginLookups
}

/** A channel's figures, as the screens read them. */
export type ChannelUnreadView = ChannelUnread

export class ChannelHouse {
  private readonly deps: HouseDeps

  /** @param deps - What the host knows. */
  constructor(deps: HouseDeps) {
    this.deps = deps
  }

  /**
   * @param projectId - Tenant project (checked by the caller).
   * @param me - The person the figures are for.
   * @returns The unread figures of every channel that is not archived.
   */
  unread(projectId: string, me: UnreadMember): ChannelUnreadView[] {
    return this.deps.channels(projectId).filter(channel => channel.archived !== true).map(channel => this.unreadOf(projectId, channel.id, me))
  }

  /**
   * One channel's figures. A channel this person was never counted in starts at its last line (the history is not "new").
   * @param projectId - Tenant project.
   * @param channelId - The channel.
   * @param me - The person.
   */
  unreadOf(projectId: string, channelId: string, me: UnreadMember): ChannelUnreadView {
    const streamId = `channel:${channelId}`
    const last = this.deps.lastSeqOf(streamId)
    const read = this.deps.reads.baseline(projectId, me.id, channelId, last)
    if (last <= read) return { channelId, unread: 0, mentions: 0, lastSeq: last }
    const lines: UnreadEvent[] = []
    let after = read
    while (lines.length < UNREAD_SCAN_MAX) {
      const page = this.deps.linesAfter(streamId, me.id, after, PAGE)
      lines.push(...page.events)
      // The host drops what a person may not see AFTER paging, so a short page is no sign of the end: follow the (raw) cursor to the last line.
      if (page.nextSeq <= after || page.nextSeq >= last) break
      after = page.nextSeq
    }
    return unreadOf(channelId, lines, read, me)
  }

  /**
   * The person read the channel up to `seq` (never past its last line, never backwards).
   * @returns The channel's figures after the mark.
   */
  markRead(projectId: string, channelId: string, me: UnreadMember, seq: number): ChannelUnreadView {
    const last = this.deps.lastSeqOf(`channel:${channelId}`)
    this.deps.reads.mark(projectId, me.id, channelId, Math.min(seq, last))
    return this.unreadOf(projectId, channelId, me)
  }

  /**
   * "Quem está aqui" of one channel.
   * @param projectId - Tenant project.
   * @param channelId - The channel.
   * @param owner - The workspace owner (the "Dono" group).
   */
  here(projectId: string, channelId: string, owner: HereOwner | undefined): HereGroup[] {
    const members = this.deps.membersOf(projectId, channelId) ?? this.deps.personas(projectId).map(persona => persona.id) // a channel the directory does not know has everybody (the old behavior)
    return hereGroups({ ...(owner === undefined ? {} : { owner }), teams: this.deps.teams(projectId), channelPersonaIds: members, personas: this.deps.personas(projectId) })
  }

  /**
   * @param projectId - Tenant project.
   * @param messages - The lines to look at (id and author).
   * @returns The chip of each line a routine made (the others are not in the answer).
   */
  origins(projectId: string, messages: readonly { readonly id: string; readonly actorId: string }[]): Record<string, MessageOrigin> {
    const lookups = this.deps.origin(projectId)
    const found: Record<string, MessageOrigin> = {}
    for (const message of messages) {
      const origin = originOfMessage(message.id, message.actorId, lookups)
      if (origin !== undefined) found[message.id] = origin
    }
    return found
  }

  /**
   * @param projectId - Tenant project.
   * @param channelId - The channel.
   * @returns The 3 suggestions of the empty channel (made from who is on it).
   */
  suggestions(projectId: string, channelId: string): ChannelSuggestion[] {
    const members = this.deps.membersOf(projectId, channelId)
    const personas = this.deps.personas(projectId)
    return suggestionsFor(members === undefined ? personas : personas.filter(persona => members.includes(persona.id)))
  }
}
