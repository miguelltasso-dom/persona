/**
 * Host scheduler for the team's own initiative ("a equipe age sozinha", PROACTIVITY §1/§2/§4/§5).
 *
 * Before this module nobody called `claimRoutines`, `tickProactivity` or `tickInitiativeBatch` outside tests:
 * routines never ran, a ticket left running by a retry / answered question / full slot never resumed, and an
 * empty queue never planned. One cycle (Vigia) now does, cheapest first and deterministic:
 *
 *  1. "Pausar equipe" ⇒ nothing runs (visible once, not every cycle);
 *  2. launch queued assignments (`Orchestration.tick`);
 *  3. materialize due routine occurrences from their rrule, claim them and run them
 *     (daily initiative inside the persona's work hours; custom routines as a task for their persona);
 *  4. pull: the Vigia (`vigiaTick`) says which persona is idle with a queue; a ticket nobody is executing is
 *     driven to completion (never while another run is in flight);
 *  5. retry with backoff a ticket whose run failed (runner / connection);
 *  6. empty queue + open goal ⇒ Coordination plans; no goal ⇒ the team rests with ZERO model calls.
 *
 * Budgets (executions and tokens per persona per day), silence windows, paused personas and engine readiness
 * are honored. Every decision is an audit row (`watchdog_audit`) so "Enquanto você estava fora" shows it; a
 * state that stays the same is recorded once, never every cycle. The clock and timers are injected.
 */

import {
  emptyQueueDecision,
  latestAssignment,
  vigiaTick,
  waitsForPerson,
  type PersonaGoal,
  type Ticket,
} from '@deepseek-ai/dsh-persona-engine'
import type {
  AutonomyRow,
  EventRepos,
  ProductRepos,
  Routine,
  RoutineRepos,
  RoutineRun,
  ScreenRepos,
  StoredPersona,
} from '@deepseek-ai/dsh-persona-store'
import type { HouseRules } from './house-rules.ts'
import { MORNING_ROUTINE_PREFIX } from './morning-brief-host.ts'
import type { ProactivityHost } from './proactivity.ts'
import type { LeadBudget } from './project-lead.ts'
import { inSilence } from './proactivity.ts'
import { EVENT_DOC_KIND, EVENT_RRULE, isEventRunId, type RoutineEventDoc, type RoutineTrigger } from './routine-events.ts'
import { nextOccurrence, occurrencesBetween, RruleError, zonedParts } from './rrule-lite.ts'
import { doneEventId } from './ticket-done.ts'
import type { TeamStateBook } from './team-state.ts'
import type { TaskProposalPort } from './task-proposals.ts'

/** `screen_doc` kind holding what a custom routine does (who, what). Written by the routine Remotes. */
export const ROUTINE_SPEC_KIND = 'routine_spec'
const STATE_KIND = 'scheduler_state'
const SPEND_KIND = 'scheduler_spend'
const INITIATIVE_PREFIX = 'initiative:'
const MIN_MS = 60_000
const DAY_MS = 86_400_000
const RETRY_BACKOFF_MS = [2 * MIN_MS, 10 * MIN_MS, 30 * MIN_MS] as const
const MAX_BACKFILL_MS = 62 * DAY_MS
const MAX_DRIVES_PER_ASSIGNMENT = 3
const MAX_LEASE_ATTEMPTS = 3

/**
 * What a custom routine does when it is due. Both fields are optional: without them the routine falls back to
 * its governance charge ("Quem cuida de quem": executor persona) and to its own name as the instruction.
 */
export interface RoutineSpecDoc {
  readonly personaId?: string
  readonly prompt?: string
  /** Item 26: what starts the routine when it is not the clock (an event of a connected source). Absent = the schedule. Only read when the row's rrule is `EVENT`. */
  readonly trigger?: RoutineTrigger
}

/** The slice of a governance routine charge the scheduler needs. */
export interface RoutineChargeLite {
  readonly executorPersonaId?: string
  readonly requiresApproval: boolean
}

/** Audit kinds written by the scheduler (all start with `sched:`). */
export type SchedulerEventKind =
  | 'sched:team_paused' | 'sched:team_resumed' | 'sched:no_engine' | 'sched:engine_ready'
  | 'sched:routine_run' | 'sched:routine_skipped' | 'sched:routine_bad_rule' | 'sched:routine_lost'
  | 'sched:initiative_act' | 'sched:initiative_skipped' | 'sched:initiative_proposed' | 'sched:proposal_card'
  | 'sched:assigned' | 'sched:stalled' | 'sched:retry' | 'sched:retry_exhausted' | 'sched:planned' | 'sched:not_delivered' | 'sched:released' | 'sched:queue_sent' | 'sched:window'
  | 'sched:budget' | 'sched:silence' | 'sched:quiet' | 'sched:error'

/** One request the scheduler hands to the normal message pipeline (so the run is a real Ticket). */
export interface TeamRequest {
  readonly workspaceId: string
  readonly projectId: string
  /** Idempotent event id. */
  readonly id: string
  /** Non-persona author, `routine:<id>` / `team:plan` / `team:initiative`. */
  readonly actorId: string
  readonly personaId: string
  /** Already addresses the persona (`@Name …`). */
  readonly body: string
  readonly kind: 'routine' | 'plan' | 'initiative' | 'proposal'
}

/** Whether the pipeline turned a {@link TeamRequest} into a Ticket (the pre-router may refuse: silence, budget, injection…). */
export type PostResult =
  | { readonly ok: true; readonly ticketId: string }
  /** `held`: the 95% window reserve already keeps the request (it runs when the window renews): not a refusal to retry every cycle. */
  | { readonly ok: false; readonly reason: string; readonly held?: true }

/** The engine/orchestration surface the scheduler reads and drives. */
export interface SchedulerOrchestration {
  tick(projectId: string): void
  runtime(projectId: string): {
    readonly repo: { readonly tickets: { list(): Ticket[] } }
    readonly engine: { retryTicket(ticketId: string): unknown }
  }
  isPersonaPaused(projectId: string, personaId: string): boolean
  readonly budget: { of(projectId: string): number; readonly maxPerProject: number }
}

