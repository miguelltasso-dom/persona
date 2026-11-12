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
  WindowReserveView,
  EmailConnectionTestView,
  EmailConnectionView,
  EmailFilterView,
  EmailPresetView,
} from '@deepseek-ai/dsh-persona-host/types'
import { ApprovalsInbox, type ApprovalRememberChoice } from '../approvals/ApprovalsInbox.tsx'
import type { ActionDecision } from '../chat/ActionPreviewCard.tsx'
import type { ApprovalItem } from '../approvals/mock-data.ts'
import { SecondBrainShell } from '../second-brain/SecondBrainShell.tsx'
import { ConnectionsView, type PolicyPersona } from '../connections/ConnectionsView.tsx'
import { FilesView } from '../files/FilesView.tsx'
import type { FileEntry } from '../files/mock-data.ts'
import { KnowledgeVault } from '../knowledge/KnowledgeVault.tsx'
import { RoutinesView, type RoutineActions, type RoutineRow } from '../routines/RoutinesView.tsx'
import type { EditorPersona, EditorProject, EventOption } from '../routines/RoutineEditorModal.tsx'
import { EVENT_SOURCES, readEventWire, type EventSourceId, type RoutineEventWire } from '../routines/routine-trigger.ts'
import { routineNameFromPrompt, type RoutineScheduleWire, type RoutineWire } from '../routines/routine-wire.ts'
import { UsageLimits } from '../usage/UsageLimits.tsx'
import { EmailRuleForm, type EmailCredentialInput } from '../email-rule/EmailRuleForm.tsx'
import { TriageRulesView, type HouseLockKind, type HouseLockUi } from '../rules/TriageRulesView.tsx'
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
import type { LocalePanelProps } from '../locale/panel-dicts.ts'
import { pt as profileDict } from '../locale/profile/locales.ts'
import { pt as rulesDict } from '../locale/rules/locales.ts'
import { tasksToKanbanCards } from './adapters/kanban.ts'
import { countStaleReviews } from '../kanban/review-stale.ts'
import { readKanbanScaleSeed } from '../kanban/kanban-scale-dev.ts'
import { mockLargeKanbanCards } from '../kanban/mock-large-kanban-cards.ts'
import { memoriesOfPersona, memoryViewsToRows } from './adapters/memory.ts'
import { skillViewsToRecords, skillsOfPersona } from './adapters/skills.ts'
import { personaImpactToUi } from './adapters/insights.ts'
import { currentUsagePeriod, usageBookToMeters } from './adapters/usage.ts'
import { officialQuotasToProviderPools, usageMetersWithoutQuotaDuplicates } from './adapters/usage-pooled.ts'
import { usagePanelToUi } from './adapters/usage-panel.ts'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
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
import { indexKeeperName, personaPortrait } from '../second-brain/brain-ui-adapters.ts'
import { companyProfileLines, companyProfileText, newCompanyBriefId } from './company-profile.ts'
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
import type { ProjectLimitsView, QuietWindowView, RuleKindsView, TriageRuleView } from '@deepseek-ai/dsh-persona-host/types'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellState } from '../shell/create-shell-store.ts'
import { HIRE_PERSONA_PROFILE_ID, type MainPanelId } from '../shell/create-shell-store.ts'
import { resolveProfileProjectNames } from '../profile/resolve-profile-project-names.ts'
import { personaCardViewToInfo } from '../profile/map-persona-card-view.ts'
import type { PersonaCardView, PlaybookNoteView, SkillView, TalkAclView } from '@deepseek-ai/dsh-persona-host/types'
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
import { useProjectName } from './use-project-name.ts'
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
/** Item 26: the Cofre slot each event source reads (`connectorSecretState`): a routine only listens to what the person connected. */
const EVENT_PROVIDER: Readonly<Record<EventSourceId, string>> = { email: 'imap', telegram: 'telegram', slack: 'slack', discord: 'discord', calendar: 'caldav' }
const FILES_EMPTY_PROMPT = 'Preciso de uma entrega de arquivo para este projeto — o que você sugere?'

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
    // P1-10: what the host says about it (never guessed): the lock kind it obeys, and whether it obeys the rule at all.
    ...(rule.kind === undefined ? {} : { kind: rule.kind }),
    ...(rule.enforced === undefined ? {} : { enforced: rule.enforced }),
  }))
}

