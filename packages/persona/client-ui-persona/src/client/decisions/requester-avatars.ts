/**
 * The portrait of whoever asks, resolved once in the store from the REAL team (the same way the Gestor row is):
 * every screen that draws a decision gets `requester.avatarSrc` and never guesses from a host id.
 */

import { personaFaceSrc } from '../hire/persona-face.ts'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { normalizeCharacterId } from '../governance/governance-ui-helpers.ts'
import type { Decision } from './decision-types.ts'

export interface RequesterPersona {
  readonly id: string
  readonly name: string
  readonly avatarRef?: string | undefined
}

function portraitOf(persona: RequesterPersona): string | undefined {
  const key = normalizeCharacterId(persona.avatarRef) ?? normalizeCharacterId(persona.name)
  // Muse (D-069): quem não tem um animal na referência ganha um bicho estável da galeria em vez das iniciais.
  return key === undefined ? personaFaceSrc(persona.avatarRef, persona.id) : AVATAR_96[key as keyof typeof AVATAR_96]
}

/** Adds `requester.avatarSrc` by persona id, else by name (an attention card only knows the name). */
export function withRequesterAvatars(
  decisions: readonly Decision[],
  team: readonly RequesterPersona[] | undefined,
): readonly Decision[] {
  if (team === undefined || team.length === 0) return decisions
  return decisions.map((decision) => {
    const { personaId, name } = decision.requester
    const persona = team.find(row => row.id === personaId)
      ?? team.find(row => row.name.toLowerCase() === name.toLowerCase())
    const avatarSrc = persona === undefined ? undefined : portraitOf(persona)
    return avatarSrc === undefined ? decision : { ...decision, requester: { ...decision.requester, avatarSrc } }
  })
}
