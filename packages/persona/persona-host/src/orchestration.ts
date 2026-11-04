/**
 * Channel/DM message → Trigger → Ticket → assignment → coordination reply (C2).
 * Coordination is a function, never a hardcoded persona name (D-043).
 */

import { existsSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { z } from 'zod'
import {
  Engine,
  MemoryPreRouteLog,
  RECOVERY_NOTE,
  allExternalSourceScope,
  composeSourceScope,
  capTalkContext,
  composeHostTalk,
  finishHostTalk,
  foldHostTalkUsed,
  withTurnActivityEmit,
  milestoneSummary,
  firstDeliveryExecutionPrompt,
  hasPendingDelivery,
  internalSourceScope,
  latestAssignment,
  preRoute,
  projectKanban,
  wantsWork,
  workerSessionId,
  type Assessor,
  type Candidate,
  type Executor,
  type MergeMode,
  type Policy,
  type PreRouteResult,
  type RouteWindowEntry,
  type ReviewAcceptResult,
  type ReviewSummary,
  type ReviewWorktree,
  type Runner,
  type Ticket,
  type Trigger,
  type DomainEvent,
  type FirstDeliveryRouteDirective,
  type ReviewDelivery,
  type ReviewApplyOptions,
} from '@deepseek-ai/dsh-persona-engine'
import {
  authorizeContext,
  canReadVault,
  compileVaultContext,
  EMPTY_LAYERS,
  isRequiredVaultKind,
  parseVaultRecord,
  type TurnActivityEvent,
  type TurnLedgerEntry,
} from '@deepseek-ai/dsh-persona-core'
import {
  createCoordinationDriver,
  createFakeRunner,
  disposeRunnerSessions,
  isRunnerResolveError,
  prewarmCoordination,
  RunnerResolveError,
  wordCount,
} from '@deepseek-ai/dsh-persona-runners'
import {
  ProactivityRepos,
  ScreenRepos,
  SqliteOutbox,
  SqliteRepositories,
  StoreError,
  type EventRepos,
  type AccountRepos,
  type OptRepos,
  type ProductRepos,
  type StoredEvent,
  type StoredPersona,
  type SqliteUsageStore,
  type VaultRepos,
} from '@deepseek-ai/dsh-persona-store'
import { compileSubjectVault } from './wave2.ts'
import { doneEventId } from './ticket-done.ts'
import { QuotaWaitBook, type QuotaWaitRow } from './quota-wait.ts'
import { safeUsedContext } from './used-context-safety.ts'
import { foldSubjectSummary, shouldFoldSubject, SUBJECT_RECENT } from './subject-summary.ts'
import type { AutonomyMode, EngineStatusView, UsedContextRecord } from './types.ts'
import { ExecutionBudget } from './budget.ts'
import { silenceUntilOf } from './proactivity.ts'
import { HeldMessages, heldLine } from './held-messages.ts'
import { MessageFlags } from './message-flags.ts'
import { ReplyStream } from './reply-stream.ts'
import { FIRST_DELIVERY_EVENT_ID } from './onboarding.ts'
import type { DeadLetterBook } from './dead-letter.ts'
import type { MutantRunBook } from './mutant-run.ts'
import { reviewDeliveryOf, reviewTreesOf, type HostReviewOptions } from './review.ts'
import {
  allowsScriptedReplies,
  assertCliPermission,
  autonomyLevelOf,
  createHostRunner,
  lastRunnerQuestion,
  lastRunnerReport,
  lastRunnerReportAt,
  setRunnerPartialSink,
  lastRunnerText,
  permissionFor,
  runnerHomeOf,
  specFromConnection,
  type DetectedCli,
  type HostRunnerFactory,
  type HostRunnerRequest,
  type RunnerPurpose,
} from './runner.ts'

/** Sticker (Brush catalog) the persona answers a courtesy line with: a heart for thanks, a thumbs-up for the rest. Muse owns the final form. */
export function courtesyStickerFor(body: string): 'coracao' | 'joinha' {
  return /obrigad|valeu|vlw|🙏|❤|thanks?/iu.test(body) ? 'coracao' : 'joinha'
}

/** Fixture strings that must never reach a real-mode channel. */
export const SCRIPTED_HELLO = 'Olá — em que posso ajudar?'

/** Display name for RUN-ERRORS-SPEC. Never a CLI binary. */
const PROVIDER_LABEL: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  gemini: 'Gemini',
  grok: 'Grok',
  ollama: 'Ollama',
}

/** Host-bound inputs for {@link preRoute} (roster, budget, ACL). */
export interface HostPreRoutePorts {
  personas(): readonly { id: string; name: string }[]
  budgetLeft(): boolean
  silenceUntil(): number
  canCommand(command: 'pausar' | 'retomar' | 'tarefa', senderId: string): boolean
  firstDelivery?(trigger: Trigger): FirstDeliveryRouteDirective | undefined
}

const ROUTE_WINDOW_KIND = 'preroute_window'
const ROUTE_WINDOW_ID = 'log'
const ROUTE_WINDOW_KEEP = 80
const FirstDeliveryRouteSchema = z.object({ executorId: z.string().min(1), title: z.string().min(1) })

function defaultPreRoutePorts(): HostPreRoutePorts {
  return {
    personas: () => [],
    budgetLeft: () => true,
    silenceUntil: () => 0,
    canCommand: () => true,
  }
}

interface RunnerUsageContext {
  ticketId: string | undefined
  kind: TurnLedgerEntry['kind']
  engine: string
  model: string
}

/** One project's live engine bound to SQLite. */
export class ProjectRuntime {
  readonly repo: SqliteRepositories
  readonly engine: Engine
  readonly outbox: SqliteOutbox
  readonly candidates: Candidate[] = []
  readonly launches: Array<{ ticketId: string; assignmentId: string }> = []
  readonly recoveryNotes: string[] = []
  readonly started: Set<string> = new Set<string>()
  readonly routeLog: MemoryPreRouteLog = new MemoryPreRouteLog()
  lastRoute: PreRouteResult | undefined
  runner: Runner | undefined
  readonly runnerReady: Promise<Runner>

  /**
   * @param repo - SQLite engine repositories for this project.
   * @param now - Instant factory.
   * @param _runnerFactory - Unused; per-persona resolve happens in {@link Orchestration.resolveFor}.
   * @param ports - Roster / budget / ACL for the pre-router.
   * @param onActivity - Persist `assignment.reported` (host `recordTurnActivity`).
   * @param onDomainEvent - Host presentation of durable engine availability events.
   */
  constructor(
    repo: SqliteRepositories,
    now: () => string,
    _runnerFactory?: HostRunnerFactory,
    ports: HostPreRoutePorts = defaultPreRoutePorts(),
    onActivity?: (row: TurnActivityEvent) => void,
    onDomainEvent?: (event: DomainEvent) => void,
  ) {
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
    const activity = withTurnActivityEmit((row) => { onActivity?.(row) })
    this.engine = new Engine({
      repo,
      policy: () => policy,
      scope: composeSourceScope(allExternalSourceScope(), {
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
      }),
      assessor,
      executor,
      outbox: this.outbox,
      now,
      preRoute: trigger => this.route(trigger, ports),
      emit: (event) => { activity(event); onDomainEvent?.(event) },
    })
    this.restoreRouteWindow()
  }

  /**
   * Run the deterministic pre-router and remember the message for the window.
   * @param trigger - Inbound.
   * @param ports - Roster / budget / ACL.
   */
  route(trigger: Trigger, ports: HostPreRoutePorts): PreRouteResult {
    const thread = trigger.threads[0]
    // The anti-duplicate window is per conversation (the channel), not per message thread.
    const threadKey = trigger.channel !== undefined
      ? `${trigger.channel.source}:${trigger.channel.thread}`
      : (thread === undefined ? trigger.id : `${thread.source}:${thread.id}`)
    const parsed = Date.parse(trigger.at)
    const at = Number.isFinite(parsed) ? parsed : 0
    const firstDelivery = ports.firstDelivery?.(trigger)
    const result = preRoute({
      text: trigger.text,
      senderId: trigger.actor.id,
      threadKey,
      at,
      personas: ports.personas(),
      budgetLeft: ports.budgetLeft(),
      silenceUntil: ports.silenceUntil(),
      canCommand: command => ports.canCommand(command, trigger.actor.id),
      window: this.routeLog.window,
      ...(firstDelivery === undefined ? {} : { firstDelivery }),
    })
    this.routeLog.record({
      at,
      action: result.action,
      ...(result.rule === undefined ? {} : { rule: result.rule }),
      why: result.why,
      modelCalled: result.modelCalled,
      triggerId: trigger.id,
    })
    this.routeLog.remember({
      text: trigger.text, senderId: trigger.actor.id, threadKey, at,
    })
    this.persistRouteWindow()
    // @mention picks the speaker in ingest; it must not auto-accept a ticket.
    const decided = result.rule === 'mention'
      ? { action: 'model' as const, why: result.why, modelCalled: true, rule: result.rule }
      : result
    this.lastRoute = decided
    return decided
  }

  /** Reload the duplicate window from `screen_doc` (process restart). */
  private restoreRouteWindow(): void {
    const rows = new ScreenRepos(this.repo.store).get<RouteWindowEntry[]>(
      this.repo.projectId, ROUTE_WINDOW_KIND, ROUTE_WINDOW_ID,
    )
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      if (typeof row.text !== 'string') continue
      this.routeLog.remember(row)
    }
  }

  /** Keep the newest window rows so a new runtime still de-dupes. */
  private persistRouteWindow(): void {
    new ScreenRepos(this.repo.store).put(
      this.repo.projectId, ROUTE_WINDOW_KIND, ROUTE_WINDOW_ID,
      this.routeLog.window.slice(-ROUTE_WINDOW_KEEP),
    )
  }
}

/**
 * One useful Coordination line: who does what, when it comes back.
 * Never echoes the person's text; never a placeholder ("Recebido", "digitando").
 * @param input - Message + who will execute.
 */
export function coordinationHandoff(input: {
  readonly body: string
  readonly executorName: string
  readonly samePerson: boolean
}): string {
  const job = summarizeWork(input.body)
  if (input.samePerson) return `Faço ${job} e te chamo na revisão.`
  return `${input.executorName} assume ${job}. Te chamo na revisão quando estiver pronto.`
}

/**
 * Short job noun for the handoff. Keywords only — not a quote of the message.
 * @param body - Person's text.
 */
export function summarizeWork(body: string): string {
  if (/readme/iu.test(body)) return 'o README'
  if (/changelog/iu.test(body)) return 'o changelog'
  if (/document|\bdocs?\b/iu.test(body)) return 'a documentação'
  if (/deploy/iu.test(body)) return 'o deploy'
  if (/testes?|\bspec\b/iu.test(body)) return 'os testes'
  if (/corrig|consert|bug|\berro\b/iu.test(body)) return 'a correção'
  return 'este pedido'
}

/**
 * Compose engines per project and turn human channel/DM messages into tickets.
 */
export class Orchestration {
  readonly runtimes: Map<string, ProjectRuntime> = new Map<string, ProjectRuntime>()
  work: Promise<void> = Promise.resolve()
  readonly budget: ExecutionBudget
  readonly cancelled: Set<string> = new Set<string>()
  /** Minimum gap between two writes of a reply that is streaming into the thread. */
  streamThrottleMs: number = 120
  /** Tickets whose open turn a person stopped (Parar): the run loop must not report them afterwards. */
  readonly stopped: Set<string> = new Set<string>()
  readonly lastErrors: string[] = []
  private readonly meteredRunners = new WeakSet<Runner>()
  private readonly usageContexts = new WeakMap<Runner, RunnerUsageContext>()

  /**
   * @param product - Product repos.
   * @param events - Event log.
   * @param store - Open store (for engine tables).
   * @param now - Instant factory.
   * @param runnerFactory - Per-persona resolve (plugin inject when present).
   * @param budget - Concurrent execution slots.
   * @param deadLetters - Exhausted outbox/effect failures.
   * @param usage - Measured-turn ledger (D5).
   * @param mutant - One run per ticket (B7).
   */
  constructor(
    readonly product: ProductRepos,
    readonly events: EventRepos,
    readonly store: SqliteRepositories['store'],
    now: () => string = () => new Date().toISOString(),
    runnerFactory: HostRunnerFactory = createHostRunner,
    budget: ExecutionBudget = new ExecutionBudget(),
    deadLetters?: DeadLetterBook,
    usage?: SqliteUsageStore,
    mutant?: MutantRunBook,
  ) {
    this.now = now
    this.runnerFactory = runnerFactory
    this.budget = budget
    this.deadLetters = deadLetters
    this.usage = usage
    this.mutant = mutant
  }

