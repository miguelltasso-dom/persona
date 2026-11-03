import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { AwayEventLive, ChannelMessageUi } from './map-host-ui.ts'
import { mapAwayEventLive, mapMessage, mapPersonaNowRow, mapTeamToStrip } from './map-host-ui.ts'
import { bootstrapPersonaTenant, hostReportsFirstUse, type TenantBootstrapRemote } from './bootstrap-tenant.ts'
import { shouldWriteCacheComplete } from './onboarding-host.ts'
import { galleryRefForRosterPerson, seedDevTeamIfEmpty, type OnboardingRosterPerson } from './seed-default-team.ts'
import { writeOnboardingCacheComplete } from '../shell/onboarding-persistence.ts'
import { mapTaskToKanbanCard } from './map-host-ui.ts'
import type { KanbanCardModel } from '../kanban/types.ts'
import type { OverviewView as HostOverviewView, PersonaTenantScope, TeamView } from './persona-remote-types.ts'
import type { PersonaNowSnapshot } from '../team/persona-work-state.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'

export interface PersonaLiveSnapshot {
  readonly ready: boolean
  readonly tenant: PersonaTenantScope | null
  readonly team: TeamView | null
  readonly nowRows: readonly PersonaNowSnapshot[]
  readonly stripMembers: readonly ChannelPersonaMember[]
  readonly awayEvents: readonly AwayEventLive[]
  readonly attentionTitles: readonly string[]
  readonly messages: readonly ChannelMessageUi[]
  readonly projects: readonly { id: string; name: string; kind: string }[]
  readonly kanbanCards: readonly KanbanCardModel[]
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
  projects: [],
  kanbanCards: [],
  error: null,
}

/** Host-backed snapshot for shell panels (production path). */
export interface PersonaLiveStore {
  readonly observable: HostObservable<PersonaLiveSnapshot>
  bootstrap(onFirstUse: (firstUse: boolean) => void): Promise<void>
  runDevHarnessSeedIfEnabled(): Promise<void>
  refresh(): Promise<void>
  postChannelMessage(body: string): Promise<void>
  commitOnboardingRoster(
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
  ): Promise<void>
  completeOnboarding(
    displayName: string,
    roster: readonly OnboardingRosterPerson[],
  ): Promise<void>
}

type PersonaRemote = Omit<TenantBootstrapRemote, 'listProjects'> & {
  ping(): unknown
  getOverviewNow(request: PersonaTenantScope): { personas: readonly import('./persona-remote-types.ts').PersonaNowView[] }
  getWhileAway(request: PersonaTenantScope): { events: readonly import('./persona-remote-types.ts').AwayEventView[] }
  getOverview(request: PersonaTenantScope): HostOverviewView
  listTeam(request: PersonaTenantScope): TeamView
  listProjects(request: PersonaTenantScope): readonly { id: string; name: string; kind: string }[]
  listTasks(request: PersonaTenantScope): readonly import('./persona-remote-types.ts').TaskView[]
  listMessages(request: {
    workspaceId: string
    projectId: string
    streamKind: 'channel'
    ownerId: string
    actorId: string
    afterSeq: number
    limit: number
  }): { events: readonly import('./persona-remote-types.ts').MessageView[] }
  postMessage(request: {
    id: string
    workspaceId: string
    projectId: string
    streamKind: 'channel'
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

export function createPersonaLiveStore(remote: PersonaRemote): PersonaLiveStore {
  const store = createSnapshotStore<PersonaLiveSnapshot>(EMPTY)
  let tenant: PersonaTenantScope | null = null

  const refresh = async (): Promise<void> => {
    if (tenant === null) return
    try {
      const scope = tenant
      const [now, away, overview, team, projects, tasks, page] = await Promise.all([
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
      ])
      const nowRows = now.personas.map(row => mapPersonaNowRow(row, team))
      const stripMembers = mapTeamToStrip(team, now.personas)
      const awayEvents = away.events.map(mapAwayEventLive)
      const attentionTitles = [
        ...overview.needsYou.map(card => card.title),
        ...overview.inProgress.map(card => card.title),
      ]
      const messages = page.events.map(event => mapMessage(event, team, scope.memberId))
      store.set({
        ready: true,
        tenant,
        team,
        nowRows,
        stripMembers,
        awayEvents,
        attentionTitles,
        messages,
        projects,
        kanbanCards: tasks.map(mapTaskToKanbanCard),
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
      if (tenant !== null) {
        try {
          remote.markVisit(tenant)
        } catch {
          /* visit marker best-effort */
        }
      }
    } catch (error) {
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
    const seeded = await seedDevTeamIfEmpty(remote, tenant)
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

  return {
    observable: {
      getSnapshot: () => store.getSnapshot(),
      subscribe: listener => store.subscribe(listener),
    },
    bootstrap,
    runDevHarnessSeedIfEnabled,
    refresh,
    postChannelMessage,
    commitOnboardingRoster,
    completeOnboarding,
  }
}
