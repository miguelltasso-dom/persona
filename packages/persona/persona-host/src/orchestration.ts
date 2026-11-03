/**
 * Channel/DM message → Trigger → Ticket → assignment → coordination reply (C2).
 * Coordination is a function, never a hardcoded persona name (D-043).
 */

import {
  Engine,
  RECOVERY_NOTE,
  followupOwners,
  internalSourceScope,
  latestAssignment,
  projectKanban,
  type Assessor,
  type Candidate,
  type Executor,
  type Policy,
  type Ticket,
  type Trigger,
} from '@deepseek-ai/dsh-persona-engine'
import {
  SqliteOutbox,
  SqliteRepositories,
  type EventRepos,
  type ProductRepos,
  type StoredEvent,
  type StoredPersona,
} from '@deepseek-ai/dsh-persona-store'

/** One project's live engine bound to SQLite. */
export class ProjectRuntime {
  readonly repo: SqliteRepositories
  readonly engine: Engine
  readonly outbox: SqliteOutbox
  readonly candidates: Candidate[] = []
  readonly launches: Array<{ ticketId: string; assignmentId: string }> = []
  readonly recoveryNotes: string[] = []
  readonly started: Set<string> = new Set<string>()

  /**
   * @param repo - SQLite engine repositories for this project.
   * @param now - Instant factory.
   */
  constructor(repo: SqliteRepositories, now: () => string) {
    this.repo = repo
    this.outbox = new SqliteOutbox(repo.store, repo.projectId, now)
    const assessor: Assessor = {
      request: (candidate: Candidate) => { this.candidates.push(candidate) },
    }
    const executor: Executor = {
      start: (ticket: Ticket, assignment: { id: string }) => {
        if (this.started.has(ticket.id)) return
        this.started.add(ticket.id)
        this.launches.push({ ticketId: ticket.id, assignmentId: assignment.id })
      },
      deliver: () => {},
      stop: () => {},
    }
    const policy: Policy = {
      version: 'v1',
      paused: false,
      evalTimeoutMs: 60_000,
      gate: (trigger: Trigger) => trigger.human
        ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } }
        : { admissible: false, reason: 'not-human' },
      revalidate: () => true,
      admitsInferred: () => true,
    }
    this.engine = new Engine({
      repo,
      policy: () => policy,
      scope: {
        scope: (input: { source: string; meta: Record<string, unknown> }) => {
          const kind = input.source === 'dm' ? 'dm' : 'channel'
          return internalSourceScope(kind).scope(input)
        },
      },
      assessor,
      executor,
      outbox: this.outbox,
      now,
    })
  }
}

/**
 * Compose engines per project and turn human channel/DM messages into tickets.
 */
export class Orchestration {
  readonly runtimes: Map<string, ProjectRuntime> = new Map<string, ProjectRuntime>()