/** The lock card: one switch per kind the host obeys (`getRuleKinds`), on when a saved rule of that kind exists, with what it really held back. */
function houseLocksFromHost(kinds: readonly { readonly kind: HouseLockKind }[], rules: readonly TriageRuleView[]): readonly HouseLockUi[] {
  return kinds.map(({ kind }) => {
    const rule = rules.find(row => row.kind === kind)
    const applied = rule?.applied === undefined ? undefined : { thisWeek: rule.applied.thisWeek, lastWhat: rule.applied.lastWhat }
    // Muse 07:07: paying and deleting ALWAYS ask (D-084, item 5): their lock is shown on and cannot be switched off (the host would let it be saved off, and it would change nothing).
    const locked = kind === 'never-spend' || kind === 'never-delete'
    return { kind, on: rule !== undefined, ...(locked ? { locked: true as const } : {}), ...(applied === undefined ? {} : { applied }) }
  })
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
  // Quadros, regra 4 (Keel 06:07): the cards in review and when each one entered it (`BoardCardView.inReviewSince`), from this project's board.
  const loadBoard = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.getProjectBoard({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const { state: boardState } = usePersonaRemoteLoad(scope !== null, `${loadKey}:board:${reloadToken}`, loadBoard)
  const staleReviewCount = boardState.status === 'ready' ? countStaleReviews(boardState.data.cards, Date.now()) : 0
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
      staleReviewCount={staleReviewCount}
      onMutate={() => { setReloadToken(token => token + 1) }}
      onRemoteRetry={onRemoteRetry}
    />
  )
}

/** The documents and records of the company. Alone it is a screen; with `embedded` it is the section at the bottom of Páginas. */
export function RemoteKnowledgePanel({ persona, useTenant, useShell, selectMainPanel, embedded = false }: LumenRemotePanelProps & { readonly embedded?: boolean }): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
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
  return (
    <KnowledgeVault
      embedded={embedded}
      records={records}
      documents={documents}
      initialState={remotePanelSurface(gate, state, data => data.records.length === 0 && data.documents.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
      onOpenImport={selectMainPanel === undefined ? undefined : () => { selectMainPanel('importers') }}
      onUploadDocument={persona.ingestVaultDocument === undefined ? undefined : onUploadDocument}
      onReplaceDocument={persona.replaceVaultDocument === undefined ? undefined : onReplaceDocument}
      onDeleteDocument={persona.deleteVaultDocument === undefined ? undefined : onDeleteDocument}
    />
  )
}

export function RemoteFilesPanel({ persona, useTenant, useShell, sendToPersona }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap, workspaceOverrideProjectId } = useRemoteProjectScope(useTenant, useShell)
  // The tabs of the Projetos place are of the project of the moment: the screen says which one by NAME, never by id.
  const projectName = useProjectName(persona, scope, workspaceOverrideProjectId)
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
      scopeProjectName={projectName}
      onChooseProjectRoot={onChooseProjectRoot}
      onRemoteRetry={() => { retryBootstrap(); retry(); setReloadToken(token => token + 1) }}
      onEmptyPrimary={() => { void onEmptyPrimary() }}
    />
  )
}

