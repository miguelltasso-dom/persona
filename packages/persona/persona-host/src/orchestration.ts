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
  workerSessionId,
  type Assessor,
  type Candidate,
  type Executor,
  type Policy,
  type Runner,
  type Ticket,
  type Trigger,
} from '@deepseek-ai/dsh-persona-engine'
import {
  createCoordinationDriver,
  createFakeRunner,
  isRunnerResolveError,
  loginHintFor,
  wordCount,
} from '@deepseek-ai/dsh-persona-runners'
import {
  SqliteOutbox,
  SqliteRepositories,
  type EventRepos,
  type ProductRepos,
  type StoredEvent,
  type StoredPersona,
} from '@deepseek-ai/dsh-persona-store'
import type { AutonomyMode } from './types.ts'
import {
  autonomyLevelOf,
  createHostRunner,
  permissionModeOf,
  runnerHomeOf,
  specOfPersona,
  type HostRunnerFactory,
  type HostRunnerRequest,
} from './runner.ts'

/** One project's live engine bound to SQLite. */
export class ProjectRuntime {
  readonly repo: SqliteRepositories
  readonly engine: Engine
  readonly outbox: SqliteOutbox
  readonly candidates: Candidate[] = []
  readonly launches: Array<{ ticketId: string; assignmentId: string }> = []
  readonly recoveryNotes: string[] = []
  readonly started: Set<string> = new Set<string>()
  runner: Runner | undefined
  readonly runnerReady: Promise<Runner>

  /**
   * @param repo - SQLite engine repositories for this project.
   * @param now - Instant factory.
   * @param _runnerFactory - Unused; per-persona resolve happens in {@link Orchestration.resolveFor}.
   */
  constructor(repo: SqliteRepositories, now: () => string, _runnerFactory?: HostRunnerFactory) {
    this.repo = repo
    this.outbox = new SqliteOutbox(repo.store, repo.projectId, now)
    this.runnerReady = Promise.resolve(createFakeRunner()).then((runner) => {
      this.runner = runner
      return runner
    })
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
          if (input.source === 'github') {
            const number = input.meta.number
            return {
              listened: true,
              observed: false,
              row: typeof number === 'number' ? String(number) : 'github',
            }
          }
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
  work: Promise<void> = Promise.resolve()

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
    now: () => string = () => new Date().toISOString(),
    runnerFactory: HostRunnerFactory = createHostRunner,
  ) {
    this.now = now
    this.runnerFactory = runnerFactory
  }

  now: () => string
  runnerFactory: HostRunnerFactory

