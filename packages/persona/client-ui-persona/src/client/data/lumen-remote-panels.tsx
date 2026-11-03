/** Main panels that load {@link PersonaRemoteClient} data (production path). */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ProjectFileListing } from '@deepseek-ai/dsh-persona-host/types'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import { ApprovalsInbox } from '../approvals/ApprovalsInbox.tsx'
import { ConnectionsView } from '../connections/ConnectionsView.tsx'
import { FilesView } from '../files/FilesView.tsx'
import type { FileEntry } from '../files/mock-data.ts'
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
import { ReviewDeliveryPanel } from '../review/ReviewDeliveryPanel.tsx'
import { KanbanReviewSheet } from '../review/KanbanReviewSheet.tsx'
import { KanbanWithReview } from '../review/KanbanWithReview.tsx'
import { teamToMembers } from './adapters/members.ts'
import { dailySummariesToUi } from './adapters/proactive.ts'
import { routineScheduleToQuiet, routineScheduleToRuns } from './adapters/routines.ts'
import { triageLogFromHost } from './adapters/triage.ts'
import { vaultRecordsToKnowledge } from './adapters/vault.ts'
import { pickProjectRootPath } from '../files/pick-project-root.ts'
import type { FilesSurfaceState } from '../files/FilesView.tsx'
import type { ProactivityLimits, QuietWindow, TriageRule } from '../rules/mock-data.ts'
import type { ProjectLimitsView, QuietWindowView, TriageRuleView } from '@deepseek-ai/dsh-persona-host/types'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellState } from '../shell/create-shell-store.ts'
import { HIRE_PERSONA_PROFILE_ID } from '../shell/create-shell-store.ts'
import type { LumenRemoteInjected, LumenRemotePanelProps } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'
import { usePersonaRemoteLoad } from './use-persona-remote-load.ts'
import { useRemoteTenantGate } from './use-remote-tenant-gate.ts'

