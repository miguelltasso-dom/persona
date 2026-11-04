import type { PersonaView } from '@deepseek-ai/dsh-persona-host/types'

/** First persona with coordination role (workspace coordinator). */
export function coordinationPersonaId(personas: readonly PersonaView[]): string | undefined {
  return personas.find(row => row.systemRoles.includes('coordination'))?.id
}