/** Rotinas (Equipe › Rotinas, DESIGN-01 #10): the routines of the WHOLE team, so the workspace's own project, never the Projetos place's project of the moment. */
export function RemoteRoutinesPanel({ persona, useTenant, sendToPersona, selectMainPanel }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const schedules = await unwrapRemote(await persona.listRoutineSchedule({ workspaceId, projectId }))
    // A persona's daily routine is named after its id (`initiative:<id>`): read the team once to show a person's name.
    let team: readonly NamedPersona[] = []
    let faces: readonly EditorPersona[] = []
    try {
      const rows = await unwrapRemote(await persona.listPersonas({ workspaceId, projectId }))
      team = rows.map(row => ({ id: row.id, name: row.name }))
      // The same read gives the faces for "Quem faz" (IV-9): nothing extra to load.
      faces = rows.map(row => ({ id: row.id, name: row.name, avatarSrc: personaPortrait(row) }))
    } catch {
      /* names only: the neutral label is used when the team cannot be read */
    }
    let projects: readonly EditorProject[] = [{ id: projectId, name: projectId }]
    const projectWire = persona as PersonaRemoteClient & { listProjects?(request: ProjectScopeRequest): Promise<RemoteResult<readonly { id: string; name: string }[]>> }
    if (projectWire.listProjects !== undefined) {
      try {
        const rows = await unwrapRemote(await projectWire.listProjects({ workspaceId, projectId }))
        if (rows.length > 0) projects = rows.map(row => ({ id: row.id, name: row.name }))
      } catch { /* only the current project is offered */ }
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
      faces,
      projects,
    }
  }, [persona, workspaceId, projectId])
  // Item 26: which sources are connected (a routine only listens to what the person connected: the credential is in the Cofre). Nothing secret comes back, only "there is one".
  const [connected, setConnected] = useState<Readonly<Record<EventSourceId, boolean>> | null>(null)
  useEffect(() => {
    if (workspaceId === undefined || projectId === undefined) return undefined
    const stateWire = persona as PersonaRemoteClient & { connectorSecretState?(request: { workspaceId: string; projectId: string; provider: string }): Promise<RemoteResult<{ readonly hasSecret: boolean }>> }
    if (typeof stateWire.connectorSecretState !== 'function') return undefined
    const live = { current: true }
    void (async () => {
      const entries = await Promise.all(EVENT_SOURCES.map(async (source) => {
        try {
          const state = await unwrapRemote(await stateWire.connectorSecretState({ workspaceId, projectId, provider: EVENT_PROVIDER[source] }))
          return [source, state.hasSecret] as const
        } catch {
          return [source, false] as const
        }
      }))
      if (live.current) setConnected(Object.fromEntries(entries) as Record<EventSourceId, boolean>)
    })()
    return () => { live.current = false }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  const schedules = state.status === 'ready' ? state.data.schedules : []
  const routineWire = persona as PersonaRemoteClient & RoutineWire
  const faces = state.status === 'ready' ? state.data.faces : []
  const routineRows: readonly RoutineRow[] = schedules.map((schedule: RoutineScheduleWire) => {
    const owner = faces.find(face => face.id === schedule.ownerPersonaId)
    return {
      id: schedule.id,
      name: schedule.name,
      // An older host sends no prompt/humanSchedule/system: every one is optional on the row.
      prompt: schedule.prompt ?? '',
      rrule: schedule.rrule,
      ownerPersonaId: schedule.ownerPersonaId,
      ownerName: owner?.name,
      ownerAvatarSrc: owner?.avatarSrc,
      projectId: schedule.projectId,
      paused: schedule.paused,
      humanSchedule: schedule.humanSchedule,
      system: schedule.system === true,
      timeZone: schedule.timeZone,
      catchUp: schedule.catchUp,
      silenceStart: schedule.silenceStart,
      silenceEnd: schedule.silenceEnd,
      trigger: readEventWire(schedule.trigger),
    }
  })
  // A new routine takes the person's zone, "skip" and no quiet window; a restored one brings back what it had (the host
  // keeps zone, catch-up and quiet window on the schedule row, and createRoutine accepts them all).
  const createRoutineFrom = useCallback(async (request: {
    id: string
    projectId: string
    prompt: string
    rrule: string
    ownerPersonaId?: string | undefined
    name?: string | undefined
    timeZone?: string | undefined
    catchUp?: 'skip' | 'run_once' | 'run_all' | undefined
    silenceStart?: string | undefined
    silenceEnd?: string | undefined
    /** Item 26: the event it waits for (then `rrule` is ignored by the host). */
    trigger?: RoutineEventWire | undefined
  }) => {
    if (workspaceId === undefined) return
    await unwrapRemote(await routineWire.createRoutine({
      workspaceId,
      projectId: request.projectId,
      id: request.id,
      name: request.name ?? routineNameFromPrompt(request.prompt),
      rrule: request.rrule,
      timeZone: request.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      catchUp: request.catchUp ?? 'skip',
      silenceStart: request.silenceStart ?? '',
      silenceEnd: request.silenceEnd ?? '',
      prompt: request.prompt,
      ...(request.ownerPersonaId === undefined ? {} : { ownerPersonaId: request.ownerPersonaId }),
      ...(request.trigger === undefined ? {} : { trigger: request.trigger }),
    }))
  }, [routineWire, workspaceId])
  // Item 26: one entry per source, with whether its connector is on (the editor offers a trigger only for what the person connected).
  const eventOptions: readonly EventOption[] | undefined = connected === null ? undefined : EVENT_SOURCES.map(source => ({ source, connected: connected[source] }))
  const routineActions: RoutineActions | undefined = workspaceId === undefined || projectId === undefined || typeof routineWire.createRoutine !== 'function'
    ? undefined
    : {
      personas: faces,
      projects: state.status === 'ready' ? state.data.projects : [{ id: projectId, name: projectId }],
      defaultProjectId: projectId,
      canEdit: typeof routineWire.updateRoutine === 'function',
      ...(eventOptions === undefined ? {} : { eventOptions }),
      ...(selectMainPanel === undefined ? {} : { onOpenConnections: () => { selectMainPanel('connections') } }),
      onSave: async (saved) => {
        if (saved.id === undefined) {
          await createRoutineFrom({
            id: `routine-${randomUUID()}`, projectId: saved.projectId, prompt: saved.prompt, rrule: saved.rrule, ownerPersonaId: saved.ownerPersonaId, trigger: saved.trigger,
          })
        } else if (routineWire.updateRoutine !== undefined) {
          await unwrapRemote(await routineWire.updateRoutine({
            workspaceId,
            projectId: saved.projectId,
            id: saved.id,
            name: routineNameFromPrompt(saved.prompt),
            prompt: saved.prompt,
            // The trigger is said ALWAYS on an edit: an event, or `schedule` (leaving an event needs its time, which `rrule` carries).
            trigger: saved.trigger ?? { kind: 'schedule' },
            ...(saved.trigger === undefined ? { rrule: saved.rrule } : {}),
            ...(saved.ownerPersonaId === undefined ? {} : { ownerPersonaId: saved.ownerPersonaId }),
          }))
        }
        retry()
      },
      onTogglePause: typeof routineWire.pauseRoutine === 'function'
        ? async (row, paused) => {
          await unwrapRemote(await routineWire.pauseRoutine({ workspaceId, projectId: row.projectId, id: row.id, paused }))
          retry()
        }
        : undefined,
      onDelete: typeof routineWire.deleteRoutine === 'function'
        ? async (row) => {
          await unwrapRemote(await routineWire.deleteRoutine!({ workspaceId, projectId: row.projectId, id: row.id }))
          retry()
        }
        : undefined,
      // "Desfazer" brings the routine back under the same id and with the same fields (the host accepts a deleted id).
      onRestore: typeof routineWire.deleteRoutine === 'function'
        ? async (row) => {
          await createRoutineFrom({
            id: row.id,
            projectId: row.projectId,
            name: row.name,
            prompt: row.prompt.length > 0 ? row.prompt : row.name,
            rrule: row.rrule,
            ownerPersonaId: row.ownerPersonaId,
            timeZone: row.timeZone,
            catchUp: row.catchUp,
            silenceStart: row.silenceStart,
            silenceEnd: row.silenceEnd,
            trigger: row.trigger, // an event routine comes back as an event (its `rrule` is not a time)
          })
          if (row.paused && typeof routineWire.pauseRoutine === 'function') {
            await unwrapRemote(await routineWire.pauseRoutine({ workspaceId, projectId: row.projectId, id: row.id, paused: true }))
          }
          retry()
        }
        : undefined,
    }
  const routineRuns = routineScheduleToRuns(schedules)
  const derivedQuiet = routineScheduleToQuiet(schedules)
  const savedQuiet = state.status === 'ready'
    ? state.data.saved.map(row => ({ id: `host-${row.id}`, label: row.label, range: `${row.start} – ${row.end}` }))
    : []
  const quietWindows = [...derivedQuiet.filter(row => !savedQuiet.some(saved => saved.range === row.range)), ...savedQuiet]
  const putQuiet = (persona as PersonaRemoteClient & { putQuietWindow?(request: { workspaceId: string; projectId: string; id: string; label: string; start: string; end: string }): Promise<RemoteResult<unknown>> }).putQuietWindow
  const onAddQuietWindow = useCallback(async (window: { readonly label: string; readonly start: string; readonly end: string }) => {
    if (workspaceId === undefined || projectId === undefined || putQuiet === undefined) return
    await unwrapRemote(await putQuiet.call(persona, { workspaceId, projectId, id: `quiet-${randomUUID()}`, ...window }))
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
      initialState={remotePanelSurface(gate, state, data => data.schedules.length === 0)}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
      onAskSuggestions={() => { void onAskSuggestions() }}
      onAddQuietWindow={putQuiet === undefined ? undefined : onAddQuietWindow}
      routineRows={routineRows}
      actions={routineActions}
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
    const [usage, quotas, insights, tokenPanelRaw, personaNames, reserve] = await Promise.all([
      unwrapRemote(await screens.getUsage({ ...scopeReq, period })),
      loadOfficialQuotasByAccount(persona, scopeReq),
      loadLocalInsights(persona, scopeReq),
      loadUsagePanelRemote(persona, { ...scopeReq, period }),
      loadPersonaNames(persona, scopeReq),
      screens.getWindowReserve === undefined ? Promise.resolve(null) : screens.getWindowReserve(scopeReq).then(unwrapRemote),
    ])
    return { usage, quotas, insights, tokenPanelRaw, personaNames, reserve }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, remoteScopeKey(scope), load)
  // “Continuar agora” swaps the reserve in place; a new load (or another scope) drops the local answer.
  const [reserveAfterContinue, setReserveAfterContinue] = useState<WindowReserveView | null>(null)
  useEffect(() => { setReserveAfterContinue(null) }, [state])
  const windowReserve = reserveAfterContinue ?? (state.status === 'ready' ? state.data.reserve : null)
  const onContinueWindow = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) return
    const screens = personaScreensRemote(persona)
    if (screens.continueWindowNow === undefined) return
    try {
      setReserveAfterContinue(await unwrapRemote(await screens.continueWindowNow({ workspaceId, projectId })))
    } catch {
      // Never silent: re-read the host, which shows the error surface if it is unreachable.
      retryBootstrap()
      retry()
    }
  }, [persona, workspaceId, projectId, retryBootstrap, retry])
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
      windowReserve={windowReserve}
      onContinueWindow={() => { void onContinueWindow() }}
      showLimitNotice={false}
      insightsFunnel={insightsPayload?.funnel ?? null}
      insightsImpacts={insightsImpacts}
      initialState={remotePanelSurface(gate, state, data =>
        data.tokenPanelRaw === null
        && data.insights === null
        && usageBookToMeters(data.usage, data.quotas).length === 0
        && (data.reserve === null || data.reserve.state === 'ok'))}
      onRemoteRetry={() => { retryBootstrap(); retry() }}
      onEmptyPrimary={selectMainPanel === undefined ? undefined : () => { selectMainPanel('connections') }}
    />
  )
}