function useScope(useTenant: LumenRemotePanelProps['useTenant']): ProjectScopeRequest | null {
  const gate = useRemoteTenantGate(useTenant)
  return gate === 'loading' || gate === 'error' ? null : gate
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
  const loadKey = remoteScopeKey(scope)
  const load = useCallback(async () => {
    if (scope === null) throw new Error('no-scope')
    return unwrapRemote(await persona.listTasks(scope))
  }, [persona, scope])
  const [reloadToken, setReloadToken] = useState(0)
  const state = usePersonaRemoteLoad(scope !== null, `${loadKey}:${reloadToken}`, load)
  const cards = state.status === 'ready' ? tasksToKanbanCards(state.data, scope?.projectId ?? '') : []
  return (
    <KanbanWithReview
      persona={persona}
      scope={scope}
      initialCards={cards}
      initialState={surfaceFromLoad(state, data => data.length === 0)}
      onMutate={() => { setReloadToken(token => token + 1) }}
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
  const gate = useRemoteTenantGate(useTenant)
  const scope = gate === 'loading' || gate === 'error' ? null : gate
  const load = useCallback(async () => unwrapRemote(await persona.listConnections(scope!)), [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const entries = state.status === 'ready' ? connectionsToEntries(state.data) : []
  if (gate === 'loading') return <ConnectionsView initialState="loading" />
  if (gate === 'error') return <ConnectionsView initialState="error" />
  return (
    <ConnectionsView
      entries={entries}
      initialState={surfaceFromLoad(state, data => data.length === 0)}
    />
  )
}

export function RemoteApprovalsPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const [reloadToken, setReloadToken] = useState(0)
  const loadKey = `${remoteScopeKey(scope)}:approvals:${reloadToken}`
  const load = useCallback(async () => {
    const [approvals, summaries] = await Promise.all([
      unwrapRemote(await persona.listApprovals(scope!)),
      unwrapRemote(await persona.listDailySummaries(scope!)),
    ])
    return { approvals, summaries }
  }, [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, loadKey, load)
  const payload = state.status === 'ready' ? state.data : null
  const items = payload === null ? [] : approvalsToInbox(payload.approvals)
  const proactiveSummaries = payload === null ? [] : dailySummariesToUi(payload.summaries)
  const inboxEmpty = items.length === 0 && !proactiveSummaries.some(summary => summary.proposals.length > 0)
  const reload = (): void => { setReloadToken(token => token + 1) }
  const decide = async (id: string, kind: 'hire' | 'vault' | 'skill' | 'attention', accept: boolean): Promise<void> => {
    if (scope === null) return
    await unwrapRemote(await persona.decideApproval({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      id,
      kind,
      accept,
    }))
    reload()
  }
  return (
    <ApprovalsInbox
      items={items}
      proactiveSummaries={proactiveSummaries}
      initialState={surfaceFromLoad(state, () => inboxEmpty)}
      onDecideItem={(item, accept) => { void decide(item.id, item.kind, accept) }}
      onDecideProactive={(proposal, accept) => {
        if (proposal.approvalKind === undefined) return
        void decide(proposal.id, proposal.approvalKind, accept)
      }}
    />
  )
}

export function RemoteRulesPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const [reloadToken, setReloadToken] = useState(0)
  const loadKey = `${remoteScopeKey(scope)}:rules:${reloadToken}`
  const load = useCallback(async () => {
    const [rules, quiet, limits, triageLog] = await Promise.all([
      unwrapRemote(await persona.listTriageRules(scope!)),
      unwrapRemote(await persona.listQuietWindows(scope!)),
      unwrapRemote(await persona.getProjectLimits(scope!)),
      unwrapRemote(await persona.listTriageLog(scope!)),
    ])
    return { rules, quiet, limits, triageLog }
  }, [persona, scope])
  const state = usePersonaRemoteLoad(scope !== null, loadKey, load)
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
      onSaveLimits={(limits) => {
        if (scope === null) return
        void (async () => {
          await unwrapRemote(await persona.setProjectLimits({
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            maxProposalsPerDay: limits.maxProposalsPerDay,
            tokensPerPersonaMonth: limits.tokensPerPersonaMonth,
            tokensPerProjectMonth: limits.tokensPerProjectMonth,
          }))
          setReloadToken(token => token + 1)
        })()
      }}
    />
  )
}

export type RemoteProfilePanelProps = InjectFace<LumenRemoteInjected & {
  hooks: LumenRemoteInjected['hooks'] & { shell: HostObservable<ShellState> }
}>

export function RemoteProfilePanel({ persona, useTenant, useShell }: RemoteProfilePanelProps): ReactNode {
  const scope = useScope(useTenant)
  const profilePersonaId = useShell(state => state.profilePersonaId)
  const load = useCallback(async () => {
    if (profilePersonaId === HIRE_PERSONA_PROFILE_ID) {
      return { hireMode: true as const }
    }
    const [personas, now] = await Promise.all([
      unwrapRemote(await persona.listPersonas(scope!)),
      unwrapRemote(await persona.getOverviewNow(scope!)),
    ])
    const picked = profilePersonaId === null
      ? personas[0]
      : personas.find(row => row.id === profilePersonaId) ?? personas[0]
    const row = picked === undefined ? undefined : now.personas.find(r => r.personaId === picked.id)
    if (picked === undefined) return null
    let autonomy: { mode: 'asked' | 'propose' | 'act'; proposalBudget: number } | null = null
    if (persona.getAutonomy !== undefined) {
      try {
        autonomy = await unwrapRemote(await persona.getAutonomy({
          workspaceId: scope!.workspaceId,
          projectId: scope!.projectId,
          personaId: picked.id,
        }))
      } catch {
        autonomy = null
      }
    }
    return { hireMode: false as const, primary: picked, row, autonomy }
  }, [persona, scope, profilePersonaId])
  const loadKey = scope === null ? '' : `${remoteScopeKey(scope)}:${profilePersonaId ?? 'default'}`
  const state = usePersonaRemoteLoad(scope !== null, loadKey, load)
  const snapshot = useMemo((): PersonaProfileSnapshot | null => {
    if (state.status !== 'ready' || state.data === null) return null
    if (state.data.hireMode) return null
    const { primary, row, autonomy } = state.data
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
    if (autonomy !== null && autonomy !== undefined) {
      return {
        ...base,
        autonomy: { mode: autonomy.mode, proposalBudget: autonomy.proposalBudget },
      }
    }
    if (row === undefined) return base
    const acceptanceRatePct = row.deliveriesToday === 0
      ? undefined
      : Math.min(100, Math.round((row.proposalsAcceptedToday / Math.max(1, row.deliveriesToday)) * 100))
    return {
      ...base,
      proactivity: {
        proposalsToday: row.proposalsAcceptedToday,
        proposalsAccepted7d: row.proposalsAcceptedToday,
        ...(acceptanceRatePct !== undefined ? { acceptanceRatePct } : {}),
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
  if (state.status === 'ready' && state.data?.hireMode === true) {
    return <PersonaProfilePage initialState="empty" />
  }
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

/** Standalone Revisar panel (ticket id required). Kanban uses {@link KanbanReviewSheet}. */
export function RemoteReviewDeliveryPanel(props: LumenRemotePanelProps & {
  readonly ticketId?: string
  readonly taskTitle?: string
}): ReactNode {
  const scope = useScope(props.useTenant)
  const ticketId = props.ticketId ?? ''
  if (scope === null || ticketId === '') {
    return <ReviewDeliveryPanel initialState="empty" summary={null} />
  }
  return (
    <KanbanReviewSheet
      persona={props.persona}
      scope={scope}
      ticketId={ticketId}
      taskTitle={props.taskTitle ?? ticketId}
      onClose={() => {}}
      onMutate={() => {}}
    />
  )
}
