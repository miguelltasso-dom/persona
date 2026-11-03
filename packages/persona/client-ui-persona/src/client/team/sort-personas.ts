import type { PersonaView } from '../remote/persona-remote-types.ts'

/** UI roster tier: coordination first, then core team, watchdog last. */
export function personaRosterTier(persona: Pick<PersonaView, 'systemRoles'>): number {
  const roles = persona.systemRoles ?? []
  if (roles.includes('coordination')) return 0
  if (roles.includes('watchdog')) return 2
  return 1
}

/** Sort personas for rail, channel strip, and composer (no fixed animal names). */
export function sortPersonasForUi<T extends PersonaView>(personas: readonly T[]): T[] {
  return [...personas].sort((a, b) => {
    const tier = personaRosterTier(a) - personaRosterTier(b)
    if (tier !== 0) return tier
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}
