import { AVATAR_96 } from '../assets/generated-imports.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import { normalizeCharacterId } from './governance-ui-helpers.ts'

const GESTOR_FALLBACK_NAME = 'Gestor de equipe'

export interface GestorActivityPersona {
  readonly name: string
  readonly avatarSrc?: string | undefined
}

function avatarSrcForCharacter(characterKey: string | undefined): string | undefined {
  if (characterKey === undefined) return undefined
  return AVATAR_96[characterKey as keyof typeof AVATAR_96]
}

/**
 * Gestor row for ActivityGroup: the real team_manager of this team. Never a made-up persona — when the team is not
 * loaded the row is just "Gestor de equipe" (and the screen only draws it when the host sent audit items at all).
 */
export function gestorActivityPersonaFromLive(live: PersonaLiveSnapshot | null): GestorActivityPersona {
  if (live?.ready === true && live.team !== null) {
    const gestor = live.team.personas.find(row => row.systemRoles.includes('team_manager'))
      ?? live.team.personas.find(row => row.name.toLowerCase() === 'atlas')
    if (gestor !== undefined) {
      const characterKey = normalizeCharacterId(gestor.avatarRef)
        ?? normalizeCharacterId(gestor.name)
      return {
        name: gestor.name,
        avatarSrc: avatarSrcForCharacter(characterKey),
      }
    }
  }
  return { name: GESTOR_FALLBACK_NAME }
}
