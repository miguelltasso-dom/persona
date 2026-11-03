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
  type MergeMode,
  type Policy,
  type ReviewAcceptResult,
  type ReviewSummary,
  type ReviewWorktree,
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
import { ExecutionBudget } from './budget.ts'
import type { DeadLetterBook } from './dead-letter.ts'
import { reviewDeliveryOf } from './review.ts'
import {
  autonomyLevelOf,
  createHostRunner,
  lastRunnerText,
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
  readonly budget: ExecutionBudget
  readonly cancelled: Set<string> = new Set<string>()
  readonly lastErrors: string[] = []

  /**
   * @param product - Product repos.
   * @param events - Event log.
   * @param store - Open store (for engine tables).
   * @param now - Instant factory.
   * @param runnerFactory - Per-persona resolve (plugin inject when present).
   * @param budget - Concurrent execution slots.
   * @param deadLetters - Exhausted outbox/effect failures.
   */
  constructor(
    readonly product: ProductRepos,
    readonly events: EventRepos,
    readonly store: SqliteRepositories['store'],
    now: () => string = () => new Date().toISOString(),
    runnerFactory: HostRunnerFactory = createHostRunner,
    budget: ExecutionBudget = new ExecutionBudget(),
    deadLetters?: DeadLetterBook,
  ) {
    this.now = now
    this.runnerFactory = runnerFactory
    this.budget = budget
    this.deadLetters = deadLetters
  }

  now: () => string
  runnerFactory: HostRunnerFactory
  readonly deadLetters: DeadLetterBook | undefined
  /** Test hook: throw from here to fail the next outbox deliver. */
  outboxDeliver?: (id: string, text: string) => void

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
    this.advanceAssignments(created, projectId)
    this.work = this.work.then(async () => { await this.sweepReviews(projectId) }).catch((error: unknown) => {
      if (error instanceof Error && /not open/i.test(error.message)) return
      throw error
    })
    this.work = this.work.then(() => this.recoverPartials(created, projectId)).catch((error: unknown) => {
      if (error instanceof Error && /not open/i.test(error.message)) return
      throw error
    })
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
  ingest(event: StoredEvent, streamKind: 'channel' | 'dm', ownerId: string, responderId: string = ''): void {
    if (this.product.getPersona(event.actorId) !== undefined) return
    const coordination = this.coordinationOf(event.projectId)
    const mentioned = this.mentionedPersona(event.projectId, event.body)
    const dmPeer = streamKind === 'dm' ? this.dmPersona(ownerId, event.actorId) : undefined
    const chosen = (responderId === '' ? undefined : this.product.getPersona(responderId))
      ?? mentioned
      ?? dmPeer
    const speaker = chosen ?? coordination
    if (speaker === undefined) return
    const rt = this.runtime(event.projectId)
    const trigger = this.triggerOf(event, streamKind, ownerId, mentioned !== undefined || streamKind === 'dm')
    const result = rt.engine.receive(trigger)
    if (result === 'duplicate' || result === 'filtered') return
    this.pass(event.projectId)
    if (followupOwners(trigger, rt.repo).length > 0) {
      this.advanceAssignments(rt, event.projectId)
      return
    }
    const work = wantsWork(event.body)
    this.decidePending(rt, event.body, work)
    this.advanceAssignments(rt, event.projectId)
    if (!work) {
      this.postAs(event, speaker, `coord-${event.id}-partial`, '…', 'partial')
      this.work = this.work.then(() => this.finishReply(rt, event, speaker)).catch((error: unknown) => {
        if (error instanceof Error && /not open/i.test(error.message)) return
        this.failReply(event, speaker, error)
      })
      return
    }
    this.bindExecution(rt, event.projectId, chosen)
    this.streamAck(event, coordination)
    this.work = this.work.then(() => this.runLaunched(rt, event, coordination, chosen)).catch((error: unknown) => {
      if (error instanceof Error && /not open/i.test(error.message)) return
      this.failReply(event, speaker, error)
    })
  }

  /**
   * Abort an in-flight reply. The next finish posts a cancel line.
   * @param eventId - Human message id.
   */
  cancelReply(eventId: string): void {
    this.cancelled.add(eventId)
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
   * Re-attempt pending outbox rows (after a dead-letter retry).
   * @param projectId - Tenant.
   */
  retryOutbox(projectId: string): void {
    const rt = this.runtimes.get(projectId)
    if (rt === undefined) return
    const speaker = this.coordinationOf(projectId)
    const project = this.product.getProject(projectId)
    const event = {
      id: `retry-${projectId}`,
      streamId: 'channel:geral',
      workspaceId: project?.workspaceId ?? '',
      projectId,
      seq: 0,
      type: 'message',
      body: '',
      actorId: '',
      subjectId: '',
      occurredAt: this.now(),
      deleted: false,
    }
    this.deliverOutbox(rt, event, speaker)
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
    this.advanceAssignments(rt, projectId)
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

  /**
   * Prepare a review worktree when the project has a folder; otherwise the task has no code.
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   * @param assignmentId - Assignment just started.
   */
  async prepareReview(projectId: string, ticketId: string, assignmentId: string): Promise<ReviewWorktree | undefined> {
    const delivery = reviewDeliveryOf(this.product, this.runtimes, projectId)
    if (delivery === undefined) return undefined
    const tree = await delivery.prepare({ id: assignmentId, ticketId })
    const rt = this.runtimes.get(projectId)
    const live = rt?.repo.tickets.get(ticketId)
    if (rt !== undefined && live !== undefined) {
      rt.repo.tickets.save({
        ...live,
        execution: {
          name: live.execution?.name ?? '',
          directory: tree.path,
          assignment: live.execution?.assignment ?? live.title,
        },
      })
    }
    return tree
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   */
  async reviewSummary(projectId: string, ticketId: string): Promise<ReviewSummary> {
    const ticket = this.runtime(projectId).repo.tickets.get(ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    const delivery = reviewDeliveryOf(this.product, this.runtimes, projectId)
    if (delivery === undefined) {
      return {
        ticketId,
        files: [],
        added: 0,
        deleted: 0,
        patch: '',
        patchTruncated: false,
        patchLimitBytes: 0,
        secretsRedacted: false,
        testsClaimed: [],
      }
    }
    return delivery.summary(ticket)
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   * @param mode - Project merge policy.
   */
  async acceptReview(projectId: string, ticketId: string, mode: MergeMode): Promise<ReviewAcceptResult> {
    const ticket = this.runtime(projectId).repo.tickets.get(ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    const delivery = reviewDeliveryOf(this.product, this.runtimes, projectId)
    if (delivery === undefined) return { kind: 'blocked', explanation: 'Projeto sem pasta — Tarefa sem código.' }
    return delivery.accept(ticket, mode)
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   * @param feedback - What to change.
   */
  async requestChanges(projectId: string, ticketId: string, feedback: string): Promise<void> {
    const ticket = this.runtime(projectId).repo.tickets.get(ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    const delivery = reviewDeliveryOf(this.product, this.runtimes, projectId)
    if (delivery === undefined) {
      this.runtime(projectId).engine.note(ticketId, feedback)
      this.runtime(projectId).engine.retryTicket(ticketId)
    } else {
      await delivery.requestChanges(ticket, feedback)
    }
    this.advanceAssignments(this.runtime(projectId), projectId)
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   */
  async discardReview(projectId: string, ticketId: string): Promise<void> {
    const delivery = reviewDeliveryOf(this.product, this.runtimes, projectId)
    if (delivery === undefined) return
    await delivery.discard({ id: ticketId })
  }

  /**
   * Drop orphan worktrees after resume.
   * @param projectId - Tenant.
   */
  async sweepReviews(projectId: string): Promise<string[]> {
    const delivery = reviewDeliveryOf(this.product, this.runtimes, projectId)
    if (delivery === undefined) return []
    return delivery.sweepOrphans()
  }

  private advanceAssignments(rt: ProjectRuntime, projectId: string): void {
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
      if (running !== undefined) {
        this.work = this.work.then(async () => {
          await this.prepareReview(projectId, ticket.id, running.id)
        }).catch((error: unknown) => {
          if (error instanceof Error && /not open/i.test(error.message)) return
          throw error
        })
      }
    }
  }

  private bindExecution(rt: ProjectRuntime, projectId: string, preferred?: StoredPersona): void {
    const executor = preferred ?? this.executorOf(projectId)
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
    this.deliverOutbox(this.runtime(event.projectId), event, coordination)
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
    preferred?: StoredPersona,
  ): Promise<void> {
    const acquired = this.budget.acquire(event.projectId)
    if (!acquired) {
      this.postAs(event, coordination, `coord-${event.id}-wait`, 'Aguardando vaga neste projeto.')
      return
    }
    try {
      await rt.runnerReady
      const coordinationPersona = coordination ?? this.coordinationOf(event.projectId)
      const executor = preferred ?? this.executorOf(event.projectId) ?? coordinationPersona
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
      if (this.cancelled.has(event.id)) {
        this.postAs(event, coordinationPersona, `coord-${event.id}-reply`, 'Resposta cancelada.')
        return
      }
      if (coordinationPersona !== undefined && executor.id !== coordinationPersona.id) {
        this.postAs(event, coordinationPersona, `coord-${event.id}-handoff`, `Encaminhei para ${executor.name}.`)
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
        this.postAs(event, executor, `exec-${ticket.id}-progress`, `Em andamento: ${ticket.title}`)
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
        const speaker = executor
        const live = lastRunnerText(runner)
        this.postAs(
          event,
          speaker,
          doneId,
          ask
            ? `Precisa de você: ${ticket.title}`
            : clipWords(live !== '' ? live : `Pronto: ${ticket.title}`),
        )
      }
    } catch (error) {
      if (error instanceof Error && /not open/i.test(error.message)) return
      throw error
    } finally {
      if (acquired) this.budget.release(event.projectId)
    }
  }

  private async finishReply(
    rt: ProjectRuntime,
    event: StoredEvent,
    speaker: StoredPersona,
  ): Promise<void> {
    const replyId = `coord-${event.id}-reply`
    if (this.events.has(replyId)) return
    if (this.cancelled.has(event.id)) {
      this.postAs(event, speaker, replyId, 'Resposta cancelada.')
      return
    }
    try {
      rt.engine.reply({ purpose: 'answer', triggerId: event.id, text: clipWords('Olá — em que posso ajudar?') })
    } catch {
      // Scripted path still posts even if the outbox purpose refuses.
    }
    let runner: Runner
    try {
      runner = await this.resolveFor(speaker, event.projectId, 'asked')
      await runner.ensureSession(`talk-${event.id}`, '.', speaker.name, 'coordinator')
      await runner.deliver(`talk-${event.id}`, `talk:${event.id}`, event.body, 'queue')
      await runner.whenIdle(`talk-${event.id}`)
    } catch (error: unknown) {
      this.failReply(event, speaker, error)
      return
    }
    const live = lastRunnerText(runner)
    this.postAs(event, speaker, replyId, clipWords(live !== '' ? live : 'Olá — em que posso ajudar?'))
    this.deliverOutbox(rt, event, speaker)
  }

  private deliverOutbox(
    rt: ProjectRuntime,
    event: StoredEvent,
    speaker: StoredPersona | undefined,
  ): void {
    for (const message of rt.outbox.pending()) {
      const send = (): void => {
        this.outboxDeliver?.(message.id, message.text)
        this.postAs(event, speaker, `coord-${message.id}`, clipWords(message.text))
        rt.outbox.settle(message.id, 'sent')
      }
      if (this.deadLetters === undefined) {
        send()
        continue
      }
      const result = this.deadLetters.attempt(
        event.projectId,
        message.id,
        'Não consegui enviar a resposta.',
        send,
      )
      if (result !== 'ok') break
    }
  }

  private failReply(event: StoredEvent, speaker: StoredPersona | undefined, error: unknown): void {
    const message = isRunnerResolveError(error)
      ? error.message
      : (error instanceof Error ? error.message : 'falha')
    const safe = /stack|token|sk-/iu.test(message) ? 'falha do executor' : message
    this.lastErrors.push(safe)
    if (this.lastErrors.length > 8) this.lastErrors.shift()
    this.postAs(event, speaker, `coord-${event.id}-reply`, `não consegui responder: ${safe}`, 'error')
    this.postAs(event, speaker, `coord-${event.id}-action`, 'Tente de novo ou escolha outra persona.')
  }

  private async recoverPartials(rt: ProjectRuntime, projectId: string): Promise<void> {
    const speaker = this.coordinationOf(projectId)
    if (speaker === undefined) return
    const rows = this.store.db.prepare(
      "SELECT id, stream_id AS streamId, workspace_id AS workspaceId, project_id AS projectId, seq, type, body, actor_id AS actorId, subject_id AS subjectId, occurred_at AS occurredAt, deleted FROM event WHERE project_id = ? AND type = 'partial' AND deleted = 0",
    ).all(projectId) as Array<{
      id: string
      streamId: string
      workspaceId: string
      projectId: string
      seq: number
      type: string
      body: string
      actorId: string
      subjectId: string
      occurredAt: string
      deleted: number
    }>
    for (const row of rows) {
      const eventId = row.id.replace(/^coord-/u, '').replace(/-partial$/u, '')
      if (this.events.has(`coord-${eventId}-reply`)) continue
      const event: StoredEvent = {
        id: eventId,
        streamId: row.streamId,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        seq: row.seq,
        type: row.type,
        body: row.body,
        actorId: row.actorId,
        subjectId: row.subjectId,
        occurredAt: row.occurredAt,
        deleted: row.deleted === 1,
      }
      await this.finishReply(rt, event, speaker)
    }
  }

  private postAs(
    event: StoredEvent,
    speaker: StoredPersona | undefined,
    id: string,
    body: string,
    type: string = 'message',
  ): void {
    if (this.events.has(id)) return
    this.events.append({
      id,
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      streamKind: event.streamId.startsWith('dm:') ? 'dm' : 'channel',
      ownerId: event.streamId.slice(event.streamId.indexOf(':') + 1),
      type,
      body,
      actorId: speaker?.id ?? 'coordination',
      subjectId: event.subjectId,
      occurredAt: this.now(),
    })
  }

  private postCoord(
    event: StoredEvent,
    coordination: StoredPersona | undefined,
    id: string,
    body: string,
  ): void {
    this.postAs(event, coordination, id, body)
  }

  private executorOf(projectId: string): StoredPersona | undefined {
    return this.product.listPersonas(projectId).find(persona => !persona.systemRoles.includes('coordination'))
  }

  private coordinationOf(projectId: string): StoredPersona | undefined {
    return this.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
  }

  private mentionedPersona(projectId: string, body: string): StoredPersona | undefined {
    return this.product.listPersonas(projectId).find(persona => body.includes(`@${persona.name}`))
  }

  private dmPersona(dmId: string, actorId: string): StoredPersona | undefined {
    const row = this.store.db.prepare(
      'SELECT participant_a AS a, participant_b AS b FROM dm WHERE id = ?',
    ).get(dmId) as { a: string; b: string } | undefined
    if (row === undefined) return undefined
    const peer = row.a === actorId ? row.b : row.a
    return this.product.getPersona(peer)
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
