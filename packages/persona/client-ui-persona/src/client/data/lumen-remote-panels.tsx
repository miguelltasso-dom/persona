/** Main panels that load {@link PersonaRemoteClient} data (production path). */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ProjectFileListing } from '@deepseek-ai/dsh-persona-host/types'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import { ApprovalsInbox } from '../approvals/ApprovalsInbox.tsx'
import { ConnectionsView } from '../connections/ConnectionsView.tsx'
import { FilesView } from '../files/FilesView.tsx'
import type { FileEntry } from '../files/mock-data.ts'
import { GlobalKanban } from '../kanban/GlobalKanban.tsx'
import { KnowledgeVault } from '../knowledge/KnowledgeVault.tsx'
import { RoutinesView } from '../routines/RoutinesView.tsx'
import { UsageLimits } from '../usage/UsageLimits.tsx'
import { TriageRulesView } from '../rules/TriageRulesView.tsx'
import { PersonaProfilePage } from '../profile/PersonaProfilePage.tsx'
import type { PersonaProfileSnapshot } from '../profile/mock-data.ts'
import type { PersonaAvatar } from '@deepseek-ai/dsh-persona-core'
import { MembersView } from '../members/MembersView.tsx'
import { ImportWizard } from '../importers/ImportWizard.tsx'
import { CanvasView } from '../canvas/CanvasView.tsx'
import { approvalsToInbox } from './adapters/approvals.ts'
import { connectionsToEntries } from './adapters/connections.ts'
import { tasksToKanbanCards } from './adapters/kanban.ts'
import { limitsToUsageMeters } from './adapters/usage.ts'
import { canvasGraphToUi } from './adapters/canvas.ts'
import { teamToMembers } from './adapters/members.ts'
import { dailySummariesToUi } from './adapters/proactive.ts'
import { routineScheduleToQuiet, routineScheduleToRuns } from './adapters/routines.ts'
import { triageLogFromHost } from './adapters/triage.ts'
import { vaultRecordsToKnowledge } from './adapters/vault.ts'
import { pickProjectRootPath } from '../files/pick-project-root.ts'
import type { FilesSurfaceState } from '../files/FilesView.tsx'
import type { ProactivityLimits, QuietWindow, TriageRule } from '../rules/mock-data.ts'
import type { ProjectLimitsView, QuietWindowView, TriageRuleView } from '@deepseek-ai/dsh-persona-host/types'
import type { LumenRemotePanelProps } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'
import { usePersonaRemoteLoad } from './use-persona-remote-load.ts'

function useScope(useTenant: LumenRemotePanelProps['useTenant']): ProjectScopeRequest | null {
  const tenant = useTenant(s => s)
  if (tenant.status !== 'ready' || tenant.scope === null) return null
  const { workspaceId, projectId } = tenant.scope
  return { workspaceId, projectId }
}

function remoteScopeKey(scope: ProjectScopeRequest | null): string {
  return scope === null ? '' : `${scope.workspaceId}:${scope.projectId}`
}

function triageRulesFromHost(rules: readonly TriageRuleView[]): readonly TriageRule[] {
  return rules.map(rule => ({
    id: rule.id,
    gateText: rule.gateText,
    assessmentText: rule.assessmentText,
    logOnly: rule.logOnly,
    speculativeEnabled: rule.speculativeEnabled,
  }))
}

function quietFromHost(windows: readonly QuietWindowView[]): readonly QuietWindow[] {
  return windows.map(window => ({
    id: window.id,
    label: window.label,
    days: [],
    start: window.start,
    end: window.end,
  }))
}

function limitsFromHost(limits: ProjectLimitsView): ProactivityLimits {
  return {
    maxProposalsPerDay: limits.maxProposalsPerDay,
    tokensPerPersonaMonth: limits.tokensPerPersonaMonth,
    tokensPerProjectMonth: limits.tokensPerProjectMonth,
  }
}

function filesSurfaceFromListing(listing: ProjectFileListing): FilesSurfaceState {
  if (listing.status === 'need-root') return 'needRoot'
  if (listing.entries.length === 0) return 'empty'
  return 'ready'
}

function surfaceFromLoad<T>(state: { status: string; data?: T }, emptyWhen?: (data: T) => boolean): 'loading' | 'error' | 'empty' | 'ready' {
  if (state.status === 'loading') return 'loading'
  if (state.status === 'error') return 'error'
  if (state.status === 'ready' && state.data !== undefined && emptyWhen?.(state.data)) return 'empty'
  return state.status === 'ready' ? 'ready' : 'loading'
}

