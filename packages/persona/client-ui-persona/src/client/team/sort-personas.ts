import type { PersonaView } from '../remote/persona-remote-types.ts'

/** UI roster tier: coordination first, then core team, watchdog last. */
export function personaRosterTier(persona: Pick<PersonaView, 'systemRoles'>): number {
  const roles = persona.systemRoles ?? []
  if (roles.includes('coordination')) return 0
  if (roles.includes('watchdog')) return 2
  return 1
}

/**
 * The ONE order of people for the whole app (rail, channel strip, composer, cards; DESIGN-01-MUSE §5.1 #06): Coordenação first, the watchdog last,
 * and everyone else in the order the host lists them, which is the order they were hired. The sort is stable and never looks at
 * names or activity, so a face keeps its place (spatial memory matters more than recency; recency lives in Ctrl+K › Recentes).
 */
export function sortPersonasForUi<T extends PersonaView>(personas: readonly T[]): T[] {
  return [...personas].sort((a, b) => personaRosterTier(a) - personaRosterTier(b))
}
