import type { OrgChartGroupBy, OrgChartView } from './governance-contract.ts'

/** Host-aligned organogram with zero personas (fresh workspace). */
export function emptyOrgChart(workspaceId: string, groupBy: OrgChartGroupBy): OrgChartView {
  return {
    workspaceId,
    groupBy,
    personaCount: 0,
    humanCount: 0,
    groups: [],
  }
}
