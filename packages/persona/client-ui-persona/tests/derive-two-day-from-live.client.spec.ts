import { describe, expect, it } from 'vitest'
import { deriveTwoDayFromLive } from '../src/client/governance/derive-two-day-from-live.ts'
import { preferDerivedTwoDay } from '../src/client/governance/two-day-prefer-derived.ts'
import { pt as governanceDict } from '../src/client/locale/governance/locales.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS } from './persona-live-fixtures.client.ts'

function liveStub(partial: Partial<PersonaLiveSnapshot>): PersonaLiveSnapshot {
  return {
    ready: true,
    tenant: null,
    team: null,
    nowRows: [],
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
    ...partial,
  }
}

describe('deriveTwoDayFromLive', () => {
  it('adds approvals row when attention queue is non-empty', () => {
    const view = deriveTwoDayFromLive(governanceDict, 'ws', liveStub({
      nowRows: [{
        member: { id: 'luna', name: 'Luna', role: 'Vigia', state: 'working', systemRoles: ['watchdog'] },
        queueCount: 0,
      }],
      attentionTitles: ['Aprovar pagamento'],
    }))
    expect(view).not.toBeNull()
    expect(view?.rows.some(row => row.id === 'live-approvals-you')).toBe(true)
    expect(view?.rows.find(row => row.id === 'live-approvals-you')?.slots.every(s => s === 'waits')).toBe(true)
  })

  it('expands roster personas beyond nowRows', () => {
    const view = deriveTwoDayFromLive(governanceDict, 'ws', liveStub({
      nowRows: [{
        member: { id: 'luna', name: 'Luna', role: 'Vigia', state: 'working', systemRoles: ['watchdog'] },
        queueCount: 0,
      }],
      team: {
        members: [],
        personas: [
          { id: 'p-luna', workspaceId: 'w', projectId: 'p', name: 'Luna', title: 'Vigia', description: '', avatarKind: 'gallery', avatarRef: '', systemRoles: ['watchdog'], canRecruit: false },
          { id: 'p-iara', workspaceId: 'w', projectId: 'p', name: 'Iara', title: 'Atendimento', description: '', avatarKind: 'gallery', avatarRef: '', systemRoles: [], canRecruit: false },
        ],
      },
    }))
    expect(view?.rows.length).toBeGreaterThanOrEqual(2)
    expect(view?.rows.filter(row => row.label === 'Vigia (Luna)')).toHaveLength(1)
  })

  it('adds one row per team persona when host two-day is empty', () => {
    const personaRow = (id: string, name: string, title: string, systemRoles: readonly string[] = []) => ({
      id,
      workspaceId: 'w',
      projectId: 'p',
      name,
      title,
      description: '',
      avatarKind: 'gallery' as const,
      avatarRef: '',
      systemRoles,
      canRecruit: false,
    })
    const personas = [
      personaRow('p-atlas', 'Atlas', 'Coordenação'),
      personaRow('p-bento', 'Bento', 'Engenharia'),
      personaRow('p-nina', 'Nina', 'Pesquisa'),
      personaRow('p-luna', 'Luna', 'Vigia', ['watchdog']),
      personaRow('p-sol', 'Sol', 'Relacionamento'),
      personaRow('p-raposa', 'Raposa', 'Conteúdo'),
    ]
    const view = deriveTwoDayFromLive(governanceDict, 'ws', liveStub({
      team: { members: [], personas: personas as never },
    }))
    expect(view?.rows.filter(row => row.id.startsWith('live-persona-'))).toHaveLength(6)
  })
})

describe('preferDerivedTwoDay', () => {
  it('replaces single all-green host stub', () => {
    const fromHost = {
      workspaceId: 'ws',
      slotLabels: ['a', 'b', 'c', 'd'],
      rows: [{ id: 'host', label: 'Vigia (Luna)', slots: ['runs', 'runs', 'runs', 'runs'] as const }],
    }
    const derived = {
      workspaceId: 'ws',
      slotLabels: ['a', 'b', 'c', 'd'],
      rows: [
        { id: 'host', label: 'Vigia (Luna)', slots: ['runs', 'runs', 'runs', 'runs'] as const },
        { id: 'live-approvals-you', label: 'Aprovações (você)', slots: ['waits', 'waits', 'waits', 'waits'] as const },
      ],
    }
    const merged = preferDerivedTwoDay(fromHost, derived)
    expect(merged.rows.length).toBe(2)
  })
})
