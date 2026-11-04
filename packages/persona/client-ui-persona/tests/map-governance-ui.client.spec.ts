import { describe, expect, it } from 'vitest'
import { mockOrgChart, mockTwoDayTest } from '../src/client/governance/mock-governance.ts'
import { orgChartToUi, twoDayToUi } from '../src/client/governance/map-governance-ui.ts'
import { normalizeCharacterId, orgMapLabelsFromDict } from '../src/client/governance/governance-ui-helpers.ts'
import { pt } from '../src/client/locale/governance/locales.ts'

describe('normalizeCharacterId', () => {
  it('strips -default suffix like RailPersona', () => {
    expect(normalizeCharacterId('raposa-default')).toBe('raposa')
    expect(normalizeCharacterId('sol')).toBe('sol')
  })
})

describe('orgMapLabelsFromDict', () => {
  it('maps governance locale to OrgMap scaleLabels', () => {
    const labels = orgMapLabelsFromDict(pt)
    expect(labels.search).toBe(pt['org.map.search'])
    expect(labels.gestor).toBe('Gestor')
    expect(labels.count(3)).toBe(pt['org.map.count'].replace('{count}', '3'))
  })
})

describe('orgChartToUi', () => {
  it('removes right-hand persona from group members', () => {
    const base = mockOrgChart('ws', 'person')
    const view = {
      ...base,
      groups: [
        ...base.groups,
        {
          id: 'h-owner',
          title: 'Amara',
          kind: 'person' as const,
          members: [{ id: base.rightHand!.id, name: base.rightHand!.name, role: base.rightHand!.role, characterId: 'sol', state: 'working' as const }],
        },
      ],
    }
    const ui = orgChartToUi(pt, view)
    const dup = ui.groups.flatMap(g => g.members).find(m => m.id === view.rightHand!.id)
    expect(dup).toBeUndefined()
  })

  it('maps human sector subtitle onto persona cards', () => {
    const ui = orgChartToUi(pt, mockOrgChart('ws', 'person'))
    const milo = ui.groups.flatMap(g => g.members).find(m => m.name === 'Milo')
    expect(milo?.sector).toBe('Dono')
    expect(milo?.role).toBe('Financeiro')
  })
})

describe('twoDayToUi', () => {
  it('maps rows and replaces +12H-style slot labels', () => {
    const view = { ...mockTwoDayTest('ws'), slotLabels: ['+12H', '+24H', '+36H', '+48H'] as const }
    const ui = twoDayToUi(pt, view, () => {})
    expect(ui.rows.length).toBe(4)
    expect(ui.slotLabels[0]).toBe(pt['twoDay.slot1'])
    expect(ui.rows[0]!.slots.length).toBe(4)
  })
})
