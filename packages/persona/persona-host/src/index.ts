/** Persona host service and authenticated Remote controller. */
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  EventRepos,
  ProductRepos,
  RoutineRepos,
  VaultRepos,
  openPersonaStore,
  type PersonaStore,
} from '@deepseek-ai/dsh-persona-store'
import { draftPersonaFromDescription, draftTeamFromDescription } from './draft.ts'
import {
  listProjectFiles,
  readProjectFile,
  statProjectFile,
} from './files.ts'
import type {
  ChannelView,
  ClaimRoutinesRequest,
  CreateChannelRequest,
  CreateDmRequest,
  CreateMemberRequest,
  CreatePersonaRequest,
  CreateProjectRequest,
  CreateRoutineRequest,
  CreateWorkspaceRequest,
  DmView,
  DraftPersonaRequest,
  DraftTeamRequest,
  ListMessagesRequest,
  MemberView,
  MessagePage,
  MessageStreamFrame,
  MessageView,
  OverviewView,
  ParticipationRequest,
  PauseRoutineRequest,
  PersonaDraft,
  PersonaView,
  PingResult,
  PostMessageRequest,
  ProjectFileListing,
  ProjectFileRequest,
  ProjectFileStat,
  ProjectFileText,
  ProjectScopeRequest,
  ProjectView,
  RoutineRunRequest,
  RoutineRunView,
  RoutineView,
  ScheduleRoutineRequest,
  SearchRequest,
  TaskView,
  TeamView,
  UpdateProjectRequest,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Persona Remote controller. */
    personaHost: PersonaHost
  }
}

/** Remote protocol revision; bump on incompatible Remote changes. */
export const PERSONA_PROTOCOL = 1

/** Optional on-disk path; empty means env or the Vitest memory fallback. */
export interface Config {
  readonly databasePath: string
}

/**
 * Resolve `<PERSONA_HOME>/db/persona.db`, a configured path, or `:memory:` under Vitest.
 * @param configured - Plugin config path.
 * @returns SQLite path.
 */
export function resolvePersonaDatabasePath(configured: string): string {
  if (configured !== '') return configured
  const home = process.env.PERSONA_HOME ?? process.env.DSH_HOME
  if (home !== undefined && home !== '') return join(home, 'db', 'persona.db')
  if (process.env.VITEST === 'true') return ':memory:'
  throw new Error('PERSONA_HOME or personaHost.databasePath is required')
}

/** Persona domain methods for the authenticated owner and invited peers. */
export default class PersonaHost extends TypertRemoteService {
  static inject = ['typert']

  readonly store: PersonaStore
  readonly product: ProductRepos
  readonly events: EventRepos
  readonly vault: VaultRepos
  readonly routines: RoutineRepos

  /**
   * @param ctx - Host context.
   * @param config - Database path; default empty (env / Vitest memory).
   */
  constructor(ctx: Context, config: Config = { databasePath: '' }) {
    super(ctx, 'personaHost', { namespace: 'persona' })
    this.store = openPersonaStore({ path: resolvePersonaDatabasePath(config.databasePath) })
    this.product = new ProductRepos(this.store)
    this.events = new EventRepos(this.store)
    this.vault = new VaultRepos(this.store)
    this.routines = new RoutineRepos(this.store)
    ctx.effect(() => () => {
      this.store.close()
    })
  }

  /**
   * Probe that the Persona host half is mounted.
   * @returns the product marker and protocol revision.
   */
  @Remote
  ping(): PingResult {
    return { ok: true, product: 'persona', protocol: PERSONA_PROTOCOL }
  }

  /**
   * List projects in a workspace, newest first.
   * @param request - Workspace and the caller's current project (tenant check).
   * @returns Project cards.
   */
  @Remote
  listProjects(request: ProjectScopeRequest): ProjectView[] {
    this.requireWorkspace(request)
    return this.product.listProjects(request.workspaceId).map(project => ({
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description,
      kind: project.kind,
    }))
  }

