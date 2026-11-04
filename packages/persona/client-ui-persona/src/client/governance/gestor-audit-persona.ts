import { AVATAR_96 } from '../assets/generated-imports.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import { MOCK_GESTOR_AUDIT_PERSONA } from './gestor-audit-mock.ts'
import { normalizeCharacterId } from './governance-ui-helpers.ts'

export interface GestorActivityPersona {
  readonly name: string
  readonly avatarSrc?: string | undefined
}

function avatarSrcForCharacter(characterKey: string | undefined): string | undefined {
  if (characterKey === undefined) return undefined
  return AVATAR_96[characterKey as keyof typeof AVATAR_96]
}

/** Gestor row for ActivityGroup — live team_manager when present, else mock Atlas. */
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
  return { name: MOCK_GESTOR_AUDIT_PERSONA.name, avatarSrc: MOCK_GESTOR_AUDIT_PERSONA.avatarSrc }
}
