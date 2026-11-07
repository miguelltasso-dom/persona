/**
 * EQUIPE-REAL §0 (Atlas/Muse, 05/11): the thread shows PEOPLE and PERSONAS — never an internal id. The host posts requests of its own
 * (a routine that is due, the Gestor splitting a request, a persona's initiative) as events with a technical author (`routine:manha`,
 * `team:split`, `team:initiative`): they are triggers for the engine, not words anybody said. They stay in the store (the engine reads
 * them) but no read path shows them, and they are not replicated to the other desks of a remote team.
 */

/**
 * @param actorId - The author of a stored event.
 * @returns True when the author is an internal one (`routine:*`, `team:*`, anything with a colon): never shown to a person.
 */
export function isTechnicalAuthor(actorId: string): boolean {
  return actorId.includes(':')
}