  /**
   * List members of the workspace plus personas of the project.
   * @param request - Workspace and project.
   * @returns The team roster.
   */
  @Remote
  listTeam(request: ProjectScopeRequest): TeamView {
    this.requireProject(request)
    return {
      members: this.product.listMembers(request.workspaceId).map(toMemberView),
      personas: this.product.listPersonas(request.projectId).map(toPersonaView),
    }
  }

  /**
   * List personas of the project, newest first.
   * @param request - Workspace and project.
   * @returns Persona cards.
   */
  @Remote
  listPersonas(request: ProjectScopeRequest): PersonaView[] {
    this.requireProject(request)
    return this.product.listPersonas(request.projectId).map(toPersonaView)
  }

  /**
   * List channels of the project, newest first.
   * @param request - Workspace and project.
   * @returns Channel cards.
   */
  @Remote
  listChannels(request: ProjectScopeRequest): ChannelView[] {
    this.requireProject(request)
    return this.product.listChannels(request.projectId).map(channel => ({
      id: channel.id,
      projectId: channel.projectId,
      name: channel.name,
      topic: channel.topic,
    }))
  }

  /**
   * List DMs of the project, newest first.
   * @param request - Workspace and project.
   * @returns DM cards.
   */
  @Remote
  listDms(request: ProjectScopeRequest): DmView[] {
    this.requireProject(request)
    return this.product.listDms(request.projectId).map(dm => ({
      id: dm.id,
      projectId: dm.projectId,
      participantA: dm.participantA,
      participantB: dm.participantB,
    }))
  }

  /**
   * List tasks for the project. Empty until engine repositories land.
   * @param request - Workspace and project.
   * @returns Task cards.
   */
  @Remote
  listTasks(request: ProjectScopeRequest): TaskView[] {
    this.requireProject(request)
    return []
  }

  /**
   * Visão geral: needs-you first. Empty while no tickets exist.
   * @param request - Workspace and project.
   * @returns Attention and in-progress cards.
   */
  @Remote
  getOverview(request: ProjectScopeRequest): OverviewView {
    this.requireProject(request)
    return { needsYou: [], inProgress: [] }
  }

  /**
   * Create a workspace and its Pessoal project.
   * @param request - Workspace id, name, and personal project id.
   * @returns The personal project card.
   */
  @Remote
  createWorkspace(request: CreateWorkspaceRequest): ProjectView {
    const created = this.product.createWorkspace({
      id: request.id, name: request.name, personalProjectId: request.personalProjectId,
    })
    return {
      id: created.personal.id,
      workspaceId: created.personal.workspaceId,
      name: created.personal.name,
      description: created.personal.description,
      kind: created.personal.kind,
    }
  }

  /**
   * Create a shared project.
   * @param request - Project fields.
   * @returns The project card.
   */
  @Remote
  createProject(request: CreateProjectRequest): ProjectView {
    this.requireWorkspace(request)
    const project = this.product.createProject({
      id: request.id,
      workspaceId: request.workspaceId,
      name: request.name,
      description: request.description,
    })
    return {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description,
      kind: project.kind,
    }
  }

  /**
   * Update a project's name, description, and file root.
   * @param request - Tenant plus fields. Empty `rootPath` clears the root.
   * @returns The updated card.
   */
  @Remote
  updateProject(request: UpdateProjectRequest): ProjectView {
    this.requireProject(request)
    const project = this.product.updateProject(request.projectId, {
      name: request.name,
      description: request.description,
      rootPath: request.rootPath === '' ? null : request.rootPath,
    })
    return {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description,
      kind: project.kind,
    }
  }

  /**
   * Create a workspace member.
   * @param request - Member fields plus tenant project.
   * @returns The member card.
   */
  @Remote
  createMember(request: CreateMemberRequest): MemberView {
    this.requireProject(request)
    const member = this.product.createMember({
      id: request.id,
      workspaceId: request.workspaceId,
      displayName: request.displayName,
      handle: request.handle,
      role: request.role,
    })
    return toMemberView(member)
  }

