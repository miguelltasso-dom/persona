import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { AwayEventLive, ChannelMessageUi } from './map-host-ui.ts'
import { mapAwayEventLive, mapMessage, mapPersonaNowRow, mapTeamToStrip } from './map-host-ui.ts'
import { bootstrapPersonaTenant, hostReportsFirstUse, type TenantBootstrapRemote } from './bootstrap-tenant.ts'
import { shouldWriteCacheComplete } from './onboarding-host.ts'
import {
  galleryRefForRosterPerson,
  seedDevHarnessScenario,
  type DevHarnessSeedRemote,
  type OnboardingRosterPerson,
} from './seed-default-team.ts'
import { writeOnboardingCacheComplete } from '../shell/onboarding-persistence.ts'
import { applyMessageStreamFrame, type MessageStreamFrame } from './apply-message-stream.ts'
import { mapTaskToKanbanCard } from './map-host-ui.ts'
import type { KanbanCardModel } from '../kanban/types.ts'
import { passThroughFollowers } from './derive-pass-through.ts'
import { mapDmList, type DmListItemUi } from './map-dm-list.ts'
import type { TurnContextUi } from './turn-context-ui.ts'
import type { DmView, OverviewView as HostOverviewView, PersonaTenantScope, TeamView } from './persona-remote-types.ts'
import type { PersonaNowSnapshot } from '../team/persona-work-state.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import type { AutonomyLevel } from '../persona-editor/persona-draft.ts'
import { patchAutonomyMode } from '../persona-editor/autonomy-map.ts'
import { unwrapPersonaRemote } from './persona-remote-unwrap.ts'

export interface PersonaLiveSnapshot {
  readonly ready: boolean
  readonly tenant: PersonaTenantScope | null
  readonly team: TeamView | null
  readonly nowRows: readonly PersonaNowSnapshot[]
  readonly stripMembers: readonly ChannelPersonaMember[]
  readonly awayEvents: readonly AwayEventLive[]
  readonly attentionTitles: readonly string[]
  readonly messages: readonly ChannelMessageUi[]
  readonly passThroughFollowers: readonly { readonly name: string }[]
  readonly dms: readonly DmListItemUi[]
  readonly selectedDmId: string | null
  readonly dmMessages: readonly ChannelMessageUi[]
  readonly projects: readonly { id: string; name: string; kind: string }[]
  readonly kanbanCards: readonly KanbanCardModel[]
  readonly dmUnreadByPersonaId: Readonly<Record<string, number>>
  /** First actionable task for post-onboarding / overview card (C8). */
  readonly suggestedTask: { readonly id: string; readonly title: string } | null
  readonly turnContext: TurnContextUi | null
  readonly error: string | null
}

const EMPTY: PersonaLiveSnapshot = {
  ready: false,
  tenant: null,
  team: null,
  nowRows: [],
  stripMembers: [],
  awayEvents: [],
  attentionTitles: [],
  messages: [],
  passThroughFollowers: [],
  dms: [],
  selectedDmId: null,
  dmMessages: [],
  projects: [],
  kanbanCards: [],
  dmUnreadByPersonaId: {},
  suggestedTask: null,
  turnContext: null,
  error: null,
}

/** Host-backed snapshot for shell panels (production path). */
export interface PersonaLiveStore {
  readonly observable: HostObservable<PersonaLiveSnapshot>
  bootstrap(onFirstUse: (firstUse: boolean) => void): Promise<void>
  runDevHarnessSeedIfEnabled(): Promise<void>
  refresh(): Promise<void>
  postChannelMessage(body: string): Promise<void>
  selectDm(dmId: string | null): Promise<void>
  openPersonaDm(personaId: string): Promise<void>
  loadTurnContext(ticketId: string): Promise<void>
  postDmMessage(body: string): Promise<void>
  commitOnboardingRoster(
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
  ): Promise<void>
  completeOnboarding(
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
  ): Promise<void>
  setPersonaAutonomyLevel(personaId: string, level: AutonomyLevel): Promise<void>
}

