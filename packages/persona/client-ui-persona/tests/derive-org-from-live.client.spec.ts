import { describe, expect, it } from 'vitest'
import { deriveOrgChartFromLive } from '../src/client/governance/derive-org-from-live.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS } from './persona-live-fixtures.client.ts'

const BASE: PersonaLiveSnapshot = {
  ready: true,
  tenant: { workspaceId: 'ws', projectId: 'p', memberId: 'm1', channelId: 'ch' },
  team: {
    members: [{ id: 'm1', workspaceId: 'ws', displayName: 'Amara', handle: 'amara', role: 'owner' }],
    personas: [
      {
        id: 'coord-1',
        workspaceId: 'ws',
        projectId: 'p',
        name: 'Lena',
        title: 'Coordenação',
        description: '',
        avatarKind: 'gallery',
        avatarRef: 'sol',
        systemRoles: ['coordination'],
        canRecruit: true,
      },
      {
        id: 'dev-1',
        workspaceId: 'ws',
        projectId: 'p',
        name: 'Ada',
        title: 'Dev',
        description: '',
        avatarKind: 'gallery',
        avatarRef: 'raposa',
        systemRoles: [],
        canRecruit: false,
      },
    ],
  },
  nowRows: [{
    member: { id: 'sol', name: 'Ada', role: 'Dev', state: 'working' },
    queueCount: 1,
    currentTask: 'tk-1',
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
  kanbanCards: [],
  dmUnreadByPersonaId: {},
  suggestedTask: null,
  turnContext: null,
  error: null,
  ...PERSONA_LIVE_GESTOR_FIELDS,
}

describe('deriveOrgChartFromLive', () => {
  it('puts coordination on root and owner group for personas', () => {
    const chart = deriveOrgChartFromLive('ws', 'person', BASE, true)
    expect(chart).not.toBeNull()
    expect(chart!.rightHand?.name).toBe('Lena')
    expect(chart!.groups[0]?.members.some(row => row.name === 'Ada')).toBe(true)
    expect(chart!.groups[0]?.members[0]?.state).toBe('working')
  })
})
