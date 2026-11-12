import { describe, expect, it } from 'vitest'
import { mapRailTeamFromLive } from '../src/client/remote/map-rail-team.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS } from './persona-live-fixtures.client.ts'

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
  ...PERSONA_LIVE_GESTOR_FIELDS,
}

describe('mapRailTeamFromLive', () => {
  it('maps host persona id and reviewing when task is in review column', () => {
    const rows = mapRailTeamFromLive(base, true)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('p-atlas')
    expect(rows[0]?.characterId).toBe('atlas')
    expect(rows[0]?.state).toBe('reviewing')
  })

  it('o rail recebe do palco os fatos do vocabulário único: rascunho, janela de silêncio e pausa', () => {
    const snap: PersonaLiveSnapshot = {
      ...base,
      kanbanCards: [],
      nowRows: [{ member: { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'working', draftFiles: 2, quiet: true, paused: false }, queueCount: 0 }],
    }
    expect(mapRailTeamFromLive(snap, true)[0]).toMatchObject({ state: 'working', draftFiles: 2, quiet: true, paused: false })
    const idle: PersonaLiveSnapshot = { ...snap, nowRows: [], stripMembers: [{ id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', quiet: true }] }
    expect(mapRailTeamFromLive(idle, true)[0]).toMatchObject({ state: 'resting', quiet: true })
  })

  it('marks offline when host is disconnected', () => {
    const rows = mapRailTeamFromLive(base, false)
    expect(rows[0]?.state).toBe('offline')
  })

  it('orders coordination before watchdog before name (before RailTeam state sort)', () => {
    const snap: PersonaLiveSnapshot = {
      ...base,
      team: {
        members: [],
        personas: [
          { id: 'p-luna', workspaceId: 'ws', projectId: 'pp', name: 'Luna', title: 'Vigia', description: '', avatarKind: 'gallery', avatarRef: 'luna', systemRoles: ['watchdog'], canRecruit: false },
          { id: 'p-atlas', workspaceId: 'ws', projectId: 'pp', name: 'Atlas', title: 'Coordenação', description: '', avatarKind: 'gallery', avatarRef: 'atlas', systemRoles: ['coordination'], canRecruit: true },
          { id: 'p-bento', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Eng', description: '', avatarKind: 'gallery', avatarRef: 'bento', systemRoles: [], canRecruit: false },
        ],
      },
      nowRows: [],
    }
    const rows = mapRailTeamFromLive(snap, true)
    expect(rows.map(row => row.name)).toEqual(['Atlas', 'Bento', 'Luna'])
  })
})
