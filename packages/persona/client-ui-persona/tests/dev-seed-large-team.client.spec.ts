// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { applyDevSeedLargeTeam, DEV_SEED_STORAGE_KEY, readDevOrgChartScaleSeed } from '../src/client/data/dev-seed-large-team.ts'
import { ORG_CHART_SCALE_SEED_KEY } from '../src/client/governance/org-scale-dev.ts'

describe('dev-seed-large-team', () => {
  afterEach(() => {
    localStorage.removeItem(DEV_SEED_STORAGE_KEY)
    localStorage.removeItem(ORG_CHART_SCALE_SEED_KEY)
  })

  it('sets dev roster + org scale keys', () => {
    applyDevSeedLargeTeam(60)
    expect(localStorage.getItem(DEV_SEED_STORAGE_KEY)).toBe('1')
    expect(readDevOrgChartScaleSeed()).toBe(60)
  })
})