/** Everything the scheduler depends on. The host binds the real ones; tests bind fakes for the model calls. */
export interface SchedulerDeps {
  readonly product: Pick<ProductRepos, 'listWorkspaces' | 'listProjects' | 'listPersonas' | 'getPersona'>
  readonly routines: RoutineRepos
  readonly proactivity: ProactivityHost
  readonly screens: ScreenRepos
  readonly events: Pick<EventRepos, 'has'>
  readonly teamState: TeamStateBook
  readonly orchestration: SchedulerOrchestration
  /** Governance charge of a routine (who executes it, whether it needs approval). */
  chargeOf?(workspaceId: string, routineId: string): RoutineChargeLite | undefined
  /** Open goals of the project (active sprints). */
  goalsOf(projectId: string): readonly PersonaGoal[]
  /** A CLI is connected (always true when scripted). */
  engineReady(): boolean
  /** Hand a request to the message pipeline. May call the model later; the scheduler never awaits that. */
  postRequest(request: TeamRequest): PostResult
  /** Run a ticket nobody executes. Serialized with human messages by the host. */
  driveTicket(projectId: string, ticketId: string, personaId: string): Promise<void>
  /** Send the dashed queues of idle personas (IV-5). Returns how many bubbles went. */
  flushQueues?(projectId: string): number
  /** Hand back requests the pre-router held (silence, full project) once the gate is open. Returns how many. */
  releaseHeld?(projectId: string): number
  /** Harvest 10: the window renewed (or the person chose “Continuar agora”): one turn per waiting conversation. Returns how many. */
  releaseWindowQueue?(projectId: string): number
  /** TEAM-7: the morning card of the Coordenação when it is time (no model; it runs even when no engine is connected). */
  morningBrief?(projectId: string): void
  /** Re-measure the draft of a running ticket (SW-7 “Num rascunho · N arquivos”). Failures are not fatal. */
  refreshDraft?(projectId: string, ticketId: string): Promise<void>
  /** Tokens a persona spent since `fromIso` (0 when unmetered). */
  tokensSince?(projectId: string, personaId: string, fromIso: string): number
  /** P1-9: visible “Proposta de {persona}” cards. Absent ⇒ the initiative stays an audit line, as before. */
  readonly proposals?: TaskProposalPort
  /**
   * HONEST-1: the team's quiet window. Inside it the team starts NOTHING by itself (initiatives, routines, plans, the proposal card, the morning card):
   * what is held stays due and goes when the window ends. Absent ⇒ no window.
   */
  readonly houseRules?: Pick<HouseRules, 'hold' | 'quietNow'>
  /**
   * Marco M2: the responsible's loop. Stepped ONCE per project per cycle, right after the pull (a paused team and a missing engine never reach it: the scheduler already said why; the quiet window does, and the loop
   * writes its own hold). It receives the persona's own daily budget (the same count the routines and the pull spend). A loop that throws never breaks the cycle. Absent ⇒ no loop.
   */
  readonly lead?: { step(projectId: string, budget: LeadBudget): void }
}

/** Timer pair; the handle is opaque to the scheduler. */
export interface SchedulerTimers {
  set(run: () => void, ms: number): number
  clear(handle: number): void
}

/** Timing and injection knobs. `cycleMs: 0` disables the timer (tests call {@link ProactivityScheduler.cycle}). */
export interface SchedulerOptions {
  readonly cycleMs?: number
  readonly initialDelayMs?: number
  readonly leaseMs?: number
  /** Running ticket without progress for this long is reported (Vigia `no_progress`). */
  readonly stallAfterMs?: number
  /** Minimum gap between two planning turns for the same goal. */
  readonly planEveryMs?: number
  /**
   * A running ticket counts as "nobody executes it" only when untouched for this long: one that was just created or
   * retried has its own run starting (queued behind other work), and driving it too would run it twice.
   */
  readonly strandedAfterMs?: number
  readonly nowMs?: () => number
  readonly timers?: SchedulerTimers
}

/** UI-visible scheduler state. `resting` = nothing to do, no model calls. */
export type SchedulerState = 'working' | 'resting' | 'paused' | 'no_engine' | 'error'

/** What one cycle did in one project. */
export interface ProjectCycleReport {
  readonly projectId: string
  readonly state: SchedulerState
  readonly routinesRun: number
  readonly routinesSkipped: number
  readonly assigned: readonly string[]
  readonly retried: readonly string[]
  readonly planned: readonly string[]
  /** Model-bound starts this cycle (drives, plans, routine and initiative tasks). Zero when the team rests. */
  readonly modelStarts: number
}

/** Result of {@link ProactivityScheduler.cycle}. */
export interface CycleReport {
  readonly at: string
  readonly skipped: 'busy' | 'disposed' | undefined
  readonly projects: readonly ProjectCycleReport[]
}

/** One line of the activity list. */
export interface SchedulerActionView {
  readonly at: string
  readonly kind: SchedulerEventKind
  readonly detail: string
}

/** Read model behind `getProactivityStatus`. */
export interface ProactivityStatusView {
  readonly projectId: string
  readonly state: SchedulerState
  readonly running: boolean
  readonly cycleMs: number
  readonly lastCycleAt: string
  readonly nextCycleAt: string
  readonly openGoals: number
  readonly queued: number
  readonly lastActions: readonly SchedulerActionView[]
}

interface RetryDoc { readonly attempts: number; readonly nextAt: string; readonly exhausted: boolean }
interface CountDoc { readonly n: number }
interface PlanDoc { readonly at: string }
interface Tally {
  routinesRun: number
  routinesSkipped: number
  modelStarts: number
  assigned: string[]
  retried: string[]
  planned: string[]
}

const DEFAULTS = {
  cycleMs: 30_000,
  initialDelayMs: 5_000,
  leaseMs: 5 * MIN_MS,
  stallAfterMs: 10 * MIN_MS,
  planEveryMs: 6 * 60 * MIN_MS,
  strandedAfterMs: 30_000,
} as const

/** Real timers: unref'd so an idle host can exit. */
export function realTimers(): SchedulerTimers {
  const live = new Map<number, ReturnType<typeof setTimeout>>()
  let sequence = 0
  return {
    set(run, ms) {
      sequence += 1
      const id = sequence
      const handle = setTimeout(() => { live.delete(id); run() }, ms)
      handle.unref()
      live.set(id, handle)
      return id
    },
    clear(id) {
      const handle = live.get(id)
      if (handle !== undefined) clearTimeout(handle)
      live.delete(id)
    },
  }
}