export function RemoteKanbanPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => {
    if (scope === null) throw new Error('no-scope')
    return unwrapRemote(await persona.listTasks(scope))
  }, [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const cards = state.status === 'ready' ? tasksToKanbanCards(state.data, scope?.projectId ?? '') : []
  return (
    <GlobalKanban
      initialCards={cards}
      initialState={surfaceFromLoad(state, data => data.length === 0)}
    />
  )
}

export function RemoteKnowledgePanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => unwrapRemote(await persona.listVaultRecords(scope!)), [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const records = state.status === 'ready' ? vaultRecordsToKnowledge(state.data) : []
  return (
    <KnowledgeVault
      records={records}
      initialState={surfaceFromLoad(state, data => data.length === 0)}
    />
  )
}

export function RemoteFilesPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const actorId = useTenant(s => s.scope?.actorId ?? '')
  const [reloadToken, setReloadToken] = useState(0)
  const loadKey = `${remoteScopeKey(scope)}:${reloadToken}`
  const load = useCallback(async () => {
    if (scope === null || actorId === '') throw new Error('no-scope')
    return unwrapRemote(await persona.listFiles({
      ...scope,
      actorId,
      path: '',
    }))
  }, [persona, scope, actorId])
  const state = usePersonaRemoteLoad(scope !== null && actorId !== '', loadKey, load)
  const listing = state.status === 'ready' ? state.data : null
  const files: FileEntry[] = listing !== null && listing.status === 'ok'
    ? listing.entries.filter(e => e.kind === 'file').map((entry, index) => ({
      id: `${entry.name}-${index}`,
      name: entry.name,
      projectName: scope?.projectId ?? '',
      updatedAt: '—',
      sizeLabel: '—',
      kind: 'other',
    }))
    : []
  const initialState: FilesSurfaceState = state.status === 'loading'
    ? 'loading'
    : state.status === 'error'
      ? 'error'
      : listing === null
        ? 'loading'
        : filesSurfaceFromListing(listing)
  const onChooseProjectRoot = useCallback(() => {
    void (async () => {
      if (scope === null) return
      const rootPath = await pickProjectRootPath()
      if (rootPath === null) return
      await unwrapRemote(await persona.setProjectRoot({ ...scope, rootPath }))
      setReloadToken(token => token + 1)
    })()
  }, [persona, scope])
  return (
    <FilesView
      files={files}
      initialState={initialState}
      onChooseProjectRoot={onChooseProjectRoot}
    />
  )
}

export function RemoteRoutinesPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => unwrapRemote(await persona.listRoutineSchedule(scope!)), [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const schedules = state.status === 'ready' ? state.data : []
  const routineRuns = routineScheduleToRuns(schedules)
  const quietWindows = routineScheduleToQuiet(schedules)
  return (
    <RoutinesView
      routineRuns={routineRuns}
      quietWindows={quietWindows}
      initialState={surfaceFromLoad(state, data => data.length === 0)}
    />
  )
}

export function RemoteUsagePanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => unwrapRemote(await persona.getProjectLimits(scope!)), [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const meters = state.status === 'ready' ? limitsToUsageMeters(state.data) : []
  return (
    <UsageLimits
      meters={meters}
      showLimitNotice={false}
      initialState={surfaceFromLoad(state)}
    />
  )
}

export function RemoteConnectionsPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => unwrapRemote(await persona.listConnections(scope!)), [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const entries = state.status === 'ready' ? connectionsToEntries(state.data) : []
  return (
    <ConnectionsView
      entries={entries}
      initialState={surfaceFromLoad(state, data => data.length === 0)}
    />
  )
}

export function RemoteApprovalsPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => {
    const [approvals, summaries] = await Promise.all([
      unwrapRemote(await persona.listApprovals(scope!)),
      unwrapRemote(await persona.listDailySummaries(scope!)),
    ])
    return { approvals, summaries }
  }, [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const payload = state.status === 'ready' ? state.data : null
  const items = payload === null ? [] : approvalsToInbox(payload.approvals)
  const proactiveSummaries = payload === null ? [] : dailySummariesToUi(payload.summaries)
  const inboxEmpty = items.length === 0 && !proactiveSummaries.some(summary => summary.proposals.length > 0)
  return (
    <ApprovalsInbox
      items={items}
      proactiveSummaries={proactiveSummaries}
      initialState={surfaceFromLoad(state, () => inboxEmpty)}
    />
  )
}