type PersonaRemote = Omit<TenantBootstrapRemote, 'listProjects'> & {
  ping(): unknown
  getOverviewNow(request: PersonaTenantScope): { personas: readonly import('./persona-remote-types.ts').PersonaNowView[] }
  getWhileAway(request: PersonaTenantScope): { events: readonly import('./persona-remote-types.ts').AwayEventView[] }
  getOverview(request: PersonaTenantScope): HostOverviewView
  listTeam(request: PersonaTenantScope): TeamView
  listProjects(request: PersonaTenantScope): readonly { id: string; name: string; kind: string }[]
  listTasks(request: PersonaTenantScope): readonly import('./persona-remote-types.ts').TaskView[]
  listApprovals?(request: PersonaTenantScope): readonly { readonly title: string; readonly status: string }[]
  listDms?(request: PersonaTenantScope): readonly DmView[]
  createDm?(request: {
    id: string
    workspaceId: string
    projectId: string
    participantA: string
    participantB: string
  }): unknown
  listMessages(request: {
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    actorId: string
    afterSeq: number
    limit: number
  }): { events: readonly import('./persona-remote-types.ts').MessageView[] }
  followMessages?(
    request: {
      workspaceId: string
      projectId: string
      streamKind: 'channel' | 'dm'
      ownerId: string
      actorId: string
      afterSeq: number
      limit: number
    },
    signal: AbortSignal,
  ): AsyncIterable<MessageStreamFrame>
  postMessage(request: {
    id: string
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    actorId: string
    subjectId: string
    body: string
  }): unknown
  createPersona(request: {
    workspaceId: string
    projectId: string
    id: string
    name: string
    title: string
    description: string
    personality: string
    instructions: string
    avatarKind: 'gallery'
    avatarRef: string
    runnerKind: 'dsh'
    runnerCli: string
    runnerModel: string
    canRecruit: boolean
    createdBy: string
    systemRoles?: readonly ('coordination' | 'watchdog')[]
  }): unknown
  markVisit(request: PersonaTenantScope): boolean
  createMember(request: {
    id: string
    workspaceId: string
    projectId: string
    displayName: string
    handle: string
    role: 'owner'
  }): unknown
  getTurnContext?(request: {
    workspaceId: string
    projectId: string
    ticketId: string
    command: 'stop'
    reason: string
  }): { ticketId: string; title: string; triggerIds: readonly string[] }
  getAutonomy?(request: {
    workspaceId: string
    projectId: string
    personaId: string
  }): {
    workspaceId: string
    projectId: string
    personaId: string
    mode: 'asked' | 'propose' | 'act'
    proposalBudget: number
    tokenBudget: number
    executionBudget: number
    silenceStart: string
    silenceEnd: string
  }
  setAutonomy?(request: {
    workspaceId: string
    projectId: string
    personaId: string
    mode: 'asked' | 'propose' | 'act'
    proposalBudget: number
    tokenBudget: number
    executionBudget: number
    silenceStart: string
    silenceEnd: string
  }): {
    workspaceId: string
    projectId: string
    personaId: string
    mode: 'asked' | 'propose' | 'act'
    proposalBudget: number
    tokenBudget: number
    executionBudget: number
    silenceStart: string
    silenceEnd: string
  }
  completeOnboarding?(request: {
    workspaceId: string
    projectId: string
    memberId: string
    displayName: string
    roster: readonly OnboardingRosterPerson[]
  }): unknown
}

function slugId(name: string, index: number): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'persona'
  return `${base}-${index}`
}