export function RemoteConnectionsPanel({ persona, useTenant, useShell, selectMainPanel, openHelp, dicts }: LumenRemotePanelProps & LocalePanelProps): ReactNode {
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
  // Harvest 19b: the inbox rule and the provider presets (absent when the host predates them).
  const [emailRule, setEmailRule] = useState<{ readonly presets: readonly EmailPresetView[]; readonly filter: EmailFilterView } | null>(null)
  useEffect(() => {
    if (workspaceId === undefined || projectId === undefined) return undefined
    let alive = true
    void (async () => {
      try {
        const [presets, filter] = await Promise.all([
          persona.listEmailPresets().then(unwrapRemote),
          persona.getEmailFilter({ workspaceId, projectId }).then(unwrapRemote),
        ])
        if (alive) setEmailRule({ presets, filter })
      } catch {
        if (alive) setEmailRule(null)
      }
    })()
    return () => { alive = false }
  }, [persona, workspaceId, projectId])
  const saveEmailRule = useCallback(async (filter: EmailFilterView) => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const saved = await unwrapRemote(await persona.putEmailFilter({ workspaceId, projectId, filter }))
    setEmailRule(current => current === null ? null : { ...current, filter: saved })
  }, [persona, workspaceId, projectId])
  // Harvest 19b: the mailbox account (never its password) and the read-only login test behind "Testar conexão". Absent when the host predates them.
  const [emailConnection, setEmailConnection] = useState<EmailConnectionView | undefined>(undefined)
  useEffect(() => {
    if (workspaceId === undefined || projectId === undefined) return undefined
    let alive = true
    void (async () => {
      try {
        const view = await persona.getEmailConnection({ workspaceId, projectId }).then(unwrapRemote)
        if (alive) setEmailConnection(view)
      } catch {
        if (alive) setEmailConnection(undefined)
      }
    })()
    return () => { alive = false }
  }, [persona, workspaceId, projectId])
  const testEmailConnection = useCallback(async (input: Partial<EmailCredentialInput>): Promise<EmailConnectionTestView> => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.testEmailConnection({ workspaceId, projectId, ...input }))
  }, [persona, workspaceId, projectId])
  // The password goes to the Cofre in `connector:imap` (the slot the poller reads) and is never read back: the screen asks the host for the account state again.
  const saveEmailCredential = useCallback(async (input: EmailCredentialInput): Promise<void> => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const secret = JSON.stringify({ host: input.host, user: input.user, password: input.password, port: input.port, secure: input.secure })
    await unwrapRemote(await persona.saveConnectorSecret({ workspaceId, projectId, provider: 'imap', secret }))
    setEmailConnection(await persona.getEmailConnection({ workspaceId, projectId }).then(unwrapRemote))
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
      emailRule={emailRule === null ? undefined : (
        <EmailRuleForm
          dict={dicts?.emailRule}
          presets={emailRule.presets}
          filter={emailRule.filter}
          onSave={saveEmailRule}
          connection={emailConnection}
          onTest={emailConnection === undefined ? undefined : testEmailConnection}
          onSaveCredential={emailConnection === undefined ? undefined : saveEmailCredential}
        />
      )}
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
    kind: 'hire' | 'vault' | 'skill' | 'attention' | 'connector' | 'action',
    accept: boolean,
    remember?: ApprovalRememberChoice,
    brain?: ApprovalItem['brain'],
    connectorChoice?: 'once' | 'always' | 'not-now',
  ): Promise<void> => {
    if (scope === null) return
    const scopeReq = { workspaceId: scope.workspaceId, projectId: scope.projectId }
    // `kind: 'connector'` and `choice` are newer than the host types (contracts/team-real.md §9): sent as data.
    await unwrapRemote(await persona.decideApproval({
      ...scopeReq,
      id,
      kind,
      accept,
      ...(connectorChoice === undefined ? {} : { choice: connectorChoice }),
    } as Parameters<typeof persona.decideApproval>[0]))
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
  /** P0-10: o cartão de ação externa ("Segure para enviar" · Editar · Cancelar) decide direto no host (`kind: 'action'`); sem isto o cartão era só leitura, sem botão. */
  const decideAction = async (decision: ActionDecision): Promise<void> => {
    if (scope === null) return
    try {
      await unwrapRemote(await persona.decideApproval({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        kind: 'action',
        id: decision.approvalId,
        choice: decision.choice,
        ...(decision.edited === undefined ? {} : { edited: decision.edited }),
        ...(decision.remember === true ? { remember: true } : {}),
      } as unknown as Parameters<typeof persona.decideApproval>[0]))
    } catch (error) {
      // A recusa do host chega ao cartão com as palavras do host (`hostMessage`, como o `PersonaRemoteError`): o cartão a mostra e deixa tentar de novo.
      const message = error instanceof Error ? error.message : ''
      throw Object.assign(error instanceof Error ? error : new Error(message), { hostMessage: message })
    }
    reload()
  }
  return (
    <ApprovalsInbox
      items={items}
      proactiveSummaries={proactiveSummaries}
      focusId={shell.focusedApprovalId ?? undefined}
      initialState={remotePanelSurface(gate, state, () => inboxEmpty)}
      onDecideAction={decideAction}
      onRemoteRetry={() => { retryBootstrap(); retry(); reload() }}
      onDecideItem={(item, accept, remember) => {
        if (item.kind === 'connector') { void decide(item.id, item.kind, accept, undefined, undefined, accept ? 'once' : 'not-now'); return }
        void decide(item.id, item.kind, accept, remember, item.brain)
      }}
      onDecideConnector={(item, choice) => { void decide(item.id, item.kind, choice !== 'not-now', undefined, undefined, choice) }}
      onDecideProactive={(proposal, accept) => {
        if (proposal.approvalKind === undefined) return
        void decide(proposal.id, proposal.approvalKind, accept)
      }}
    />
  )
}

