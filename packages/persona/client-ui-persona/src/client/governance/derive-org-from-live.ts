/** Build organogram from live team until Anvil `getOrgChart` (GOV-5). */

import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import { mapRailTeamFromLive } from '../remote/map-rail-team.ts'
import type { RailPersonaState } from '../shell/RailTeam.tsx'
import { sortPersonasForUi } from '../team/sort-personas.ts'
import type { OrgChartGroupBy, OrgChartView, OrgPersonaStateView, OrgPersonaView } from './governance-contract.ts'
import { normalizeCharacterId } from './governance-ui-helpers.ts'

function railToOrgState(state: RailPersonaState): OrgPersonaStateView {
  if (state === 'reviewing') return 'reviewing'
  if (state === 'offline') return 'offline'
  return state
}

function toOrgPersona(
  id: string,
  name: string,
  role: string,
  characterId: string | undefined,
  state: RailPersonaState,
): OrgPersonaView {
  const portrait = normalizeCharacterId(characterId)
  return {
    id,
    name,
    role,
    ...(portrait === undefined ? {} : { characterId: portrait }),
    state: railToOrgState(state),
  }
}

/**
 * @param snap - Live host snapshot.
 * @param hostOnline - Shell host ping.
 * @returns Organogram when roster is loaded; otherwise `null` (caller uses mock/RPC).
 */
export function deriveOrgChartFromLive(
  workspaceId: string,
  groupBy: OrgChartGroupBy,
  snap: PersonaLiveSnapshot,
  hostOnline: boolean,
): OrgChartView | null {
  if (!snap.ready || snap.team === null || snap.team.personas.length === 0) return null

  const rail = mapRailTeamFromLive(snap, hostOnline)
  const railById = new Map(rail.map(row => [row.id, row]))
  const sorted = sortPersonasForUi(snap.team.personas)
  const coord = sorted.find(p => p.systemRoles.includes('coordination'))
  const others = sorted.filter(p => p.id !== coord?.id)

  const owner = snap.team.members.find(m => m.role === 'owner') ?? snap.team.members[0]
  const humanTitle = owner?.displayName ?? 'Você'

  const personas: OrgPersonaView[] = others.map((persona) => {
    const row = railById.get(persona.id)
    const characterId = normalizeCharacterId(row?.characterId ?? persona.avatarRef)
    const state = row?.state ?? 'resting'
    return toOrgPersona(persona.id, persona.name, persona.title, characterId, state)
  })

  const rightHand = coord === undefined
    ? undefined
    : toOrgPersona(
      coord.id,
      coord.name,
      coord.title,
      normalizeCharacterId(railById.get(coord.id)?.characterId ?? coord.avatarRef),
      railById.get(coord.id)?.state ?? 'working',
    )

  if (groupBy === 'sector') {
    const byTitle = new Map<string, OrgPersonaView[]>()
    for (const persona of personas) {
      const key = persona.role.trim().length > 0 ? persona.role : 'Equipe'
      const bucket = byTitle.get(key) ?? []
      bucket.push(persona)
      byTitle.set(key, bucket)
    }
    return {
      workspaceId,
      groupBy,
      ...(rightHand === undefined ? {} : { rightHand, rightHandCaption: 'seu braço direito' }),
      personaCount: sorted.length,
      humanCount: snap.team.members.length,
      groups: [...byTitle.entries()].map(([title, members], index) => ({
        id: `sector-${index}`,
        title,
        kind: 'sector' as const,
        subtitle: `${members.length} personas`,
        members,
      })),
    }
  }

  return {
    workspaceId,
    groupBy,
    ...(rightHand === undefined ? {} : { rightHand, rightHandCaption: 'seu braço direito' }),
    personaCount: sorted.length,
    humanCount: snap.team.members.length,
    groups: [{
      id: owner?.id ?? 'human-owner',
      title: humanTitle,
      subtitle: 'Responsável',
      kind: 'person' as const,
      members: personas,
    }],
  }
}
