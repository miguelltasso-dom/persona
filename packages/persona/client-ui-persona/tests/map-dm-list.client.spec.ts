import { describe, expect, it } from 'vitest'
import { mapDmList } from '../src/client/remote/map-dm-list.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

const team: TeamView = {
  personas: [{
    id: 'p1',
    workspaceId: 'ws',
    projectId: 'pp',
    name: 'Guia',
    title: 'Coord',
    description: '',
    avatarKind: 'gallery',
    avatarRef: 'guia',
    systemRoles: [],
    canRecruit: true,
  }],
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
}

describe('mapDmList', () => {
  it('labels the peer for the viewer', () => {
    const rows = mapDmList([{
      id: 'dm1', projectId: 'pp', participantA: 'ana', participantB: 'p1',
    }], team, 'ana')
    expect(rows[0]?.peerName).toBe('Guia')
  })
})