export function RemoteRulesPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => {
    const [rules, quiet, limits, triageLog] = await Promise.all([
      unwrapRemote(await persona.listTriageRules(scope!)),
      unwrapRemote(await persona.listQuietWindows(scope!)),
      unwrapRemote(await persona.getProjectLimits(scope!)),
      unwrapRemote(await persona.listTriageLog(scope!)),
    ])
    return { rules, quiet, limits, triageLog }
  }, [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const payload = state.status === 'ready' ? state.data : null
  const rulesProps = payload === null
    ? { rules: [] as const, quietWindows: [] as const, triageLog: [] as const }
    : {
      rules: triageRulesFromHost(payload.rules),
      quietWindows: quietFromHost(payload.quiet),
      limits: limitsFromHost(payload.limits),
      triageLog: triageLogFromHost(payload.triageLog),
    }
  return (
    <TriageRulesView
      {...rulesProps}
      initialState={surfaceFromLoad(state)}
    />
  )
}

export function RemoteProfilePanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => {
    const [personas, now] = await Promise.all([
      unwrapRemote(await persona.listPersonas(scope!)),
      unwrapRemote(await persona.getOverviewNow(scope!)),
    ])
    const primary = personas[0]
    const row = now.personas[0]
    if (primary === undefined) return null
    return { primary, row }
  }, [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const snapshot = useMemo((): PersonaProfileSnapshot | null => {
    if (state.status !== 'ready' || state.data === null) return null
    const { primary, row } = state.data
    const avatar: PersonaAvatar = primary.avatarKind === 'upload'
      ? { kind: 'upload', ref: primary.avatarRef }
      : primary.avatarKind === 'silhouette'
        ? { kind: 'silhouette', ref: primary.avatarRef }
        : { kind: 'gallery', ref: primary.avatarRef }
    const base: PersonaProfileSnapshot = {
      persona: {
        id: primary.id,
        workspaceId: primary.workspaceId,
        name: primary.name,
        title: primary.title,
        description: primary.description,
        avatar,
        personality: '',
        instructions: '',
        runner: { kind: 'dsh', model: 'default' },
        tools: {},
        skills: [],
        limits: {},
        systemRoles: [...primary.systemRoles],
        canRecruit: primary.canRecruit,
        createdAt: '',
        updatedAt: '',
        createdBy: '',
      },
      liveState: row?.state === 'working' ? 'working'
        : row?.state === 'resting' ? 'resting'
          : row?.state === 'waiting' ? 'waiting'
            : row?.state === 'stuck' ? 'error'
              : 'idle',
      projectNames: [scope?.projectId ?? ''],
      recentActivity: [],
    }
    if (row === undefined) return base
    return {
      ...base,
      proactivity: {
        proposalsToday: row.proposalsAcceptedToday,
        proposalsAccepted7d: row.proposalsAcceptedToday,
        acceptanceRatePct: 70,
        idleMinutesToday: row.idleMinutes,
        lazinessBench: {
          runner: 'dsh',
          model: 'default',
          grade: 'fair',
          lastRunAt: '',
        },
      },
    }
  }, [state, scope?.projectId])
  if (state.status === 'loading') return <PersonaProfilePage initialState="loading" />
  if (state.status === 'error' || snapshot === null) return <PersonaProfilePage initialState="empty" />
  return <PersonaProfilePage snapshot={snapshot} initialState="ready" />
}

export function RemoteMembersPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => unwrapRemote(await persona.listTeam(scope!)), [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const members = state.status === 'ready' ? teamToMembers(state.data) : []
  return (
    <MembersView
      members={members}
      initialState={surfaceFromLoad(state, data => data.members.length === 0)}
    />
  )
}

/** Import wizard stays client-driven until files are chosen. */
export function RemoteImportPanel(_props: LumenRemotePanelProps): ReactNode {
  return <ImportWizard />
}

export function RemoteCanvasPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const load = useCallback(async () => unwrapRemote(await persona.listCanvas(scope!)), [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const graph = state.status === 'ready' ? canvasGraphToUi(state.data) : { nodes: [], edges: [] }
  return (
    <CanvasView
      nodes={graph.nodes}
      edges={graph.edges}
      initialState={surfaceFromLoad(state, data => data.nodes.length === 0)}
    />
  )
}
