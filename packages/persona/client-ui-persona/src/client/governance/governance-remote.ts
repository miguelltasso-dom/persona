import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import type { GovernanceFixKind, OrgChartGroupBy, OrgChartView, TeamHealthView, TwoDayTestView } from './governance-contract.ts'
import { readOrgChartScaleSeed } from './org-scale-dev.ts'
import { mockLargeOrgChart } from './mock-governance.ts'

/**
 * The host's organogram. A host that cannot answer is an error the screen shows ("Tentar de novo"), never a sample
 * organogram dressed up as the team's own (IV-8). Only the dev scale seed (gallery) draws a made-up chart.
 * @param client - Remote client.
 * @param workspaceId - Workspace to read.
 * @param groupBy - By person or by sector.
 * @returns The organogram. Rejects when the host has no `getOrgChart` or it fails.
 */
export async function fetchOrgChart(
  client: PersonaRemoteClient,
  workspaceId: string,
  groupBy: OrgChartGroupBy,
): Promise<OrgChartView> {
  const scaleSeed = readOrgChartScaleSeed()
  if (scaleSeed !== null) return mockLargeOrgChart(workspaceId, groupBy, scaleSeed)
  if (!('getOrgChart' in client) || typeof client.getOrgChart !== 'function') {
    throw new Error('org-chart-unavailable')
  }
  return await unwrapRemote(
    await client.getOrgChart({ workspaceId, groupBy }) as RemoteResult<OrgChartView>,
  )
}

/**
 * The host's team health. Like the organogram (IV-8), a host that cannot answer is an error the screen shows with
 * "Tentar de novo", never a sample team's health score (IV-8b).
 * @param client - Remote client.
 * @param workspaceId - Workspace to read.
 * @returns The health read. Rejects when the host has no `getTeamHealth` or it fails.
 */
export async function fetchTeamHealth(client: PersonaRemoteClient, workspaceId: string): Promise<TeamHealthView> {
  if (!('getTeamHealth' in client) || typeof client.getTeamHealth !== 'function') {
    throw new Error('team-health-unavailable')
  }
  return await unwrapRemote(
    await client.getTeamHealth({ workspaceId }) as RemoteResult<TeamHealthView>,
  )
}

/**
 * The host's "Teste dos 2 dias". Rejects when the host has no `runTwoDayTest` or it fails (IV-8b): the caller may draw
 * the same test from the live roster, but never from a sample.
 * @param client - Remote client.
 * @param workspaceId - Workspace to read.
 * @returns The simulated test result from the host.
 */
export async function fetchTwoDayTest(client: PersonaRemoteClient, workspaceId: string): Promise<TwoDayTestView> {
  if (!('runTwoDayTest' in client) || typeof client.runTwoDayTest !== 'function') {
    throw new Error('two-day-unavailable')
  }
  return await unwrapRemote(
    await client.runTwoDayTest({ workspaceId }) as RemoteResult<TwoDayTestView>,
  )
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
