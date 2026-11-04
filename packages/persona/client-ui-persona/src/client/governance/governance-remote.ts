import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import type { GovernanceFixKind, OrgChartGroupBy, OrgChartView, TeamHealthView, TwoDayTestView } from './governance-contract.ts'
import { readOrgChartScaleSeed } from './org-scale-dev.ts'
import { mockLargeOrgChart, mockOrgChart, mockTeamHealth, mockTwoDayTest } from './mock-governance.ts'

function mockOrgChartForWorkspace(workspaceId: string, groupBy: OrgChartGroupBy): OrgChartView {
  const scale = readOrgChartScaleSeed()
  if (scale !== null) return mockLargeOrgChart(workspaceId, groupBy, scale)
  return mockOrgChart(workspaceId, groupBy)
}

export async function fetchOrgChart(
  client: PersonaRemoteClient,
  workspaceId: string,
  groupBy: OrgChartGroupBy,
): Promise<OrgChartView> {
  const scaleSeed = readOrgChartScaleSeed()
  if (scaleSeed !== null) return mockLargeOrgChart(workspaceId, groupBy, scaleSeed)
  if (!('getOrgChart' in client) || typeof client.getOrgChart !== 'function') {
    return mockOrgChartForWorkspace(workspaceId, groupBy)
  }
  try {
    return await unwrapRemote(
      await client.getOrgChart({ workspaceId, groupBy }) as RemoteResult<OrgChartView>,
    )
  } catch {
    return mockOrgChartForWorkspace(workspaceId, groupBy)
  }
}

export async function fetchTeamHealth(client: PersonaRemoteClient, workspaceId: string): Promise<TeamHealthView> {
  if (!('getTeamHealth' in client) || typeof client.getTeamHealth !== 'function') {
    return mockTeamHealth(workspaceId)
  }
  try {
    return await unwrapRemote(
      await client.getTeamHealth({ workspaceId }) as RemoteResult<TeamHealthView>,
    )
  } catch {
    return mockTeamHealth(workspaceId)
  }
}

export async function fetchTwoDayTest(client: PersonaRemoteClient, workspaceId: string): Promise<TwoDayTestView> {
  if (!('runTwoDayTest' in client) || typeof client.runTwoDayTest !== 'function') {
    return mockTwoDayTest(workspaceId)
  }
  try {
    return await unwrapRemote(
      await client.runTwoDayTest({ workspaceId }) as RemoteResult<TwoDayTestView>,
    )
  } catch {
    return mockTwoDayTest(workspaceId)
  }
}

export async function applyGovernanceFix(
  client: PersonaRemoteClient,
  workspaceId: string,
  findingId: string,
  fixKind: GovernanceFixKind,
  targetId?: string,
): Promise<TeamHealthView | null> {
  if (!('applyGovernanceFix' in client) || typeof client.applyGovernanceFix !== 'function') {
    return null
  }
  return await unwrapRemote(
    await client.applyGovernanceFix({
      workspaceId,
      findingId,
      fixKind,
      ...(targetId === undefined ? {} : { targetId }),
    }) as RemoteResult<TeamHealthView>,
  )
}