/** The Memória da empresa: the Resumo (default) or, with `view="pages"`, the Páginas tab (its `footer` holds the documents). */
export function RemoteSecondBrainPanel({ persona, useTenant, useShell, selectMainPanel, view = 'summary', footer }: LumenRemotePanelProps & {
  readonly view?: 'summary' | 'pages'
  readonly footer?: ReactNode
}): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const actorId = useTenant(tenant => tenant.scope?.actorId ?? 'owner')
  const [reloadToken, setReloadToken] = useState(0)
  const loadKey = `${remoteScopeKey(scope)}:second-brain:${reloadToken}`
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async () => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const scopeReq = { workspaceId, projectId }
    const [home, personas, pages, grants, profile] = await Promise.all([
      loadBrainHomeRemote(persona, scopeReq),
      unwrapRemote(await persona.listPersonas(scopeReq)),
      listBrainPagesRemote(persona, scopeReq),
      listBrainPermissionsRemote(persona, scopeReq),
      // The profile is "Comece aqui" of the Resumo; a host that cannot list the Cofre simply has no profile to show.
      typeof persona.listVaultRecords === 'function'
        ? persona.listVaultRecords(scopeReq).then(result => unwrapRemote(result)).then(rows => companyProfileText(rows), () => null)
        : Promise.resolve(null),
    ])
    const personaNames = Object.fromEntries(personas.map(row => [row.id, row.name]))
    // The automatic updates are signed by the librarian, else Pesquisa, else Coordenação (none → "Atualização automática da equipe").
    const personaAvatars = Object.fromEntries(personas.flatMap((row) => {
      const src = personaPortrait(row)
      return src === undefined ? [] : [[row.id, src] as const]
    }))
    return { home, personaNames, personaAvatars, pages, grants, librarianName: indexKeeperName(personas), companyLines: companyProfileLines(profile), companyText: profile ?? '' }
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
  /** "Descrever a empresa em 3 frases": stores what was written as a new `brief` of the Cofre; a refusal reaches the dialog, which keeps the text. */
  const onSaveCompanyBrief = useCallback(async (text: string) => {
    if (scope === null) throw new Error('no-scope')
    await unwrapRemote(await persona.createVaultRecord({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      id: newCompanyBriefId(),
      kind: 'brief',
      body: text,
      authorId: actorId,
    }))
    reload()
  }, [actorId, persona, scope])
  // A profile the person wrote is content: the Resumo then shows it instead of the "empty" illustration.
  const surfaceEmpty = payload !== null
    && payload.companyLines.length === 0
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
      surfaceState={remotePanelSurface(gate, state, () => view === 'pages' ? false : surfaceEmpty)}
      onRemoteRetry={() => { retryBootstrap(); retry(); reload() }}
      onRevokeGrant={onRevokeGrant}
      onReload={reload}
      selectMainPanel={selectMainPanel}
      companyLines={payload?.companyLines ?? []}
      companyText={payload?.companyText ?? ''}
      {...(typeof persona.createVaultRecord === 'function' ? { onSaveCompanyBrief } : {})}
      view={view}
      footer={footer}
    />
  )
}

