/** Fill missing organogram avatars from the live rail (host getOrgChart often omits characterId). */

import { mapRailTeamFromLive } from '../remote/map-rail-team.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import { normalizeCharacterId } from './governance-ui-helpers.ts'
import type { OrgChartView, OrgPersonaView } from './governance-contract.ts'

function withRailAvatar(
  row: OrgPersonaView,
  railByPersonaId: ReadonlyMap<string, string>,
): OrgPersonaView {
  if (row.characterId !== undefined && row.characterId.trim().length > 0) return row
  const fromRail = railByPersonaId.get(row.id)
  if (fromRail === undefined) return row
  const portrait = normalizeCharacterId(fromRail) ?? fromRail
  return { ...row, characterId: portrait }
}

/** @returns Map persona id → gallery character id from live team. */
export function railCharacterIdsFromLive(
  snap: PersonaLiveSnapshot,
  hostOnline: boolean,
): ReadonlyMap<string, string> {
  return new Map(mapRailTeamFromLive(snap, hostOnline).map(row => [row.id, row.characterId]))
}

export function enrichOrgChartWithRail(
  view: OrgChartView,
  snap: PersonaLiveSnapshot,
  hostOnline: boolean,
): OrgChartView {
  const railByPersonaId = railCharacterIdsFromLive(snap, hostOnline)
  return {
    ...view,
    ...(view.rightHand === undefined
      ? {}
      : { rightHand: withRailAvatar(view.rightHand, railByPersonaId) }),
    groups: view.groups.map(group => ({
      ...group,
      members: group.members.map(member => withRailAvatar(member, railByPersonaId)),
    })),
  }
}