  /**
   * Create a persona in the project.
   * @param request - Persona fields.
   * @returns The persona card.
   */
  @Remote
  createPersona(request: CreatePersonaRequest): PersonaView {
    this.requireProject(request)
    const now = new Date().toISOString()
    const stored = this.product.createPersona({
      id: request.id,
      workspaceId: request.workspaceId,
      name: request.name,
      title: request.title,
      description: request.description,
      personality: request.personality,
      instructions: request.instructions,
      avatar: { kind: request.avatarKind, ref: request.avatarRef },
      runner: request.runnerKind === 'dsh'
        ? { kind: 'dsh', model: request.runnerModel }
        : { kind: 'cli', cli: asCli(request.runnerCli), model: request.runnerModel },
      tools: {},
      skills: [],
      limits: {},
      systemRoles: [],
      canRecruit: request.canRecruit,
      createdAt: now,
      updatedAt: now,
      createdBy: request.createdBy,
    }, request.projectId)
    return toPersonaView(stored)
  }

  /**
   * Add a participation (project or channel).
   * @param request - Participation.
   * @returns true when stored.
   */
  @Remote
  addParticipation(request: ParticipationRequest): boolean {
    this.requireProject(request)
    this.product.addParticipation({
      personaId: request.personaId,
      projectId: request.projectId,
      kind: request.kind,
      targetId: request.targetId,
    })
    return true
  }

  /**
   * Remove a participation.
   * @param request - Participation.
   * @returns true when removed.
   */
  @Remote
  removeParticipation(request: ParticipationRequest): boolean {
    this.requireProject(request)
    this.product.removeParticipation(request.personaId, request.kind, request.targetId)
    return true
  }

  /**
   * Create a channel.
   * @param request - Channel fields.
   * @returns The channel card.
   */
  @Remote
  createChannel(request: CreateChannelRequest): ChannelView {
    this.requireProject(request)
    const channel = this.product.createChannel({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      name: request.name,
      topic: request.topic,
    })
    return { id: channel.id, projectId: channel.projectId, name: channel.name, topic: channel.topic }
  }

  /**
   * Create a DM.
   * @param request - Participants.
   * @returns The DM card.
   */
  @Remote
  createDm(request: CreateDmRequest): DmView {
    this.requireProject(request)
    const dm = this.product.createDm({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      participantA: request.participantA,
      participantB: request.participantB,
    })
    return {
      id: dm.id,
      projectId: dm.projectId,
      participantA: dm.participantA,
      participantB: dm.participantB,
    }
  }

  /**
   * Append a message to a channel or DM stream.
   * @param request - Message fields.
   * @returns The stored message.
   */
  @Remote
  postMessage(request: PostMessageRequest): MessageView {
    this.requireProject(request)
    return toMessageView(this.events.append({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      streamKind: request.streamKind,
      ownerId: request.ownerId,
      type: 'message',
      body: request.body,
      actorId: request.actorId,
      subjectId: request.subjectId,
      occurredAt: request.occurredAt,
    }))
  }

  /**
   * Page messages with ACL.
   * @param request - Stream, actor, cursor, limit.
   * @returns Authorized page.
   */
  @Remote
  listMessages(request: ListMessagesRequest): MessagePage {
    this.requireProject(request)
    const streamId = `${request.streamKind}:${request.ownerId}`
    const page = this.events.list(streamId, { id: request.actorId }, request.afterSeq, request.limit)
    return { events: page.events.map(toMessageView), nextSeq: page.nextSeq }
  }

  /**
   * Stream messages: one baseline frame, then upserts until `signal` aborts.
   * @param request - Same scope as listMessages.
   * @param signal - Client observation lifetime.
   * @returns Baseline then increment frames.
   */
  @Remote({ mode: 'stream' })
  async *followMessages(request: ListMessagesRequest, signal: AbortSignal): AsyncIterable<MessageStreamFrame> {
    this.requireProject(request)
    const streamId = `${request.streamKind}:${request.ownerId}`
    const queue: MessageView[] = []
    const dispose = this.events.subscribe((event) => {
      if (event.streamId !== streamId) return
      queue.push(toMessageView(event))
    })
    try {
      const page = this.events.list(streamId, { id: request.actorId }, request.afterSeq, request.limit)
      const events = page.events.map(toMessageView)
      const seen = new Set(events.map(item => item.id))
      yield { kind: 'baseline', events, order: events.map(item => item.id) }
      while (!signal.aborted) {
        const next = queue.shift()
        if (next !== undefined) {
          if (seen.has(next.id)) continue
          seen.add(next.id)
          yield { kind: 'upsert', events: [next], order: [next.id] }
          continue
        }
        await sleep(25, signal)
      }
    } finally {
      dispose()
    }
  }

