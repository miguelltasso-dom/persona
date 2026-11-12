/**
 * Casa da Equipe (item 22, Muse §29/§29b): the ONE place that knows how the host's events, Tasks, routines and personas are read for the channel screens.
 * `index.ts` hands in a few ports (what only it owns); everything else — the thread-visibility filter, the cursor, the project fence of the origin chips —
 * lives here, over `ChannelHouse`, so the Remotes stay a few lines each.
 */

import { StoreError, type StoredEvent } from '@deepseek-ai/dsh-persona-store'
import type { ChannelDirectory } from './channel-directory.ts'
import { ChannelHouse } from './channel-house.ts'
import type { MessageOrigin } from './channel-origins.ts'
import { ChannelReadBook, type ReadMarkStore } from './channel-unread.ts'
import type { HerePersona } from './channel-here.ts'
import type { SuggestionPersona } from './channel-suggestions.ts'
import { hiddenFromList } from './task-thread.ts'

/** The most message ids one origins call looks at (a screen page is 50–200 lines). */
export const ORIGINS_MAX_IDS = 200

/** What `index.ts` owns and hands in. */
export interface HouseWirePorts {
  readonly events: {
    list(streamId: string, actor: { readonly id: string }, afterSeq?: number, limit?: number): { readonly events: readonly StoredEvent[]; readonly nextSeq: number }
    get(id: string): StoredEvent | undefined
  }
  /** The last line of a stream (0 when empty). */
  readonly lastSeqOf: (streamId: string) => number
  readonly directory: ChannelDirectory
  /** The screens KV (the person's read marks live there; no migration). */
  readonly reads: ReadMarkStore
  /** What a person may read in a thread (never an internal author, never a line a card replaces). */
  readonly shown: (event: StoredEvent) => boolean
  readonly personas: (projectId: string) => readonly (HerePersona & SuggestionPersona)[]
  /** The Tasks of the project: id and the trigger that started each. */
  readonly tickets: (projectId: string) => readonly { readonly id: string; readonly triggerId: string }[]
  /** The routine's name when it belongs to the project (else undefined: the fence). */
  readonly routineName: (projectId: string, routineId: string) => string | undefined
}

/**
 * @param ports - What the host hands in.
 * @returns The house the Remotes ask.
 */
export function houseOver(ports: HouseWirePorts): ChannelHouse {
  return new ChannelHouse({
    reads: new ChannelReadBook(ports.reads),
    channels: projectId => ports.directory.channels(projectId),
    linesAfter: (streamId, actorId, afterSeq, limit) => {
      try {
        const page = ports.events.list(streamId, { id: actorId }, afterSeq, limit)
        // A line of a Task thread, an internal author and a card-absorbed line are not "new messages" of the channel; the cursor stays the RAW one.
        return { events: page.events.filter(event => ports.shown(event) && !hiddenFromList(event.topicId, undefined)), nextSeq: page.nextSeq }
      } catch (error: unknown) {
        if (error instanceof StoreError && (error.code === 'forbidden' || error.code === 'not-found')) return { events: [], nextSeq: afterSeq } // the same "nothing to read" the thread shows
        throw error
      }
    },
    lastSeqOf: ports.lastSeqOf,
    teams: projectId => ports.directory.teams(projectId),
    membersOf: (projectId, channelId) => ports.directory.membersOf(projectId, channelId),
    personas: ports.personas,
    origin: (projectId) => {
      const triggerOf = new Map(ports.tickets(projectId).map(ticket => [ticket.id, ticket.triggerId]))
      return {
        ticketIds: () => [...triggerOf.keys()],
        triggerOfTicket: ticketId => triggerOf.get(ticketId),
        // A trigger of another project (or a DM) is not looked at: the answer would tell a thing the person cannot see.
        actorOfEvent: (eventId) => {
          const event = ports.events.get(eventId)
          return event?.projectId === projectId && event.streamId.startsWith('channel:') ? event.actorId : undefined
        },
        routineName: routineId => ports.routineName(projectId, routineId),
      }
    },
  })
}

/**
 * The chips of the lines a person asks about. The author of each line is read from the store, never from the caller; only lines of a channel of THIS project count.
 * @param house - The house.
 * @param ports - The ports (for the events).
 * @param projectId - Tenant project (checked by the caller).
 * @param messageIds - The ids on screen (at most `ORIGINS_MAX_IDS` are looked at).
 * @returns The chip of each line a routine made (the others are not in the answer).
 */
export function originsOf(house: ChannelHouse, ports: Pick<HouseWirePorts, 'events'>, projectId: string, messageIds: readonly string[]): Record<string, MessageOrigin> {
  const lines: { id: string; actorId: string }[] = []
  for (const id of messageIds.slice(0, ORIGINS_MAX_IDS)) {
    const event = ports.events.get(id)
    if (event?.projectId === projectId && event.streamId.startsWith('channel:')) lines.push({ id, actorId: event.actorId })
  }
  return house.origins(projectId, lines)
}