  /**
   * Engine runtime for a project. Creates it on first use.
   * @param projectId - Tenant.
   * @returns Bound runtime.
   */
  runtime(projectId: string): ProjectRuntime {
    const existing = this.runtimes.get(projectId)
    if (existing !== undefined) return existing
    const created = new ProjectRuntime(new SqliteRepositories(this.store, projectId), this.now, this.runnerFactory)
    this.runtimes.set(projectId, created)
    for (const ticket of created.repo.tickets.open()) {
      const latest = latestAssignment(ticket)
      if (latest?.state !== 'running') continue
      created.engine.assignmentInterrupted(ticket.id, latest.id)
      created.recoveryNotes.push(RECOVERY_NOTE)
    }
    this.advanceAssignments(created)
    if (created.recoveryNotes.length > 0) {
      this.work = this.work.then(() => this.recover(created, projectId)).catch((error: unknown) => {
        if (error instanceof Error && /not open/i.test(error.message)) return
        throw error
      })
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
    const work = wantsWork(event.body)
    this.decidePending(rt, event.body, work)
    this.advanceAssignments(rt)
    if (!work) {
      this.replySimple(rt, event, coordination)
      return
    }
    this.bindExecution(rt, event.projectId)
    this.streamAck(event, coordination)
    this.work = this.work.then(() => this.runLaunched(rt, event, coordination)).catch((error: unknown) => {
      if (error instanceof Error && /not open/i.test(error.message)) return
      throw error
    })
  }

  /**
   * Wait for the scripted/real runner of the last ingest.
   * @param projectId - Tenant.
   */
  async flush(projectId: string): Promise<void> {
    try {
      await this.runtime(projectId).runnerReady
    } catch (error: unknown) {
      if (!isRunnerResolveError(error)) throw error
    }
    await this.work
  }

  /**
   * First persona without Coordenação receives the function (D-043).
   * @param projectId - Tenant.
   */
  ensureCoordination(projectId: string): void {
    const personas = this.product.listPersonas(projectId)
    if (personas.some(persona => persona.systemRoles.includes('coordination'))) return
    const first = personas[0]
    if (first === undefined) return
    this.product.updatePersona({ ...first, systemRoles: ['coordination'] }, projectId)
  }

  /**
   * One 2s pass: expire/start evals, decide, launch, reply.
   * @param projectId - Tenant.
   */
  tick(projectId: string): void {
    const rt = this.runtime(projectId)
    this.pass(projectId)
    this.decidePending(rt, '', true)
    this.advanceAssignments(rt)
  }

  /**
   * Close the review thread so a ready ticket becomes Concluído.
   * @param projectId - Tenant.
   * @param ticketId - Ticket in Em revisão.
   */
  completeReview(projectId: string, ticketId: string): void {
    this.runtime(projectId).engine.threadClosed({ source: 'review', id: ticketId }, 'merged', this.now())
  }

  /**
   * Resume running assignments after a host restart (recovery note).
   * @param projectId - Tenant.
   */
  resume(projectId: string): void {
    this.runtime(projectId)
  }

  private async recover(rt: ProjectRuntime, projectId: string): Promise<void> {
    const ticket = rt.repo.tickets.list().find(item => latestAssignment(item)?.state === 'running')
    if (ticket === undefined) return
    const trigger = rt.repo.triggers.get(ticket.origin.triggerId)
    const project = this.product.getProject(projectId)
    const thread = trigger?.threads[0]
    const ownerId = thread?.id ?? 'geral'
    const streamKind = thread?.source === 'dm' ? 'dm' : 'channel'
    const event: StoredEvent = {
      id: ticket.origin.triggerId,
      streamId: `${streamKind}:${ownerId}`,
      workspaceId: project?.workspaceId ?? '',
      projectId,
      seq: 0,
      type: 'message',
      body: trigger?.text ?? ticket.title,
      actorId: trigger?.actor.id ?? '',
      subjectId: ticket.origin.triggerId,
      occurredAt: this.now(),
      deleted: false,
    }
    await this.runLaunched(rt, event, this.coordinationOf(projectId))
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

  private decidePending(rt: ProjectRuntime, text: string, work: boolean): void {
    const title = clip(text.split(/\r?\n/, 1)[0] ?? text, 80) || 'Pedido'
    for (const candidate of rt.candidates.splice(0)) {
      const triggerId = candidate.triggers[0]?.id
      if (triggerId === undefined) continue
      if (!work) {
        rt.engine.decide(triggerId, { kind: 'ignore', reason: 'answered', evalId: candidate.evalId })
        continue
      }
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

  private bindExecution(rt: ProjectRuntime, projectId: string): void {
    const executor = this.executorOf(projectId)
    const coordination = this.coordinationOf(projectId)
    const name = executor?.name ?? coordination?.name
    if (name === undefined) return
    for (const ticket of rt.repo.tickets.list()) {
      if (ticket.execution !== undefined || ticket.ended !== undefined) continue
      const next: Ticket = {
        ...ticket,
        execution: { name, directory: '.', assignment: ticket.title },
      }
      rt.repo.tickets.save(next)
    }
  }

  private streamAck(event: StoredEvent, coordination: StoredPersona | undefined): void {
    this.postCoord(event, coordination, `coord-${event.id}-ack`, 'Recebido. Vou encaminhar.')
    const rt = this.runtime(event.projectId)
    for (const message of rt.outbox.pending()) {
      this.postCoord(event, coordination, `coord-${message.id}`, clipWords(message.text))
      rt.outbox.settle(message.id, 'sent')
    }
  }

  private async resolveFor(
    persona: StoredPersona,
    projectId: string,
    mode: AutonomyMode,
  ): Promise<Runner> {
    const request: HostRunnerRequest = {
      spec: specOfPersona(persona.runner),
      permissionMode: permissionModeOf(mode),
      autonomy: autonomyLevelOf(mode),
      home: runnerHomeOf(projectId),
      personId: persona.id,
    }
    return this.runnerFactory(request)
  }

  private reportResolveFailure(
    rt: ProjectRuntime,
    event: StoredEvent,
    coordination: StoredPersona | undefined,
    ticketId: string,
    error: { code: string; message: string },
  ): void {
    rt.engine.report(ticketId, {
      state: 'blocked',
      summary: error.message,
      question: error.message,
    })
    const needsUser = error.code === 'not_logged_in' || error.code === 'quota_exhausted'
    const hint = needsUser && error.code === 'not_logged_in'
      ? loginHintFor(cliOf(error.message))
      : error.message
    this.postCoord(event, coordination, `coord-${ticketId}-done`, `Precisa de você: ${hint}`)
  }

  private async runLaunched(
    rt: ProjectRuntime,
    event: StoredEvent,
    coordination: StoredPersona | undefined,
  ): Promise<void> {
    try {
      await rt.runnerReady
      const coordinationPersona = coordination ?? this.coordinationOf(event.projectId)
      const executor = this.executorOf(event.projectId) ?? coordinationPersona
      if (executor === undefined) return
      let runner: Runner
      try {
        runner = await this.resolveFor(executor, event.projectId, 'asked')
      } catch (error: unknown) {
        if (!isRunnerResolveError(error)) throw error
        for (const ticket of rt.repo.tickets.list()) {
          if (latestAssignment(ticket)?.state !== 'running') continue
          if (this.events.has(`coord-${ticket.id}-done`)) continue
          this.reportResolveFailure(rt, event, coordinationPersona, ticket.id, error)
        }
        return
      }
      if (coordinationPersona !== undefined) {
        const driver = createCoordinationDriver({
          runner,
          persona: {
            id: coordinationPersona.id,
            name: coordinationPersona.name,
            instructions: coordinationPersona.instructions,
          },
          cwd: '.',
        })
        await driver.start()
        await driver.deliver(`ingest:${event.id}`, event.body, 'queue')
      }
      for (const ticket of rt.repo.tickets.list()) {
        const latest = latestAssignment(ticket)
        if (latest?.state !== 'running') continue
        const doneId = `coord-${ticket.id}-done`
        if (this.events.has(doneId)) continue
        const sessionId = workerSessionId(ticket.id)
        const recovery = rt.recoveryNotes.includes(RECOVERY_NOTE)
        await runner.ensureSession(sessionId, ticket.execution?.directory ?? '.', ticket.title, 'worker')
        await runner.deliver(
          sessionId,
          recovery ? `recovery:${latest.id}` : `launch:${latest.id}`,
          recovery ? `${RECOVERY_NOTE}\n${ticket.title}` : (ticket.execution?.assignment ?? ticket.title),
          recovery ? 'steer' : 'queue',
        )
        await runner.whenIdle(sessionId)
        const ask = wantsAttention(ticket.title) || wantsAttention(event.body)
        if (ask) {
          rt.engine.report(ticket.id, {
            state: 'waiting', summary: 'Precisa de uma decisão.', question: ticket.title,
          })
        } else {
          const live = rt.repo.tickets.get(ticket.id)
          if (live !== undefined && (live.follows === undefined || live.follows.length === 0)) {
            rt.engine.bindThread(ticket.id, { source: 'review', id: ticket.id }, true)
          }
          rt.engine.report(ticket.id, { state: 'ready', summary: 'scripted' })
        }
        this.postCoord(
          event,
          coordinationPersona,
          doneId,
          ask ? `Precisa de você: ${ticket.title}` : clipWords(`Pronto: ${ticket.title}`),
        )
      }
    } catch (error) {
      if (error instanceof Error && /not open/i.test(error.message)) return
      throw error
    }
  }

  private postCoord(
    event: StoredEvent,
    coordination: StoredPersona | undefined,
    id: string,
    body: string,
  ): void {
    if (this.events.has(id)) return
    this.events.append({
      id,
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      streamKind: event.streamId.startsWith('dm:') ? 'dm' : 'channel',
      ownerId: event.streamId.slice(event.streamId.indexOf(':') + 1),
      type: 'message',
      body,
      actorId: coordination?.id ?? 'coordination',
      subjectId: event.subjectId,
      occurredAt: this.now(),
    })
  }

  private replySimple(
    rt: ProjectRuntime,
    event: StoredEvent,
    coordination: StoredPersona | undefined,
  ): void {
    const text = clipWords('Olá — em que posso ajudar?')
    try {
      rt.engine.reply({ purpose: 'answer', triggerId: event.id, text })
    } catch {
      // Scripted path still posts even if the outbox purpose refuses.
    }
    this.postCoord(event, coordination, `coord-${event.id}-reply`, text)
    for (const message of rt.outbox.pending()) {
      this.postCoord(event, coordination, `coord-${message.id}`, clipWords(message.text))
      rt.outbox.settle(message.id, 'sent')
    }
  }

  private executorOf(projectId: string): StoredPersona | undefined {
    return this.product.listPersonas(projectId).find(persona => !persona.systemRoles.includes('coordination'))
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

function clipWords(value: string): string {
  const words = value.trim().split(/\s+/u).filter(part => part.length > 0)
  if (wordCount(value) <= 100) return value.trim()
  return words.slice(0, 100).join(' ')
}

function wantsAttention(text: string): boolean {
  return /\?|precisa de você|aprovar/iu.test(text)
}

function wantsWork(text: string): boolean {
  return /preciso|implement|cri[ae]|adicion|consert|corrig|escrev|readme|deploy|faz(er)?\b|tarefa|ticket|aprov/iu.test(text)
}

function cliOf(message: string): string {
  const match = /CLI (\S+)/u.exec(message)
  return match?.[1] ?? 'dsh'
}