  now: () => string
  runnerFactory: HostRunnerFactory
  /** Deployment settings passed to the file-delivery provider. */
  reviewOptions: HostReviewOptions = {}
  readonly deadLetters: DeadLetterBook | undefined
  readonly usage: SqliteUsageStore | undefined
  readonly mutant: MutantRunBook | undefined
  /** Persist a core turn (host maps `usagePortWindow` at the Rivet port). */
  recordLedger: ((projectId: string, entry: TurnLedgerEntry) => void) | undefined = undefined
  /** Persist T3 §9 rows from `Engine.report` (`assignment.reported`). */
  recordActivity: ((projectId: string, row: TurnActivityEvent) => void) | undefined = undefined
  /** Notify the host after task execution and its channel reply settle; failed means execution threw. */
  onTaskSettled: ((event: StoredEvent, failed: boolean) => void) | undefined = undefined
  /** Cached-only admission decision; scripted/test composition can return ready. */
  engineReadinessOf: (() => Pick<EngineStatusView, 'state' | 'reason'>) | undefined = undefined
  /** Arm host reconnection polling after intake retains a message. */
  onEngineDeferred: (() => void) | undefined = undefined
  /** A Task was stopped by the quota window (IV-7): the host arms its re-check (reset clock, or a fixed period). */
  onQuotaWaiting: ((info: { readonly projectId: string; readonly ticketId: string }) => void) | undefined = undefined
  vault: VaultRepos | undefined
  opt: OptRepos | undefined
  accounts: AccountRepos | undefined
  accountSeatOf?: (projectId: string, persona: StoredPersona) => { home: string; accountId?: string; activity?: string }
  /** Logged-in CLI from `listConnections` (no extra engine step). */
  loggedCliOf?: (projectId: string) => DetectedCli | undefined
  /** `persona_runtime` docs (same rows as `pausePersona`). */
  screens: ScreenRepos | undefined
  /** Warm runner lease per project+persona+purpose (Rivet D10). */
  readonly warmRunners: Map<string, Runner> = new Map<string, Runner>()
  /** Stage timings from last ingest (ms from first mark). */
  readonly stages: Array<{ name: string; ms: number }> = []
  /** Last compiled Cofre records keyed by event / ticket id. */
  readonly usedContext: Map<string, UsedContextRecord[]> = new Map<string, UsedContextRecord[]>()
  private stageOrigin: number = 0
  /** Test hook: throw from here to fail the next outbox deliver. */
  outboxDeliver?: (id: string, text: string) => void
  /** Test hook: next streamed model text (real-mode classify / empty). */
  liveText: string | undefined = undefined
  /** Test hook: `ended.report.question` (D-052). */
  liveQuestion: string | undefined = undefined
  /**
   * Token lever SK (D-073): do not spend the coordination triage call. It runs on an answer-only runner (no tools) and
   * nothing reads its answer: Tickets come from the router, the worker from the Ticket. Turn it off to bring the call back,
   * e.g. if the MCP tools are ever wired to the adapters (contracts/token-wiring.md).
   */
  skipTriage: boolean = true
  /**
   * Token lever CF (D-075): a courtesy line ("valeu!", "ok") gets a visible reaction of the persona instead of a model call.
   * Never when the persona has something open for the person in that thread (an Attention question, or her last line is a
   * question): then "ok" is an answer and takes the normal route. Courtesy + a request is work (`wantsWork` wins).
   */
  courtesyNoModel: boolean = true
  /** Test hook: force the scripted/real gate. Default follows env. */
  scripted: boolean = allowsScriptedReplies()
  /** Names of files bound to a message (MediaHost). */
  attachmentNamesOf?: (eventId: string) => string[]
  /** Copy those files into worktree/talk `inputs/` (images skip the copy when `hasVision`). */
  stageAttachments?: (eventId: string, destDir: string, hasVision?: boolean) => string[]

  /**
   * Record a named stage for the first-reply table.
   * @param name - Stage id.
   */
  mark(name: string): void {
    const now = Date.now()
    if (this.stageOrigin === 0) this.stageOrigin = now
    this.stages.push({ name, ms: now - this.stageOrigin })
  }

  /**
   * Open one Coordination talk session with no model turn (Rivet D10).
   * @param projectId - Tenant.
   */
  async prewarmProject(projectId: string): Promise<void> {
    if (allowsScriptedReplies()) return
    const coord = this.coordinationOf(projectId)
    if (coord === undefined) return
    const key = `${projectId}:${coord.id}:talk`
    if (this.warmRunners.has(key)) return
    try {
      const cwd = process.env.PERSONA_HOME !== undefined && process.env.PERSONA_HOME !== ''
        ? process.env.PERSONA_HOME
        : '.'
      await prewarmCoordination({
        spec: specFromConnection(coord.runner, this.loggedCliOf?.(projectId)),
        permissionMode: 'deny',
        personaId: coord.id,
        personId: coord.id,
        projectId,
        cwd,
      })
    } catch {
      // Missing CLI must not block boot.
    }
  }

