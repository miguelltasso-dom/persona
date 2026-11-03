import { describe, expect, it } from 'vitest'
import { mapRailTeamFromLive } from '../src/client/remote/map-rail-team.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'

const base: PersonaLiveSnapshot = {
  ready: true,
  tenant: { workspaceId: 'ws', projectId: 'pp', memberId: 'owner', channelId: 'geral' },
  team: {
    members: [],
    personas: [{
      id: 'p-atlas',
      workspaceId: 'ws',
      projectId: 'pp',
      name: 'Atlas',
      title: 'Coordenação',
      description: '',
      avatarKind: 'gallery',
      avatarRef: 'atlas',
      systemRoles: ['coordination'],
      canRecruit: true,
    }],
  },
  nowRows: [{
    member: { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'working' },
    queueCount: 1,
    currentTask: 'Contrato',
  }],
  stripMembers: [],
  awayEvents: [],
  attentionTitles: [],
  messages: [],
  passThroughFollowers: [],
  dms: [],
  selectedDmId: null,
  dmMessages: [],
  projects: [],
  kanbanCards: [{ id: 't1', title: 'Contrato', projectId: 'pp', projectName: 'pp', teamId: 't', teamName: 't', column: 'in_review', waitingEvent: false, blocked: false, reviewApproved: false }],
  dmUnreadByPersonaId: {},
  suggestedTask: null,
  turnContext: null,
  error: null,
}

describe('mapRailTeamFromLive', () => {
  it('maps host persona id and reviewing when task is in review column', () => {
    const rows = mapRailTeamFromLive(base, true)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('p-atlas')
    expect(rows[0]?.characterId).toBe('atlas')
    expect(rows[0]?.state).toBe('reviewing')
  })

  it('marks offline when host is disconnected', () => {
    const rows = mapRailTeamFromLive(base, false)
    expect(rows[0]?.state).toBe('offline')
  })
})
