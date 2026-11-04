import type { OrgPersona, OrgPersonaState } from '../primitives/Governance.tsx'
import type { PersonaNowKind } from '../primitives/index.ts'
import type { PersonaCardInfo } from '../profile/PersonaInfoCard.tsx'

const STATE_NOW: Readonly<Record<OrgPersonaState, PersonaNowKind>> = {
  working: 'working',
  reviewing: 'reviewing',
  waiting: 'waiting-approval',
  resting: 'resting',
  stuck: 'stuck',
  offline: 'offline',
}

/** Fallback card when `getPersonaCard` is not loaded yet (same idea as rail `railCardInfo`). */
export function orgPersonaToCardInfo(persona: OrgPersona): PersonaCardInfo {
  return {
    personaId: persona.id,
    name: persona.name,
    role: persona.role,
    ...(persona.characterId === undefined ? {} : { characterId: persona.characterId }),
    ...(persona.sector === undefined ? {} : { sector: persona.sector }),
    systemRoles: [],
    nowKind: STATE_NOW[persona.state],
    presence: persona.state === 'offline' ? 'offline' : 'online',
  }
}
