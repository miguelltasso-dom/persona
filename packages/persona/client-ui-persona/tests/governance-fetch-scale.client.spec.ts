// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { fetchOrgChart } from '../src/client/governance/governance-remote.ts'
import { ORG_CHART_SCALE_SEED_KEY } from '../src/client/governance/org-scale-dev.ts'

const client = {
  getOrgChart: async () => ({
    ok: true as const,
    value: {
      workspaceId: 'ws',
      groupBy: 'person' as const,
      groups: [{ id: 'g', title: 'Tiny', kind: 'person' as const, members: [] }],
    },
  }),
}

describe('fetchOrgChart scale seed (GOV-6 gallery)', () => {
  afterEach(() => {
    localStorage.removeItem(ORG_CHART_SCALE_SEED_KEY)
  })

  it('localStorage scale wins over host getOrgChart', async () => {
    localStorage.setItem(ORG_CHART_SCALE_SEED_KEY, '150')
    const chart = await fetchOrgChart(client as never, 'ws', 'person')
    expect(chart.groups.reduce((n, g) => n + g.members.length, 0)).toBe(150)
  })
})
