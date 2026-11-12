/**
 * Casa da Equipe (Muse §29), H2: the "Quem está aqui" panel of a channel, grouped: the owner, each equipe (only whoever is on THIS channel) and "Fora agora". With the live state of each persona in green
 * ("Preparando o envio"). Only personas for now: real people come with item 23 (the panel shows nothing it cannot honour). Pure: the host hands in what it knows.
 */

import type { DirectoryTeam } from './channel-directory.ts'
import { equipeIconOf, type EquipeIcon } from './equipe-icon.ts'

/** What the host knows of one persona on the channel. */
export interface HerePersona {
  readonly id: string
  readonly name: string
  readonly title: string
  /** Paused by the owner ("Pausar equipe"/her own pause). */
  readonly paused: boolean
  /** Her engine is not ready (no AI connected for her): she cannot answer now. */
  readonly noEngine: boolean
  /** The honest work state (`PersonaWorkState`): `working` shows the live sentence. */
  readonly state: 'working' | 'resting' | 'stuck' | 'waiting'
  /** The step she is on, in plain words ("Preparando o envio"); only meaningful while `working`. */
  readonly sentence?: string
}

export interface HereMember {
  readonly personaId: string
  readonly name: string
  readonly title: string
  /** The live line in green; absent when she is not working. */
  readonly doing?: string
  /** Why she is away (only in the "Fora agora" group). */
  readonly away?: 'paused' | 'no-engine'
}

/** `owner` | `away` | `unassigned` | `team:<id>`: a plain string on the wire (Typert has no Zod projection for a template-literal type). */
export type HereGroupId = string

export interface HereGroup {
  readonly id: HereGroupId
  readonly name: string
  /** The glyph of the equipe (`UiIcon equipe-…`); present only on a `team:<id>` group. */
  readonly icon?: EquipeIcon
  readonly members: readonly HereMember[]
}

export interface HereOwner {
  readonly id: string
  readonly name: string
}

/**
 * @param input - Who owns the workspace, the equipes, who is on the channel (persona ids, in roster order) and what is known of each persona.
 * @returns The groups in order: Dono, each equipe (in the directory's order), a group for who has no equipe, "Fora agora" last. A group with nobody is not returned.
 */
export function hereGroups(input: {
  readonly owner?: HereOwner
  readonly teams: readonly DirectoryTeam[]
  readonly channelPersonaIds: readonly string[]
  readonly personas: readonly HerePersona[]
}): HereGroup[] {
  const byId = new Map(input.personas.map(persona => [persona.id, persona]))
  const onChannel = input.channelPersonaIds.flatMap(id => byId.get(id) ?? [])
  const away = (persona: HerePersona): HereMember['away'] | undefined => (persona.paused ? 'paused' : persona.noEngine ? 'no-engine' : undefined)
  const member = (persona: HerePersona): HereMember => ({
    personaId: persona.id,
    name: persona.name,
    title: persona.title,
    ...(persona.state === 'working' && persona.sentence !== undefined && persona.sentence.trim() !== '' ? { doing: persona.sentence.trim() } : {}),
  })
  const groups: HereGroup[] = []
  if (input.owner !== undefined) groups.push({ id: 'owner', name: 'Dono', members: [{ personaId: '', name: input.owner.name, title: '' }] })
  const placed = new Set<string>()
  for (const team of input.teams) {
    const ids = new Set(team.personaIds)
    const members = onChannel.filter(persona => ids.has(persona.id) && !placed.has(persona.id) && away(persona) === undefined)
    for (const persona of members) placed.add(persona.id)
    if (members.length > 0) groups.push({ id: `team:${team.id}`, name: team.name, icon: equipeIconOf(team.name, team.icon), members: members.map(member) })
  }
  const loose = onChannel.filter(persona => !placed.has(persona.id) && away(persona) === undefined)
  if (loose.length > 0) groups.push({ id: 'unassigned', name: 'Sem equipe', members: loose.map(member) })
  const gone = onChannel.filter(persona => away(persona) !== undefined)
  if (gone.length > 0) groups.push({ id: 'away', name: 'Fora agora', members: gone.map(persona => ({ ...member(persona), away: away(persona)! })) })
  return groups
}