  /**
   * @param product - Product repos.
   * @param events - Event log.
   * @param store - Open store (for engine tables).
   * @param now - Instant factory.
   */
  constructor(
    readonly product: ProductRepos,
    readonly events: EventRepos,
    readonly store: SqliteRepositories['store'],
    readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /**
   * Engine runtime for a project. Creates it on first use.
   * @param projectId - Tenant.
   * @returns Bound runtime.
   */
  runtime(projectId: string): ProjectRuntime {
    const existing = this.runtimes.get(projectId)
    if (existing !== undefined) return existing
    const created = new ProjectRuntime(new SqliteRepositories(this.store, projectId), this.now)
    this.runtimes.set(projectId, created)
    for (const ticket of created.repo.tickets.open()) {
      const latest = latestAssignment(ticket)
      if (latest?.state !== 'running') continue
      created.engine.assignmentInterrupted(ticket.id, latest.id)
      created.recoveryNotes.push(RECOVERY_NOTE)
    }
    return created
  }

  /**
   * Ingest a stored human message. Coordination function required except for @mention or DM.
   * @param event - Committed message event.
   * @param streamKind - channel or dm.
   * @param ownerId - Channel or DM id.
   */
  ingest(event: StoredEvent, streamKind: 'channel' | 'dm', ownerId: string): void {
    if (this.product.getPersona(event.actorId) !== undefined) return
    const coordination = this.coordinationOf(event.projectId)
    const mentioned = this.mentioned(event.projectId, event.body)
    if (coordination === undefined && !mentioned) return
    const rt = this.runtime(event.projectId)
    const trigger = this.triggerOf(event, streamKind, ownerId, mentioned || streamKind === 'dm')
    const result = rt.engine.receive(trigger)
    if (result === 'duplicate' || result === 'filtered') return
    this.pass(event.projectId)
    if (followupOwners(trigger, rt.repo).length > 0) {
      this.advanceAssignments(rt)
      return
    }
    this.decidePending(rt, event.body)
    this.advanceAssignments(rt)
    this.deliverCoordination(event, coordination)
  }

  /**
   * One 2s pass: expire/start evals, decide, launch, reply.
   * @param projectId - Tenant.
   */
  tick(projectId: string): void {
    const rt = this.runtime(projectId)
    this.pass(projectId)
    this.decidePending(rt, '')
    this.advanceAssignments(rt)
  }

  /**
   * Resume running assignments after a host restart (recovery note).
   * @param projectId - Tenant.
   */
  resume(projectId: string): void {
    const rt = this.runtime(projectId)
    for (const ticket of rt.repo.tickets.open()) {
      const latest = latestAssignment(ticket)
      if (latest?.state !== 'running') continue
      rt.engine.assignmentInterrupted(ticket.id, latest.id)
      rt.recoveryNotes.push(RECOVERY_NOTE)
    }
  }

  /**
   * Kanban cards for a project (P5 projection).
   * @param projectId - Tenant.
   * @returns Cards newest first.
   */
  kanban(projectId: string): Array<ReturnType<typeof projectKanban> & { title: string; stageAction: string }> {
    return this.runtime(projectId).repo.tickets.list().map((ticket) => {
      const card = projectKanban(ticket)
      return {
        ...card,
        title: ticket.title,
        stageAction: card.stage.stage === 'person' || card.stage.stage === 'working'
          ? (card.stage.action ?? '')
          : '',
      }
    })
  }

  private pass(projectId: string): void {
    this.runtime(projectId).engine.evaluateDue()
  }

  private decidePending(rt: ProjectRuntime, text: string): void {
    const title = clip(text.split(/\r?\n/, 1)[0] ?? text, 80) || 'Pedido'
    for (const candidate of rt.candidates.splice(0)) {
      const triggerId = candidate.triggers[0]?.id
      if (triggerId === undefined) continue
      rt.engine.decide(triggerId, {
        kind: 'accept',
        title,
        scope: 'small',
        reason: 'requested',
        acknowledgement: clip(`${title}: recebido.`, 400),
        evalId: candidate.evalId,
      })
    }
  }

  private advanceAssignments(rt: ProjectRuntime): void {
    for (;;) {
      const next = rt.launches.shift()
      if (next === undefined) break
      rt.engine.assignmentStarted(next.ticketId, next.assignmentId)
      const ticket = rt.repo.tickets.get(next.ticketId)
      if (ticket === undefined) continue
      const running = latestAssignment(ticket)
      if (running?.state === 'running' && ticket.undelivered.length > 0) {
        rt.engine.inputsDelivered(next.ticketId, running.id, ticket.undelivered)
      }
    }
  }

  private deliverCoordination(event: StoredEvent, coordination: StoredPersona | undefined): void {
    const rt = this.runtime(event.projectId)
    const pending = rt.outbox.pending()
    for (const message of pending) {
      const body = clip(message.text, 800)
      this.events.append({
        id: `coord-${message.id}`,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        streamKind: event.streamId.startsWith('dm:') ? 'dm' : 'channel',
        ownerId: event.streamId.slice(event.streamId.indexOf(':') + 1),
        type: 'message',
        body,
        actorId: coordination?.id ?? 'coordination',
        subjectId: message.ticketId ?? event.subjectId,
        occurredAt: this.now(),
      })
      rt.outbox.settle(message.id, 'sent')
    }
  }

  private coordinationOf(projectId: string): StoredPersona | undefined {
    return this.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
  }

  private mentioned(projectId: string, body: string): boolean {
    return this.product.listPersonas(projectId).some(persona => body.includes(`@${persona.name}`))
  }

  private triggerOf(event: StoredEvent, streamKind: 'channel' | 'dm', ownerId: string, addressed: boolean): Trigger {
    return {
      id: event.id,
      source: streamKind,
      threads: [{ source: streamKind, id: ownerId }],
      actor: { source: streamKind, id: event.actorId },
      human: true,
      ...(addressed ? { addressed: streamKind === 'dm' ? 'direct' : 'mention' } : {}),
      at: event.occurredAt,
      text: event.body,
      channel: { source: streamKind, thread: ownerId, address: { message: event.id } },
      meta: streamKind === 'dm' ? { dmId: ownerId } : { channelId: ownerId },
    }
  }
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}