  /**
   * Search events the actor may read. Does not leak DMs.
   * @param request - Tenant, actor, query, limit.
   * @returns Authorized hits.
   */
  @Remote
  search(request: SearchRequest): MessageView[] {
    this.requireProject(request)
    return this.events.search(request.projectId, { id: request.actorId }, request.query, request.limit)
      .map(toMessageView)
  }

  /**
   * List one directory under the project's file root.
   * @param request - Tenant, actor, relative path.
   * @returns Direct children.
   */
  @Remote
  listFiles(request: ProjectFileRequest): ProjectFileListing {
    return listProjectFiles(this.requireFileRoot(request), request.path)
  }

  /**
   * Stat one path under the project's file root.
   * @param request - Tenant, actor, relative path.
   * @returns Kind and size.
   */
  @Remote
  statFile(request: ProjectFileRequest): ProjectFileStat {
    return statProjectFile(this.requireFileRoot(request), request.path)
  }

  /**
   * Read a UTF-8 file under the project's file root.
   * @param request - Tenant, actor, relative path.
   * @returns Text and byte length.
   */
  @Remote
  readFile(request: ProjectFileRequest): ProjectFileText {
    return readProjectFile(this.requireFileRoot(request), request.path)
  }

  /**
   * Create a routine in the project.
   * @param request - Routine fields.
   * @returns The routine card.
   */
  @Remote
  createRoutine(request: CreateRoutineRequest): RoutineView {
    this.requireProject(request)
    return toRoutineView(this.routines.create({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      name: request.name,
      rrule: request.rrule,
      timeZone: request.timeZone,
      catchUp: request.catchUp,
      ...(request.silenceStart === '' ? {} : { silenceStart: request.silenceStart }),
      ...(request.silenceEnd === '' ? {} : { silenceEnd: request.silenceEnd }),
    }))
  }

  /**
   * List routines of the project, newest first.
   * @param request - Tenant.
   * @returns Routine cards.
   */
  @Remote
  listRoutines(request: ProjectScopeRequest): RoutineView[] {
    this.requireProject(request)
    return this.routines.list(request.projectId).map(toRoutineView)
  }

  /**
   * Pause or resume one routine. Pause cancels pending and leased runs.
   * @param request - Routine and flag.
   * @returns The updated card.
   */
  @Remote
  pauseRoutine(request: PauseRoutineRequest): RoutineView {
    this.requireProject(request)
    return toRoutineView(this.routines.setPaused(request.id, request.paused))
  }

  /**
   * Pause every routine in the project ("Pausar equipe").
   * @param request - Tenant.
   * @returns true when applied.
   */
  @Remote
  pauseTeam(request: ProjectScopeRequest): boolean {
    this.requireProject(request)
    this.routines.pauseTeam(request.projectId)
    return true
  }

  /**
   * Queue one occurrence. Duplicate `scheduledFor` returns the existing run.
   * @param request - Routine, run id, instant.
   * @returns The run.
   */
  @Remote
  scheduleRoutine(request: ScheduleRoutineRequest): RoutineRunView {
    this.requireProject(request)
    return toRunView(this.routines.schedule({
      id: request.runId, routineId: request.id, scheduledFor: request.scheduledFor,
    }))
  }

  /**
   * Lease due runs (fake-clock friendly: uses the store clock).
   * @param request - Tenant and lease expiry.
   * @returns Newly leased runs.
   */
  @Remote
  claimRoutines(request: ClaimRoutinesRequest): RoutineRunView[] {
    this.requireProject(request)
    return this.routines.claimDue(request.projectId, request.leaseUntil).map(toRunView)
  }

