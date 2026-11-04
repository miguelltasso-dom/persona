/**
 * Organogram "Quem cuida de quem" — by person or by sector (D-054).
 */

import { chargeOf, type GovernancePersona, type GovernanceSnapshot, type HumanMember } from './model.ts'
import { rightHand } from './escalate.ts'

/** One hanging persona card. */
export interface OrgPersonaCard {
  personaId: string
  title: string
  live?: GovernancePersona['live']
}

/** One group: a human (by person) or a sector (by sector). */
export interface OrgGroup {
  id: string
  label: string
  humans: readonly HumanMember[]
  personas: readonly OrgPersonaCard[]
}

/** Read-model for the organogram. */
export interface OrgChart {
  view: 'person' | 'sector'
  rightHand?: OrgPersonaCard
  groups: readonly OrgGroup[]
}

function cardOf(persona: GovernancePersona): OrgPersonaCard {
  return {
    personaId: persona.id,
    title: persona.title,
    ...(persona.live === undefined ? {} : { live: persona.live }),
  }
}

/**
 * Organogram. Braço direito is the coordination function, not a fixed name.
 * @param snapshot - Workspace.
 * @param view - Por pessoa | Por setor.
 */
export function orgChart(snapshot: GovernanceSnapshot, view: 'person' | 'sector'): OrgChart {
  const coord = rightHand(snapshot)
  const right = coord === undefined ? undefined : cardOf(coord)
  if (view === 'person') return { view, ...(right === undefined ? {} : { rightHand: right }), groups: byPerson(snapshot) }
  return { view, ...(right === undefined ? {} : { rightHand: right }), groups: bySector(snapshot) }
}

function byPerson(snapshot: GovernanceSnapshot): OrgGroup[] {
  const groups: OrgGroup[] = []
  for (const human of snapshot.humans) {
    const personas = snapshot.charges
      .filter(row => row.responsibleHumanId === human.id)
      .flatMap((row) => {
        const persona = snapshot.personas.find(item => item.id === row.personaId)
        return persona === undefined ? [] : [cardOf(persona)]
      })
    groups.push({ id: human.id, label: human.name, humans: [human], personas })
  }
  return groups
}

function bySector(snapshot: GovernanceSnapshot): OrgGroup[] {
  const groups: OrgGroup[] = []
  for (const sector of snapshot.sectors) {
    const charges = snapshot.charges.filter(row => row.sectorId === sector.id)
    const humanIds = new Set(charges.map(row => row.responsibleHumanId))
    const humans = snapshot.humans.filter(row => humanIds.has(row.id))
    const personas = charges.flatMap((row) => {
      const persona = snapshot.personas.find(item => item.id === row.personaId)
      return persona === undefined ? [] : [cardOf(persona)]
    })
    groups.push({ id: sector.id, label: sector.name, humans, personas })
  }
  const loose = snapshot.personas.filter(persona => chargeOf(snapshot, persona.id)?.sectorId === undefined)
  if (loose.length > 0) {
    groups.push({
      id: 'unassigned',
      label: 'Sem setor',
      humans: [],
      personas: loose.map(cardOf),
    })
  }
  return groups
}
