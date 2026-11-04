/** Main panels that load {@link PersonaRemoteClient} data (production path). */

import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ActivationFunnelView,
  AddConnectionAccountRequest,
  PersonaImpactView,
  PersonaView,
  ProjectFileListing,
  ProjectScopeRequest,
  RunnerSwapPolicy,
} from '@deepseek-ai/dsh-persona-host/types'
import { ApprovalsInbox, type ApprovalRememberChoice } from '../approvals/ApprovalsInbox.tsx'
import type { ApprovalItem } from '../approvals/mock-data.ts'
import { SecondBrainShell } from '../second-brain/SecondBrainShell.tsx'
import { ConnectionsView, type PolicyPersona } from '../connections/ConnectionsView.tsx'
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
import { ConnectedRemoteTeamPanel } from '../remote-team/ConnectedRemoteTeamPanel.tsx'
import { pt as membersDict } from '../locale/members/locales.ts'
import { BringContextImportPage } from '../importers/BringContextImportPage.tsx'
import { CANVAS_OPEN_PANEL, CanvasView } from '../canvas/CanvasView.tsx'
import { approvalsToInbox } from './adapters/approvals.ts'
import {
  addConnectionAccountRemote,
  loadConnectionsAccountsUi,
  loadOfficialQuotasByAccount,
  persistRunnerSwapPolicy,
  removeConnectionAccountRemote,
  updateConnectionAccountRemote,
} from './connections-remote.ts'
import { swapPolicyCardSummaryLine, type ConnectionsAccountsUi, type RunnerSwapPolicyScope } from './adapters/connection-accounts.ts'
import { coordinationPersonaId } from './coordination-persona.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as profileDict } from '../locale/profile/locales.ts'
import { tasksToKanbanCards } from './adapters/kanban.ts'
import { readKanbanScaleSeed } from '../kanban/kanban-scale-dev.ts'
import { mockLargeKanbanCards } from '../kanban/mock-large-kanban-cards.ts'
import { memoryViewsToRows } from './adapters/memory.ts'
import { skillViewsToRecords } from './adapters/skills.ts'
import { personaImpactToUi } from './adapters/insights.ts'
import { currentUsagePeriod, usageBookToMeters } from './adapters/usage.ts'
import { officialQuotasToProviderPools, usageMetersWithoutQuotaDuplicates } from './adapters/usage-pooled.ts'
import { usagePanelToUi } from './adapters/usage-panel.ts'
import { loadUsagePanelRemote } from './usage-panel-remote.ts'
import { MOCK_USAGE_TOKEN_PANEL } from '../usage/mock-usage-token-panel.ts'
import { readClientDevSeedEnabled } from '../remote/persona-dev-seed.ts'
import { personaScreensRemote } from './persona-screens-remote.ts'
import { canvasGraphToUi } from './adapters/canvas.ts'
import { ReviewDeliveryPanel } from '../review/ReviewDeliveryPanel.tsx'
import { KanbanReviewSheet } from '../review/KanbanReviewSheet.tsx'
import { KanbanWithReview } from '../review/KanbanWithReview.tsx'
import { teamToMembers } from './adapters/members.ts'
import { dailySummariesToUi } from './adapters/proactive.ts'
import { routineScheduleToQuiet, routineScheduleToRuns } from './adapters/routines.ts'
import { humanizeInternalIds, type NamedPersona } from '../governance/humanize-ids.ts'
import { personaPortrait } from '../second-brain/brain-ui-adapters.ts'
import { pt as governanceDictPt } from '../locale/governance/locales.ts'
import { pt as brainDictPt } from '../locale/second-brain/locales.ts'
import { triageLogFromHost } from './adapters/triage.ts'
import { vaultRecordsToKnowledge } from './adapters/vault.ts'
import { vaultDocumentsToKnowledge } from './adapters/vault-documents.ts'
import {
  deleteVaultDocumentRemote,
  ingestVaultDocumentRemote,
  replaceVaultDocumentRemote,
} from './vault-documents-remote.ts'
import {
  brainValidityToRpc,
  grantBrainPermissionRemote,
  listBrainPagesRemote,
  listBrainPermissionsRemote,
  loadBrainHomeRemote,
  revokeBrainPermissionRemote,
} from './brain-remote.ts'
import { pickProjectRootPath } from '../files/pick-project-root.ts'
import type { FilesSurfaceState } from '../files/FilesView.tsx'
import type { ProactivityLimits, QuietWindow, TriageRule } from '../rules/mock-data.ts'
import type { ProjectLimitsView, QuietWindowView, TriageRuleView } from '@deepseek-ai/dsh-persona-host/types'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellState } from '../shell/create-shell-store.ts'
import { HIRE_PERSONA_PROFILE_ID, type MainPanelId } from '../shell/create-shell-store.ts'
import { resolveProfileProjectNames } from '../profile/resolve-profile-project-names.ts'
import { personaCardViewToInfo } from '../profile/map-persona-card-view.ts'
import type { PersonaCardView, SkillView, TalkAclView } from '@deepseek-ai/dsh-persona-host/types'
import type { SkillRecord } from '../skills/mock-data.ts'
import { ConnectedPersonaEditor } from '../remote/ConnectedPersonaEditor.tsx'
import { pt as editorDict } from '../locale/persona-editor/locales.ts'
import { pt as governanceDict } from '../locale/governance/locales.ts'
import { pt as usageDict } from '../locale/usage/locales.ts'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import type { LumenRemotePanelProps, PersonaRemoteClient } from './lumen-inject.ts'
import type { PersonaTenantSnapshot } from './persona-tenant.ts'
import { unwrapRemote } from './remote-call.ts'
import { usePersonaRemoteLoad } from './use-persona-remote-load.ts'
import { type RemoteTenantGate } from './use-remote-tenant-gate.ts'
import { useRemoteProjectScope } from './use-remote-project-scope.ts'
import type { RemoteLoadState } from './remote-call.ts'