  /** Prewarm every project that already has Coordination. */
  prewarmAll(): void {
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        void this.prewarmProject(project.id)
      }
    }
  }

  /** Close warm leases and Rivet's process pool (quit / pause). */
  async disposeRunners(): Promise<void> {
    this.warmRunners.clear()
    await disposeRunnerSessions()
  }

  /**
   * Engine runtime for a project. Creates it on first use.
   * @param projectId - Tenant.
   * @returns Bound runtime.
   */
  runtime(projectId: string): ProjectRuntime {
    const existing = this.runtimes.get(projectId)
    if (existing !== undefined) return existing
    const created = new ProjectRuntime(
      new SqliteRepositories(this.store, projectId),
      this.now,
      this.runnerFactory,
      {
        personas: () => this.product.listPersonas(projectId).map(persona => ({
          id: persona.id, name: persona.name,
        })),
        budgetLeft: () => this.routeBudgetLeft(projectId),
        silenceUntil: () => this.routeSilenceUntil(projectId),
        canCommand: (command, senderId) => this.routeCanCommand(projectId, command, senderId),
        firstDelivery: trigger => this.firstDeliveryRoute(projectId, trigger.id),
      },
      (row) => { this.recordActivity?.(projectId, row) },
      (event) => { this.presentEngineAvailability(projectId, event) },
    )
    this.runtimes.set(projectId, created)
    if (created.engine.pendingEngineTriggers().length > 0) this.onEngineDeferred?.()
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
    this.work = this.work.then(() => this.recoverTalks(created, projectId)).catch((error: unknown) => {
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
   * @param responderId - Explicit responder, empty for the stored mention or Coordination.
   * @param resumed - Trigger already released by engineReady; omitted performs initial receive.
   * @param firstDelivery - Host-authorized onboarding target; never supplied by the message Remote.
   */
  ingest(event: StoredEvent, streamKind: 'channel' | 'dm', ownerId: string, responderId: string = '', resumed?: Trigger, firstDelivery?: FirstDeliveryRouteDirective): void {
    if (this.product.getPersona(event.actorId) !== undefined) return
    const coordination = this.coordinationOf(event.projectId)
    const mentioned = this.mentionedPersona(event.projectId, event.body)
    const dmPeer = streamKind === 'dm' ? this.dmPersona(ownerId, event.actorId) : undefined
    const firstDeliveryTarget = firstDelivery ?? this.firstDeliveryRoute(event.projectId, event.id)
    const chosen = firstDeliveryTarget === undefined
      ? ((responderId === '' ? undefined : this.product.getPersona(responderId)) ?? mentioned ?? dmPeer)
      : this.product.listPersonas(event.projectId).find(persona => persona.id === firstDeliveryTarget.executorId)
    const speaker = chosen ?? coordination
    const readiness = this.engineReadinessOf?.()
    if (speaker === undefined && (readiness === undefined || readiness.state === 'ready')) return
    this.stageOrigin = 0
    this.stages.length = 0
    this.mark('ingest')
    if (firstDelivery !== undefined) this.screens?.put(event.projectId, 'first_delivery_route', event.id, firstDelivery)
    // A paused persona does not take the message: it is kept as it is (not even routed) and starts when /retomar comes.
    if (speaker !== undefined && resumed === undefined && firstDelivery === undefined
      && pauseCommandOf(event.body) === undefined && this.isPersonaPaused(event.projectId, speaker.id)) {
      this.holdPaused(event, streamKind, ownerId, responderId, speaker)
      return
    }
    const rt = this.runtime(event.projectId)
    const original = this.triggerOf(event, streamKind, ownerId, mentioned !== undefined || streamKind === 'dm')
    const trigger = resumed ?? { ...original, meta: { ...original.meta, responderId,
      ...(firstDelivery === undefined ? {} : { firstDelivery }),
    } }
    const unavailable = readiness !== undefined && readiness.state !== 'ready' && pauseCommandOf(event.body) === undefined
    const result = resumed === undefined ? rt.engine.receive(trigger, { deferRouting: unavailable }) : 'stored'
    if (result === 'duplicate' || result === 'filtered') return
    if (rt.engine.pendingEngineTriggers().some(item => item.id === trigger.id)) {
      if (unavailable) {
        rt.engine.engineUnavailable(trigger.id, readiness.reason ?? 'none_connected')
      }
      this.onEngineDeferred?.()
      return
    }
    if (speaker === undefined) return
    this.pass(event.projectId)
    const routed = rt.lastRoute
    const pauseCommand = pauseCommandOf(event.body)
    if (pauseCommand !== undefined) {
      if (this.routeCanCommand(event.projectId, pauseCommand, event.actorId)) {
        this.applyPauseCommand(event, speaker, pauseCommand)
      }
      return
    }
    if (this.isPersonaPaused(event.projectId, speaker.id)) {
      this.postAs(
        event,
        speaker,
        `coord-${event.id}-paused`,
        `${speaker.name} está pausada. Use /retomar para voltar.`,
      )
      return
    }
    if (routed !== undefined && !routed.modelCalled) {
      const accepted = routed.action === 'assign'
        || (routed.action === 'command' && routed.command === 'tarefa')
      if (!accepted) {
        if (routed.action === 'react' || !wantsWork(event.body)) {
          if (this.courtesyNoModel && routed.action === 'react' && routed.rule === 'courtesy' && !wantsWork(event.body)
            && !this.pendingFromPersona(rt, event) && this.reactCourtesy(event, speaker)) return
          this.work = this.work.then(() => this.finishReply(rt, event, speaker)).catch((error: unknown) => {
            if (error instanceof Error && /not open/i.test(error.message)) return
            this.failReply(event, speaker, error)
          })
        }
        // A work request held back by silence or a full project must not vanish: say so now, keep it, retry later.
        if (routed.action === 'silent' && wantsWork(event.body)) this.holdSilenced(event, streamKind, ownerId, responderId, speaker)
        // A work request the rules turned down (duplicate, injection, out of scope, refused command) is told so: never silence.
        if (routed.action === 'ignore' && routed.rule !== 'empty' && wantsWork(event.body)) {
          this.postAs(event, speaker, `coord-${event.id}-ignored`, ignoredLine(routed))
        }
        return
      }
    }
    // D-079: a message continues a task only when that task is RUNNING in this conversation on the same subject, or when it
    // answers the question the persona asked there. Anything else is a message of its own (Ticket or conversation).
    if (firstDeliveryTarget === undefined) {
      const absorber = this.absorbingTicket(rt, event, streamKind, ownerId)
      if (absorber !== undefined && this.absorb(rt, event, absorber)) {
        this.settleCandidates(rt, event)
        return
      }
      this.noteBusy(rt, event, speaker)
    }
    const work = firstDeliveryTarget !== undefined || wantsWork(event.body)
    this.mark(work ? 'triage:ticket' : 'triage:talk')
    this.decidePending(rt, event.body, work, chosen)
    this.advanceAssignments(rt, event.projectId)
    if (!work) {
      this.work = this.work.then(() => this.finishReply(rt, event, speaker)).catch((error: unknown) => {
        if (error instanceof Error && /not open/i.test(error.message)) return
        this.failReply(event, speaker, error)
      })
      return
    }
    this.bindExecution(rt, event.projectId, chosen)
    const ticket = rt.repo.tickets.list().find(item => item.origin.triggerId === event.id)
    const topicId = event.topicId !== undefined && event.topicId !== ''
      ? event.topicId
      : (event.subjectId === '' ? event.id : event.subjectId)
    if (ticket !== undefined && event.topicId !== undefined && event.topicId !== '') {
      this.screens?.put(event.projectId, 'ticket_subject', ticket.id, { subjectId: event.topicId })
    }
    const claim = ticket === undefined || this.mutant === undefined
      ? 'running'
      : this.mutant.claim(event.projectId, ticket.id, topicId, event.id)
    if (claim === 'queued' || claim === 'refused') {
      this.postAs(
        event,
        coordination,
        `coord-${event.id}-queue`,
        claim === 'queued' ? 'Esta execução entra na fila deste assunto.' : 'Já há uma execução neste assunto.',
      )
      return
    }
    this.streamAck(event, coordination)
    this.work = this.work.then(() => this.settleTask(rt, event, coordination, chosen))
  }

  /**
   * Release retained messages in the engine's per-stream order without receiving them twice.
   * @param projectId - Local project.
   * @param confirmedTriggerId - Explicitly confirmed expired message; omission never confirms one.
   * @returns Number of messages handed back to host routing.
   */
  resumeEngineTriggers(projectId: string, confirmedTriggerId?: string): number {
    const rt = this.runtime(projectId)
    let resumed = 0
    for (const pending of rt.engine.pendingEngineTriggers()) {
      const event = this.events.get(pending.id)
      if (event === undefined) continue
      const trigger = rt.engine.engineReady(pending.id, { confirmed: pending.id === confirmedTriggerId })
      if (trigger === undefined) continue
      const kind = event.streamId.startsWith('dm:') ? 'dm' : 'channel'
      const responder = typeof trigger.meta.responderId === 'string' ? trigger.meta.responderId : ''
      this.ingest(event, kind, event.streamId.slice(kind.length + 1), responder, trigger)
      resumed += 1
    }
    return resumed
  }

  /** @param projectId - Local project. @param triggerId - Stored onboarding request. @returns Host-owned routing directive, never inferred from caller text or IDs. */
  firstDeliveryRoute(projectId: string, triggerId: string): FirstDeliveryRouteDirective | undefined {
    const stored = this.screens?.get<unknown>(projectId, 'first_delivery_route', triggerId)
    return stored === undefined ? undefined : FirstDeliveryRouteSchema.parse(stored)
  }

  private presentEngineAvailability(projectId: string, event: DomainEvent): void {
    if (event.type !== 'no_engine_ready' && event.type !== 'engine_confirmation_required') return
    const original = this.events.get(event.data.triggerId)
    if (original === undefined) return
    const id = `engine-status:${event.type}:${event.data.triggerId}`
    if (this.events.has(id)) return
    this.events.append({
      id, workspaceId: original.workspaceId, projectId,
      streamKind: original.streamId.startsWith('dm:') ? 'dm' : 'channel',
      ownerId: original.streamId.slice(original.streamId.indexOf(':') + 1),
      type: event.type,
      body: `[[run-error:${JSON.stringify({
        code: 'engine_unavailable', reason: event.data.reason, triggerId: event.data.triggerId,
      })}]]`,
      actorId: this.coordinationOf(projectId)?.id ?? 'system', subjectId: original.subjectId,
      occurredAt: event.at,
      ...(original.topicId === undefined ? {} : { topicId: original.topicId }),
    })
  }

  /** Post a line in the thread of `event` as `speaker` (the account switch and its Notice). Idempotent on `id`. */
  postThreadLine(event: StoredEvent, speaker: StoredPersona | undefined, id: string, body: string): void {
    this.postAs(event, speaker, id, body)
  }

  private quotaBook(): QuotaWaitBook | undefined {
    return this.screens === undefined ? undefined : new QuotaWaitBook(this.screens)
  }

  /** Remember a Task the quota window stopped, so it runs again when the engine is ready (IV-7). */
  private waitForQuota(projectId: string, ticket: { readonly id: string; readonly assignments: readonly { readonly id: string }[]; readonly execution?: { readonly name?: string } }, error: { readonly code: string }): void {
    const book = this.quotaBook()
    const latest = ticket.assignments.at(-1)
    if (book === undefined || latest === undefined) return
    const extra = error as { resetAt?: string; provider?: string }
    const persona = this.product.listPersonas(projectId).find(row => row.name === ticket.execution?.name)
    const account = persona === undefined ? undefined : this.screens?.get<{ accountId: string }>(projectId, 'active_account', persona.id)?.accountId
    book.record(projectId, {
      ticketId: ticket.id,
      assignmentId: latest.id,
      provider: extra.provider ?? '',
      ...(persona === undefined ? {} : { personaId: persona.id }),
      ...(account === undefined ? {} : { accountId: account }),
      ...(extra.resetAt === undefined ? {} : { resetAt: extra.resetAt }),
      since: this.now(),
    })
    this.onQuotaWaiting?.({ projectId, ticketId: ticket.id })
  }

  /** The Tasks the quota stopped in one project, oldest first, with the persona and account they ran on ("na hora, com outra conta"). */
  quotaRows(projectId: string): QuotaWaitRow[] {
    return this.quotaBook()?.list(projectId) ?? []
  }

  /** Drop the warm runners of a persona: they are bound to the home of the account she used (after a switch). */
  evictWarmRunners(projectId: string, personaId: string): number {
    let evicted = 0
    for (const [key, runner] of [...this.warmRunners]) {
      if (!key.startsWith(`${projectId}:${personaId}:`)) continue
      this.warmRunners.delete(key)
      evicted += 1
      const dispose: unknown = Reflect.get(runner, 'dispose')
      if (typeof dispose === 'function') {
        void Promise.resolve(dispose.call(runner)).catch((error: unknown) => { void error })
      }
    }
    return evicted
  }

  /**
   * Tasks waiting for the quota, across projects, oldest first (the host decides when to look again).
   * @returns The rows with their project.
   */
  quotaWaiting(): { readonly projectId: string; readonly ticketId: string; readonly resetAt?: string }[] {
    const book = this.quotaBook()
    if (book === undefined) return []
    return [...this.runtimes.keys()].flatMap(projectId => book.list(projectId).map(row => ({
      projectId, ticketId: row.ticketId, ...(row.resetAt === undefined ? {} : { resetAt: row.resetAt }),
    })))
  }

  /**
   * Run again, in order, the Tasks the quota window stopped, once the engine is ready: on the probe saying so, at the reset
   * clock, or when the person clicks Retomar. Each Ticket gets a new Assignment (`retryTicket`) and runs once; a Ticket that
   * moved on since (someone retried it, stopped it, finished it) is dropped from the list without running.
   * @param projectId - Tenant.
   * @returns How many Tasks were run again.
   */
  async resumeQuotaWaiting(projectId: string, options: { readonly ticketId?: string; readonly force?: boolean } = {}): Promise<number> {
    const book = this.quotaBook()
    // `force`: the person chose another account (confirmAccountSwap); the runner re-checks that account before the turn.
    if (book === undefined || (options.force !== true && this.engineReadinessOf?.().state !== 'ready')) return 0
    const rt = this.runtime(projectId)
    let resumed = 0
    for (const row of book.list(projectId).filter(item => options.ticketId === undefined || item.ticketId === options.ticketId)) {
      book.clear(projectId, row.ticketId)
      const ticket = rt.repo.tickets.get(row.ticketId)
      if (ticket === undefined || ticket.ended !== undefined || latestAssignment(ticket)?.id !== row.assignmentId) continue
      try {
        rt.engine.retryTicket(ticket.id)
      } catch (error) {
        void error
        continue
      }
      await this.driveTicket(projectId, ticket.id)
      resumed += 1
    }
    return resumed
  }

  /** True when the persona has something open for the person in the thread of `event`: an Attention question or a last line that asks. */
  private pendingFromPersona(rt: ProjectRuntime, event: StoredEvent): boolean {
    return this.pendingInStream(rt, event.streamId, event.seq)
  }

  /**
   * Does the persona have something open for the person in this stream? The rule `ingest` applies before it lets a courtesy
   * be a reaction, asked BEFORE a message is sent (the estimate under the composer).
   * @param projectId - Tenant.
   * @param streamId - `channel:<id>` or `dm:<id>`.
   * @returns True when a Ticket of that stream waits on the person (Attention) or the persona's last line is a question.
   */
  pendingFromPersonaIn(projectId: string, streamId: string): boolean {
    return this.pendingInStream(this.runtime(projectId), streamId, Number.MAX_SAFE_INTEGER)
  }

  private pendingInStream(rt: ProjectRuntime, streamId: string, beforeSeq: number): boolean {
    for (const ticket of rt.repo.tickets.list()) {
      if (ticket.attention === undefined) continue
      if (this.events.get(ticket.origin.triggerId)?.streamId === streamId) return true
    }
    const last = this.store.db.prepare(
      "SELECT actor_id AS actorId, body FROM event WHERE stream_id = ? AND seq < ? AND deleted = 0 AND type <> 'partial' ORDER BY seq DESC LIMIT 1",
    ).get(streamId, beforeSeq) as { actorId: string; body: string } | undefined
    return last !== undefined && this.product.getPersona(last.actorId) !== undefined && /[?？]\s*$/u.test(last.body.trim())
  }

  /** The persona reacts to a courtesy line with a catalog sticker (no model, no Ticket). Idempotent. */
  private reactCourtesy(event: StoredEvent, speaker: StoredPersona): boolean {
    const stickerId = courtesyStickerFor(event.body)
    if (!this.events.listReactions(event.id).some(row => row.actorId === speaker.id && row.stickerId === stickerId)) {
      this.events.addReaction({ eventId: event.id, actorId: speaker.id, stickerId, projectId: event.projectId })
      this.events.addAudit({
        id: `react:${event.id}:${speaker.id}:${stickerId}`,
        eventId: event.id, projectId: event.projectId, actorId: speaker.id, action: 'react', detail: stickerId,
      })
    }
    this.mark('courtesy:react')
    return true
  }

  private async settleTask(
    rt: ProjectRuntime,
    event: StoredEvent,
    coordination: StoredPersona | undefined,
    preferred?: StoredPersona,
    only?: string,
  ): Promise<void> {
    let failed = false
    try {
      await this.runLaunched(rt, event, coordination, preferred, only)
    } catch (error: unknown) {
      if (error instanceof Error && /not open/i.test(error.message)) return
      failed = true
      this.failReply(event, preferred ?? coordination, error)
    }
    this.onTaskSettled?.(event, failed)
  }

  /**
   * Run one open ticket whose assignment is running but that nobody executes: a retry, an answered question, a full slot
   * ("Aguardando vaga"), a restart. It joins the same chain as a person's message, so it never races one; only that ticket
   * runs, as the persona it is bound to. Used by the proactivity scheduler (IV-1).
   * @param projectId - Tenant.
   * @param ticketId - Ticket to run.
   */
  driveTicket(projectId: string, ticketId: string): Promise<void> {
    const rt = this.runtime(projectId)
    this.advanceAssignments(rt, projectId)
    let ticket = rt.repo.tickets.get(ticketId)
    const queued = ticket === undefined ? undefined : latestAssignment(ticket)
    if (ticket !== undefined && ticket.ended === undefined && queued?.state === 'pending') {
      rt.engine.assignmentStarted(ticketId, queued.id)
      ticket = rt.repo.tickets.get(ticketId)
    }
    if (ticket === undefined || ticket.ended !== undefined || latestAssignment(ticket)?.state !== 'running') return Promise.resolve()
    const trigger = rt.repo.triggers.get(ticket.origin.triggerId)
    const thread = trigger?.threads[0]
    const streamKind = thread?.source.startsWith('dm') === true ? 'dm' : 'channel'
    const event: StoredEvent = {
      id: ticket.origin.triggerId,
      streamId: `${streamKind}:${thread?.id ?? 'geral'}`,
      workspaceId: this.product.getProject(projectId)?.workspaceId ?? '',
      projectId,
      seq: 0,
      type: 'message',
      body: trigger?.text ?? ticket.title,
      actorId: trigger?.actor.id ?? '',
      subjectId: ticket.origin.triggerId,
      occurredAt: this.now(),
      deleted: false,
    }
    const owner = ticket.execution?.name
    const persona = owner === undefined ? undefined : this.product.listPersonas(projectId).find(item => item.name === owner)
    const run = this.work.then(() => this.settleTask(rt, event, this.coordinationOf(projectId), persona, ticketId))
    this.work = run.catch(() => undefined)
    return run
  }

  /** Texts of the Inputs a worker has not read yet (answers, notes, later messages), never the request that started the ticket. */
  private pendingInputs(rt: ProjectRuntime, ticket: Ticket): { ids: string[]; texts: string[] } {
    const ids: string[] = []
    const texts: string[] = []
    for (const id of ticket.undelivered) {
      const input = ticket.inputs.find(item => item.id === id)
      if (input === undefined) continue
      if (input.kind === 'text' || input.kind === 'note') {
        ids.push(id)
        texts.push(input.text)
      } else if (input.kind === 'trigger' && input.human === true && !ticket.origin.triggerIds.includes(input.triggerId)) {
        const text = rt.repo.triggers.get(input.triggerId)?.text
        if (text !== undefined) {
          ids.push(id)
          texts.push(text)
        }
      }
    }
    return { ids, texts }
  }

  /** The conversation (`channel:geral`, `dm:<id>`) a ticket was asked in. */
  private conversationOf(rt: ProjectRuntime, ticket: Ticket): string {
    const channel = rt.repo.triggers.get(ticket.origin.triggerId)?.channel
    return channel === undefined ? 'channel:geral' : `${channel.source}:${channel.thread}`
  }

  /**
   * IV-10: where a ticket was asked, so the person's answer is posted in that very thread.
   * @param projectId - Tenant.
   * @param ticketId - Ticket that asks.
   * @returns Stream, conversation subject (`topicId`) and the thread subject of the message that started the ticket.
   */
  conversationOfTicket(projectId: string, ticketId: string): { streamKind: 'channel' | 'dm'; ownerId: string; topicId: string; subjectId: string } | undefined {
    const rt = this.runtime(projectId)
    const ticket = rt.repo.tickets.get(ticketId)
    if (ticket === undefined) return undefined
    const [kind, ...rest] = this.conversationOf(rt, ticket).split(':')
    const ownerId = rest.join(':')
    const streamKind = kind === 'dm' ? 'dm' : 'channel'
    return {
      streamKind,
      ownerId: kind === 'dm' || kind === 'channel' ? ownerId : 'geral',
      topicId: this.screens?.get<{ subjectId: string }>(projectId, 'ticket_subject', ticketId)?.subjectId ?? '',
      subjectId: this.events.get(ticket.origin.triggerId)?.subjectId ?? '',
    }
  }

  /**
   * The ticket a new message of the person continues, if any: one asking a question in this conversation (the message answers
   * it in plain words), or one RUNNING here on the same subject whose turn can take the text. Finished, ready, in-review,
   * blocked or other-subject tickets never absorb.
   */
  private absorbingTicket(
    rt: ProjectRuntime,
    event: StoredEvent,
    streamKind: 'channel' | 'dm',
    ownerId: string,
  ): { ticket: Ticket; kind: 'answer' | 'continuation' } | undefined {
    const here = `${streamKind}:${ownerId}`
    const subject = event.topicId ?? ''
    const open = rt.repo.tickets.list().filter(ticket => ticket.ended === undefined && this.conversationOf(rt, ticket) === here)
    // An answer in plain words (not a new request), or any reply written ON the line where the persona asked.
    const asking = open.find(ticket => ticket.attention !== undefined && latestAssignment(ticket)?.report?.state === 'waiting'
      && (!wantsWork(event.body) || event.replyToId === doneEventId(ticket)))
    if (asking !== undefined) return { ticket: asking, kind: 'answer' }
    for (const ticket of open) {
      const latest = latestAssignment(ticket)
      const turnOpen = latest?.state === 'running' && (latest.report === undefined || latest.report.state === 'progress')
      const ticketSubject = this.screens?.get<{ subjectId: string }>(event.projectId, 'ticket_subject', ticket.id)?.subjectId ?? ''
      if (turnOpen && ticketSubject === subject && this.taskRunnerOf(event.projectId, ticket.id)?.status(workerSessionId(ticket.id)) === 'running') {
        return { ticket, kind: 'continuation' }
      }
    }
    return undefined
  }

  /** Hand the message to the ticket and say so in the thread. false when it could not be handed over (then it flows normally). */
  private absorb(rt: ProjectRuntime, event: StoredEvent, found: { ticket: Ticket; kind: 'answer' | 'continuation' }): boolean {
    const { ticket, kind } = found
    const persona = this.product.listPersonas(event.projectId).find(item => item.name === ticket.execution?.name)
    const name = persona?.name ?? 'a equipe'
    if (kind === 'continuation') {
      const runner = this.taskRunnerOf(event.projectId, ticket.id)
      if (runner === undefined) return false
      // "Direcionar agora" delivers itself into the turn (as a steer); the message in the thread is its visible reaction.
      if (event.id.startsWith('steer:')) return true
      // Straight into the open turn's queue (the running task itself holds the work chain): it reads the text after this step.
      void runner.deliver(workerSessionId(ticket.id), `msg:${event.id}`, event.body, 'queue').catch((error: unknown) => {
        this.lastErrors.push(error instanceof Error ? error.message : String(error))
      })
      this.postAs(event, persona, `coord-${event.id}-absorbed`, `Passei para ${name}: lê assim que terminar o passo atual.`)
      return true
    }
    try {
      // IV-10: files attached to the reply reach the worker too (named in the answer, copied next to it).
      const files = this.attachmentNamesOf?.(event.id) ?? []
      const stage = files.length > 0 ? workerDirOf(event.projectId, ticket) : undefined
      if (stage !== undefined) this.stageAttachments?.(event.id, stage, false)
      rt.engine.answerAttention(ticket.id, citeAttachments(event.body, files))
      this.postAs(event, persona, `coord-${event.id}-absorbed`, `Resposta enviada para ${name}: continua “${ticket.title}”.`)
      void this.wakeAfterAnswer(event.projectId, ticket.id).catch((error: unknown) => {
        this.lastErrors.push(error instanceof Error ? error.message : String(error))
      })
    } catch (error: unknown) {
      this.lastErrors.push(error instanceof Error ? error.message : String(error))
      this.postAs(event, persona, `coord-${event.id}-absorbed`, `Guardei sua resposta para ${name}; ela lê quando voltar a trabalhar.`)
    }
    return true
  }

  /** The persona is in the middle of a task: say so, so the message is never met with silence. */
  private noteBusy(rt: ProjectRuntime, event: StoredEvent, speaker: StoredPersona): void {
    if (this.budget.of(event.projectId) === 0) return
    const running = rt.repo.tickets.list().find(ticket => ticket.ended === undefined && latestAssignment(ticket)?.state === 'running')
    if (running === undefined) return
    const mine = running.execution?.name === speaker.name
    this.postAs(event, speaker, `coord-${event.id}-busy`, mine
      ? `Estou terminando “${running.title}”; respondo em seguida.`
      : `A equipe está terminando “${running.title}”; respondo em seguida.`)
  }

  /**
   * IV-10: the person's answer (text and any files already bound to `messageId`) reaches the ticket that asked. The files are
   * copied next to the worker (`inputs/`) and named in the answer; the question is cleared; the worker wakes and reads it.
   * @param projectId - Tenant.
   * @param ticketId - Ticket that asked.
   * @param text - Answer text.
   * @param messageId - The person's message in the thread, which carries the files.
   * @returns true when the question is cleared.
   */
  deliverAttentionAnswer(projectId: string, ticketId: string, text: string, messageId: string): boolean {
    const rt = this.runtime(projectId)
    const ticket = rt.repo.tickets.get(ticketId)
    if (ticket === undefined) return false
    const files = this.attachmentNamesOf?.(messageId) ?? []
    const stage = files.length > 0 ? workerDirOf(projectId, ticket) : undefined
    if (stage !== undefined) this.stageAttachments?.(messageId, stage, false)
    const answered = rt.engine.answerAttention(ticketId, citeAttachments(text, files))
    void this.wakeAfterAnswer(projectId, ticketId).catch((error: unknown) => {
      this.lastErrors.push(error instanceof Error ? error.message : String(error))
    })
    return answered.attention === undefined
  }

  /**
   * After a person answered the question of a ticket (the `answerAttention` Remote or a plain-words reply), wake its worker:
   * a new Assignment that reads the answer, run at once.
   * @param projectId - Tenant.
   * @param ticketId - Ticket that asked.
   */
  wakeAfterAnswer(projectId: string, ticketId: string): Promise<void> {
    const rt = this.runtime(projectId)
    const ticket = rt.repo.tickets.get(ticketId)
    if (ticket === undefined || ticket.ended !== undefined || latestAssignment(ticket)?.state !== 'running') return Promise.resolve()
    rt.engine.resumeTicket(ticketId, 'Continue a tarefa com a resposta da pessoa.')
    return this.driveTicket(projectId, ticketId)
  }

  /** The message was handled (handed to a task): tell the engine, so its Eval candidate is not accepted as a new task later. */
  private settleCandidates(rt: ProjectRuntime, event: StoredEvent): void {
    const mine = rt.candidates.filter(candidate => candidate.triggers.some(trigger => trigger.id === event.id))
    for (const candidate of mine) {
      rt.candidates.splice(rt.candidates.indexOf(candidate), 1)
      rt.engine.decide(event.id, { kind: 'ignore', reason: 'answered', evalId: candidate.evalId })
    }
  }

  /** Take a message out of the anti-duplicate window (it was not taken, so asking again is not a repeat). */
  private forgetRouted(rt: ProjectRuntime, trigger: Trigger): void {
    const at = Date.parse(trigger.at)
    for (let index = rt.routeLog.window.length - 1; index >= 0; index -= 1) {
      const seen = rt.routeLog.window[index]
      if (seen !== undefined && seen.senderId === trigger.actor.id && seen.text === trigger.text && seen.at === at) rt.routeLog.window.splice(index, 1)
    }
  }

  private holdPaused(
    event: StoredEvent,
    streamKind: 'channel' | 'dm',
    ownerId: string,
    responderId: string,
    speaker: StoredPersona,
  ): void {
    if (this.screens !== undefined) {
      new HeldMessages(this.screens).hold(event.projectId, {
        eventId: event.id, streamKind, ownerId, responderId, speakerId: speaker.id, at: this.now(),
      })
    }
    this.postAs(event, speaker, `coord-${event.id}-paused`, `${speaker.name} está pausada. Use /retomar para voltar.`)
  }

  private holdSilenced(
    event: StoredEvent,
    streamKind: 'channel' | 'dm',
    ownerId: string,
    responderId: string,
    speaker: StoredPersona,
  ): void {
    const coord = this.coordinationOf(event.projectId)
    const autonomy = coord === undefined ? undefined : new ProactivityRepos(this.store, this.now).getAutonomy(event.projectId, coord.id)
    const silenceEnd = autonomy !== undefined && silenceUntilOf(this.now(), autonomy.silenceStart, autonomy.silenceEnd) > 0 ? (autonomy.silenceEnd ?? '') : ''
    if (this.screens !== undefined) {
      new HeldMessages(this.screens).hold(event.projectId, { eventId: event.id, streamKind, ownerId, responderId, at: this.now() })
    }
    this.postAs(event, speaker, `coord-${event.id}-held`, heldLine(speaker.name, silenceEnd))
  }

  /**
   * Re-evaluate the work requests that were held back, once the gate (silence window, free slot, budget) is open. Used by
   * the proactivity scheduler; safe to call any time.
   * @param projectId - Tenant.
   * @returns How many requests were handed back to routing.
   */
  releaseHeld(projectId: string): number {
    if (this.screens === undefined) return 0
    const book = new HeldMessages(this.screens)
    const held = book.list(projectId)
    if (held.length === 0) return 0
    if (!this.routeBudgetLeft(projectId) || this.routeSilenceUntil(projectId) > 0) return 0
    const rt = this.runtime(projectId)
    let released = 0
    for (const row of held) {
      if (row.speakerId !== undefined && this.isPersonaPaused(projectId, row.speakerId)) continue
      book.drop(projectId, row.eventId)
      const event = this.events.get(row.eventId)
      const trigger = rt.repo.triggers.get(row.eventId)
      if (event === undefined) continue
      if (trigger === undefined) {
        // Never routed (the persona was paused): it comes in now, like a message that just arrived.
        this.ingest(event, row.streamKind, row.ownerId, row.responderId)
        released += 1
        continue
      }
      // The pre-router remembered this very message; replaying it must not look like a duplicate of itself.
      this.forgetRouted(rt, trigger)
      rt.engine.reevaluate(row.eventId)
      this.ingest(event, row.streamKind, row.ownerId, row.responderId, trigger)
      released += 1
    }
    return released
  }

  /** The warm task runner of the persona that executes a ticket, when its turn can be reached. */
  private taskRunnerOf(projectId: string, ticketId: string): Runner | undefined {
    const owner = this.runtime(projectId).repo.tickets.get(ticketId)?.execution?.name
    const persona = owner === undefined ? undefined : this.product.listPersonas(projectId).find(item => item.name === owner)
    if (persona === undefined) return undefined
    return this.warmRunners.get(`${projectId}:${persona.id}:task`) ?? this.warmRunners.get(`${projectId}:${persona.id}:task:answer-only`)
  }

  /**
   * The persona's ticket with a turn open right now (running, no final report yet).
   * @param projectId - Tenant.
   * @param personaId - Persona.
   */
  runningTicketOf(projectId: string, personaId: string): Ticket | undefined {
    const persona = this.product.getPersona(personaId)
    if (persona === undefined) return undefined
    return this.runtime(projectId).repo.tickets.list().find((ticket) => {
      const latest = latestAssignment(ticket)
      return ticket.ended === undefined && ticket.execution?.name === persona.name && latest?.state === 'running'
        && (latest.report === undefined || latest.report.state === 'progress')
    })
  }

  /**
   * “Direcionar agora”: put text into the open turn of a ticket's worker right away.
   * @param projectId - Tenant.
   * @param ticketId - Ticket whose turn is open.
   * @param requestId - Idempotent delivery id.
   * @param text - What the person wants the worker to do differently.
   * @returns false when no turn is open to steer.
   */
  async steerTicket(projectId: string, ticketId: string, requestId: string, text: string): Promise<boolean> {
    const runner = this.taskRunnerOf(projectId, ticketId)
    if (runner === undefined || runner.status(workerSessionId(ticketId)) !== 'running') return false
    await runner.deliver(workerSessionId(ticketId), requestId, text, 'steer')
    return true
  }

  /**
   * Parar: cancel the open turn (keeping what is queued for it) and end the ticket as stopped by the person.
   * @param projectId - Tenant.
   * @param ticketId - Ticket to stop.
   * @param reason - Why it ended.
   * @returns false when the ticket is unknown or already ended.
   */
  async stopTicketRun(projectId: string, ticketId: string, reason: string): Promise<boolean> {
    const rt = this.runtime(projectId)
    const ticket = rt.repo.tickets.get(ticketId)
    if (ticket === undefined || ticket.ended !== undefined) return false
    const runner = this.taskRunnerOf(projectId, ticketId)
    const live = runner !== undefined && runner.status(workerSessionId(ticketId)) === 'running'
    if (live) this.stopped.add(ticketId)
    rt.engine.stopTicket(ticketId, reason)
    if (live) await runner.cancel(workerSessionId(ticketId), { keepInbox: true })
    return true
  }

  private replyStream(event: StoredEvent, speaker: StoredPersona, replyId: string): ReplyStream {
    const guard = (work: () => void): void => {
      try {
        work()
      } catch (error: unknown) {
        // A write that fails (store closing) must never break the model's stream.
        this.lastErrors.push(error instanceof Error ? error.message : String(error))
        if (this.lastErrors.length > 20) this.lastErrors.shift()
      }
    }
    return new ReplyStream({
      open: (text) => { guard(() => { this.postAs(event, speaker, replyId, clipWords(text), 'partial') }) },
      update: (text) => { guard(() => { this.events.updatePartial(replyId, clipWords(text)) }) },
    }, this.streamThrottleMs)
  }

  /** Settle the streaming message under the same id; with nothing streamed, post the reply as usual. Idempotent. */
  private settleReply(event: StoredEvent, speaker: StoredPersona, id: string, body: string, type: string): void {
    if (this.events.settlePartial(id, body, type)) return
    this.postAs(event, speaker, id, body, type)
  }

  private finishStopped(event: StoredEvent, speaker: StoredPersona, replyId: string, partial: string): void {
    const text = clipWords(partial).trim()
    if (text === '') {
      this.postAs(event, speaker, replyId, 'Resposta cancelada.')
      return
    }
    this.settleReply(event, speaker, replyId, text, 'runner')
    if (this.screens !== undefined) new MessageFlags(this.screens).set(event.projectId, replyId, { stopped: true })
  }

  /**
   * Parar a reply that is being written: cancel the talk turn and let the reply settle with what was written.
   * @param projectId - Tenant.
   * @param eventId - The person's message the reply answers.
   * @returns true when a turn was open and was cancelled.
   */
  async stopReply(projectId: string, eventId: string): Promise<boolean> {
    this.cancelled.add(eventId)
    let live = false
    for (const [key, runner] of this.warmRunners) {
      if (!key.startsWith(`${projectId}:`) || !key.includes(':talk')) continue
      if (runner.status(`talk-${eventId}`) !== 'running') continue
      await runner.cancel(`talk-${eventId}`, { keepInbox: false })
      live = true
    }
    return live
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
    if (personas.length === 0) return
    const first = personas[0]
    if (first === undefined) return
    if (!personas.some(persona => persona.systemRoles.includes('coordination'))) {
      this.product.updatePersona({ ...first, systemRoles: ['coordination', 'team_manager'] }, projectId)
      return
    }
    const coord = personas.find(persona => persona.systemRoles.includes('coordination'))
    if (coord === undefined || coord.systemRoles.includes('team_manager')) return
    if (personas.some(persona => persona.systemRoles.includes('team_manager'))) return
    this.product.updatePersona({ ...coord, systemRoles: [...coord.systemRoles, 'team_manager'] }, projectId)
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
    const rt = this.runtime(projectId)
    rt.engine.threadClosed({ source: 'review', id: ticketId }, 'merged', this.now())
    const ticket = rt.repo.tickets.get(ticketId)
    const titles = [
      ...(ticket?.title !== undefined ? [ticket.title] : []),
      ...rt.repo.tickets.list()
        .filter(row => row.ended !== undefined && row.id !== ticketId)
        .map(row => row.title),
    ]
    const text = milestoneSummary(titles)
    const speaker = this.coordinationOf(projectId)
    const project = this.product.getProject(projectId)
    const id = `coord-${ticketId}-milestone`
    if (text === '' || speaker === undefined || project === undefined || this.events.has(id)) return
    this.events.append({
      id,
      workspaceId: project.workspaceId,
      projectId,
      streamKind: 'channel',
      ownerId: 'geral',
      type: 'message',
      body: text,
      actorId: speaker.id,
      subjectId: ticketId,
      occurredAt: this.now(),
    })
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
    const streamKind = thread?.source.startsWith('dm') === true ? 'dm' : 'channel'
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
    await this.settleTask(rt, event, this.coordinationOf(projectId))
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

  private decidePending(
    rt: ProjectRuntime,
    text: string,
    work: boolean,
    preferred?: StoredPersona,
  ): void {
    const title = clip(text.split(/\r?\n/, 1)[0] ?? text, 80) || 'Pedido'
    const executor = preferred ?? this.executorOf(rt.repo.projectId) ?? this.coordinationOf(rt.repo.projectId)
    const coord = this.coordinationOf(rt.repo.projectId)
    const acknowledgement = coordinationHandoff({
      body: text,
      executorName: executor?.name ?? coord?.name ?? 'a equipe',
      samePerson: executor === undefined || coord === undefined || executor.id === coord.id,
    })
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
        acknowledgement,
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
    const ticket = this.runtime(projectId).repo.tickets.get(ticketId)
    if (ticket !== undefined && this.firstDeliveryRoute(projectId, ticket.origin.triggerId) !== undefined) return undefined
    const delivery = await this.reviewDelivery(projectId)
    if (delivery === undefined) return undefined
    const tree = await delivery.prepare({ id: assignmentId, ticketId })
    const rt = this.runtimes.get(projectId)
    const live = rt?.repo.tickets.get(ticketId)
    if (rt !== undefined && live !== undefined) {
      const names = this.stageAttachments?.(live.origin.triggerId, tree.path, false) ?? []
      const assignment = citeAttachments(live.execution?.assignment ?? live.title, names)
      rt.repo.tickets.save({
        ...live,
        execution: {
          name: live.execution?.name ?? '',
          directory: tree.path,
          assignment,
        },
      })
    }
    return tree
  }

  /** @param projectId - Local project. @returns Automatically selected file-delivery provider, absent without a folder. */
  reviewDelivery(projectId: string): Promise<ReviewDelivery | undefined> {
    return reviewDeliveryOf(this.product, this.runtimes, projectId, { ...this.reviewOptions, now: this.now })
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   */
  async reviewSummary(projectId: string, ticketId: string): Promise<ReviewSummary> {
    const ticket = this.runtime(projectId).repo.tickets.get(ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    const delivery = await this.reviewDelivery(projectId)
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
   * @param options - Explicit choices for the exact reviewed file versions.
   */
  async acceptReview(projectId: string, ticketId: string, mode: MergeMode, options?: ReviewApplyOptions): Promise<ReviewAcceptResult> {
    const ticket = this.runtime(projectId).repo.tickets.get(ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    const delivery = await this.reviewDelivery(projectId)
    if (delivery === undefined) return { kind: 'blocked', explanation: 'Projeto sem pasta — Tarefa sem código.' }
    return delivery.accept(ticket, mode, options)
  }

  /**
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   * @param feedback - What to change.
   */
  async requestChanges(projectId: string, ticketId: string, feedback: string): Promise<void> {
    const ticket = this.runtime(projectId).repo.tickets.get(ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    const delivery = await this.reviewDelivery(projectId)
    if (delivery === undefined) {
      const rt = this.runtime(projectId)
      rt.engine.note(ticketId, feedback)
      const live = rt.repo.tickets.get(ticketId) ?? ticket
      const report = latestAssignment(live)?.report?.state
      if (report !== 'blocked' && report !== 'failed') {
        rt.engine.report(ticketId, { state: 'blocked', summary: feedback, question: feedback })
      }
      rt.engine.retryTicket(ticketId)
    } else {
      await delivery.requestChanges(ticket, feedback)
    }
    this.advanceAssignments(this.runtime(projectId), projectId)
  }

  /**
   * Descartar: drop the draft, and end the Task the person just turned down (outcome `stopped`). FLOW-1 refuses to drag a
   * card with a result waiting to Concluído, so a Ticket left `ready` after its draft is gone would be stuck in Revisar
   * for good. A Task that is not waiting for review any more (a newer assignment is working) is left running.
   * @param projectId - Tenant.
   * @param ticketId - Ticket.
   */
  async discardReview(projectId: string, ticketId: string): Promise<void> {
    const delivery = await this.reviewDelivery(projectId)
    if (delivery === undefined) return
    const waiting = this.runtime(projectId).repo.tickets.get(ticketId)
    await delivery.discard({ id: ticketId })
    if (waiting !== undefined && hasPendingDelivery(waiting)) {
      await this.stopTicketRun(projectId, ticketId, 'discarded')
    }
  }

  /**
   * Drop orphan worktrees after resume.
   * @param projectId - Tenant.
   */
  async sweepReviews(projectId: string): Promise<string[]> {
    const delivery = await this.reviewDelivery(projectId)
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
        execution: {
          name, directory: '.',
          assignment: ticket.origin.triggerId === FIRST_DELIVERY_EVENT_ID
            ? (rt.repo.triggers.get(ticket.origin.triggerId)?.text ?? ticket.title)
            : ticket.title,
        },
      }
      rt.repo.tickets.save(next)
    }
  }

  private streamAck(event: StoredEvent, coordination: StoredPersona | undefined): void {
    this.deliverOutbox(this.runtime(event.projectId), event, coordination)
  }

  private async resolveFor(
    persona: StoredPersona,
    projectId: string,
    mode: AutonomyMode,
    purpose: RunnerPurpose,
    onFirstToken?: (text: string) => void,
    answerOnly: boolean = false,
  ): Promise<Runner> {
    this.mark(`resolve:${purpose}:start`)
    const key = `${projectId}:${persona.id}:${purpose}${answerOnly ? ':answer-only' : ''}`
    const cached = this.warmRunners.get(key)
    if (cached !== undefined) {
      this.mark(`resolve:${purpose}:warm`)
      return cached
    }
    const spec = specFromConnection(persona.runner, this.loggedCliOf?.(projectId))
    const tools = answerOnly ? {} : persona.tools
    const permissionMode = answerOnly ? 'deny' : permissionFor(spec, purpose, tools, mode)
    assertCliPermission(spec, permissionMode)
    const seat = this.accountSeatOf?.(projectId, persona)
    const home = seat?.home !== undefined && seat.home !== '' ? seat.home : runnerHomeOf(projectId)
    const usage = this.usage
    const accountId = seat?.accountId
    const usageContext: RunnerUsageContext = {
      ticketId: undefined, kind: purpose === 'talk' ? 'reply' : 'triage',
      engine: spec.kind === 'cli' ? spec.cli : 'dsh', model: spec.model,
    }
    let turnSequence = 0
    const talkCwd = purpose === 'talk'
      ? (process.env.PERSONA_HOME !== undefined && process.env.PERSONA_HOME !== ''
        ? process.env.PERSONA_HOME
        : '')
      : ''
    const request: HostRunnerRequest = {
      spec,
      permissionMode,
      autonomy: autonomyLevelOf(mode),
      personId: persona.id,
      personaName: persona.name,
      personaTitle: persona.title,
      purpose,
      projectId,
      tools,
      ...(talkCwd === '' ? {} : { cwd: talkCwd }),
      ...(onFirstToken === undefined ? {} : { onFirstToken }),
      ...(home === '' ? {} : { home }),
      ...(usage === undefined && this.recordLedger === undefined ? {} : {
        usage: {
          record: (entry) => {
            // The slot is part of the id: the triage runner and the task runner of one persona both count from 1.
            const id = `${projectId}:${persona.id}:${key}:${entry.at}:${entry.provider}:${String(++turnSequence)}`
            this.meteredRunners.add(runner)
            if (this.recordLedger !== undefined) {
              this.recordLedger(projectId, {
                id,
                personaId: persona.id,
                engine: entry.provider,
                kind: usageContext.kind,
                inputTokens: entry.inputTokens,
                outputTokens: entry.outputTokens,
                cacheReadTokens: entry.cacheReadTokens ?? 0,
                cacheWriteTokens: entry.cacheWriteTokens ?? 0,
                layers: EMPTY_LAYERS,
                at: entry.at,
                origin: 'measured',
                // OPT-9: the wall time of the turn, only when the runner measured it (never a made-up 0).
                ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
                ...(usageContext.ticketId === undefined ? {} : { ticketId: usageContext.ticketId }),
                ...(accountId === undefined ? {} : { accountId }),
              })
              return
            }
            usage?.record({
              id,
              projectId,
              personaId: persona.id,
              provider: entry.provider,
              model: entry.model,
              window: entry.window,
              inputTokens: entry.inputTokens,
              outputTokens: entry.outputTokens,
              origin: entry.origin,
              at: entry.at,
              ...(accountId === undefined ? {} : { accountId }),
            })
          },
        },
      }),
    }
    const runner = await this.runnerFactory(request)
    this.usageContexts.set(runner, usageContext)
    this.warmRunners.set(key, runner)
    this.mark(`resolve:${purpose}:ready`)
    return runner
  }

  private reportResolveFailure(
    rt: ProjectRuntime,
    event: StoredEvent,
    coordination: StoredPersona | undefined,
    ticketId: string,
    error: { code: string; message: string },
  ): void {
    const line = reportLineFor(error, coordination?.name)
    const stopped = rt.repo.tickets.get(ticketId)
    rt.engine.report(ticketId, {
      state: 'blocked',
      summary: line,
      question: line,
    })
    if (error.code === 'quota_exhausted' && stopped !== undefined) this.waitForQuota(event.projectId, stopped, error)
    const ticket = rt.repo.tickets.get(ticketId)
    this.postCoord(event, coordination, ticket === undefined ? `coord-${ticketId}-done` : doneEventId(ticket), channelLineFor(error, coordination?.name))
  }

  private async runLaunched(
    rt: ProjectRuntime,
    event: StoredEvent,
    coordination: StoredPersona | undefined,
    preferred?: StoredPersona,
    only?: string,
  ): Promise<void> {
    const acquired = this.budget.acquire(event.projectId)
    if (!acquired) {
      this.postAs(event, coordination, `coord-${event.id}-wait`, 'Aguardando vaga neste projeto.')
      return
    }
    try {
      await rt.runnerReady
      const coordinationPersona = coordination ?? this.coordinationOf(event.projectId)
      const firstDelivery = this.firstDeliveryRoute(event.projectId, event.id)
      const executor = firstDelivery === undefined
        ? (preferred ?? this.executorOf(event.projectId) ?? coordinationPersona)
        : this.product.listPersonas(event.projectId).find(persona => persona.id === firstDelivery.executorId)
      if (executor === undefined) return
      if (this.overTokenBudget(event.projectId, executor)) {
        for (const ticket of rt.repo.tickets.list().filter(item => only === undefined || item.id === only)) {
          if (latestAssignment(ticket)?.state !== 'running') continue
          const line = reportLineFor({ code: 'budget_exhausted', message: '' }, executor.name)
          rt.engine.report(ticket.id, {
            state: 'blocked',
            summary: line,
            question: line,
          })
          this.postAs(event, coordinationPersona, doneEventId(ticket), runErrorLine({
            code: 'budget_exhausted',
            provider: providerOf(cliOfPersona(executor)),
            persona: executor.name,
          }))
        }
        return
      }
      let runner: Runner
      try {
        const contextWork = this.compileUsed(event, executor)
        runner = await this.resolveFor(executor, event.projectId, 'asked', 'task', undefined, firstDelivery !== undefined)
        await contextWork
      } catch (error: unknown) {
        if (!isRunnerResolveError(error)) throw error
        for (const ticket of rt.repo.tickets.list().filter(item => only === undefined || item.id === only)) {
          if (latestAssignment(ticket)?.state !== 'running') continue
          if (this.events.has(doneEventId(ticket))) continue
          this.reportResolveFailure(rt, event, coordinationPersona, ticket.id, error)
        }
        return
      }
      if (this.cancelled.has(event.id)) {
        this.postAs(event, coordinationPersona, `coord-${event.id}-reply`, 'Resposta cancelada.')
        return
      }
      if (coordinationPersona !== undefined && firstDelivery === undefined && !this.skipTriage) {
        // OPT-5 (W1): triage is support work. It runs on the cheap talk slot, not on the executor's task runner;
        // if that cannot resolve, it falls back to the executor's runner exactly as before.
        // answerOnly gives it its own runner object (no tools, deny): it never shares the talk reply's callbacks or ledger kind.
        const triageRunner = await this.resolveFor(coordinationPersona, event.projectId, 'asked', 'talk', undefined, true).catch(() => runner)
        this.setRunnerUsageContext(triageRunner, 'triage')
        const driver = createCoordinationDriver({
          runner: triageRunner,
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
      for (const ticket of rt.repo.tickets.list().filter(item => only === undefined || item.id === only)) {
        const latest = latestAssignment(ticket)
        if (latest?.state !== 'running') continue
        const doneId = doneEventId(ticket)
        if (this.events.has(doneId)) continue
        const sessionId = workerSessionId(ticket.id)
        this.setRunnerUsageContext(runner, 'execution', ticket.id)
        const recovery = rt.recoveryNotes.includes(RECOVERY_NOTE)
        this.postAs(event, executor, `exec-${ticket.id}-progress`, `Em andamento: ${ticket.title}`)
        await runner.ensureSession(sessionId, ticket.execution?.directory ?? '.', ticket.title, 'worker')
        const base = recovery ? `${RECOVERY_NOTE}\n${ticket.title}` : (ticket.execution?.assignment ?? ticket.title)
        // What the person said since the last turn (an answer, a note) goes into the prompt of the resumed Assignment.
        const heard = firstDelivery === undefined ? this.pendingInputs(rt, ticket) : { ids: [], texts: [] }
        const assignment = heard.texts.length === 0 ? base : `${base}\n\nDesde a última rodada a pessoa disse:\n${heard.texts.map(text => `- ${text}`).join('\n')}`
        const prompt = firstDelivery === undefined ? assignment : firstDeliveryExecutionPrompt({
          fields: {
            identity: { name: executor.name, title: executor.title },
            personality: executor.personality, instructions: executor.instructions,
            functionLabel: executor.title, vault: '',
            capabilities: 'Primeira entrega em texto. Sem ferramentas, shell ou arquivos. Execute a atribuição diretamente.',
          },
          assignment,
          ...foldHostTalkUsed(this.usedContext.get(event.id) ?? []),
        })
        await runner.deliver(
          sessionId,
          recovery ? `recovery:${latest.id}` : `launch:${latest.id}`,
          prompt,
          recovery ? 'steer' : 'queue',
        )
        if (heard.ids.length > 0) rt.engine.inputsDelivered(ticket.id, latest.id, heard.ids)
        await runner.whenIdle(sessionId)
        await this.noteUsage(event.projectId, executor, sessionId, runner)
        if (this.stopped.delete(ticket.id)) continue // Parar: the ticket already ended as stopped by the person
        const report = lastRunnerReport(runner)
        const live = this.takeLive(runner)
        if (report !== undefined) {
          this.screens?.put(event.projectId, 'worker_report', latest.id, {
            ticketId: ticket.id, assignmentId: latest.id, personaId: executor.id,
            report: { ...report, at: lastRunnerReportAt(runner) ?? this.now() },
          })
        }
        const login = loginFailureFromText(live, cliOfPersona(executor))
        if (login !== undefined) {
          this.reportResolveFailure(rt, event, coordinationPersona, ticket.id, login)
          continue
        }
        if (report?.state === 'failed' || report?.state === 'blocked' || report?.state === 'dropped') {
          rt.engine.report(ticket.id, report)
          this.postAs(event, executor, doneId, runErrorLine({
            code: 'engine_unavailable', provider: providerOf(cliOfPersona(executor)), persona: executor.name,
          }), 'error')
          continue
        }
        const asked = this.takeQuestion(runner)
        // Once the person answered (a later Assignment), the title/body heuristic must not ask the same thing again.
        const firstRun = ticket.assignments.length <= 1
        const ask = asked !== undefined || (firstRun && (wantsAttention(ticket.title) || wantsAttention(event.body)))
        const question = asked ?? ticket.title
        if (!ask && live === '' && !this.scripted) {
          rt.engine.report(ticket.id, { state: 'failed', summary: 'O motor terminou sem entregar uma resposta.' })
          this.postAs(event, executor, doneId, runErrorLine({
            code: 'engine_unavailable', provider: providerOf(cliOfPersona(executor)), persona: executor.name,
          }), 'error')
          continue
        }
        if (ask) {
          rt.engine.report(ticket.id, {
            ...report,
            state: 'waiting', summary: report?.summary ?? question, question,
          })
        } else {
          const currentTicket = rt.repo.tickets.get(ticket.id)
          if (currentTicket !== undefined && (currentTicket.follows === undefined || currentTicket.follows.length === 0)) {
            rt.engine.bindThread(ticket.id, { source: 'review', id: ticket.id }, true)
          }
          rt.engine.report(ticket.id, { state: 'ready', summary: report?.summary ?? (live || 'scripted') })
        }
        const speaker = executor
        this.postAs(
          event,
          speaker,
          doneId,
          ask
            ? `Precisa de você: ${question}`
            : clipWords(this.scriptedReady(live, ticket.title)),
          live === '' || ask ? 'message' : 'runner',
        )
      }
    } catch (error) {
      if (error instanceof Error && /not open/i.test(error.message)) return
      throw error
    } finally {
      this.budget.release(event.projectId)
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
    const stream = this.replyStream(event, speaker, replyId)
    let runner: Runner
    try {
      const contextWork = this.compileUsed(event, speaker)
      runner = await this.resolveFor(speaker, event.projectId, 'asked', 'talk', () => { this.mark('first-token') })
      // The reply grows in the thread as ONE message while the model writes (streaming); it settles under the same id below.
      setRunnerPartialSink(runner, (text) => { stream.push(text) })
      const used = await contextWork
      const talkHome = process.env.PERSONA_HOME ?? process.env.DSH_HOME ?? ''
      if (talkHome !== '') this.stageAttachments?.(event.id, talkHome, runnerHasVision(runner))
      const talk = this.talkPrompt(event, speaker, used)
      await runner.ensureSession(`talk-${event.id}`, '.', speaker.name, 'coordinator')
      this.mark('session')
      await runner.deliver(`talk-${event.id}`, `talk:${event.id}`, talk, 'queue')
      await runner.whenIdle(`talk-${event.id}`)
      this.mark('idle')
      setRunnerPartialSink(runner, undefined)
      stream.flush()
      if (this.cancelled.has(event.id)) {
        // Parar during the reply: keep what was written, marked as stopped (or say it was cancelled if nothing came out).
        stream.stop()
        this.finishStopped(event, speaker, replyId, stream.text)
        return
      }
      await this.noteUsage(event.projectId, speaker, `talk-${event.id}`, runner)
    } catch (error: unknown) {
      stream.stop()
      this.failReply(event, speaker, error)
      return
    }
    stream.stop()
    const live = this.takeLive(runner)
    const login = loginFailureFromText(live, cliOfPersona(speaker))
    if (login !== undefined) {
      this.failReply(event, speaker, login)
      return
    }
    const raw = this.scriptedHello(live)
    if (raw === undefined) {
      this.failReply(event, speaker, new Error('resposta vazia'))
      return
    }
    const body = finishHostTalk(raw, event.body)
    this.store.tx(() => {
      let queuedId: string | undefined
      if (this.scripted) {
        try { queuedId = rt.engine.reply({ purpose: 'answer', triggerId: event.id, text: clipWords(body) }).id }
        catch (error) {
          // The visible scripted reply remains available when the domain refuses this reply purpose.
          void error
        }
      }
      this.settleReply(event, speaker, replyId, clipWords(body), live !== '' ? 'runner' : 'message')
      if (queuedId !== undefined && this.events.has(replyId)) rt.outbox.settle(queuedId, 'sent')
    })
    this.mark('reply')
    this.deliverOutbox(rt, event, speaker)
  }

  /**
   * Conversation prompt: display name, team, capped Cofre, user text as data.
   * @param event - Human message.
   * @param speaker - Persona that will answer.
   * @param used - Compiled "Contexto usado".
   */
  talkPrompt(event: StoredEvent, speaker: StoredPersona, used: UsedContextRecord[]): string {
    return this.talkLayers(event, speaker, used).text
  }

  /**
   * Cache-stable prefix + full text. Clock and user message stay off the prefix.
   * @param event - Human message.
   * @param speaker - Persona.
   * @param used - Cofre + subject fold.
   */
  talkLayers(event: StoredEvent, speaker: StoredPersona, used: UsedContextRecord[]): {
    readonly prefix: string
    readonly text: string
  } {
    const role = speaker.systemRoles.includes('coordination')
      ? 'coordenação'
      : speaker.systemRoles.includes('watchdog') ? 'vigia' : speaker.title
    const colleagues = this.product.listPersonas(event.projectId)
      .filter(row => row.id !== speaker.id)
      .map((row) => {
        const fn = row.systemRoles.includes('coordination')
          ? 'coordenação'
          : row.systemRoles.includes('watchdog') ? 'vigia' : undefined
        return {
          name: row.name,
          title: row.title,
          ...(fn === undefined ? {} : { role: fn }),
        }
      })
      .sort((left, right) => left.name.localeCompare(right.name) || left.title.localeCompare(right.title))
    const folded = foldHostTalkUsed(used, event.body)
    return composeHostTalk({
      fields: {
        identity: { name: speaker.name, title: speaker.title },
        personality: speaker.personality,
        instructions: speaker.instructions,
        functionLabel: role,
        vault: '',
        colleagues,
        capabilities: 'resposta de conversa; sem ferramentas; sem shell; sem arquivos; nunca ecoe a mensagem da pessoa; sem placeholders (Recebido, Vou encaminhar, digitando); pedido simples responde direto; trabalho: o que entendeu, quem faz, quando volta',
      },
      surface: 'talk',
      userText: citeAttachments(event.body, this.attachmentNamesOf?.(event.id) ?? []),
      required: folded.required,
      ...(folded.subject === '' ? {} : { subject: folded.subject }),
      ...(folded.recall === '' ? {} : { recall: capTalkContext(folded.recall) }),
    })
  }

  /**
   * Fold new subject messages in lote and attach summary + last N (not full history).
   * @param event - Human message.
   * @param used - Cofre rows already mapped.
   */
  attachSubjectFold(event: StoredEvent, used: UsedContextRecord[]): void {
    const topicId = event.topicId
    if (topicId === undefined || topicId === '' || this.opt === undefined) return
    const existing = this.opt.getSummary(topicId)
    const fresh = this.events.listTopic(
      event.streamId, { id: event.actorId }, topicId, existing?.lastSeq ?? 0, 200,
    )
    if (shouldFoldSubject(fresh.events.length)) {
      this.opt.putSummary({
        topicId,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        summary: foldSubjectSummary(existing?.summary ?? '', fresh.events.map(row => row.body)),
        lastSeq: fresh.nextSeq,
        messageCount: (existing?.messageCount ?? 0) + fresh.events.length,
      })
    }
    const stored = this.opt.getSummary(topicId)
    if (stored !== undefined && stored.summary !== '') {
      used.push({
        id: `summary:${topicId}`,
        kind: 'subject_summary',
        body: stored.summary,
        required: false,
        restricted: false,
      })
    }
    const recent = this.events.listTopic(event.streamId, { id: event.actorId }, topicId, 0, 200)
      .events.slice(-SUBJECT_RECENT)
    for (const row of recent) {
      used.push({
        id: `recent:${row.id}`,
        kind: 'subject_recent',
        body: row.body,
        required: false,
        restricted: false,
      })
    }
  }

  /**
   * Compile Cofre context in parallel with runner start; store "Contexto usado".
   * @param event - Human message.
   * @param speaker - Persona that will answer.
   */
  async compileUsed(event: StoredEvent, speaker: StoredPersona): Promise<UsedContextRecord[]> {
    this.mark('compile-context')
    const vault = this.vault
    if (vault === undefined) return []
    const records = vault.listRecords(event.projectId)
    const actor = {
      kind: 'user' as const,
      id: event.actorId,
      workspaceId: event.workspaceId,
      workspaceRole: 'owner' as const,
      projectIds: [event.projectId],
    }
    try {
      const compileInput = {
        scope: {
          workspaceId: event.workspaceId,
          projectId: event.projectId,
          agentId: speaker.id,
          actorId: event.actorId,
          audienceId: event.actorId,
          policyRevision: 'v1',
        },
        budgetTokens: 2_000,
        countTokens: (text: string) => Math.max(1, Math.ceil(text.length / 4)),
        authorize: authorizeContext(actor),
      }
      const topicId = event.topicId
      if (topicId !== undefined && topicId !== '') {
        await compileSubjectVault(records, event.projectId, topicId, compileInput)
      } else {
        await compileVaultContext({
          ...compileInput,
          records,
          snapshotRevision: this.now(),
        })
      }
    } catch {
      // Required Cofre denied still appears in Contexto usado as restricted.
    }
    const used: UsedContextRecord[] = records.map(record => ({
      id: record.id,
      kind: record.kind,
      body: record.visibility.kind === 'workspace' ? record.body : '',
      required: isRequiredVaultKind(record.kind),
      restricted: record.visibility.kind !== 'workspace',
    }))
    this.attachSubjectFold(event, used)
    if (event.body.trim() !== '') {
      const speakerActor = {
        kind: 'persona' as const,
        id: speaker.id,
        workspaceId: event.workspaceId,
        workspaceRole: 'member' as const,
        projectIds: [event.projectId],
        systemRoles: speaker.systemRoles,
      }
      for (const hit of vault.searchChunks(event.projectId, event.body, 8)) {
        if (!canReadVault(speakerActor, parseVaultRecord({
          id: hit.documentId,
          workspaceId: event.workspaceId,
          kind: 'memory',
          body: hit.body.slice(0, 32) || 'x',
          status: 'active',
          sourceIds: [],
          authorId: speaker.id,
          visibility: hit.visibility,
          createdAt: event.occurredAt,
          revision: 1,
        }))) continue
        const restricted = hit.visibility.kind !== 'workspace'
        used.push({
          id: hit.id,
          kind: 'document',
          body: restricted ? '' : hit.body,
          required: false,
          restricted,
          title: hit.title,
          locator: hit.locator,
        })
      }
    }
    const safe = safeUsedContext(used)
    this.usedContext.set(event.id, safe)
    const ticket = this.runtime(event.projectId).repo.tickets.list()
      .find(item => item.origin.triggerId === event.id)
    if (ticket !== undefined) {
      this.usedContext.set(ticket.id, safe)
      if (event.topicId !== undefined && event.topicId !== '') {
        this.screens?.put(event.projectId, 'ticket_subject', ticket.id, { subjectId: event.topicId })
      }
    }
    this.mark('compile-context:done')
    return safe
  }

  private deliverOutbox(
    rt: ProjectRuntime,
    event: StoredEvent,
    speaker: StoredPersona | undefined,
  ): void {
    for (const message of rt.outbox.pending()) {
      const send = (): void => {
        this.outboxDeliver?.(message.id, message.text)
        const origin = this.events.get(message.channel.address.message ?? '') ?? event
        this.postAs(origin, speaker, `coord-${message.id}`, clipWords(message.text))
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
    if (isRunnerResolveError(error)) {
      const tickets = this.runtime(event.projectId).repo.tickets.list()
        .filter(item => item.origin.triggerId === event.id)
      if (tickets[0] !== undefined) {
        this.reportResolveFailure(this.runtime(event.projectId), event, speaker, tickets[0].id, error)
        return
      }
      this.postAs(event, speaker, `coord-${event.id}-reply`, channelLineFor(error, speaker?.name), 'error')
      return
    }
    const failure = { code: 'engine_unavailable', message: 'A execução falhou. Tente de novo ou escolha outro motor.' }
    this.lastErrors.push(failure.message)
    if (this.lastErrors.length > 8) this.lastErrors.shift()
    const rt = this.runtime(event.projectId)
    const tickets = rt.repo.tickets.list().filter(ticket => ticket.ended === undefined
      && latestAssignment(ticket)?.state === 'running'
      && (ticket.origin.triggerId === event.id || ticket.origin.triggerIds.includes(event.id)
        || ticket.inputs.some(input => input.kind === 'trigger' && input.triggerId === event.id)))
    if (tickets.length > 0) {
      for (const ticket of tickets) this.reportResolveFailure(rt, event, speaker, ticket.id, failure)
      return
    }
    this.postAs(event, speaker, `coord-${event.id}-reply`, `Não consegui responder. ${channelLineFor(failure, speaker?.name)}`, 'error')
  }

  private async noteUsage(
    projectId: string,
    persona: StoredPersona,
    sessionId: string,
    runner: Runner,
  ): Promise<void> {
    if (this.meteredRunners.has(runner)) return
    if (this.usage === undefined && this.recordLedger === undefined) return
    const read: unknown = Reflect.get(runner, 'usage')
    if (typeof read !== 'function') return
    const at = this.now()
    let spent: { inputTokens: number; outputTokens: number }
    try {
      spent = await (read.call(runner, sessionId) as Promise<{ inputTokens: number; outputTokens: number }>)
    } catch (error) {
      // No provider usage is available; leave the book empty so acceptance rejects missing evidence.
      void error
      return
    }
    const context = this.usageContexts.get(runner)
    const engine = context?.engine ?? (persona.runner.kind === 'cli' ? persona.runner.cli : 'dsh')
    const id = `${projectId}:${persona.id}:${sessionId}:${at}`
    if (this.recordLedger !== undefined) {
      this.recordLedger(projectId, {
        id,
        personaId: persona.id,
        engine,
        kind: context?.kind ?? 'execution',
        inputTokens: spent.inputTokens,
        outputTokens: spent.outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        layers: EMPTY_LAYERS,
        at,
        origin: 'measured',
        ...(context?.ticketId === undefined ? {} : { ticketId: context.ticketId }),
      })
      return
    }
    this.usage?.record({
      id,
      projectId,
      personaId: persona.id,
      provider: engine,
      model: context?.model ?? persona.runner.model,
      window: 'turn',
      inputTokens: spent.inputTokens,
      outputTokens: spent.outputTokens,
      origin: 'measured',
      at,
    })
  }

  private setRunnerUsageContext(runner: Runner, kind: TurnLedgerEntry['kind'], ticketId?: string): void {
    const scope = this.usageContexts.get(runner)
    if (scope === undefined) return
    scope.kind = kind
    scope.ticketId = ticketId
  }

  private capturedSubject(event: StoredEvent): string | undefined {
    if (this.mutant === undefined) return undefined
    for (const ticket of this.runtime(event.projectId).repo.tickets.list()) {
      const captured = this.mutant.subjectOf(event.projectId, ticket.id)
      if (captured === undefined) continue
      if (ticket.origin.triggerId === event.id || event.subjectId === captured) return captured
    }
    return undefined
  }

  private overTokenBudget(projectId: string, persona: StoredPersona): boolean {
    const cap = persona.limits.tokensPerMonth
    if (cap === undefined || this.usage === undefined) return false
    const month = monthWindow(this.now())
    return this.usage.tokens({
      projectId, personaId: persona.id, from: month.from, to: month.to,
    }) >= cap
  }

  private takeQuestion(runner: Runner): string | undefined {
    const hooked = this.liveQuestion
    this.liveQuestion = undefined
    if (hooked !== undefined) return hooked
    return lastRunnerQuestion(runner)
  }

  private takeLive(runner: Runner): string {
    const hooked = this.liveText
    this.liveText = undefined
    if (hooked !== undefined) return hooked
    return lastRunnerText(runner)
  }

  private scriptedHello(live: string): string | undefined {
    if (live !== '') return live
    return this.scripted ? SCRIPTED_HELLO : undefined
  }

  private scriptedReady(live: string, title: string): string {
    if (live !== '') return live
    return this.scripted ? `Pronto: ${title}` : 'não consegui responder: resposta vazia'
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
      if (!row.id.endsWith('-partial')) continue
      const eventId = row.id.replace(/^coord-/u, '').replace(/-partial$/u, '')
      if (this.events.has(`coord-${eventId}-reply`)) continue
      const original = this.store.db.prepare(
        'SELECT body, actor_id AS actorId, subject_id AS subjectId FROM event WHERE id = ?',
      ).get(eventId) as { body: string; actorId: string; subjectId: string } | undefined
      const event: StoredEvent = {
        id: eventId,
        streamId: row.streamId,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        seq: row.seq,
        type: 'message',
        body: original?.body ?? row.body,
        actorId: original?.actorId ?? row.actorId,
        subjectId: original?.subjectId ?? row.subjectId,
        occurredAt: row.occurredAt,
        deleted: row.deleted === 1,
      }
      await this.finishReply(rt, event, speaker)
    }
  }

  /**
   * Resume a talk that never got a Coordination line (crash before first token).
   * @param rt - Runtime.
   * @param projectId - Tenant.
   */
  private async recoverTalks(rt: ProjectRuntime, projectId: string): Promise<void> {
    const rows = this.store.db.prepare(
      `SELECT id, stream_id AS streamId, workspace_id AS workspaceId, project_id AS projectId,
              seq, type, body, actor_id AS actorId, subject_id AS subjectId, occurred_at AS occurredAt, deleted
         FROM event
        WHERE project_id = ? AND type = 'message' AND deleted = 0 AND id NOT LIKE 'coord-%'`,
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
      if (this.product.getPersona(row.actorId) !== undefined) continue
      if (wantsWork(row.body)) continue
      if (this.events.has(`coord-${row.id}-reply`)) continue
      // A courtesy line the persona already reacted to is answered (CF, D-075): recovery must not turn it into a model call.
      if (this.events.listReactions(row.id).some(reaction => this.product.getPersona(reaction.actorId) !== undefined)) continue
      const streamKind = row.streamId.startsWith('dm:') ? 'dm' : 'channel'
      const ownerId = row.streamId.slice(row.streamId.indexOf(':') + 1)
      const speaker = this.mentionedPersona(projectId, row.body)
        ?? (streamKind === 'dm' ? this.dmPersona(ownerId, row.actorId) : undefined)
        ?? this.coordinationOf(projectId)
      if (speaker === undefined) continue
      const event: StoredEvent = {
        id: row.id,
        streamId: row.streamId,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        seq: row.seq,
        type: 'message',
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
    const topicId = event.topicId ?? this.events.get(event.id)?.topicId
    if (looksLikeOarLogin(body)) {
      this.failReply(event, speaker, new RunnerResolveError('not_logged_in', cliOfPersona(speaker)))
      return
    }
    try {
      this.events.append({
        id,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        streamKind: event.streamId.startsWith('dm:') ? 'dm' : 'channel',
        ownerId: event.streamId.slice(event.streamId.indexOf(':') + 1),
        type,
        body,
        actorId: speaker?.id ?? 'coordination',
        subjectId: this.capturedSubject(event) ?? event.subjectId,
        ...(topicId === undefined || topicId === '' ? {} : { topicId }),
        occurredAt: this.now(),
      })
    } catch (error: unknown) {
      if (error instanceof StoreError && (error.code === 'constraint' || error.code === 'not-open')) return
      throw error
    }
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

  /**
   * Slots left and coordination token/execution budget still positive.
   * @param projectId - Tenant.
   */
  private routeBudgetLeft(projectId: string): boolean {
    if (this.budget.of(projectId) >= this.budget.maxPerProject) return false
    if (this.budget.total() >= this.budget.maxGlobal) return false
    const coord = this.coordinationOf(projectId)
    if (coord === undefined) return true
    const row = new ProactivityRepos(this.store, this.now).getAutonomy(projectId, coord.id)
    return row.tokenBudget > 0 && row.executionBudget > 0
  }

  /**
   * Quiet-window end for the coordination persona, or 0.
   * @param projectId - Tenant.
   */
  private routeSilenceUntil(projectId: string): number {
    const coord = this.coordinationOf(projectId)
    if (coord === undefined) return 0
    const row = new ProactivityRepos(this.store, this.now).getAutonomy(projectId, coord.id)
    return silenceUntilOf(this.now(), row.silenceStart, row.silenceEnd)
  }

  /**
   * Card / `/pausar` flag. Missing row is not paused.
   * @param projectId - Tenant.
   * @param personaId - Persona.
   */
  isPersonaPaused(projectId: string, personaId: string): boolean {
    return this.screens?.get<{ paused?: boolean }>(projectId, 'persona_runtime', personaId)?.paused === true
  }

  /**
   * Persist the same `persona_runtime` row the card Remote reads.
   * @param projectId - Tenant.
   * @param personaId - Persona.
   * @param paused - Offline when true.
   */
  setPersonaPaused(projectId: string, personaId: string, paused: boolean): void {
    this.screens?.put(projectId, 'persona_runtime', personaId, { paused })
  }

  /**
   * Owner `/pausar` / `/retomar` — named, @mentioned, or Coordination.
   * @param event - Human command.
   * @param speaker - Fallback Coordination / mentioned peer.
   * @param command - Accepted command.
   */
  private applyPauseCommand(
    event: StoredEvent,
    speaker: StoredPersona,
    command: 'pausar' | 'retomar',
  ): void {
    const target = this.pauseTargetOf(event, speaker)
    this.setPersonaPaused(event.projectId, target.id, command === 'pausar')
    this.postAs(
      event,
      speaker,
      `coord-${event.id}-pause`,
      command === 'pausar'
        ? `${target.name} pausada. Sem conversa nem tarefa até /retomar.`
        : `${target.name} retomada.`,
    )
    // What was asked while the persona was paused starts now.
    if (command === 'retomar') this.releaseHeld(event.projectId)
  }

  /**
   * @param event - Command body.
   * @param speaker - Fallback.
   */
  private pauseTargetOf(event: StoredEvent, speaker: StoredPersona): StoredPersona {
    const mentioned = this.mentionedPersona(event.projectId, event.body)
    if (mentioned !== undefined) return mentioned
    const extra = event.body.trim().replace(/^\/(?:pausar|retomar)\s*/iu, '').trim()
    if (extra !== '') {
      const named = this.product.listPersonas(event.projectId)
        .find(persona => persona.name.toLowerCase() === extra.toLowerCase())
      if (named !== undefined) return named
    }
    return this.coordinationOf(event.projectId) ?? speaker
  }

  /**
   * Guest and unknown senders cannot command. Pause/resume is owner-only.
   * @param projectId - Tenant (membership is workspace-scoped).
   * @param command - Short command.
   * @param senderId - Trigger actor.
   */
  private routeCanCommand(
    projectId: string,
    command: 'pausar' | 'retomar' | 'tarefa',
    senderId: string,
  ): boolean {
    const member = this.product.getMember(senderId)
    if (member === undefined || member.role === 'guest') return false
    const project = this.product.getProject(projectId)
    if (project === undefined || member.workspaceId !== project.workspaceId) return false
    return command === 'tarefa' || member.role === 'owner'
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
      // Each message is its own conversation (D-079). On the shared channel thread the engine read every message as a
      // follow-up of whichever ticket was still open there — or woke a finished one — and nothing answered. A continuation is
      // decided on purpose by `absorbingTicket`; replies still go to `channel` below.
      threads: [{ source: `${streamKind}:${event.id}`, id: ownerId }],
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

function monthWindow(iso: string): { from: string; to: string } {
  const at = new Date(iso)
  const from = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString()
  const to = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0, 23, 59, 59, 999)).toISOString()
  return { from, to }
}

/**
 * The line a request gets when the deterministic rules turn it down.
 * @param routed - The ignore decision.
 */
function ignoredLine(routed: PreRouteResult): string {
  if (routed.rule === 'duplicate') return 'Já tenho esse pedido, igual ao de agora há pouco; não abri outra tarefa.'
  if (routed.rule === 'injection') return 'Não vou seguir esse pedido.'
  if (routed.rule === 'scope') return 'Isso fica fora do que posso fazer aqui.'
  if (routed.rule === 'command') return `Não consegui usar esse comando: ${routed.why}.`
  return `Não consegui tratar esse pedido (${routed.why}).`
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

function clipWords(value: string): string {
  const words = value.trim().split(/\s+/u).filter(part => part.length > 0)
  if (wordCount(value) <= 100) return value.trim()
  return words.slice(0, 100).join(' ')
}

function pauseCommandOf(body: string): 'pausar' | 'retomar' | undefined {
  const match = /^\/(pausar|retomar)(?:\s|$)/iu.exec(body.trim())
  const name = match?.[1]?.toLowerCase()
  return name === 'pausar' || name === 'retomar' ? name : undefined
}

function wantsAttention(text: string): boolean {
  return /\?|precisa de você|aprovar/iu.test(text)
}

export { wantsWork }

/**
 * Where files may be copied for a worker: only its own review worktree (like the files of the request that started it).
 * A task without a folder runs in the host's working directory, which is never written to; a relative or missing folder
 * is refused too.
 * @param projectId - Tenant.
 * @param ticket - Ticket with an `execution`.
 */
function workerDirOf(projectId: string, ticket: Ticket): string | undefined {
  const directory = ticket.execution?.directory
  if (directory === undefined || !isAbsolute(directory) || !existsSync(directory)) return undefined
  try {
    const trees = resolve(reviewTreesOf(projectId))
    return resolve(directory).startsWith(`${trees}${sep}`) ? directory : undefined
  } catch {
    return undefined
  }
}

function citeAttachments(text: string, names: readonly string[]): string {
  if (names.length === 0) return text
  return `${text}\nAnexos: ${names.join(', ')}`
}

function cliOf(message: string): string {
  const match = /CLI (\S+)/u.exec(message)
  return match?.[1] ?? 'dsh'
}

function detailOf(error: { code: string; message: string }): string {
  const cli = /CLI (\S+)/u.exec(error.message)?.[1]
  if (cli !== undefined) return cli
  const quota = /Cota de (\S+)/u.exec(error.message)?.[1]
  if (quota !== undefined) return quota
  const model = /Modelo (\S+)/u.exec(error.message)?.[1]
  if (model !== undefined) return model
  if (/DSH/u.test(error.message)) return 'dsh'
  return cliOf(error.message)
}

function cliOfPersona(speaker: StoredPersona | undefined): string {
  const runner = speaker?.runner
  return runner?.kind === 'cli' ? runner.cli : 'claude'
}

const LOGIN_COMMAND: Record<string, string> = {
  claude: 'claude login',
  codex: 'codex login',
  opencode: 'opencode auth login',
}

function providerOf(cli: string): string {
  if (cli === 'dsh') return 'Claude'
  return PROVIDER_LABEL[cli] ?? cli
}

function runErrorLine(payload: {
  code: string
  provider?: string
  persona?: string
  model?: string
  command?: string
}): string {
  return `[[run-error:${JSON.stringify(payload)}]]`
}

function reportLineFor(error: { code: string; message: string }, persona?: string): string {
  const who = persona === undefined || persona === '' ? 'esta persona' : persona
  if (error.code === 'budget_exhausted') return `O orçamento deste mês para ${who} acabou.`
  const cli = detailOf(error)
  const provider = providerOf(cli)
  if (error.code === 'not_logged_in') return `O ${provider} não está conectado neste computador.`
  if (error.code === 'cli_not_found') {
    if (cli === 'dsh') return `O motor de ${who} não está disponível neste computador.`
    return `O ${provider} não está instalado neste computador.`
  }
  if (error.code === 'quota_exhausted') return `A conta do ${provider} chegou ao limite.`
  if (error.code === 'model_unavailable') return `O modelo não está disponível no ${provider}.`
  return `O motor de ${who} não está disponível neste computador.`
}

function channelLineFor(error: { code: string; message: string }, persona?: string): string {
  const cli = detailOf(error)
  const extra = persona === undefined || persona === '' ? {} : { persona }
  if (error.code === 'not_logged_in') {
    const command = LOGIN_COMMAND[cli]
    return runErrorLine({
      code: 'not_logged_in',
      provider: providerOf(cli),
      ...extra,
      ...(command === undefined ? {} : { command }),
    })
  }
  if (error.code === 'cli_not_found') {
    if (cli === 'dsh') return runErrorLine({ code: 'engine_unavailable', ...extra })
    return runErrorLine({ code: 'cli_not_found', provider: providerOf(cli), ...extra })
  }
  if (error.code === 'quota_exhausted') {
    return runErrorLine({ code: 'quota_exhausted', provider: providerOf(cli), ...extra })
  }
  if (error.code === 'model_unavailable') {
    return runErrorLine({ code: 'model_unavailable', provider: providerOf(cli), model: cli, ...extra })
  }
  return runErrorLine({ code: 'engine_unavailable', provider: providerOf(cli), ...extra })
}

function looksLikeOarLogin(text: string): boolean {
  return /not logged in|please run\s*\/login/iu.test(text)
}

/**
 * Treat streamed OAR login failures as a typed resolve error (never post raw English).
 * @param text - Last runner text.
 * @param cli - Persona CLI id.
 */
export function loginFailureFromText(text: string, cli: string): RunnerResolveError | undefined {
  return looksLikeOarLogin(text) ? new RunnerResolveError('not_logged_in', cli) : undefined
}

function runnerHasVision(runner: Runner): boolean {
  return (runner.capabilities() as { vision?: boolean }).vision === true
}