  /**
   * Re-queue a failed run.
   * @param request - Run id.
   * @returns The pending run.
   */
  @Remote
  retryRoutine(request: RoutineRunRequest): RoutineRunView {
    this.requireProject(request)
    return toRunView(this.routines.retry(request.runId))
  }

  /**
   * Draft one persona from a description. Valid against Forge's schema; tools empty.
   * @param request - Tenant and text.
   * @returns An editable draft.
   */
  @Remote
  draftPersona(request: DraftPersonaRequest): PersonaDraft {
    this.requireProject(request)
    return draftPersonaFromDescription(request.description)
  }

  /**
   * Draft a team from a description. No coordination role is assigned.
   * @param request - Tenant and text.
   * @returns Editable drafts.
   */
  @Remote
  draftTeam(request: DraftTeamRequest): PersonaDraft[] {
    this.requireProject(request)
    return draftTeamFromDescription(request.description)
  }

  private requireWorkspace(request: { workspaceId: string }): void {
    if (this.product.getWorkspace(request.workspaceId) === undefined) {
      throw new Error('workspace-not-found')
    }
  }

  private requireProject(request: { workspaceId: string; projectId: string }): void {
    this.requireWorkspace(request)
    const project = this.product.getProject(request.projectId)
    if (project === undefined || project.workspaceId !== request.workspaceId) {
      throw new Error('project-not-found')
    }
  }

  private requireFileRoot(request: ProjectFileRequest): string {
    this.requireProject(request)
    const member = this.product.getMember(request.actorId)
    if (member === undefined || member.workspaceId !== request.workspaceId) {
      throw new Error('files-forbidden')
    }
    const project = this.product.getProject(request.projectId)
    if (project === undefined) throw new Error('project-not-found')
    if (project.rootPath === undefined || project.rootPath === '') throw new Error('project-root-missing')
    return project.rootPath
  }
}

function toMemberView(member: { id: string; workspaceId: string; displayName: string; handle: string; role: MemberView['role'] }): MemberView {
  return {
    id: member.id,
    workspaceId: member.workspaceId,
    displayName: member.displayName,
    handle: member.handle,
    role: member.role,
  }
}

function toPersonaView(persona: {
  id: string
  workspaceId: string
  projectId: string
  name: string
  title: string
  description: string
  avatar: { kind: 'gallery' | 'upload' | 'silhouette'; ref: string }
  systemRoles: readonly ('coordination' | 'watchdog')[]
  canRecruit: boolean
}): PersonaView {
  return {
    id: persona.id,
    workspaceId: persona.workspaceId,
    projectId: persona.projectId,
    name: persona.name,
    title: persona.title,
    description: persona.description,
    avatarKind: persona.avatar.kind,
    avatarRef: persona.avatar.ref,
    systemRoles: persona.systemRoles,
    canRecruit: persona.canRecruit,
  }
}

function toMessageView(event: {
  id: string
  streamId: string
  seq: number
  body: string
  actorId: string
  subjectId: string
  occurredAt: string
}): MessageView {
  return {
    id: event.id,
    streamId: event.streamId,
    seq: event.seq,
    body: event.body,
    actorId: event.actorId,
    subjectId: event.subjectId,
    occurredAt: event.occurredAt,
  }
}

function toRoutineView(routine: {
  id: string
  projectId: string
  name: string
  rrule: string
  timeZone: string
  paused: boolean
  catchUp: RoutineView['catchUp']
}): RoutineView {
  return {
    id: routine.id,
    projectId: routine.projectId,
    name: routine.name,
    rrule: routine.rrule,
    timeZone: routine.timeZone,
    paused: routine.paused,
    catchUp: routine.catchUp,
  }
}

function toRunView(run: {
  id: string
  routineId: string
  scheduledFor: string
  status: RoutineRunView['status']
  attempt: number
}): RoutineRunView {
  return {
    id: run.id,
    routineId: run.routineId,
    scheduledFor: run.scheduledFor,
    status: run.status,
    attempt: run.attempt,
  }
}

function asCli(value: string): 'claude' | 'codex' | 'cursor' | 'opencode' {
  if (value === 'claude' || value === 'codex' || value === 'cursor' || value === 'opencode') return value
  throw new Error('invalid-cli')
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
