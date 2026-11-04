import { describe, expect, it } from 'vitest'
import { enrichOrgChartWithRail } from '../src/client/governance/enrich-org-chart-rail.ts'
import { orgChartToUi } from '../src/client/governance/map-governance-ui.ts'
import { mockOrgChart } from '../src/client/governance/mock-governance.ts'
import { pt } from '../src/client/locale/governance/locales.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS } from './persona-live-fixtures.client.ts'

const LIVE: PersonaLiveSnapshot = {
  ready: true,
  tenant: { workspaceId: 'ws', projectId: 'p', memberId: 'm1', channelId: 'ch' },
  team: {
    members: [],
    personas: [{
      id: 'p-atlas',
      workspaceId: 'ws',
      projectId: 'p',
      name: 'Atlas',
      title: 'Ops',
      description: '',
      avatarKind: 'gallery',
      avatarRef: 'raposa-default',
      systemRoles: [],
      canRecruit: false,
    }],
  },
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
}

describe('enrichOrgChartWithRail', () => {
  it('fills missing characterId from live rail for UI portraits', () => {
    const base = mockOrgChart('ws', 'person')
    const view = {
      ...base,
      groups: [{
        ...base.groups[0]!,
        members: [{
          id: 'p-atlas',
          name: 'Atlas',
          role: 'Ops',
          state: 'working' as const,
        }],
      }, ...base.groups.slice(1)],
    }
    const enriched = enrichOrgChartWithRail(view, LIVE, true)
    const atlas = enriched.groups.flatMap(g => g.members).find(m => m.id === 'p-atlas')
    expect(atlas?.characterId).toBe('raposa')
    const ui = orgChartToUi(pt, enriched)
    const portrait = ui.groups.flatMap(g => g.members).find(m => m.id === 'p-atlas')
    expect(portrait?.characterId).toBe('raposa')
  })
})
