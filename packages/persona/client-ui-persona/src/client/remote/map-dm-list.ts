import type { DmView, TeamView } from './persona-remote-types.ts'

export interface DmListItemUi {
  readonly id: string
  readonly peerName: string
  readonly peerId: string
}

function peerLabel(team: TeamView, memberId: string, otherId: string): { name: string; id: string } {
  const persona = team.personas.find(p => p.id === otherId)
  if (persona !== undefined) return { name: persona.name, id: persona.id }
  const member = team.members.find(m => m.id === otherId)
  if (member !== undefined) return { name: member.displayName, id: member.id }
  if (otherId === memberId) return { name: 'Você', id: otherId }
  return { name: otherId, id: otherId }
}

/** Map host DMs to sidebar rows (peer label for the viewer). */
export function mapDmList(dms: readonly DmView[], team: TeamView, memberId: string): readonly DmListItemUi[] {
  return dms.map((dm) => {
    const otherId = dm.participantA === memberId ? dm.participantB : dm.participantA
    const peer = peerLabel(team, memberId, otherId)
    return { id: dm.id, peerName: peer.name, peerId: peer.id }
  })
}
