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
import { memoryViewsToRows } from './adapters/memory.ts'
import { skillViewsToRecords } from './adapters/skills.ts'
import { currentUsagePeriod, usageBookToMeters } from './adapters/usage.ts'
import { personaScreensRemote } from './persona-screens-remote.ts'
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
import { ConnectedPersonaEditor } from '../remote/ConnectedPersonaEditor.tsx'
import { pt as editorDict } from '../locale/persona-editor/locales.ts'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import type { LumenRemotePanelProps, PersonaRemoteClient } from './lumen-inject.ts'
import type { PersonaTenantSnapshot } from './persona-tenant.ts'
import { unwrapRemote } from './remote-call.ts'
import { usePersonaRemoteLoad } from './use-persona-remote-load.ts'
import { type RemoteTenantGate, useRemoteTenantGate } from './use-remote-tenant-gate.ts'
import type { RemoteLoadState } from './remote-call.ts'

function useTenantScope(useTenant: LumenRemotePanelProps['useTenant']): {
  readonly scope: ProjectScopeRequest | null
  readonly gate: RemoteTenantGate
  readonly retryBootstrap: () => void
} {
  const { gate, retryBootstrap } = useRemoteTenantGate(useTenant)
  const scope = gate === 'loading' || gate === 'error' ? null : gate
  return { scope, gate, retryBootstrap }
}