/** The proactivity scheduler. See the module comment. */
export class ProactivityScheduler {
  readonly deps: SchedulerDeps
  readonly cycleMs: number
  private readonly initialDelayMs: number
  private readonly leaseMs: number
  private readonly stallAfterMs: number
  private readonly planEveryMs: number
  private readonly strandedAfterMs: number
  private readonly nowMs: () => number
  private readonly timers: SchedulerTimers
  private timer: number | undefined
  private started = false
  private disposed = false
  private cycling = false
  private lastCycleMs = 0
  private nextCycleMs = 0
  private readonly drives = new Map<string, Promise<void>>()
  private readonly measuring = new Map<string, Promise<void>>()
  private readonly lastState = new Map<string, 'running' | 'paused' | 'no_engine'>()
  private readonly states = new Map<string, SchedulerState>()
  private readonly recent = new Map<string, SchedulerActionView[]>()
  /** Last cycle failures (bounded) for diagnostics. */
  readonly lastErrors: string[] = []

  /**
   * @param deps - Repos, orchestration and the model-calling ports.
   * @param options - Timing and clock injection.
   */
  constructor(deps: SchedulerDeps, options: SchedulerOptions = {}) {
    this.deps = deps
    this.cycleMs = options.cycleMs ?? DEFAULTS.cycleMs
    this.initialDelayMs = options.initialDelayMs ?? DEFAULTS.initialDelayMs
    this.leaseMs = options.leaseMs ?? DEFAULTS.leaseMs
    this.stallAfterMs = options.stallAfterMs ?? DEFAULTS.stallAfterMs
    this.planEveryMs = options.planEveryMs ?? DEFAULTS.planEveryMs
    this.strandedAfterMs = options.strandedAfterMs ?? DEFAULTS.strandedAfterMs
    this.nowMs = options.nowMs ?? (() => Date.now())
    this.timers = options.timers ?? realTimers()
  }

  /** Arm the cycle timer. A no-op when disabled, already armed or disposed. */
  start(): void {
    if (this.disposed || this.started || this.cycleMs <= 0) return
    this.started = true
    this.arm(this.initialDelayMs)
  }

  /** Stop the timer for good (host dispose). In-flight drives finish on their own. */
  dispose(): void {
    this.disposed = true
    this.started = false
    if (this.timer !== undefined) this.timers.clear(this.timer)
    this.timer = undefined
  }

  /** Resolves when every drive started by the scheduler has settled (tests, shutdown). */
  async whenIdle(): Promise<void> {
    while (this.drives.size > 0 || this.measuring.size > 0) await Promise.allSettled([...this.drives.values(), ...this.measuring.values()])
  }

  /** One Vigia cycle over every project. Never throws; a failure becomes an audit row. */
  cycle(): Promise<CycleReport> {
    const at = new Date(this.nowMs()).toISOString()
    if (this.disposed) return Promise.resolve({ at, skipped: 'disposed', projects: [] })
    if (this.cycling) return Promise.resolve({ at, skipped: 'busy', projects: [] })
    this.cycling = true
    const projects: ProjectCycleReport[] = []
    try {
      for (const workspace of this.deps.product.listWorkspaces()) {
        for (const project of this.deps.product.listProjects(workspace.id)) {
          projects.push(this.cycleProject(workspace.id, project.id))
        }
      }
      return Promise.resolve({ at, skipped: undefined, projects })
    } finally {
      this.cycling = false
      this.lastCycleMs = this.nowMs()
    }
  }

  /**
   * Status for the UI.
   * @param projectId - Tenant.
   */
  status(projectId: string): ProactivityStatusView {
    const goals = this.deps.goalsOf(projectId).filter(goal => goal.phase === 'active')
    return {
      projectId,
      state: this.states.get(projectId) ?? 'resting',
      running: this.started && !this.disposed,
      cycleMs: this.cycleMs,
      lastCycleAt: this.lastCycleMs === 0 ? '' : new Date(this.lastCycleMs).toISOString(),
      nextCycleAt: this.started && this.nextCycleMs > 0 ? new Date(this.nextCycleMs).toISOString() : '',
      openGoals: goals.length,
      queued: this.queueOf(projectId).length,
      lastActions: [...(this.recent.get(projectId) ?? [])],
    }
  }

  private arm(delayMs: number): void {
    this.nextCycleMs = this.nowMs() + delayMs
    this.timer = this.timers.set(() => {
      this.timer = undefined
      void this.cycle().catch((error: unknown) => { this.remember(error) }).finally(() => {
        if (this.started && !this.disposed) this.arm(this.cycleMs)
      })
    }, delayMs)
  }

  private cycleProject(workspaceId: string, projectId: string): ProjectCycleReport {
    const nowIso = new Date(this.nowMs()).toISOString()
    try {
      return this.runProject(workspaceId, projectId, nowIso)
    } catch (error: unknown) {
      this.remember(error)
      this.states.set(projectId, 'error')
      this.audit(projectId, 'sched:error', projectId, `Falha no ciclo da equipe: ${message(error)}`, nowIso)
      return report(projectId, 'error')
    }
  }