/** Memória › Páginas (panel `knowledge`): every page of the company, and the uploaded documents under the list. */
export function RemotePagesPanel(props: LumenRemotePanelProps): ReactNode {
  return <RemoteSecondBrainPanel {...props} view="pages" footer={<RemoteKnowledgePanel {...props} embedded />} />
}

export function RemoteRulesPanel({ persona, useTenant, useShell }: LumenRemotePanelProps): ReactNode {
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
    // P1-10 (HONEST-1): what the host OBEYS (`getRuleKinds`). A host that does not know the contract, or that fails to answer it, offers nothing beyond the budget and the saved
    // rules: the screen never promises what it cannot confirm.
    let kinds: RuleKindsView | undefined
    if (typeof persona.getRuleKinds === 'function') {
      try { kinds = await unwrapRemote(await persona.getRuleKinds(scopeReq)) } catch (error) { void error }
    }
    return { rules, quiet, limits, triageLog, kinds }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, loadKey, load)
  const payload = state.status === 'ready' ? state.data : null
  const kinds = payload?.kinds
  // The quiet windows are updated here once the host accepted a change (no reload: a reload shows the loading screen and would drop the editor's draft and its "Desfazer"); a fresh load wins.
  const [quietLocal, setQuietLocal] = useState<readonly QuietWindowView[] | undefined>(undefined)
  useEffect(() => { setQuietLocal(undefined) }, [payload])
  const rulesProps = payload === null
    ? { rules: [] as const, quietWindows: [] as const, triageLog: [] as const }
    : {
      rules: triageRulesFromHost(payload.rules),
      quietWindows: quietFromHost(quietLocal ?? payload.quiet),
      limits: limitsFromHost(payload.limits),
      triageLog: triageLogFromHost(payload.triageLog),
      ...(kinds === undefined ? {} : {
        obeyed: { quietWindows: kinds.quietWindow.enforced, newRules: kinds.kinds.length > 0 },
        houseLocks: houseLocksFromHost(kinds.kinds, payload.rules),
      }),
    }
  /** A lock on = a saved rule of that kind (the host obeys only a rule with `kind`; its words are the lock's own name); off = delete the rule that holds it. */
  const toggleLock = async (kind: HouseLockKind, on: boolean): Promise<void> => {
    if (scope === null) return
    const scopeReq = { workspaceId: scope.workspaceId, projectId: scope.projectId }
    if (on) {
      await unwrapRemote(await persona.putTriageRule({
        ...scopeReq,
        id: `house-${kind}`,
        gateText: bindLocale(rulesDict, `locks.${kind}`),
        assessmentText: '',
        logOnly: false,
        speculativeEnabled: false,
        kind,
      }))
    } else {
      const saved = payload?.rules.find(rule => rule.kind === kind)
      if (saved === undefined) return
      await unwrapRemote(await persona.deleteTriageRule({ ...scopeReq, id: saved.id }))
    }
    setReloadToken(token => token + 1)
  }
  /** Muse 07:07: the quiet window of the whole team (the host obeys start and end, every day): saved, or deleted (the host stops obeying at once). */
  const saveQuiet = async (item: { readonly id: string; readonly label: string; readonly start: string; readonly end: string }): Promise<void> => {
    if (scope === null) return
    // Only the four fields the host knows (the screen's own rows carry more, e.g. `days`).
    await unwrapRemote(await persona.putQuietWindow({ workspaceId: scope.workspaceId, projectId: scope.projectId, id: item.id, label: item.label, start: item.start, end: item.end }))
    setQuietLocal([...(quietLocal ?? payload?.quiet ?? []).filter(row => row.id !== item.id), { id: item.id, label: item.label, start: item.start, end: item.end }])
  }
  const deleteQuiet = async (id: string): Promise<void> => {
    if (scope === null) return
    await unwrapRemote(await persona.deleteQuietWindow({ workspaceId: scope.workspaceId, projectId: scope.projectId, id }))
    setQuietLocal((quietLocal ?? payload?.quiet ?? []).filter(row => row.id !== id))
  }
  // HONEST-1: the screen offers only what the host obeys (`getRuleKinds` → `obeyed`, the lock card, the quiet windows). Without that answer: no quiet windows, no locks.
  // An empty list is not an empty screen: the budget is always there, and the rules card says there is none.
  const canEditQuiet = kinds !== undefined && typeof persona.deleteQuietWindow === 'function'
  return (
    <TriageRulesView
      {...rulesProps}
      onToggleLock={kinds === undefined ? undefined : toggleLock}
      onSaveQuiet={canEditQuiet ? saveQuiet : undefined}
      onDeleteQuiet={canEditQuiet ? deleteQuiet : undefined}
      initialState={remotePanelSurface(gate, state, () => false)}
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
  // Item 16: "Virou skill · Ver em Skills" opens this profile on the Skills tab.
  const profileInitialTab = useShell((state: ShellState) => state.profileInitialTab ?? undefined)
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
    // Item 16, tab "Jeito de trabalhar": how she works, learned quietly. A host without it has no tab; a failure shows inside the tab, never breaks the profile.
    let playbook: { readonly rows: readonly PlaybookNoteView[]; readonly failed: boolean } | undefined
    if (screens.listPlaybook !== undefined) {
      try {
        playbook = { rows: await unwrapRemote(await screens.listPlaybook({ workspaceId, projectId, personaId: picked.id })), failed: false }
      } catch {
        playbook = { rows: [], failed: true }
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
      memoryRows: memoryViewsToRows(memoriesOfPersona(memoryViews, picked.name), workspaceId, projectId), // P1-11: not what was told to ANOTHER persona in a DM
      playbook,
      skillRecords: skillViewsToRecords(skillsOfPersona(skillViews, picked.id)),
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
  const playbook = state.status === 'ready' && state.data !== null && state.data.hireMode === false
    ? state.data.playbook
    : undefined
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
    onRollback: skill => (skill.origin !== undefined // taught or learned (P1-11): "Desativar" goes back to candidate; a plain skill goes back a version
      ? skillAction(skill, async request => unwrapRemote(await persona.rollbackTaughtSkill(request)))
      : skillAction(skill, async request => unwrapRemote(await persona.rollbackSkill({ workspaceId: request.workspaceId, projectId: request.projectId, id: request.skillId })))),
    onShare: skill => skillAction(skill, async request => unwrapRemote(await persona.publishTaughtSkill({ ...request, scope: 'team', explicit: true }))),
    ...(selectMainPanel === undefined ? {} : { onReview: () => { selectMainPanel('approvals') } }),
  }
  // Memory tab: the host's own approve / edit / forget, only where the host has them. Each hands back by reloading the tab.
  const screensWire = personaScreensRemote(persona)
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
  // Playbook tab: "Esquecer" is the host's own; "Virar skill?" is decided in Aprovações (Muse §16b), so the card only links there.
  const playbookActions: ComponentProps<typeof PersonaProfilePage>['playbookActions'] = workspaceId === undefined || projectId === undefined
    ? undefined
    : {
      ...(screensWire.forgetPlaybook === undefined ? {} : {
        onForget: async (row) => {
          await unwrapRemote(await screensWire.forgetPlaybook!({ workspaceId, projectId, id: row.id }))
          retry()
        },
      }),
      ...(selectMainPanel === undefined ? {} : { onDecide: () => { selectMainPanel('approvals') } }),
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
      {...(profileInitialTab === undefined ? {} : { initialTab: profileInitialTab })}
      {...(playbook === undefined ? {} : {
        playbookRows: playbook.rows,
        playbookState: playbook.failed ? 'error' as const : 'ready' as const,
        playbookActions,
        onPlaybookRetry: () => { retryBootstrap(); retry() },
      })}
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
      inviteId: randomUUID(),
      token: randomUUID(),
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
