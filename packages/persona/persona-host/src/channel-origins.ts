/**
 * Casa da Equipe (Muse §29), H3: where a message of the thread CAME FROM when a routine made it ("Resumo das 8h"): a chip above the message. The line of a Task a routine started carries the id of its Task
 * (`coord-<ticketId>-…`), whose origin trigger is the routine's own event (`routine-run:<run>:<attempt>`, author `routine:<routineId>`). A message nobody can tie to a routine has NO chip (never a guess).
 * Pure: the host hands in the lookups.
 */

/** The chip. */
export interface MessageOrigin {
  readonly kind: 'routine'
  readonly routineId: string
  /** What the person named the routine ("Resumo das 8h"). */
  readonly name: string
}

/** What the host knows. */
export interface OriginLookups {
  /** The ids of the project's Tasks. */
  readonly ticketIds: () => readonly string[]
  /** The id of the event that started a Task. */
  readonly triggerOfTicket: (ticketId: string) => string | undefined
  /** The author of an event. */
  readonly actorOfEvent: (eventId: string) => string | undefined
  /** The name of a routine, or undefined when it is gone. */
  readonly routineName: (routineId: string) => string | undefined
}

const ROUTINE_ACTOR = 'routine:'
const ROUTINE_RUN = /^(routine-run:.+?:\d+)-[a-z]/u

/**
 * @param messageId - The id of the line.
 * @param actorId - Who wrote it.
 * @param lookups - What the host knows.
 * @returns The routine that made it, or undefined.
 */
export function originOfMessage(messageId: string, actorId: string, lookups: OriginLookups): MessageOrigin | undefined {
  const routineId = routineOf(messageId, actorId, lookups)
  if (routineId === undefined) return undefined
  const name = lookups.routineName(routineId)
  return name === undefined || name.trim() === '' ? undefined : { kind: 'routine', routineId, name: name.trim() }
}

function routineOf(messageId: string, actorId: string, lookups: OriginLookups): string | undefined {
  const fromActor = (actor: string | undefined): string | undefined => (actor?.startsWith(ROUTINE_ACTOR) === true ? actor.slice(ROUTINE_ACTOR.length) : undefined)
  const own = fromActor(actorId)
  if (own !== undefined) return own
  if (!messageId.startsWith('coord-')) return undefined
  const rest = messageId.slice('coord-'.length)
  // A line the persona wrote answering the routine's own message: `coord-routine-run:<run>:<attempt>-reply`.
  const run = ROUTINE_RUN.exec(rest)
  if (run?.[1] !== undefined) return fromActor(lookups.actorOfEvent(run[1]))
  // A line of a Task: the longest Task id the line starts with (ids contain dashes).
  const ticket = [...lookups.ticketIds()].sort((a, b) => b.length - a.length).find(id => rest.startsWith(`${id}-`))
  if (ticket === undefined) return undefined
  const trigger = lookups.triggerOfTicket(ticket)
  return trigger === undefined ? undefined : fromActor(lookups.actorOfEvent(trigger))
}