  private runProject(workspaceId: string, projectId: string, nowIso: string): ProjectCycleReport {
    const { deps } = this
    if (deps.teamState.isPaused(projectId)) {
      this.states.set(projectId, 'paused')
      this.note(projectId, 'paused', nowIso)
      return report(projectId, 'paused')
    }
    const personas = deps.product.listPersonas(projectId)
    if (personas.length === 0) {
      this.states.set(projectId, 'resting')
      this.note(projectId, 'running', nowIso)
      return report(projectId, 'resting')
    }
    deps.proactivity.ensureAllInitiativeRoutines(projectId)
    // HONEST-1: the team's quiet window. Whatever the team would start BY ITSELF waits (it stays due and goes when the window ends); a DIRECT request of
    // the person never comes through here, and the recovery of a task already started (`retryFailed`, `pull`) is not an initiative.
    const quiet = deps.houseRules?.quietNow(projectId, nowIso)
    if (quiet === undefined) {
      deps.morningBrief?.(projectId)
    } else {
      this.audit(projectId, 'sched:quiet', projectId, `A equipe está na janela de silêncio «${quiet.label}» até ${quiet.end}: iniciativas, rotinas e planos esperam.`, nowIso, `quiet:${quiet.id}:${String(quiet.untilMs)}`)
    }
    // Harvest 10: the window renewed → one turn per waiting conversation, even while the probe still says no engine.
    const windowReleased = deps.releaseWindowQueue?.(projectId) ?? 0
    if (windowReleased > 0) {
      this.audit(projectId, 'sched:window', projectId, `${String(windowReleased)} conversa(s) retomada(s) depois da janela.`, nowIso)
    }
    if (!deps.engineReady()) {
      this.states.set(projectId, 'no_engine')
      this.note(projectId, 'no_engine', nowIso)
      return report(projectId, 'no_engine')
    }
    this.note(projectId, 'running', nowIso)

    const tally: Tally = { routinesRun: 0, routinesSkipped: 0, modelStarts: 0, assigned: [], retried: [], planned: [] }
    deps.orchestration.tick(projectId)
    const released = deps.releaseHeld?.(projectId) ?? 0
    if (released > 0) {
      this.audit(projectId, 'sched:released', projectId, `${String(released)} pedido(s) que ficaram esperando foram retomados.`, nowIso)
    }
    this.reclaimExpired(projectId, nowIso)
    deps.proposals?.expire(projectId, nowIso)
    this.materialize(projectId, nowIso)
    if (quiet !== undefined) this.holdDue(projectId, nowIso)
    else {
      for (const run of deps.routines.claimDue(projectId, new Date(this.nowMs() + this.leaseMs).toISOString())) {
        const outcome = this.runRoutine(workspaceId, projectId, run, nowIso)
        if (outcome === 'skipped') tally.routinesSkipped += 1
        else tally.routinesRun += 1
        if (outcome === 'model') tally.modelStarts += 1
      }
    }
    if (quiet !== undefined) {
      if ((deps.proposals?.queued?.(projectId) ?? 0) > 0) deps.houseRules?.hold(projectId, 'proposal', projectId, 'cartão de propostas', nowIso)
    } else if (deps.proposals?.flush(projectId, nowIso) === true) {
      this.audit(projectId, 'sched:proposal_card', projectId, 'A equipe deixou uma proposta no #geral.', nowIso)
    }
    this.retryFailed(projectId, personas, nowIso, tally)
    this.pull(projectId, personas, nowIso, tally)
    this.stepLead(projectId, personas, nowIso)
    const sentQueued = deps.flushQueues?.(projectId) ?? 0
    if (sentQueued > 0) {
      this.audit(projectId, 'sched:queue_sent', projectId, `Enviei ${String(sentQueued)} mensagem(ns) que estavam na fila.`, nowIso)
    }
    this.planIfEmpty(workspaceId, projectId, personas, nowIso, tally)
    this.refreshDrafts(projectId)

    const working = this.drives.size > 0 || this.queueOf(projectId).length > 0 || deps.orchestration.budget.of(projectId) > 0
    const state: SchedulerState = working ? 'working' : 'resting'
    this.states.set(projectId, state)
    return { projectId, state, ...tally }
  }

  // ---- routines -----------------------------------------------------------

  /**
   * HONEST-1: inside the team's quiet window the due routines are NOT claimed: they stay pending and go, by their own catch-up rule, when the window
   * ends. The window's book says what it held (once per routine and per occurrence of the window, however many cycles look at it).
   */
  private holdDue(projectId: string, nowIso: string): void {
    const { deps } = this
    for (const routine of deps.routines.list(projectId)) {
      if (routine.paused) continue
      if (!deps.routines.listRuns(routine.id).some(run => run.status === 'pending' && run.scheduledFor <= nowIso)) continue
      if (routine.id.startsWith(INITIATIVE_PREFIX)) {
        const personaId = routine.id.slice(INITIATIVE_PREFIX.length)
        deps.houseRules?.hold(projectId, 'initiative', personaId, `iniciativa de ${deps.product.getPersona(personaId)?.name ?? 'alguém da equipe'}`, nowIso)
      } else if (routine.id.startsWith(MORNING_ROUTINE_PREFIX)) {
        deps.houseRules?.hold(projectId, 'brief', routine.id, 'resumo da manhã', nowIso)
      } else {
        deps.houseRules?.hold(projectId, 'routine', routine.id, `rotina «${routine.name}»`, nowIso)
      }
    }
  }

  /** A run leased by a process that died is released and tried again (bounded). */
  private reclaimExpired(projectId: string, nowIso: string): void {
    for (const routine of this.deps.routines.list(projectId)) {
      for (const run of this.deps.routines.listRuns(routine.id)) {
        if (run.status !== 'leased' || run.leaseUntil === undefined || run.leaseUntil > nowIso) continue
        this.deps.routines.fail(run.id)
        if (run.attempt + 1 >= MAX_LEASE_ATTEMPTS) {
          this.audit(projectId, 'sched:routine_lost', routine.id, `A rotina “${routine.name}” não terminou ${String(MAX_LEASE_ATTEMPTS)} vezes seguidas. Veja se algo a impede.`, nowIso, run.id)
          continue
        }
        this.deps.routines.retry(run.id)
      }
    }
  }

  /** Turn each routine's rrule into pending `routine_run` rows (idempotent on routine+instant). */
  private materialize(projectId: string, nowIso: string): void {
    const now = Date.parse(nowIso)
    const resumedAt = Date.parse(this.deps.teamState.get(projectId).resumedAt)
    for (const routine of this.deps.routines.list(projectId)) {
      if (routine.paused) continue
      if (routine.rrule === EVENT_RRULE) continue // item 26: event-driven, it has no time: the intake queues its runs when an event arrives
      try {
        const anchor = Date.parse(routine.createdAt)
        const last = this.deps.routines.listRuns(routine.id)[0]
        const lastMs = last === undefined ? Number.NEGATIVE_INFINITY : Date.parse(last.scheduledFor)
        const floor = Number.isFinite(resumedAt) ? resumedAt : Number.NEGATIVE_INFINITY
        const from = Math.max(anchor, lastMs, floor, now - MAX_BACKFILL_MS)
        const cap = routine.catchUp === 'run_all' ? 20 : 1
        for (const at of occurrencesBetween(routine.rrule, routine.timeZone, anchor, from, now, cap)) {
          const iso = new Date(at).toISOString()
          this.deps.routines.schedule({ id: `${routine.id}@${iso}`, routineId: routine.id, scheduledFor: iso })
        }
      } catch (error: unknown) {
        if (!(error instanceof RruleError)) throw error
        this.audit(
          projectId, 'sched:routine_bad_rule', routine.id,
          `A rotina “${routine.name}” tem uma agenda que não entendi (${error.message}). Ela não vai rodar até ser corrigida.`,
          nowIso, `${routine.id}:${routine.rrule}`,
        )
      }
    }
  }