export function createPersonaLiveStore(rawRemote: PersonaRemote): PersonaLiveStore {
  // Every Remote method resolves to RemoteResult; unwrap once here so bootstrap/refresh/seed see raw values (Keel P0).
  const remote = unwrapPersonaRemote(rawRemote)
  const store = createSnapshotStore<PersonaLiveSnapshot>(EMPTY)
  let tenant: PersonaTenantScope | null = null
  let messageStreamAbort: AbortController | null = null
  let dmStreamAbort: AbortController | null = null

  const stopMessageStream = (): void => {
    messageStreamAbort?.abort()
    messageStreamAbort = null
  }

  const stopDmStream = (): void => {
    dmStreamAbort?.abort()
    dmStreamAbort = null
  }

  const followStream = (
    streamKind: 'channel' | 'dm',
    ownerId: string,
    apply: (snap: PersonaLiveSnapshot, frame: MessageStreamFrame) => PersonaLiveSnapshot,
    setAbort: (ac: AbortController | null) => void,
  ): void => {
    if (tenant === null || remote.followMessages === undefined) return
    const scope = tenant
    const ac = new AbortController()
    setAbort(ac)
    void (async () => {
      try {
        const stream = remote.followMessages!({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          streamKind,
          ownerId,
          actorId: scope.memberId,
          afterSeq: 0,
          limit: 200,
        }, ac.signal)
        for await (const frame of stream) {
          if (ac.signal.aborted) break
          const snap = store.getSnapshot()
          if (snap.team === null) continue
          store.set(apply(snap, frame))
        }
      } catch {
        /* stream closed */
      }
    })()
  }

  const startMessageStream = (): void => {
    stopMessageStream()
    if (tenant === null) return
    const memberId = tenant.memberId
    followStream('channel', tenant.channelId, (snap, frame) => {
      if (snap.team === null) return snap
      const taskTitleById = new Map(snap.kanbanCards.map(card => [card.id, card.title]))
      return {
        ...snap,
        messages: applyMessageStreamFrame(snap.messages, frame, snap.team, memberId, taskTitleById),
      }
    }, (ac) => { messageStreamAbort = ac })
  }

  const startDmStream = (dmId: string): void => {
    stopDmStream()
    if (tenant === null) return
    const memberId = tenant.memberId
    followStream('dm', dmId, (snap, frame) => {
      if (snap.team === null) return snap
      const taskTitleById = new Map(snap.kanbanCards.map(card => [card.id, card.title]))
      return {
        ...snap,
        dmMessages: applyMessageStreamFrame(snap.dmMessages, frame, snap.team, memberId, taskTitleById),
      }
    }, (ac) => { dmStreamAbort = ac })
  }

  const refresh = async (): Promise<void> => {
    if (tenant === null) return
    try {
      const scope = tenant
      const prior = store.getSnapshot()
      const [now, away, overview, team, projects, tasks, page, dmRows] = await Promise.all([
        Promise.resolve(remote.getOverviewNow(scope)),
        Promise.resolve(remote.getWhileAway(scope)),
        Promise.resolve(remote.getOverview(scope)),
        Promise.resolve(remote.listTeam(scope)),
        Promise.resolve(remote.listProjects(scope)),
        Promise.resolve(remote.listTasks(scope)),
        Promise.resolve(remote.listMessages({
          ...scope,
          streamKind: 'channel',
          ownerId: scope.channelId,
          actorId: scope.memberId,
          afterSeq: 0,
          limit: 200,
        })),
        remote.listDms !== undefined
          ? Promise.resolve(remote.listDms(scope))
          : Promise.resolve([] as readonly DmView[]),
      ])
      const nowRows = now.personas.map(row => mapPersonaNowRow(row, team))
      const stripMembers = mapTeamToStrip(team, now.personas)
      const awayEvents = away.events.map(mapAwayEventLive)
      const pendingApprovals = remote.listApprovals !== undefined
        ? (await Promise.resolve(remote.listApprovals(scope)))
          .filter(row => row.status === 'pending')
          .map(row => row.title)
        : []
      const attentionTitles = [
        ...overview.needsYou.map(card => card.title),
        ...pendingApprovals,
        ...overview.inProgress.map(card => card.title),
      ]
      const taskTitleById = new Map(tasks.map(task => [task.id, task.title]))
      const suggestedPick = overview.inProgress[0] ?? overview.needsYou[0] ?? null
      const suggestedTask = suggestedPick !== null
        ? { id: suggestedPick.id, title: suggestedPick.title }
        : null
      const messages = page.events.map(event => mapMessage(event, team, scope.memberId, taskTitleById))
      const dms = mapDmList(dmRows, team, scope.memberId)
      let dmMessages = prior.dmMessages
      const selectedDmId = prior.selectedDmId
      if (selectedDmId !== null) {
        const dmPage = await Promise.resolve(remote.listMessages({
          ...scope,
          streamKind: 'dm',
          ownerId: selectedDmId,
          actorId: scope.memberId,
          afterSeq: 0,
          limit: 200,
        }))
        dmMessages = dmPage.events.map(event => mapMessage(event, team, scope.memberId, taskTitleById))
      }
      const dmUnreadByPersonaId: Record<string, number> = {}
      for (const dm of dmRows) {
        const peerId = dm.participantA === scope.memberId ? dm.participantB : dm.participantA
        if (selectedDmId === dm.id) {
          dmUnreadByPersonaId[peerId] = 0
          continue
        }
        try {
          const dmPage = await Promise.resolve(remote.listMessages({
            ...scope,
            streamKind: 'dm',
            ownerId: dm.id,
            actorId: scope.memberId,
            afterSeq: 0,
            limit: 80,
          }))
          const count = dmPage.events.filter(event => event.actorId === peerId).length
          if (count > 0) dmUnreadByPersonaId[peerId] = Math.min(99, count)
        } catch {
          /* unread best-effort */
        }
      }
      store.set({
        ready: true,
        tenant,
        team,
        nowRows,
        stripMembers,
        awayEvents,
        attentionTitles,
        messages,
        passThroughFollowers: passThroughFollowers(nowRows),
        dms,
        selectedDmId,
        dmMessages,
        projects,
        kanbanCards: tasks.map(mapTaskToKanbanCard),
        dmUnreadByPersonaId,
        suggestedTask,
        turnContext: prior.turnContext,
        error: null,
      })
    } catch (error) {
      store.set({
        ...store.getSnapshot(),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const bootstrap = async (onFirstUse: (firstUse: boolean) => void): Promise<void> => {
    try {
      tenant = await bootstrapPersonaTenant(remote)
      const firstUse = await hostReportsFirstUse(remote, tenant)
      if (shouldWriteCacheComplete(firstUse)) {
        writeOnboardingCacheComplete()
      }
      onFirstUse(firstUse)
      await refresh()
      startMessageStream()
      if (tenant !== null) {
        try {
          void Promise.resolve(remote.markVisit(tenant)).catch(() => undefined)
        } catch {
          /* visit marker best-effort */
        }
      }
    } catch (error) {
      console.error('[persona] bootstrap do live store falhou', error)
      store.set({
        ...EMPTY,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const postChannelMessage = async (body: string): Promise<void> => {
    if (tenant === null) return
    const trimmed = body.trim()
    if (trimmed.length === 0) return
    const snap = store.getSnapshot()
    const optimisticId = `local-${Date.now()}`
    const timeLabel = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    store.set({
      ...snap,
      messages: [...snap.messages, {
        id: optimisticId,
        authorId: 'user',
        authorName: 'Você',
        body: trimmed,
        timeLabel,
        reactions: [],
      }],
    })
    await Promise.resolve(remote.postMessage({
      id: `msg-${Date.now()}`,
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      streamKind: 'channel',
      ownerId: tenant.channelId,
      actorId: tenant.memberId,
      subjectId: tenant.memberId,
      body: trimmed,
    }))
    await refresh()
  }

  const selectDm = async (dmId: string | null): Promise<void> => {
    if (tenant === null) return
    if (dmId === null) {
      stopDmStream()
      store.set({ ...store.getSnapshot(), selectedDmId: null, dmMessages: [] })
      return
    }
    const scope = tenant
    const team = store.getSnapshot().team
    if (team === null) return
    const page = await Promise.resolve(remote.listMessages({
      ...scope,
      streamKind: 'dm',
      ownerId: dmId,
      actorId: scope.memberId,
      afterSeq: 0,
      limit: 200,
    }))
    const dmMessages = page.events.map(event => mapMessage(event, team, scope.memberId))
    const peerId = store.getSnapshot().dms.find(row => row.id === dmId)?.peerId
    const nextUnread = { ...store.getSnapshot().dmUnreadByPersonaId }
    if (peerId !== undefined) nextUnread[peerId] = 0
    store.set({
      ...store.getSnapshot(),
      selectedDmId: dmId,
      dmMessages,
      dmUnreadByPersonaId: nextUnread,
    })
    startDmStream(dmId)
  }

  const loadTurnContext = async (ticketId: string): Promise<void> => {
    if (tenant === null || remote.getTurnContext === undefined) return
    try {
      const row = await Promise.resolve(remote.getTurnContext({
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        ticketId,
        command: 'stop',
        reason: '',
      }))
      store.set({
        ...store.getSnapshot(),
        turnContext: {
          ticketId: row.ticketId,
          title: row.title,
          triggerIds: [...row.triggerIds],
        },
      })
    } catch {
      store.set({ ...store.getSnapshot(), turnContext: null })
    }
  }

  const openPersonaDm = async (personaId: string): Promise<void> => {
    if (tenant === null) return
    let dm = store.getSnapshot().dms.find(row => row.peerId === personaId)
    if (dm === undefined && remote.createDm !== undefined) {
      const dmId = `dm-${personaId}`.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 48)
      try {
        await Promise.resolve(remote.createDm({
          id: dmId,
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          participantA: tenant.memberId,
          participantB: personaId,
        }))
      } catch {
        /* existing dm */
      }
      await refresh()
      dm = store.getSnapshot().dms.find(row => row.peerId === personaId)
    }
    if (dm !== undefined) await selectDm(dm.id)
  }

  const postDmMessage = async (body: string): Promise<void> => {
    if (tenant === null) return
    const dmId = store.getSnapshot().selectedDmId
    if (dmId === null) return
    const trimmed = body.trim()
    if (trimmed.length === 0) return
    const snap = store.getSnapshot()
    const timeLabel = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    store.set({
      ...snap,
      dmMessages: [...snap.dmMessages, {
        id: `local-dm-${Date.now()}`,
        authorId: 'user',
        authorName: 'Você',
        body: trimmed,
        timeLabel,
        reactions: [],
      }],
    })
    await Promise.resolve(remote.postMessage({
      id: `msg-dm-${Date.now()}`,
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      streamKind: 'dm',
      ownerId: dmId,
      actorId: tenant.memberId,
      subjectId: tenant.memberId,
      body: trimmed,
    }))
    await refresh()
  }

  const commitOnboardingRoster = async (
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
  ): Promise<void> => {
    if (tenant === null) return
    if (displayName.trim().length > 0) {
      try {
        await Promise.resolve(remote.createMember({
          id: tenant.memberId,
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          displayName: displayName.trim(),
          handle: tenant.memberId,
          role: 'owner',
        }))
      } catch {
        /* update not supported — ignore */
      }
    }
    let index = 0
    for (const person of roster) {
      const id = slugId(person.name, index++)
      const avatarRef = galleryRefForRosterPerson(person)
      const systemRoles = person.systemRoles ?? []
      const canRecruit = systemRoles.includes('coordination')
      try {
        await Promise.resolve(remote.createPersona({
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          id,
          name: person.name,
          title: person.role,
          description: person.role,
          personality: 'Proativo e claro.',
          instructions: 'Trabalhe até concluir; reporte com evidência.',
          avatarKind: 'gallery',
          avatarRef,
          runnerKind: 'dsh',
          runnerCli: '',
          runnerModel: 'default',
          canRecruit,
          createdBy: tenant.memberId,
          systemRoles: [...systemRoles],
        }))
      } catch {
        /* duplicate persona */
      }
    }
    await refresh()
  }

  /** Probe/gates only: `PERSONA_DEV_SEED=1` initScript; never invoked from {@link bootstrap}. */
  const runDevHarnessSeedIfEnabled = async (): Promise<void> => {
    if (tenant === null) return
    const seeded = await seedDevHarnessScenario(remote as unknown as DevHarnessSeedRemote, tenant)
    if (seeded) await refresh()
  }

  const completeOnboarding = async (
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
  ): Promise<void> => {
    if (tenant === null) return
    writeOnboardingCacheComplete()
    if (remote.completeOnboarding !== undefined) {
      try {
        await Promise.resolve(remote.completeOnboarding({
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          memberId: tenant.memberId,
          displayName: displayName.trim(),
          roster,
        }))
        await refresh()
        return
      } catch {
        /* fall through to legacy roster RPCs */
      }
    }
    await commitOnboardingRoster(displayName, roster)
  }

  const setPersonaAutonomyLevel = async (personaId: string, level: AutonomyLevel): Promise<void> => {
    if (tenant === null || remote.getAutonomy === undefined || remote.setAutonomy === undefined) return
    const scope = {
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      personaId,
    }
    const current = await Promise.resolve(remote.getAutonomy(scope))
    await Promise.resolve(remote.setAutonomy(patchAutonomyMode(current, level)))
  }

  return {
    observable: {
      getSnapshot: () => store.getSnapshot(),
      subscribe: listener => store.subscribe(listener),
    },
    bootstrap,
    runDevHarnessSeedIfEnabled,
    refresh,
    postChannelMessage,
    selectDm,
    openPersonaDm,
    loadTurnContext,
    postDmMessage,
    commitOnboardingRoster,
    completeOnboarding,
    setPersonaAutonomyLevel,
  }
}