function remotePanelSurface<T>(
  gate: RemoteTenantGate,
  loadState: RemoteLoadState<T>,
  emptyWhen?: (data: T) => boolean,
): 'loading' | 'error' | 'empty' | 'ready' {
  if (gate === 'error') return 'error'
  if (gate === 'loading') return 'loading'
  return surfaceFromLoad(loadState, emptyWhen)
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
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const loadKey = remoteScopeKey(scope)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.listTasks({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const [reloadToken, setReloadToken] = useState(0)
  const { state, retry } = usePersonaRemoteLoad(scope !== null, `${loadKey}:${reloadToken}`, load)
  const cards = state.status === 'ready' ? tasksToKanbanCards(state.data, scope?.projectId ?? '') : []
  const onRemoteRetry = (): void => {
    retryBootstrap()
    retry()
    setReloadToken(token => token + 1)
  }
  return (
    <KanbanWithReview
      persona={persona}
      scope={scope}
      initialCards={cards}
      initialState={remotePanelSurface(gate, state, data => data.length === 0)}
      onMutate={() => { setReloadToken(token => token + 1) }}
      onRemoteRetry={onRemoteRetry}
    />
  )
}

export function RemoteKnowledgePanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.listVaultRecords({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const records = state.status === 'ready' ? vaultRecordsToKnowledge(state.data) : []
  return (
    <KnowledgeVault
      records={records}
      initialState={remotePanelSurface(gate, state, data => data.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
    />
  )
}

export function RemoteFilesPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const actorId = useTenant(s => s.scope?.actorId ?? '')
  const [reloadToken, setReloadToken] = useState(0)
  const loadKey = `${remoteScopeKey(scope)}:${reloadToken}`
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined || actorId === '') throw new Error('no-scope')
    return unwrapRemote(await persona.listFiles({
      workspaceId,
      projectId,
      actorId,
      path: '',
    }))
  }, [persona, workspaceId, projectId, actorId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null && actorId !== '', loadKey, load)
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
  const panelSurface = remotePanelSurface(gate, state)
  const initialState: FilesSurfaceState = panelSurface === 'loading' || panelSurface === 'error'
    ? panelSurface
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
      onRemoteRetry={() => { retryBootstrap(); retry(); setReloadToken(token => token + 1) }}
    />
  )
}

export function RemoteRoutinesPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.listRoutineSchedule({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const schedules = state.status === 'ready' ? state.data : []
  const routineRuns = routineScheduleToRuns(schedules)
  const quietWindows = routineScheduleToQuiet(schedules)
  return (
    <RoutinesView
      routineRuns={routineRuns}
      quietWindows={quietWindows}
      initialState={remotePanelSurface(gate, state, data => data.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
    />
  )
}

export function RemoteUsagePanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const screens = personaScreensRemote(persona)
    const scopeReq = { workspaceId, projectId }
    const period = currentUsagePeriod()
    const [usage, quotas] = await Promise.all([
      unwrapRemote(await screens.getUsage({ ...scopeReq, period })),
      unwrapRemote(await screens.getOfficialQuota(scopeReq)),
    ])
    return { usage, quotas }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const meters = state.status === 'ready'
    ? usageBookToMeters(state.data.usage, state.data.quotas)
    : []
  return (
    <UsageLimits
      meters={meters}
      showLimitNotice={false}
      initialState={remotePanelSurface(gate, state, () => meters.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
    />
  )
}

export function RemoteConnectionsPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.listConnections({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const entries = state.status === 'ready' ? connectionsToEntries(state.data) : []
  return (
    <ConnectionsView
      entries={entries}
      initialState={remotePanelSurface(gate, state, data => data.length === 0)}
      onRetry={() => { retryBootstrap(); retry() }}
    />
  )
}

export function RemoteApprovalsPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const [reloadToken, setReloadToken] = useState(0)
  const loadKey = `${remoteScopeKey(scope)}:approvals:${reloadToken}`
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const scopeReq = { workspaceId, projectId }
    const [approvals, summaries] = await Promise.all([
      unwrapRemote(await persona.listApprovals(scopeReq)),
      unwrapRemote(await persona.listDailySummaries(scopeReq)),
    ])
    return { approvals, summaries }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, loadKey, load)
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
      initialState={remotePanelSurface(gate, state, () => inboxEmpty)}
      onRemoteRetry={() => { retryBootstrap(); retry(); reload() }}
      onDecideItem={(item, accept) => { void decide(item.id, item.kind, accept) }}
      onDecideProactive={(proposal, accept) => {
        if (proposal.approvalKind === undefined) return
        void decide(proposal.id, proposal.approvalKind, accept)
      }}
    />
  )
}

export function RemoteRulesPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const [reloadToken, setReloadToken] = useState(0)
  const loadKey = `${remoteScopeKey(scope)}:rules:${reloadToken}`
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const scopeReq = { workspaceId, projectId }
    const [rules, quiet, limits, triageLog] = await Promise.all([
      unwrapRemote(await persona.listTriageRules(scopeReq)),
      unwrapRemote(await persona.listQuietWindows(scopeReq)),
      unwrapRemote(await persona.getProjectLimits(scopeReq)),
      unwrapRemote(await persona.listTriageLog(scopeReq)),
    ])
    return { rules, quiet, limits, triageLog }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, loadKey, load)
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
      initialState={remotePanelSurface(gate, state)}
      onRemoteRetry={() => { retryBootstrap(); retry(); setReloadToken(token => token + 1) }}
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

export type RemoteProfilePanelInject = {
  readonly persona: PersonaRemoteClient
  readonly live: PersonaLiveStore
  readonly hooks: {
    readonly tenant: HostObservable<PersonaTenantSnapshot>
    readonly shell: HostObservable<ShellState>
  }
}

export type RemoteProfilePanelProps = InjectFace<RemoteProfilePanelInject>

export function RemoteProfilePanel({ persona, useTenant, useShell, live }: RemoteProfilePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const profilePersonaId = useShell((state: ShellState) => state.profilePersonaId)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (profilePersonaId === HIRE_PERSONA_PROFILE_ID) {
      return { hireMode: true as const }
    }
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const scopeReq = { workspaceId, projectId }
    const screens = personaScreensRemote(persona)
    const [personas, now, memoryViews, skillViews] = await Promise.all([
      unwrapRemote(await persona.listPersonas(scopeReq)),
      unwrapRemote(await persona.getOverviewNow(scopeReq)),
      unwrapRemote(await screens.listMemory(scopeReq)),
      unwrapRemote(await screens.listSkills(scopeReq)),
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
          workspaceId,
          projectId,
          personaId: picked.id,
        }))
      } catch {
        autonomy = null
      }
    }
    return {
      hireMode: false as const,
      primary: picked,
      row,
      autonomy,
      memoryRows: memoryViewsToRows(memoryViews, workspaceId, projectId),
      skillRecords: skillViewsToRecords(skillViews),
    }
  }, [persona, workspaceId, projectId, profilePersonaId])
  const loadKey = scope === null ? '' : `${remoteScopeKey(scope)}:${profilePersonaId ?? 'default'}`
  const { state, retry } = usePersonaRemoteLoad(scope !== null, loadKey, load)
  const profileSurface = remotePanelSurface(gate, state, data => data === null)
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
  if (profileSurface === 'loading') return <PersonaProfilePage initialState="loading" />
  if (profileSurface === 'error') {
    return (
      <PersonaProfilePage
        initialState="error"
        onRemoteRetry={() => { retryBootstrap(); retry() }}
      />
    )
  }
  if (state.status === 'ready' && state.data?.hireMode === true) {
    return (
      <ConnectedPersonaEditor
        dict={editorDict}
        persona={persona}
        useTenant={useTenant}
        useShell={useShell}
        live={live}
      />
    )
  }
  if (state.status === 'error' || snapshot === null) return <PersonaProfilePage initialState="empty" />
  const memoryRows = state.status === 'ready' && state.data !== null && state.data.hireMode === false
    ? state.data.memoryRows
    : []
  const skillRecords = state.status === 'ready' && state.data !== null && state.data.hireMode === false
    ? state.data.skillRecords
    : []
  return (
    <PersonaProfilePage
      snapshot={snapshot}
      initialState="ready"
      memoryRows={memoryRows}
      skillRecords={skillRecords}
    />
  )
}

export function RemoteMembersPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.listTeam({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const members = state.status === 'ready' ? teamToMembers(state.data) : []
  return (
    <MembersView
      members={members}
      initialState={remotePanelSurface(gate, state, data => data.members.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
    />
  )
}

/** Import wizard stays client-driven until files are chosen. */
export function RemoteImportPanel(_props: LumenRemotePanelProps): ReactNode {
  return <ImportWizard />
}

export function RemoteCanvasPanel({ persona, useTenant }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useTenantScope(useTenant)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.listCanvas({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const graph = state.status === 'ready' ? canvasGraphToUi(state.data) : { nodes: [], edges: [] }
  return (
    <CanvasView
      nodes={graph.nodes}
      edges={graph.edges}
      initialState={remotePanelSurface(gate, state, data => data.nodes.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
    />
  )
}

/** Standalone Revisar panel (ticket id required). Kanban uses {@link KanbanReviewSheet}. */
export function RemoteReviewDeliveryPanel(props: LumenRemotePanelProps & {
  readonly ticketId?: string
  readonly taskTitle?: string
}): ReactNode {
  const { scope } = useTenantScope(props.useTenant)
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