  private runRoutine(workspaceId: string, projectId: string, run: RoutineRun, nowIso: string): 'model' | 'done' | 'skipped' {
    const { deps } = this
    const routine = deps.routines.get(run.routineId)
    if (routine === undefined) {
      deps.routines.complete(run.id)
      return 'skipped'
    }
    try {
      const outcome = routine.id.startsWith(INITIATIVE_PREFIX)
        ? this.runInitiative(workspaceId, projectId, routine, run, nowIso)
        : this.runCustom(workspaceId, projectId, routine, run, nowIso)
      deps.routines.complete(run.id)
      this.dropEventDocWhenOver(projectId, run)
      return outcome
    } catch (error: unknown) {
      deps.routines.fail(run.id)
      this.dropEventDocWhenOver(projectId, run)
      this.remember(error)
      this.audit(projectId, 'sched:error', routine.id, `A rotina “${routine.name}” falhou: ${message(error)}`, nowIso, run.id)
      return 'skipped'
    }
  }

  /**
   * P1-07 D: an event run that is OVER (done, skipped or failed for good) no longer needs the text of its event: the document goes. A run that waits for a retry (pending) keeps it.
   * @param projectId - Tenant.
   * @param run - The run that just ran.
   */
  private dropEventDocWhenOver(projectId: string, run: RoutineRun): void {
    if (!isEventRunId(run.id)) return
    const now = this.deps.routines.listRuns(run.routineId).find(item => item.id === run.id)
    if (now?.status === 'pending') return
    this.deps.screens.delete(projectId, EVENT_DOC_KIND, run.id)
  }

  private runInitiative(workspaceId: string, projectId: string, routine: Routine, run: RoutineRun, nowIso: string): 'model' | 'done' | 'skipped' {
    const { deps } = this
    const personaId = routine.id.slice(INITIATIVE_PREFIX.length)
    const persona = deps.product.getPersona(personaId)
    if (persona === undefined || persona.projectId !== projectId) return 'skipped'
    if (deps.orchestration.isPersonaPaused(projectId, persona.id)) {
      this.audit(projectId, 'sched:initiative_skipped', persona.id, `${persona.name} está pausada: a iniciativa de hoje foi pulada.`, nowIso, `${run.id}:paused`)
      return 'skipped'
    }
    if (!withinWorkHours(persona, Date.parse(nowIso))) {
      this.audit(projectId, 'sched:initiative_skipped', persona.id, `${persona.name} está fora do horário de trabalho: a iniciativa de hoje foi pulada.`, nowIso, `${run.id}:hours`)
      return 'skipped'
    }
    const autonomy = deps.proactivity.getAutonomy(projectId, persona.id)
    const goal = deps.goalsOf(projectId).find(item => item.phase === 'active')
    if (autonomy.mode === 'propose') {
      // P1-9: "Propor" — what is worth proposing is recorded now and shown as ONE card when the project's cycle ends. It does
      // not wait for `fire` below: that legacy scorer drops a fact about an existing Ticket as a "duplicate" of that very Ticket.
      const recorded = deps.proposals?.offer({
        workspaceId, projectId, personaId: persona.id, nowIso, ...(goal === undefined ? {} : { goalObjective: goal.objective }),
      }) ?? 0
      if (recorded > 0) this.audit(projectId, 'sched:initiative_proposed', persona.id, `${persona.name} tem ${String(recorded)} proposta(s) para você.`, nowIso, run.id)
    }
    const fired = deps.proactivity.fire(projectId, persona.id, 'routine', 'Revisar o projeto e propor o próximo passo')
    if (!fired) return 'skipped'
    if (autonomy.mode !== 'act' || goal === undefined) return 'done'
    // "Agir dentro de limites": only with an open goal (no goal ⇒ the team rests) and inside the budget.
    if (!this.mayStartModel(projectId, persona, autonomy, nowIso)) return 'done'
    const posted = deps.postRequest({
      workspaceId, projectId, id: `initiative:${run.id}`, actorId: 'team:initiative', personaId: persona.id, kind: 'initiative',
      body: `@${persona.name} Faça o próximo passo do objetivo “${goal.objective}” dentro do seu cargo e relate com evidência.`,
    })
    if (!posted.ok) {
      this.audit(projectId, 'sched:not_delivered', persona.id, `A iniciativa de ${persona.name} não virou tarefa: ${posted.reason}.`, nowIso, run.id)
      return 'done'
    }
    this.spend(projectId, persona.id, nowIso)
    this.audit(projectId, 'sched:initiative_act', persona.id, `${persona.name} começou o próximo passo do objetivo “${goal.objective}”.`, nowIso, run.id)
    return 'model'
  }

  private runCustom(workspaceId: string, projectId: string, routine: Routine, run: RoutineRun, nowIso: string): 'model' | 'done' | 'skipped' {
    const { deps } = this
    // TEAM-7: "Resumo da manhã" is the team's own ritual: the card is posted by `morningBrief` (deterministic, no model), never as a Task.
    if (routine.id.startsWith(MORNING_ROUTINE_PREFIX)) return 'done'
    const spec = deps.screens.get<RoutineSpecDoc>(projectId, ROUTINE_SPEC_KIND, routine.id)
    const charge = deps.chargeOf?.(workspaceId, routine.id)
    // No named owner ⇒ the Coordenação decides (Muse/Ember, IV-9).
    const coordination = deps.product.listPersonas(projectId).find(item => item.systemRoles.includes('coordination'))
    const personaId = [spec?.personaId, charge?.executorPersonaId].find(id => id !== undefined && id !== '') ?? coordination?.id
    if (personaId === undefined) {
      this.audit(projectId, 'sched:routine_skipped', routine.id, `A rotina “${routine.name}” venceu, mas não há ninguém para fazer (nem Coordenação). Defina quem faz.`, nowIso, run.id)
      return 'skipped'
    }
    if (charge?.requiresApproval === true) {
      this.audit(projectId, 'sched:routine_skipped', routine.id, `A rotina “${routine.name}” precisa da sua aprovação antes de rodar: não rodou.`, nowIso, run.id)
      return 'skipped'
    }
    const prompt = spec?.prompt?.trim() ?? ''
    // Item 26: a run an event started carries the event as fenced external data AFTER the request, never as the request itself.
    const event = isEventRunId(run.id) ? deps.screens.get<RoutineEventDoc>(projectId, EVENT_DOC_KIND, run.id) : undefined
    if (isEventRunId(run.id) && event === undefined) {
      this.audit(projectId, 'sched:routine_skipped', routine.id, `A rotina “${routine.name}” foi chamada por um evento que já não está guardado: não rodou.`, nowIso, run.id)
      return 'skipped'
    }
    const persona = deps.product.getPersona(personaId)
    if (persona === undefined || persona.projectId !== projectId) {
      this.audit(projectId, 'sched:routine_skipped', routine.id, `A rotina “${routine.name}” aponta para uma persona que não existe mais.`, nowIso, run.id)
      return 'skipped'
    }
    if (deps.orchestration.isPersonaPaused(projectId, persona.id)) {
      this.audit(projectId, 'sched:routine_skipped', routine.id, `${persona.name} está pausada: a rotina “${routine.name}” não rodou.`, nowIso, run.id)
      return 'skipped'
    }
    if (!this.mayStartModel(projectId, persona, deps.proactivity.getAutonomy(projectId, persona.id), nowIso)) return 'skipped'
    const posted = deps.postRequest({
      workspaceId, projectId, id: `routine-run:${run.id}:${String(run.attempt)}`, actorId: `routine:${routine.id}`, personaId: persona.id, kind: 'routine',
      body: `@${persona.name} ${prompt === '' ? `Faça a rotina “${routine.name}” agora e relate com evidência.` : prompt}${event === undefined ? '' : `\n\n${event.text}`}`,
    })
    if (!posted.ok && posted.held === true) {
      // S1 P1-12: the window reserve already keeps this request (it goes when the window renews). Retrying every cycle queued it once more each time.
      this.audit(projectId, 'sched:routine_run', routine.id, `Rotina “${routine.name}”: ${persona.name} começa quando a janela renovar.`, nowIso, `${run.id}:held`)
      return 'done'
    }
    if (!posted.ok) return this.defer(run, routine, posted.reason, nowIso)
    this.spend(projectId, persona.id, nowIso)
    if (event !== undefined) deps.screens.delete(projectId, EVENT_DOC_KIND, run.id) // the text now lives in the request itself
    this.audit(projectId, 'sched:routine_run', routine.id, `Rotina “${routine.name}”: ${persona.name} começou${event === undefined ? '' : ' ao receber um evento'}.`, nowIso, run.id)
    return 'model'
  }