function remotePanelSurface<T>(
  gate: RemoteTenantGate,
  loadState: RemoteLoadState<T>,
  emptyWhen?: (data: T) => boolean,
): 'loading' | 'error' | 'empty' | 'ready' {
  if (gate === 'error') return 'error'
  if (gate === 'loading') return 'loading'
  return surfaceFromLoad(loadState, emptyWhen)
}

const COORD_ROUTINE_PROMPT = 'Sugira 3 rotinas para a nossa equipe com horário e dono.'
const FILES_EMPTY_PROMPT = 'Preciso de uma entrega de arquivo para este projeto — o que você sugere?'
const RULES_EMPTY_PROMPT = 'Ajude-me a definir a primeira regra de triagem para este projeto.'

type IssueInviteWire = PersonaRemoteClient & {
  issueInvite(request: {
    workspaceId: string
    projectId: string
    inviteId: string
    token: string
    role: 'member' | 'guest'
  }): unknown
}

async function sendCoordinationPrompt(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
  sendToPersona: ((personaId: string, text: string) => void) | undefined,
  prompt: string,
): Promise<void> {
  if (sendToPersona === undefined) return
  const personas = await unwrapRemote(await persona.listPersonas(scope))
  const coordId = coordinationPersonaId(personas)
  if (coordId !== undefined) sendToPersona(coordId, prompt)
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

export function RemoteKanbanPanel({ persona, useTenant, useShell }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const loadKey = remoteScopeKey(scope)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.listTasks({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const [reloadToken, setReloadToken] = useState(0)
  const { state, retry } = usePersonaRemoteLoad(scope !== null, `${loadKey}:${reloadToken}`, load)
  const kanbanScaleSeed = readKanbanScaleSeed()
  const cards = kanbanScaleSeed !== null
    ? [...mockLargeKanbanCards(kanbanScaleSeed)]
    : state.status === 'ready'
      ? tasksToKanbanCards(state.data, scope?.projectId ?? '')
      : []
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

export function RemoteKnowledgePanel({ persona, useTenant, useShell, selectMainPanel }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const actorId = useTenant(tenant => tenant.scope?.actorId ?? 'owner')
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const scopeReq = { workspaceId, projectId }
    const [records, documents] = await Promise.all([
      unwrapRemote(await persona.listVaultRecords(scopeReq)),
      persona.listVaultDocuments === undefined
        ? Promise.resolve([] as import('@deepseek-ai/dsh-persona-host/types').VaultDocumentView[])
        : unwrapRemote(await persona.listVaultDocuments(scopeReq)),
    ])
    return { records, documents }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const records = state.status === 'ready' ? vaultRecordsToKnowledge(state.data.records) : []
  const documents = state.status === 'ready' ? vaultDocumentsToKnowledge(state.data.documents) : []
  const vaultScope = scope === null ? null : { workspaceId: scope.workspaceId, projectId: scope.projectId }
  const onUploadDocument = useCallback(async (file: File) => {
    if (vaultScope === null) return
    await ingestVaultDocumentRemote(persona, vaultScope, file)
    retry()
  }, [persona, vaultScope, retry])
  const onReplaceDocument = useCallback(async (documentId: string, file: File) => {
    if (vaultScope === null) return
    await replaceVaultDocumentRemote(persona, vaultScope, documentId, file)
    retry()
  }, [persona, vaultScope, retry])
  const onDeleteDocument = useCallback(async (documentId: string) => {
    if (vaultScope === null) return
    await deleteVaultDocumentRemote(persona, vaultScope, documentId)
    retry()
  }, [persona, vaultScope, retry])
  const onDescribeCompany = useCallback(async () => {
    if (vaultScope === null || typeof persona.createVaultRecord !== 'function') return
    await unwrapRemote(await persona.createVaultRecord({
      workspaceId: vaultScope.workspaceId,
      projectId: vaultScope.projectId,
      id: 'company-brief',
      kind: 'brief',
      body: '',
      authorId: actorId,
    }))
    retry()
  }, [actorId, persona, vaultScope, retry])
  return (
    <KnowledgeVault
      records={records}
      documents={documents}
      initialState={remotePanelSurface(gate, state, data => data.records.length === 0 && data.documents.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
      onDescribeCompany={() => { void onDescribeCompany() }}
      onOpenImport={selectMainPanel === undefined ? undefined : () => { selectMainPanel('importers') }}
      onUploadDocument={persona.ingestVaultDocument === undefined ? undefined : onUploadDocument}
      onReplaceDocument={persona.replaceVaultDocument === undefined ? undefined : onReplaceDocument}
      onDeleteDocument={persona.deleteVaultDocument === undefined ? undefined : onDeleteDocument}
    />
  )
}

export function RemoteFilesPanel({ persona, useTenant, useShell, sendToPersona }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap, workspaceOverrideProjectId } = useRemoteProjectScope(useTenant, useShell)
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
  const onEmptyPrimary = useCallback(async () => {
    if (scope === null) return
    await sendCoordinationPrompt(persona, scope, sendToPersona, FILES_EMPTY_PROMPT)
  }, [persona, scope, sendToPersona])
  return (
    <FilesView
      files={files}
      initialState={initialState}
      scopeProjectId={workspaceOverrideProjectId}
      onChooseProjectRoot={onChooseProjectRoot}
      onRemoteRetry={() => { retryBootstrap(); retry(); setReloadToken(token => token + 1) }}
      onEmptyPrimary={() => { void onEmptyPrimary() }}
    />
  )
}

export function RemoteRoutinesPanel({ persona, useTenant, useShell, sendToPersona }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap, workspaceOverrideProjectId } = useRemoteProjectScope(useTenant, useShell)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const schedules = await unwrapRemote(await persona.listRoutineSchedule({ workspaceId, projectId }))
    // A persona's daily routine is named after its id (`initiative:<id>`): read the team once to show a person's name.
    let team: readonly NamedPersona[] = []
    try {
      const rows = await unwrapRemote(await persona.listPersonas({ workspaceId, projectId }))
      team = rows.map(row => ({ id: row.id, name: row.name }))
    } catch {
      /* names only: the neutral label is used when the team cannot be read */
    }
    // Windows the person saved here come from the host's own list; the rest are derived from the routines.
    const quietWire = persona as PersonaRemoteClient & { listQuietWindows?(request: ProjectScopeRequest): Promise<RemoteResult<readonly { id: string; label: string; start: string; end: string }[]>> }
    let saved: readonly { id: string; label: string; start: string; end: string }[] = []
    if (quietWire.listQuietWindows !== undefined) {
      try { saved = await unwrapRemote(await quietWire.listQuietWindows({ workspaceId, projectId })) } catch { /* only derived windows */ }
    }
    return {
      schedules: schedules.map(schedule => ({ ...schedule, name: humanizeInternalIds(schedule.name, governanceDictPt, team) })),
      saved,
    }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const schedules = state.status === 'ready' ? state.data.schedules : []
  const routineRuns = routineScheduleToRuns(schedules)
  const derivedQuiet = routineScheduleToQuiet(schedules)
  const savedQuiet = state.status === 'ready'
    ? state.data.saved.map(row => ({ id: `host-${row.id}`, label: row.label, range: `${row.start} – ${row.end}` }))
    : []
  const quietWindows = [...derivedQuiet.filter(row => !savedQuiet.some(saved => saved.range === row.range)), ...savedQuiet]
  const putQuiet = (persona as PersonaRemoteClient & { putQuietWindow?(request: { workspaceId: string; projectId: string; id: string; label: string; start: string; end: string }): Promise<RemoteResult<unknown>> }).putQuietWindow
  const onAddQuietWindow = useCallback(async (window: { readonly label: string; readonly start: string; readonly end: string }) => {
    if (workspaceId === undefined || projectId === undefined || putQuiet === undefined) return
    await unwrapRemote(await putQuiet.call(persona, { workspaceId, projectId, id: `quiet-${crypto.randomUUID()}`, ...window }))
    retry()
  }, [persona, putQuiet, workspaceId, projectId, retry])
  const onAskSuggestions = useCallback(async () => {
    if (scope === null) return
    await sendCoordinationPrompt(persona, scope, sendToPersona, COORD_ROUTINE_PROMPT)
  }, [persona, scope, sendToPersona])
  return (
    <RoutinesView
      routineRuns={routineRuns}
      quietWindows={quietWindows}
      scopeProjectId={workspaceOverrideProjectId}
      initialState={remotePanelSurface(gate, state, data => data.schedules.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
      onAskSuggestions={() => { void onAskSuggestions() }}
      onAddQuietWindow={putQuiet === undefined ? undefined : onAddQuietWindow}
    />
  )
}

type InsightsRemoteWire = PersonaRemoteClient & {
  getActivationFunnel?(request: ProjectScopeRequest): Promise<unknown>
  listPersonaImpact?(request: ProjectScopeRequest): Promise<unknown>
  listPersonas?(request: ProjectScopeRequest): Promise<unknown>
}

async function loadLocalInsights(
  persona: PersonaRemoteClient,
  scopeReq: ProjectScopeRequest,
): Promise<{ readonly funnel: ActivationFunnelView; readonly impacts: readonly PersonaImpactView[]; readonly nameById: Readonly<Record<string, string>> } | null> {
  const wire = persona as InsightsRemoteWire
  if (typeof wire.getActivationFunnel !== 'function' || typeof wire.listPersonaImpact !== 'function') return null
  try {
    const [funnel, impacts] = await Promise.all([
      unwrapRemote(await wire.getActivationFunnel(scopeReq)),
      unwrapRemote(await wire.listPersonaImpact(scopeReq)),
    ])
    let nameById: Record<string, string> = {}
    if (typeof wire.listPersonas === 'function') {
      const personas = await unwrapRemote(await wire.listPersonas(scopeReq))
      if (Array.isArray(personas)) {
        nameById = Object.fromEntries((personas as PersonaView[]).map(row => [row.id, row.name]))
      }
    }
    return { funnel, impacts, nameById }
  } catch {
    return null
  }
}

/** Persona id → name for screens whose data is keyed by id (Uso). A team that cannot be read just means ids stay as sent. */
async function loadPersonaNames(persona: PersonaRemoteClient, scopeReq: ProjectScopeRequest): Promise<Readonly<Record<string, string>>> {
  try {
    const rows = await unwrapRemote(await persona.listPersonas(scopeReq))
    return Object.fromEntries(rows.map(row => [row.id, row.name]))
  } catch {
    return {}
  }
}

export function RemoteUsagePanel({ persona, useTenant, useShell, selectMainPanel }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const screens = personaScreensRemote(persona)
    const scopeReq = { workspaceId, projectId }
    const period = currentUsagePeriod()
    const [usage, quotas, insights, tokenPanelRaw, personaNames] = await Promise.all([
      unwrapRemote(await screens.getUsage({ ...scopeReq, period })),
      loadOfficialQuotasByAccount(persona, scopeReq),
      loadLocalInsights(persona, scopeReq),
      loadUsagePanelRemote(persona, { ...scopeReq, period }),
      loadPersonaNames(persona, scopeReq),
    ])
    return { usage, quotas, insights, tokenPanelRaw, personaNames }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const rawMeters = state.status === 'ready'
    ? usageBookToMeters(state.data.usage, state.data.quotas)
    : []
  const providerPools = state.status === 'ready'
    ? officialQuotasToProviderPools(state.data.quotas)
    : []
  const meters = providerPools.length > 0
    ? usageMetersWithoutQuotaDuplicates(rawMeters)
    : rawMeters
  const insightsPayload = state.status === 'ready' ? state.data.insights : null
  const insightsImpacts = insightsPayload === null
    ? []
    : personaImpactToUi(usageDict, insightsPayload.impacts, insightsPayload.nameById)
  const tokenPanel = state.status === 'ready'
    ? (state.data.tokenPanelRaw !== null
      ? usagePanelToUi(state.data.tokenPanelRaw, state.data.personaNames)
      : (readClientDevSeedEnabled() ? MOCK_USAGE_TOKEN_PANEL : null))
    : null
  return (
    <UsageLimits
      meters={meters}
      providerPools={providerPools}
      tokenPanel={tokenPanel}
      showLimitNotice={false}
      insightsFunnel={insightsPayload?.funnel ?? null}
      insightsImpacts={insightsImpacts}
      initialState={remotePanelSurface(gate, state, data =>
        data.tokenPanelRaw === null
        && data.insights === null
        && usageBookToMeters(data.usage, data.quotas).length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
      onEmptyPrimary={selectMainPanel === undefined ? undefined : () => { selectMainPanel('connections') }}
    />
  )
}

export function RemoteConnectionsPanel({ persona, useTenant, useShell, selectMainPanel, openHelp }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return loadConnectionsAccountsUi(persona, { workspaceId, projectId })
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  // "Já fiz login" re-probes in place (no full-screen loading): `fresh` overrides the panel data until the next full load.
  const [fresh, setFresh] = useState<ConnectionsAccountsUi | null>(null)
  useEffect(() => { setFresh(null) }, [state])
  const accountsUi = fresh ?? (state.status === 'ready' ? state.data : undefined)
  // Silent reload after a change: the screen keeps what it shows (no skeleton) and swaps in the host's answer.
  const refreshSilently = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) return
    setFresh(await loadConnectionsAccountsUi(persona, { workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  // Personas for "Uma persona". Without the list the scope says so instead of offering an empty picker.
  const [policyPersonas, setPolicyPersonas] = useState<readonly PolicyPersona[]>([])
  useEffect(() => {
    if (workspaceId === undefined || projectId === undefined) return undefined
    let alive = true
    void (async () => {
      try {
        const rows = await unwrapRemote(await persona.listPersonas({ workspaceId, projectId }))
        if (alive) setPolicyPersonas(rows.map(row => ({ id: row.id, name: row.name, characterId: row.avatarRef })))
      } catch {
        if (alive) setPolicyPersonas([])
      }
    })()
    return () => { alive = false }
  }, [persona, workspaceId, projectId])
  const onSwapPolicyChange = useCallback(async (policy: RunnerSwapPolicy, policyScope: RunnerSwapPolicyScope, personaId?: string) => {
    if (scope === null) throw new Error('no-scope')
    await persistRunnerSwapPolicy(persona, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      policy,
      scope: policyScope,
      ...(personaId === undefined ? {} : { personaId }),
    })
    // The rule is saved; a failed refresh must not turn it into a "not saved" message.
    await refreshSilently().catch(() => { /* next full load picks it up */ })
  }, [persona, scope, refreshSilently])
  const scopeReq = scope === null ? null : { workspaceId: scope.workspaceId, projectId: scope.projectId }
  const onAddAccount = useCallback(async (provider: AddConnectionAccountRequest['provider'], label: string) => {
    if (scopeReq === null) throw new Error('no-scope')
    setFresh(await addConnectionAccountRemote(persona, { ...scopeReq, provider, label: label.trim() }))
  }, [persona, scopeReq])
  const onRenameAccount = useCallback(async (accountId: string, label: string) => {
    if (scopeReq === null) throw new Error('no-scope')
    await updateConnectionAccountRemote(persona, { ...scopeReq, accountId, label: label.trim() })
    await refreshSilently().catch(() => { /* next full load picks it up */ })
  }, [persona, scopeReq, refreshSilently])
  const onRemoveAccount = useCallback(async (accountId: string) => {
    if (scopeReq === null) throw new Error('no-scope')
    await removeConnectionAccountRemote(persona, { ...scopeReq, accountId })
    await refreshSilently().catch(() => { /* next full load picks it up */ })
  }, [persona, scopeReq, refreshSilently])
  return (
    <ConnectionsView
      accountsUi={accountsUi}
      swapPolicyReadOnly={accountsUi?.legacySingleSeat === true}
      personas={policyPersonas}
      onSwapPolicyChange={onSwapPolicyChange}
      initialState={remotePanelSurface(gate, state, data => data.groups.every(g => g.accounts.length === 0))}
      onRetry={() => { retryBootstrap(); retry() }}
      onEmptyPrimary={() => { retryBootstrap(); retry() }}
      onRecheck={() => {
        if (workspaceId === undefined || projectId === undefined) return
        void loadConnectionsAccountsUi(persona, { workspaceId, projectId }).then(setFresh).catch(() => { /* the view says "ainda não" when no answer comes */ })
      }}
      onOpenGuide={openHelp === undefined ? undefined : () => { openHelp('conexoes') }}
      onOpenUsage={selectMainPanel === undefined ? undefined : () => { selectMainPanel('usage') }}
      onAddAccount={onAddAccount}
      onRenameAccount={onRenameAccount}
      onRemoveAccount={onRemoveAccount}
    />
  )
}

export function RemoteApprovalsPanel({ persona, useTenant, useShell }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const shell = useShell(s => s)
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
  const blockingIds = new Set(items.map(item => item.id))
  const proactiveSummaries = payload === null ? [] : dailySummariesToUi(payload.summaries, blockingIds)
  const inboxEmpty = items.length === 0 && !proactiveSummaries.some(summary => summary.proposals.length > 0)
  const reload = (): void => { setReloadToken(token => token + 1) }
  const decide = async (
    id: string,
    kind: 'hire' | 'vault' | 'skill' | 'attention',
    accept: boolean,
    remember?: ApprovalRememberChoice,
    brain?: ApprovalItem['brain'],
  ): Promise<void> => {
    if (scope === null) return
    const scopeReq = { workspaceId: scope.workspaceId, projectId: scope.projectId }
    await unwrapRemote(await persona.decideApproval({
      ...scopeReq,
      id,
      kind,
      accept,
    }))
    if (accept && remember !== undefined && brain !== undefined) {
      await grantBrainPermissionRemote(persona, {
        ...scopeReq,
        id: brain.grantId,
        personaId: brain.personaId,
        action: brain.action,
        target: brain.target,
        validity: brainValidityToRpc(remember.validity),
      })
    }
    reload()
  }
  return (
    <ApprovalsInbox
      items={items}
      proactiveSummaries={proactiveSummaries}
      focusId={shell.focusedApprovalId ?? undefined}
      initialState={remotePanelSurface(gate, state, () => inboxEmpty)}
      onRemoteRetry={() => { retryBootstrap(); retry(); reload() }}
      onDecideItem={(item, accept, remember) => { void decide(item.id, item.kind, accept, remember, item.brain) }}
      onDecideProactive={(proposal, accept) => {
        if (proposal.approvalKind === undefined) return
        void decide(proposal.id, proposal.approvalKind, accept)
      }}
    />
  )
}

export function RemoteSecondBrainPanel({ persona, useTenant, useShell, selectMainPanel }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const actorId = useTenant(tenant => tenant.scope?.actorId ?? 'owner')
  const [reloadToken, setReloadToken] = useState(0)
  const loadKey = `${remoteScopeKey(scope)}:second-brain:${reloadToken}`
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const scopeReq = { workspaceId, projectId }
    const [home, personas, pages, grants] = await Promise.all([
      loadBrainHomeRemote(persona, scopeReq),
      unwrapRemote(await persona.listPersonas(scopeReq)),
      listBrainPagesRemote(persona, scopeReq),
      listBrainPermissionsRemote(persona, scopeReq),
    ])
    const personaNames = Object.fromEntries(personas.map(row => [row.id, row.name]))
    // The automatic index is kept by whoever holds the librarian role in this team (none → a neutral "O bibliotecário").
    const librarian = personas.find(row => Array.isArray(row.systemRoles) && row.systemRoles.includes('librarian'))
    const personaAvatars = Object.fromEntries(personas.flatMap((row) => {
      const src = personaPortrait(row)
      return src === undefined ? [] : [[row.id, src] as const]
    }))
    return { home, personaNames, personaAvatars, pages, grants, librarianName: librarian?.name }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, loadKey, load)
  const payload = state.status === 'ready' ? state.data : null
  const reload = (): void => { setReloadToken(token => token + 1) }
  const onRevokeGrant = useCallback((grantId: string) => {
    if (scope === null) return
    void (async () => {
      await revokeBrainPermissionRemote(persona, {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      }, grantId)
      reload()
    })()
  }, [persona, scope])
  const surfaceEmpty = payload !== null
    && payload.pages.length <= 1
    && payload.home.changedToday.length === 0
    && payload.home.activeGrants.length === 0
    && payload.home.contradictions.length === 0
  return (
    <SecondBrainShell
      persona={persona}
      scope={scope}
      actorId={actorId}
      home={payload?.home ?? null}
      pages={payload?.pages ?? []}
      grants={payload?.grants ?? []}
      personaNames={payload?.personaNames ?? {}}
      personaAvatars={payload?.personaAvatars ?? {}}
      memberNames={{
        [actorId]: brainDictPt['feed.whoYou'] ?? 'Você',
        ...(payload?.librarianName === undefined ? {} : { system: payload.librarianName }),
      }}
      surfaceState={remotePanelSurface(gate, state, () => surfaceEmpty)}
      onRemoteRetry={() => { retryBootstrap(); retry(); reload() }}
      onRevokeGrant={onRevokeGrant}
      onReload={reload}
      selectMainPanel={selectMainPanel}
    />
  )
}

export function RemoteRulesPanel({ persona, useTenant, useShell, sendToPersona }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
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
  const onEmptyPrimary = useCallback(async () => {
    if (scope === null) return
    await sendCoordinationPrompt(persona, scope, sendToPersona, RULES_EMPTY_PROMPT)
  }, [persona, scope, sendToPersona])
  return (
    <TriageRulesView
      {...rulesProps}
      initialState={remotePanelSurface(gate, state, data => data.rules.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry(); setReloadToken(token => token + 1) }}
      onEmptyPrimary={() => { void onEmptyPrimary() }}
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
  readonly openPersonaDm: (personaId: string) => void
  readonly openPersonaEditor: (personaId: string) => void
  readonly openTeachPersona: (personaId: string) => void
  readonly openTalkAclEditor: (personaId: string) => void
  readonly closePersonaEditor: () => void
  readonly selectMainPanel?: ((panel: MainPanelId) => void) | undefined
  readonly hooks: {
    readonly tenant: HostObservable<PersonaTenantSnapshot>
    readonly shell: HostObservable<ShellState>
  }
}

export type RemoteProfilePanelProps = InjectFace<RemoteProfilePanelInject>

export function RemoteProfilePanel({
  persona,
  useTenant,
  useShell,
  live,
  openPersonaDm,
  openPersonaEditor,
  openTeachPersona,
  openTalkAclEditor,
  closePersonaEditor,
  selectMainPanel,
}: RemoteProfilePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const profilePersonaId = useShell((state: ShellState) => state.profilePersonaId)
  const profileActorId = useTenant(tenant => tenant.scope?.actorId ?? 'owner')
  const profileEditorOpen = useShell((state: ShellState) => state.profileEditorOpen)
  const hireMode = profilePersonaId === HIRE_PERSONA_PROFILE_ID
  const showPersonaEditor = hireMode || profileEditorOpen
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
    let hostCard: PersonaCardView | null = null
    let talkAcl: TalkAclView | null = null
    const personaScope = { workspaceId, projectId, personaId: picked.id }
    if ('getPersonaCard' in persona && typeof persona.getPersonaCard === 'function') {
      try {
        hostCard = await unwrapRemote(await persona.getPersonaCard(personaScope))
      } catch {
        hostCard = null
      }
    }
    if ('getPersonaTalkAcl' in persona && typeof persona.getPersonaTalkAcl === 'function') {
      try {
        talkAcl = await unwrapRemote(await persona.getPersonaTalkAcl(personaScope))
      } catch {
        talkAcl = null
      }
    }
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
    let swapPolicy: RunnerSwapPolicy | undefined
    if (typeof persona.listConnectionAccounts === 'function') {
      try {
        const bundle = await unwrapRemote(await persona.listConnectionAccounts(scopeReq))
        swapPolicy = bundle.swapPolicy
      } catch {
        swapPolicy = undefined
      }
    }
    return {
      hireMode: false as const,
      primary: picked,
      row,
      autonomy,
      memoryRows: memoryViewsToRows(memoryViews, workspaceId, projectId),
      skillRecords: skillViewsToRecords(skillViews),
      hostCard,
      talkAcl,
      swapPolicy,
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
      projectNames: resolveProfileProjectNames(live.observable.getSnapshot(), scope?.projectId),
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
  }, [state, scope?.projectId, live])
  if (showPersonaEditor) {
    return (
      <ConnectedPersonaEditor
        dict={editorDict}
        governanceDict={governanceDict}
        persona={persona}
        useTenant={useTenant}
        useShell={useShell}
        live={live}
        onHireComplete={() => {
          closePersonaEditor()
        }}
      />
    )
  }
  if (profileSurface === 'loading') return <PersonaProfilePage initialState="loading" />
  if (profileSurface === 'error') {
    return (
      <PersonaProfilePage
        initialState="error"
        onRemoteRetry={() => { retryBootstrap(); retry() }}
      />
    )
  }
  if (state.status === 'error' || snapshot === null) {
    return (
      <PersonaProfilePage
        initialState="empty"
        onEmptyPrimary={selectMainPanel === undefined ? undefined : () => { selectMainPanel('orgChart') }}
      />
    )
  }
  const memoryRows = state.status === 'ready' && state.data !== null && state.data.hireMode === false
    ? state.data.memoryRows
    : []
  const skillRecords = state.status === 'ready' && state.data !== null && state.data.hireMode === false
    ? state.data.skillRecords
    : []
  const primaryId = state.status === 'ready' && state.data !== null && state.data.hireMode === false
    ? state.data.primary.id
    : null
  const hostCard = state.status === 'ready' && state.data !== null && state.data.hireMode === false
    ? state.data.hostCard
    : null
  const talkAcl = state.status === 'ready' && state.data !== null && state.data.hireMode === false
    ? state.data.talkAcl
    : null
  const swapPolicy = state.status === 'ready' && state.data !== null && state.data.hireMode === false
    ? state.data.swapPolicy
    : undefined
  // Skills tab: the actions that really exist. Taught skills (id `taught-…`) can be turned on, taken back to candidate and
  // shared; plain ones can only go back a version. Each handler hands back the skill as the host now has it.
  const skillAction = (skill: SkillRecord, call: (request: { workspaceId: string; projectId: string; skillId: string }) => Promise<SkillView>): Promise<SkillRecord | undefined> => {
    if (workspaceId === undefined || projectId === undefined) return Promise.reject(new Error('no-scope'))
    return call({ workspaceId, projectId, skillId: skill.id }).then(view => skillViewsToRecords([view])[0])
  }
  const skillActions: NonNullable<ComponentProps<typeof PersonaProfilePage>['skillActions']> = {
    onActivate: skill => skillAction(skill, async request => unwrapRemote(await persona.activateTaughtSkill(request))),
    onRollback: skill => (skill.origin === 'taught'
      ? skillAction(skill, async request => unwrapRemote(await persona.rollbackTaughtSkill(request)))
      : skillAction(skill, async request => unwrapRemote(await persona.rollbackSkill({ workspaceId: request.workspaceId, projectId: request.projectId, id: request.skillId })))),
    onShare: skill => skillAction(skill, async request => unwrapRemote(await persona.publishTaughtSkill({ ...request, scope: 'team', explicit: true }))),
    ...(selectMainPanel === undefined ? {} : { onReview: () => { selectMainPanel('approvals') } }),
  }
  // Memory tab: the host's own approve / edit / forget, only where the host has them. Each hands back by reloading the tab.
  const memoryWire = persona as PersonaRemoteClient & {
    approveMemory?(request: { workspaceId: string; projectId: string; id: string; authorId: string; body: string }): Promise<RemoteResult<unknown>>
    editMemory?(request: { workspaceId: string; projectId: string; id: string; authorId: string; body: string }): Promise<RemoteResult<unknown>>
    forgetMemory?(request: { workspaceId: string; projectId: string; id: string }): Promise<RemoteResult<unknown>>
  }
  const memoryActions: ComponentProps<typeof PersonaProfilePage>['memoryActions'] = workspaceId === undefined || projectId === undefined
    ? undefined
    : {
      ...(memoryWire.approveMemory === undefined ? {} : {
        onApprove: async (row) => {
          await unwrapRemote(await memoryWire.approveMemory!({ workspaceId, projectId, id: row.id, authorId: profileActorId, body: row.body }))
          retry()
        },
      }),
      ...(memoryWire.editMemory === undefined ? {} : {
        onEdit: async (row, body) => {
          await unwrapRemote(await memoryWire.editMemory!({ workspaceId, projectId, id: row.id, authorId: profileActorId, body }))
          retry()
        },
      }),
      ...(memoryWire.forgetMemory === undefined ? {} : {
        onForget: async (row) => {
          await unwrapRemote(await memoryWire.forgetMemory!({ workspaceId, projectId, id: row.id }))
          retry()
        },
      }),
    }
  const cardBase = hostCard !== null ? personaCardViewToInfo(hostCard, talkAcl ?? undefined) : undefined
  const policyLine = swapPolicy !== undefined
    ? swapPolicyCardSummaryLine(key => bindLocale(profileDict, key), swapPolicy)
    : undefined
  const card = cardBase !== undefined && policyLine !== undefined
    ? { ...cardBase, accountPolicyText: policyLine }
    : cardBase
  return (
    <PersonaProfilePage
      snapshot={snapshot}
      initialState="ready"
      memoryRows={memoryRows}
      memoryActions={memoryActions}
      skillRecords={skillRecords}
      skillActions={skillActions}
      {...(card !== undefined ? { card } : {})}
      onMessage={primaryId === null ? undefined : () => { openPersonaDm(primaryId) }}
      onEdit={primaryId === null ? undefined : () => { openPersonaEditor(primaryId) }}
      onTeach={primaryId === null ? undefined : () => { openTeachPersona(primaryId) }}
      onEditTalk={primaryId === null ? undefined : () => { openTalkAclEditor(primaryId) }}
    />
  )
}

export function RemoteMembersPanel({ persona, useTenant, useShell, openHelp }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const viewerMemberId = useTenant(t => t.scope?.actorId)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.listTeam({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const members = state.status === 'ready' ? teamToMembers(state.data, viewerMemberId) : []
  const issueInvite = useCallback(async () => {
    if (scope === null || typeof (persona as IssueInviteWire).issueInvite !== 'function') return
    await unwrapRemote(await (persona as IssueInviteWire).issueInvite({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      inviteId: crypto.randomUUID(),
      token: crypto.randomUUID(),
      role: 'member',
    }))
    retry()
  }, [persona, scope, retry])
  return (
    <MembersView
      members={members}
      initialState={remotePanelSurface(gate, state, data => data.members.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
      onInvite={() => { void issueInvite() }}
      onEmptyPrimary={() => { void issueInvite() }}
      extra={(
        <ConnectedRemoteTeamPanel
          t={(key, params) => bindLocale(membersDict, key, params)}
          remote={persona as never}
          scope={scope === null ? null : { workspaceId: scope.workspaceId, projectId: scope.projectId }}
          onOpenHelp={openHelp === undefined ? undefined : () => { openHelp('solucao-de-problemas') }}
        />
      )}
    />
  )
}

/** BYC import (BRIEFING 18) + zip wizard as advanced option. */
export function RemoteImportPanel({ persona, useTenant, useShell, selectMainPanel }: LumenRemotePanelProps): ReactNode {
  const { scope } = useRemoteProjectScope(useTenant, useShell)
  const actorId = useTenant(tenant => tenant.scope?.actorId ?? 'owner')
  return (
    <BringContextImportPage
      persona={persona}
      scope={scope}
      actorId={actorId}
      {...(selectMainPanel === undefined ? {} : { onOpenVault: () => { selectMainPanel('knowledge') } })}
    />
  )
}

export function RemoteCanvasPanel({ persona, useTenant, useShell, selectMainPanel }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
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
      onEmptyPrimary={selectMainPanel === undefined ? undefined : () => { selectMainPanel('projects') }}
      // Enter on a list row opens the object where it lives (persona → Mensagens diretas, tarefa → Quadros…).
      onOpenNode={selectMainPanel === undefined ? undefined : (node) => { selectMainPanel(CANVAS_OPEN_PANEL[node.kind]) }}
    />
  )
}

/** Standalone Revisar panel (ticket id required). Kanban uses {@link KanbanReviewSheet}. */
export function RemoteReviewDeliveryPanel(props: LumenRemotePanelProps & {
  readonly ticketId?: string
  readonly taskTitle?: string
}): ReactNode {
  const { scope } = useRemoteProjectScope(props.useTenant, props.useShell)
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