  /** The pipeline refused the routine's message: put the run back for the next cycle (bounded) and say why. */
  private defer(run: RoutineRun, routine: Routine, reason: string, nowIso: string): 'skipped' {
    this.deps.routines.fail(run.id)
    const again = run.attempt + 1 < MAX_LEASE_ATTEMPTS
    if (again) this.deps.routines.retry(run.id)
    this.audit(
      routine.projectId, 'sched:not_delivered', routine.id,
      `A rotina “${routine.name}” não virou tarefa: ${reason}.${again ? ' Tento de novo no próximo ciclo.' : ' Parei de tentar; veja o histórico da rotina.'}`,
      nowIso, `${run.id}:${String(run.attempt)}`,
    )
    return 'skipped'
  }

  // ---- pull / retry / plan ------------------------------------------------

  /** Open tickets a persona can still advance: the "queue" of the Vigia. */
  private queueOf(projectId: string): Ticket[] {
    return this.deps.orchestration.runtime(projectId).repo.tickets.list().filter((ticket) => {
      if (ticket.ended !== undefined || ticket.attention !== undefined || waitsForPerson(ticket)) return false
      const report = latestAssignment(ticket)?.report
      return report === undefined || report.state === 'progress'
    })
  }

  /** Queue tickets whose run nobody is executing (no done line yet), oldest first. */
  private strandedOf(queue: readonly Ticket[], nowMs: number): Ticket[] {
    return queue
      .filter((ticket) => {
        const latest = latestAssignment(ticket)
        if (latest === undefined || latest.state === 'ended' || this.deps.events.has(doneEventId(ticket))) return false
        return nowMs - Date.parse(ticket.updatedAt) >= this.strandedAfterMs
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }

  private pull(projectId: string, personas: readonly StoredPersona[], nowIso: string, tally: Tally): void {
    const { deps } = this
    const busy = deps.orchestration.budget.of(projectId) > 0 || this.drivingIn(projectId)
    const queue = this.queueOf(projectId)
    const goalsOpen = deps.goalsOf(projectId).some(goal => goal.phase === 'active')
    const vigia = vigiaTick({
      now: Date.parse(nowIso),
      openGoal: goalsOpen || queue.length > 0,
      stalledTicketIds: [],
      failingEffectKeys: [],
      unavailableEvalIds: [],
      personas: personas.map((persona) => {
        const mine = queue.filter(ticket => ownerOf(ticket, personas)?.id === persona.id)
        const running = mine.some(ticket => latestAssignment(ticket)?.state === 'running')
        const last = mine.reduce((max, ticket) => ticket.updatedAt > max ? ticket.updatedAt : max, persona.updatedAt)
        return {
          personaId: persona.id,
          idle: !(busy && running),
          queueLength: mine.length,
          lastProgressAt: Date.parse(last) || 0,
          sameReportCount: 0,
        }
      }),
    }, { noProgressMs: this.stallAfterMs, loopCount: 3 })

    const toAssign = new Set<string>()
    for (const action of vigia.actions) {
      if (action.kind === 'assign') toAssign.add(action.subjectId)
      else if (action.kind === 'request_status' || action.kind === 'recover') {
        const persona = personas.find(item => item.id === action.subjectId)
        this.audit(projectId, 'sched:stalled', action.subjectId, `${persona?.name ?? 'Uma persona'} está sem progresso há mais de ${String(Math.round(this.stallAfterMs / MIN_MS))} min.`, nowIso, `${action.subjectId}:${nowIso.slice(0, 13)}`)
      }
    }
    if (busy) return
    const perPersona = new Set<string>()
    for (const ticket of this.strandedOf(queue, Date.parse(nowIso))) {
      if (tally.assigned.length >= deps.orchestration.budget.maxPerProject) break
      const persona = ownerOf(ticket, personas)
      if (persona === undefined || !toAssign.has(persona.id) || perPersona.has(persona.id)) continue
      if (deps.orchestration.isPersonaPaused(projectId, persona.id)) continue
      const assignmentId = latestAssignment(ticket)?.id ?? ''
      const attempts = this.count(projectId, `drive:${ticket.id}:${assignmentId}`)
      if (attempts >= MAX_DRIVES_PER_ASSIGNMENT) {
        this.audit(projectId, 'sched:retry_exhausted', ticket.id, `Não consegui retomar “${ticket.title}” depois de ${String(attempts)} tentativas. Preciso de você.`, nowIso, `${ticket.id}:${assignmentId}`)
        continue
      }
      if (!this.mayStartModel(projectId, persona, deps.proactivity.getAutonomy(projectId, persona.id), nowIso)) continue
      perPersona.add(persona.id)
      this.bump(projectId, `drive:${ticket.id}:${assignmentId}`)
      this.spend(projectId, persona.id, nowIso)
      tally.assigned.push(ticket.id)
      tally.modelStarts += 1
      this.audit(projectId, 'sched:assigned', ticket.id, `${persona.name} retomou “${ticket.title}”, que estava parada.`, nowIso, `${ticket.id}:${assignmentId}:${String(attempts)}`)
      const drive = deps.driveTicket(projectId, ticket.id, persona.id)
        .catch((error: unknown) => {
          this.remember(error)
          if (this.disposed) return // the store may already be closed
          try {
            this.audit(projectId, 'sched:error', ticket.id, `Não consegui retomar “${ticket.title}”: ${message(error)}`, new Date(this.nowMs()).toISOString())
          } catch (inner: unknown) {
            this.remember(inner)
          }
        })
        .finally(() => { this.drives.delete(ticket.id) })
      this.drives.set(ticket.id, drive)
    }
  }

  /** Marco M2: one step of the responsible's loop, on the persona's own daily budget; whatever it does, the rest of the cycle goes on. */
  private stepLead(projectId: string, personas: readonly StoredPersona[], nowIso: string): void {
    const { deps } = this
    if (deps.lead === undefined) return
    const budget: LeadBudget = {
      may: (personaId) => {
        const persona = personas.find(item => item.id === personaId)
        return persona !== undefined && this.mayStartModel(projectId, persona, deps.proactivity.getAutonomy(projectId, persona.id), nowIso)
      },
      spend: (personaId) => { this.spend(projectId, personaId, nowIso) },
    }
    try {
      deps.lead.step(projectId, budget)
    } catch (error: unknown) {
      this.remember(error)
    }
  }

  private retryFailed(projectId: string, personas: readonly StoredPersona[], nowIso: string, tally: Tally): void {
    const { deps } = this
    const now = Date.parse(nowIso)
    for (const ticket of deps.orchestration.runtime(projectId).repo.tickets.list()) {
      if (ticket.ended !== undefined) continue
      const failed = latestAssignment(ticket)?.report
      if (failed?.state !== 'failed') continue
      const persona = ownerOf(ticket, personas)
      if (persona === undefined || deps.orchestration.isPersonaPaused(projectId, persona.id)) continue
      const doc = deps.screens.get<RetryDoc>(projectId, STATE_KIND, `retry:${ticket.id}`)
      if (doc?.exhausted === true) continue
      const attempts = doc?.attempts ?? 0
      if (attempts >= RETRY_BACKOFF_MS.length) {
        deps.screens.put(projectId, STATE_KIND, `retry:${ticket.id}`, { attempts, nextAt: '', exhausted: true } satisfies RetryDoc)
        this.audit(projectId, 'sched:retry_exhausted', ticket.id, `“${ticket.title}” falhou ${String(attempts)} vezes seguidas. Preciso de você para seguir.`, nowIso, `${ticket.id}:exhausted`)
        continue
      }
      const dueAt = doc === undefined ? Date.parse(failed.at) + RETRY_BACKOFF_MS[0] : Date.parse(doc.nextAt)
      if (!Number.isFinite(dueAt) || now < dueAt) continue
      if (!this.mayStartModel(projectId, persona, deps.proactivity.getAutonomy(projectId, persona.id), nowIso)) continue
      deps.orchestration.runtime(projectId).engine.retryTicket(ticket.id)
      const wait = RETRY_BACKOFF_MS[Math.min(attempts + 1, RETRY_BACKOFF_MS.length - 1)] ?? 0
      deps.screens.put(projectId, STATE_KIND, `retry:${ticket.id}`, {
        attempts: attempts + 1, nextAt: new Date(now + wait).toISOString(), exhausted: false,
      } satisfies RetryDoc)
      tally.retried.push(ticket.id)
      this.audit(projectId, 'sched:retry', ticket.id, `Tentando “${ticket.title}” de novo (${String(attempts + 1)} de ${String(RETRY_BACKOFF_MS.length)}).`, nowIso, `${ticket.id}:${String(attempts + 1)}`)
      deps.orchestration.tick(projectId)
    }
  }

  private planIfEmpty(workspaceId: string, projectId: string, personas: readonly StoredPersona[], nowIso: string, tally: Tally): void {
    const { deps } = this
    const goals = deps.goalsOf(projectId)
    // 'work' keeps going; 'rest' spends nothing: zero model calls.
    if (emptyQueueDecision(this.queueOf(projectId).length, goals) !== 'plan') return
    const coordination = personas.find(persona => persona.systemRoles.includes('coordination'))
    if (coordination === undefined || deps.orchestration.isPersonaPaused(projectId, coordination.id)) return
    // The first open goal that was not planned lately (several goals take turns).
    const goal = goals.find((item) => {
      if (item.phase !== 'active') return false
      const planned = deps.screens.get<PlanDoc>(projectId, STATE_KIND, `plan:${item.id}`)
      return planned === undefined || Date.parse(nowIso) - Date.parse(planned.at) >= this.planEveryMs
    })
    if (goal === undefined) return
    const autonomy = deps.proactivity.getAutonomy(projectId, coordination.id)
    if (autonomy.mode === 'asked') return
    if (inSilence(nowIso, autonomy.silenceStart, autonomy.silenceEnd, deps.proactivity.offsetMinutes(nowIso))) {
      this.audit(projectId, 'sched:silence', coordination.id, `${coordination.name} está na janela de silêncio: o planejamento espera.`, nowIso, `plan-silence:${nowIso.slice(0, 13)}`)
      return
    }
    // HONEST-1: the Coordenação does not start a planning round inside the team's quiet window (it plans when the window ends).
    if (deps.houseRules?.hold(projectId, 'plan', goal.id, `plano do objetivo «${goal.objective}»`, nowIso) !== undefined) return
    if (!this.mayStartModel(projectId, coordination, autonomy, nowIso)) return
    const posted = deps.postRequest({
      workspaceId, projectId, id: `plan:${goal.id}:${nowIso}`, actorId: 'team:plan', personaId: coordination.id, kind: 'plan',
      body: `@${coordination.name} Planeje o próximo passo do objetivo “${goal.objective}”: veja o que falta, crie as tarefas e distribua para a equipe.`,
    })
    if (!posted.ok) {
      this.audit(projectId, 'sched:not_delivered', goal.id, `O planejamento do objetivo “${goal.objective}” não virou tarefa: ${posted.reason}.`, nowIso, `plan:${goal.id}:${nowIso.slice(0, 13)}`)
      return
    }
    deps.screens.put(projectId, STATE_KIND, `plan:${goal.id}`, { at: nowIso } satisfies PlanDoc)
    this.spend(projectId, coordination.id, nowIso)
    tally.planned.push(goal.id)
    tally.modelStarts += 1
    this.audit(projectId, 'sched:planned', goal.id, `A fila esvaziou com o objetivo “${goal.objective}” aberto: ${coordination.name} vai planejar o próximo passo.`, nowIso, `${goal.id}:${nowIso}`)
  }

  /** While a task runs, keep its draft file count fresh for the “agora” strip (one measurement in flight per ticket). */
  private refreshDrafts(projectId: string): void {
    const { deps } = this
    if (deps.refreshDraft === undefined) return
    for (const ticket of this.deps.orchestration.runtime(projectId).repo.tickets.list()) {
      if (ticket.ended !== undefined || latestAssignment(ticket)?.state !== 'running' || this.measuring.has(ticket.id)) continue
      const pending = deps.refreshDraft(projectId, ticket.id)
        .catch((error: unknown) => { this.remember(error) })
        .finally(() => { this.measuring.delete(ticket.id) })
      this.measuring.set(ticket.id, pending)
    }
  }

  // ---- budgets ------------------------------------------------------------

  /** Daily execution and token budgets of the persona (autonomy row). Records the refusal once per day. */
  private mayStartModel(projectId: string, persona: StoredPersona, autonomy: AutonomyRow, nowIso: string): boolean {
    const day = nowIso.slice(0, 10)
    if (this.count(projectId, `spend:${day}:${persona.id}`) >= autonomy.executionBudget) {
      this.audit(projectId, 'sched:budget', persona.id, `${persona.name} usou as ${String(autonomy.executionBudget)} execuções do dia: o resto fica para amanhã.`, nowIso, `${day}:${persona.id}:runs`)
      return false
    }
    if ((this.deps.tokensSince?.(projectId, persona.id, `${day}T00:00:00.000Z`) ?? 0) >= autonomy.tokenBudget) {
      this.audit(projectId, 'sched:budget', persona.id, `${persona.name} chegou ao limite de tokens do dia: o resto fica para amanhã.`, nowIso, `${day}:${persona.id}:tokens`)
      return false
    }
    return true
  }

  private spend(projectId: string, personaId: string, nowIso: string): void {
    this.bump(projectId, `spend:${nowIso.slice(0, 10)}:${personaId}`)
  }

  private count(projectId: string, id: string): number {
    return this.deps.screens.get<CountDoc>(projectId, SPEND_KIND, id)?.n ?? 0
  }

  private bump(projectId: string, id: string): void {
    this.deps.screens.put(projectId, SPEND_KIND, id, { n: this.count(projectId, id) + 1 } satisfies CountDoc)
  }

  private drivingIn(projectId: string): boolean {
    for (const ticket of this.deps.orchestration.runtime(projectId).repo.tickets.list()) {
      if (this.drives.has(ticket.id)) return true
    }
    return false
  }

  // ---- visible events -----------------------------------------------------

  /** Record "paused" / "no engine" and their recovery once, on the state change (never every cycle). */
  private note(projectId: string, next: 'running' | 'paused' | 'no_engine', nowIso: string): void {
    const before = this.lastState.get(projectId) ?? 'running'
    if (before === next) return
    this.lastState.set(projectId, next)
    if (next === 'paused') this.audit(projectId, 'sched:team_paused', projectId, 'A equipe está pausada: nada roda até você retomar.', nowIso)
    else if (next === 'no_engine') this.audit(projectId, 'sched:no_engine', projectId, 'Nenhuma IA conectada: a equipe espera para trabalhar.', nowIso)
    else if (before === 'paused') this.audit(projectId, 'sched:team_resumed', projectId, 'A equipe voltou a trabalhar.', nowIso)
    else this.audit(projectId, 'sched:engine_ready', projectId, 'IA conectada: a equipe voltou a trabalhar.', nowIso)
  }

  private audit(projectId: string, kind: SchedulerEventKind, subjectId: string, detail: string, nowIso: string, key?: string): void {
    this.deps.proactivity.repos.recordAudit({ projectId, id: `${kind}:${key ?? `${subjectId}:${nowIso}`}`, at: nowIso, kind, subjectId, detail })
    const list = this.recent.get(projectId) ?? []
    if (list.some(item => item.kind === kind && item.detail === detail)) return
    list.push({ at: nowIso, kind, detail })
    if (list.length > 10) list.shift()
    this.recent.set(projectId, list)
  }

  private remember(error: unknown): void {
    this.lastErrors.push(message(error))
    if (this.lastErrors.length > 20) this.lastErrors.shift()
  }
}

function report(projectId: string, state: SchedulerState): ProjectCycleReport {
  return { projectId, state, routinesRun: 0, routinesSkipped: 0, assigned: [], retried: [], planned: [], modelStarts: 0 }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The persona that owns a ticket (same rule as the Visão geral: bound executor, else Coordination).
 * @param ticket - Ticket.
 * @param personas - Project roster.
 */
export function ownerOf(ticket: Ticket, personas: readonly StoredPersona[]): StoredPersona | undefined {
  if (ticket.execution !== undefined) return personas.find(persona => persona.name === ticket.execution?.name)
  return personas.find(persona => persona.systemRoles.includes('coordination'))
}

/**
 * Whether the persona is inside a weekly work window (no schedule ⇒ always available).
 * @param persona - Persona with an optional schedule.
 * @param nowMs - Instant.
 */
export function withinWorkHours(persona: Pick<StoredPersona, 'schedule'>, nowMs: number): boolean {
  const schedule = persona.schedule
  const windows = schedule?.weeklyHours
  if (schedule === undefined || windows === undefined || windows.length === 0) return true
  try {
    const local = zonedParts(nowMs, schedule.timeZone)
    const hm = `${String(local.h).padStart(2, '0')}:${String(local.mi).padStart(2, '0')}`
    return windows.some(window => window.day === local.dow && window.start <= hm && hm < window.end)
  } catch {
    return true
  }
}

/**
 * Next instant a routine is due (the "próxima execução" chip), or undefined.
 * @param routine - Routine.
 * @param afterMs - Reference instant.
 */
export function nextRoutineRun(routine: Pick<Routine, 'rrule' | 'timeZone' | 'createdAt'>, afterMs: number): number | undefined {
  try {
    return nextOccurrence(routine.rrule, routine.timeZone, Date.parse(routine.createdAt), afterMs)
  } catch {
    return undefined
  }
}
