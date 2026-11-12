/**
 * Initiative routines, event sources, autonomy/budget, Visão geral "agora"
 * and "Enquanto você estava fora", Vigia on the host scheduler.
 */

import {
  hasPendingDelivery,
  latestAssignment,
  scoreInitiative,
  vigiaTick,
  waitsForPerson,
  watchdogWarnings,
  type AttentionBudget,
  type ExistingWorkItem,
  type ProjectFact,
  type Ticket,
  type WatchdogWarning,
} from '@deepseek-ai/dsh-persona-engine'
import {
  ProactivityRepos,
  type AutonomyRow,
  type InitiativeFire,
  type StoredPersona,
} from '@deepseek-ai/dsh-persona-store'
import type { RoutineRepos } from '@deepseek-ai/dsh-persona-store'
import type { HouseRules } from './house-rules.ts'
import type { Orchestration } from './orchestration.ts'
import type { ProductRepos } from '@deepseek-ai/dsh-persona-store'
import type {
  ApprovalView, AwayEventView, AwayPersonaView, AwayWaitingView, WhileAwayView,
} from './types.ts'

/** Honest UI work state (PROACTIVITY §7). */
export type PersonaWorkState = 'working' | 'resting' | 'stuck' | 'waiting'

/** One persona on the "agora" strip. */
export interface PersonaNowView {
  readonly personaId: string
  readonly name: string
  readonly title: string
  readonly state: PersonaWorkState
  readonly currentTask: string
  readonly currentTaskId: string
  readonly queueCount: number
  readonly idleMinutes: number
  readonly deliveriesToday: number
  readonly proposalsAcceptedToday: number
  /** Files the persona already changed in the draft of its current task. Absent (or 0) = no draft (SW-7). */
  readonly draftFiles?: number
  /** Item 7: the step her open turn is on, in plain words ("lendo os arquivos"); absent = the line stays "Trabalhando". Same field as `types.ts#PersonaNowView.sentence`. */
  readonly sentence?: string
}

/** Visão geral — agora. */
export interface OverviewNowView {
  readonly personas: readonly PersonaNowView[]
}

export type { AwayEventView, AwayPersonaView, AwayWaitingView, WhileAwayView } from './types.ts'

/** How long between two writes of the presence marker (a refresh every few seconds must not write every time). */
const PRESENCE_WRITE_MS = 30_000
/** A gap longer than this since the person was last looking is an absence: the next read opens a new window. */
const AWAY_GAP_MS = 10 * 60_000
/** Most Tasks listed under one persona in "Enquanto você estava fora". */
const AWAY_TASKS_PER_PERSONA = 5

/** A Task counts as DELIVERED only when it ended as completed or merged (stopped, dropped and closed are not deliveries). */
export function isDelivered(ticket: Ticket): boolean {
  return ticket.ended !== undefined && (ticket.ended.outcome === 'completed' || ticket.ended.outcome === 'merged')
}

/** Result of one scheduler tick. */
export interface ProactivityTickResult {
  readonly initiatives: number
  readonly skipped: number
  readonly warnings: number
}

const INITIATIVE_PREFIX = 'initiative:'
const EPOCH = '1970-01-01T00:00:00.000Z'

/**
 * Host-side proactivity. Routines are the temporal Source; events are the
 * other Source. Vigia writes audit rows, never channel messages.
 */
export class ProactivityHost {
  readonly product: ProductRepos
  readonly routines: RoutineRepos
  readonly repos: ProactivityRepos
  readonly orchestration: Orchestration
  readonly now: () => string
  /** Draft size of a running ticket (the scheduler keeps it fresh). Unset = no draft information. */
  draftFilesOf: ((projectId: string, ticketId: string) => number | undefined) | undefined = undefined
  /** Item 7: the step the open turn of a Task is on, in plain words (`PersonaNowView.sentence`); undefined when unknown. */
  stepSentenceOf: ((projectId: string, ticketId: string) => string | undefined) | undefined = undefined
  /** The proposals and questions waiting in Aprovações (the same list the screen shows). Unset = none are listed. */
  approvalsOf: ((projectId: string) => readonly ApprovalView[]) | undefined = undefined
  /** HONEST-1: the team's quiet window. Unset = no window (the team starts initiatives as before). */
  houseRules: Pick<HouseRules, 'hold' | 'quietNow'> | undefined = undefined
  /** Whether the whole team is paused ("Pausar equipe"). Unset = never. */
  teamPaused: ((projectId: string) => boolean) | undefined = undefined
  /** The machine's offset from UTC (minutes east) at an instant: the person's silence window is read on their wall clock. The host binds it; unset = UTC. */
  offsetMinutes: (iso: string) => number = () => 0

  /**
   * @param product - Personas.
   * @param routines - Calendar.
   * @param repos - Autonomy / fires / audit.
   * @param orchestration - Engine tickets.
   * @param now - Instant factory.
   */
  constructor(
    product: ProductRepos,
    routines: RoutineRepos,
    repos: ProactivityRepos,
    orchestration: Orchestration,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.product = product
    this.routines = routines
    this.repos = repos
    this.orchestration = orchestration
    this.now = now
  }

  /**
   * Daily initiative routine at the persona's timezone (09:00 when no hours).
   * @param persona - Stored persona.
   */
  ensureInitiativeRoutine(persona: StoredPersona): void {
    const id = `${INITIATIVE_PREFIX}${persona.id}`
    const current = this.routines.get(id)
    if (current !== undefined) {
      if (current.name === id) this.routines.rename(id, `Iniciativa de ${persona.name}`)
      return
    }
    const timeZone = persona.schedule?.timeZone ?? 'UTC'
    const hour = initiativeHour(persona)
    this.routines.create({
      id,
      workspaceId: persona.workspaceId,
      projectId: persona.projectId,
      name: `Iniciativa de ${persona.name}`,
      rrule: `FREQ=DAILY;BYHOUR=${hour}`,
      timeZone,
      catchUp: 'run_once',
    })
  }

  /**
   * @param projectId - Tenant.
   */
  ensureAllInitiativeRoutines(projectId: string): number {
    let created = 0
    for (const persona of this.product.listPersonas(projectId)) {
      const id = `${INITIATIVE_PREFIX}${persona.id}`
      if (this.routines.get(id) === undefined) {
        this.ensureInitiativeRoutine(persona)
        created += 1
      }
    }
    return created
  }

  /**
   * Claim due initiative runs and fire them; then run the Vigia snapshot.
   * @param projectId - Tenant.
   * @param leaseUntil - Lease expiry.
   * @param stallAfterMs - Stalled-ticket threshold.
   */
  tick(projectId: string, leaseUntil: string, stallAfterMs: number): ProactivityTickResult {
    this.ensureAllInitiativeRoutines(projectId)
    let initiatives = 0
    let skipped = 0
    const claimed = this.routines.claimDue(projectId, leaseUntil)
    for (const run of claimed) {
      if (!run.routineId.startsWith(INITIATIVE_PREFIX)) {
        this.routines.complete(run.id)
        continue
      }
      const personaId = run.routineId.slice(INITIATIVE_PREFIX.length)
      const fired = this.fire(projectId, personaId, 'routine', 'Revisar o projeto e propor o próximo passo')
      if (fired) initiatives += 1
      else skipped += 1
      this.routines.complete(run.id)
    }
    const warnings = this.tickWatchdog(projectId, stallAfterMs)
    return { initiatives, skipped, warnings: warnings.length }
  }

  /**
   * Event Source (PR, recurring error, deadline).
   * @param projectId - Tenant.
   * @param title - What happened.
   * @param subjectId - External id.
   */
  fireEvent(projectId: string, title: string, subjectId: string): string[] {
    const fired: string[] = []
    for (const persona of this.product.listPersonas(projectId)) {
      const ok = this.fire(projectId, persona.id, 'event', `${title} (${subjectId})`)
      if (ok) fired.push(persona.id)
    }
    return fired
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - Persona.
   * @param source - Routine or event.
   * @param title - Proposal title.
   */
  fire(projectId: string, personaId: string, source: 'routine' | 'event', title: string): boolean {
    const autonomy = this.repos.getAutonomy(projectId, personaId)
    if (autonomy.mode === 'asked') return false
    const at = this.now()
    if (inSilence(at, autonomy.silenceStart, autonomy.silenceEnd, this.offsetMinutes(at))) return false
    // HONEST-1: inside the team's quiet window nothing is started by itself (the hold is written in the window's book, once per persona and occurrence).
    if (this.houseRules?.hold(projectId, 'initiative', personaId, `iniciativa de ${this.product.getPersona(personaId)?.name ?? 'alguém da equipe'}`, at) !== undefined) return false
    const day = at.slice(0, 10)
    if (this.repos.proposalsToday(projectId, personaId, day) >= autonomy.proposalBudget) return false
    const scored = scoreInitiativeProposal(this.orchestration, projectId, personaId, source, title, at, this.repos.proposalsToday(projectId, personaId, day), autonomy.proposalBudget)
    if (scored === undefined) return false
    const id = `${source}:${personaId}:${at}`
    this.repos.recordFire({
      projectId, id, personaId, source, kind: 'initiative', at, title: scored,
    })
    this.repos.addProposal(projectId, personaId, day)
    return true
  }

  /**
   * @param projectId - Tenant.
   * @param stallAfterMs - Age that marks a running ticket stalled.
   */
  tickWatchdog(projectId: string, stallAfterMs: number): WatchdogWarning[] {
    const now = this.now()
    const nowMs = Date.parse(now)
    const tickets = this.orchestration.runtime(projectId).repo.tickets.list()
    const stalledTicketIds = tickets.filter((ticket) => {
      const latest = latestAssignment(ticket)
      if (latest?.state !== 'running') return false
      const updated = Date.parse(ticket.updatedAt)
      return Number.isFinite(updated) && nowMs - updated >= stallAfterMs
    }).map(ticket => ticket.id)
    const failingEffectKeys = this.failingEffects(projectId)
    const personas = this.product.listPersonas(projectId)
    const openTickets = tickets.filter(ticket => ticket.ended === undefined)
    const vigia = vigiaTick({
      now: Number.isFinite(nowMs) ? nowMs : 0,
      openGoal: openTickets.length > 0,
      stalledTicketIds,
      failingEffectKeys,
      unavailableEvalIds: [],
      personas: personas.map((persona) => {
        const mine = tickets.filter(ticket => ownsTicket(ticket, persona))
        const running = mine.some(ticket => latestAssignment(ticket)?.state === 'running')
        const last = mine.reduce((max, ticket) => ticket.updatedAt > max ? ticket.updatedAt : max, persona.updatedAt)
        return {
          personaId: persona.id,
          idle: !running,
          queueLength: mine.filter(ticket => ticket.ended === undefined).length,
          lastProgressAt: Date.parse(last) || 0,
          sameReportCount: 0,
        }
      }),
    })
    const warnings = watchdogWarnings(vigia.signals)
    for (const warning of warnings) {
      this.repos.recordAudit({
        projectId,
        id: warning.id,
        at: now,
        kind: warning.kind,
        subjectId: warning.subjectId,
        detail: warning.detail,
      })
    }
    for (const line of vigia.audit) {
      this.repos.recordAudit({
        projectId,
        id: `${line.kind}:${line.subjectId}:${line.action}`,
        at: now,
        kind: line.kind,
        subjectId: line.subjectId,
        detail: `${line.action}: ${line.detail}`,
      })
    }
    return warnings
  }

  /**
   * The two facts Muse's state words need, per persona, from the truths the host already obeys. Present only when true (absent = awake):
   * `paused` — she was paused on purpose; `quiet` — the team's Janela de silêncio is on, the whole team is paused, or her own silence window is on.
   * @param projectId - Tenant.
   * @param personaId - Persona.
   */
  restFacts(projectId: string, personaId: string): { readonly quiet?: true; readonly paused?: true } {
    const at = this.now()
    const autonomy = this.repos.getAutonomy(projectId, personaId)
    const quiet = this.teamPaused?.(projectId) === true
      || this.houseRules?.quietNow(projectId, at) !== undefined
      || inSilence(at, autonomy.silenceStart, autonomy.silenceEnd, this.offsetMinutes(at))
    return {
      ...(quiet ? { quiet: true as const } : {}),
      ...(this.orchestration.isPersonaPaused(projectId, personaId) ? { paused: true as const } : {}),
    }
  }

  /**
   * @param projectId - Tenant.
   */
  overviewNow(projectId: string): OverviewNowView {
    const now = this.now()
    const day = now.slice(0, 10)
    const tickets = this.orchestration.runtime(projectId).repo.tickets.list()
    const warnings = this.repos.auditsSince(projectId, EPOCH)
    const stalled = new Set(warnings.filter(item => item.kind === 'ticket_stalled').map(item => item.subjectId))
    const fires = this.repos.firesSince(projectId, `${day}T00:00:00.000Z`)
    const personas = this.product.listPersonas(projectId)
    return {
      personas: personas.map(persona => this.personaNow(projectId, persona, tickets, stalled, fires, now)),
    }
  }

  /**
   * "Enquanto você estava fora" (P1-7): what the team did since the person was last here, and what waits for them now, all
   * from the host's real records and linked to the real Task. Reading does NOT consume it: the window opens once per session
   * (at the first read) and stays the same until {@link dismissWhileAway}, so a client that refreshes every few seconds keeps
   * the summary on screen. The presence marker is refreshed on reads (throttled), so after a restart "last here" is the last
   * time the person was actually looking.
   * @param projectId - Tenant.
   */
  whileAway(projectId: string): WhileAwayView {
    const { since, openedAt } = this.openWindow(projectId)
    const personas = this.product.listPersonas(projectId)
    const tickets = this.orchestration.runtime(projectId).repo.tickets.list()
    const ticketById = new Map(tickets.map(ticket => [ticket.id, ticket]))
    const ownerOf = (ticket: Ticket): StoredPersona | undefined => personas.find(persona => ownsTicket(ticket, persona))
    const byPersona = (persona: StoredPersona | undefined): { personaId?: string; personaName?: string } =>
      persona === undefined ? {} : { personaId: persona.id, personaName: persona.name }

    const events: AwayEventView[] = []
    for (const fire of this.repos.firesSince(projectId, since)) {
      const ticket = fire.ticketId === undefined ? undefined : ticketById.get(fire.ticketId)
      events.push({
        id: fire.id,
        at: fire.at,
        body: fire.title,
        taskId: fire.ticketId ?? '',
        taskTitle: ticket?.title ?? fire.title,
        kind: 'proposal',
        ...byPersona(personas.find(persona => persona.id === fire.personaId)),
      })
    }
    for (const audit of this.repos.auditsSince(projectId, since)) {
      const ticket = ticketById.get(audit.subjectId)
      events.push({
        id: audit.id,
        at: audit.at,
        body: audit.detail,
        taskId: audit.subjectId,
        // The real title, never the raw id; empty when the subject is not a Task.
        taskTitle: ticket?.title ?? '',
        kind: 'watchdog',
        ...byPersona(ticket === undefined ? undefined : ownerOf(ticket)),
      })
    }
    for (const ticket of tickets) {
      if (!isDelivered(ticket) || ticket.ended === undefined || ticket.ended.at <= since) continue
      events.push({
        id: `delivery:${ticket.id}`,
        at: ticket.ended.at,
        body: ticket.title,
        taskId: ticket.id,
        taskTitle: ticket.title,
        kind: 'delivery',
        ...byPersona(ownerOf(ticket)),
      })
    }
    events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))

    const waiting = this.waitingOnPerson(projectId, tickets, ticketById, ownerOf)
    this.touch(projectId)
    // How long they were away, fixed at the moment they came back (it does not grow while they read). Absent when there is
    // no absence to speak of: the very first visit (no earlier one), or a window the person restarted by dismissing.
    const awayMs = since === EPOCH ? 0 : Date.parse(openedAt) - Date.parse(since)
    const awayMinutes = Number.isFinite(awayMs) && awayMs >= 60_000 ? Math.floor(awayMs / 60_000) : undefined
    return {
      since,
      events,
      waiting,
      byPersona: awayByPersona(personas, events, waiting),
      summary: {
        deliveries: events.filter(event => event.kind === 'delivery').length,
        waitingOnYou: waiting.length,
        ...(awayMinutes === undefined ? {} : { awayMinutes }),
      },
    }
  }

  /**
   * Record that the human opened the project: opens this session's window if it is not open yet (so the summary the first
   * read shows is not lost) and refreshes the presence marker. It never resets an open window.
   * @param projectId - Tenant.
   */
  markVisit(projectId: string): void {
    this.openWindow(projectId)
    this.touch(projectId)
  }

  /**
   * The person saw the summary: the window restarts now. Events after this moment form the next one.
   * @param projectId - Tenant.
   */
  dismissWhileAway(projectId: string): void {
    const now = this.now()
    this.repos.setAwayWindow(projectId, now, now)
    this.repos.markVisit(projectId, now)
  }

  /**
   * The window of this sitting. It stays the same while the person keeps looking (a refresh marks presence, so the gap
   * stays small) and across a quick restart; a longer gap since they were last looking is an absence, and the window then
   * starts at that moment. It is stored, so it does not depend on the process.
   */
  private openWindow(projectId: string): { readonly since: string; readonly openedAt: string } {
    const now = this.now()
    const seen = this.repos.lastVisit(projectId)
    const current = this.repos.awayWindow(projectId)
    if (current !== undefined && seen !== undefined && Date.parse(now) - Date.parse(seen) < AWAY_GAP_MS) return current
    const since = seen ?? EPOCH
    this.repos.setAwayWindow(projectId, since, now)
    return { since, openedAt: now }
  }

  private touch(projectId: string): void {
    const now = this.now()
    const last = this.repos.lastVisit(projectId)
    if (last !== undefined && Date.parse(now) - Date.parse(last) < PRESENCE_WRITE_MS) return
    this.repos.markVisit(projectId, now)
  }

  /**
   * What waits for the person right now: the Aprovações list the screen shows (proposals and Task questions) plus the results
   * waiting in Revisar (only where a draft can exist: a project with a folder). A Task with a question is listed once.
   */
  private waitingOnPerson(
    projectId: string,
    tickets: readonly Ticket[],
    ticketById: ReadonlyMap<string, Ticket>,
    ownerOf: (ticket: Ticket) => StoredPersona | undefined,
  ): AwayWaitingView[] {
    const waiting: AwayWaitingView[] = []
    const asking = new Set<string>()
    for (const card of this.approvalsOf?.(projectId) ?? []) {
      if (card.status !== 'pending') continue
      if (card.kind === 'attention') {
        asking.add(card.id)
        const ticket = ticketById.get(card.id)
        waiting.push({
          id: `question:${card.id}`, kind: 'question', title: ticket?.title ?? card.title, taskId: card.id,
          // The same card the Aprovações screen lists (its id is the Task's), so the link needs no translation.
          approvalId: card.id, approvalKind: 'attention',
          personaId: card.personaId, personaName: card.personaName,
          ...(ticket === undefined ? {} : { at: ticket.updatedAt }),
        })
        continue
      }
      waiting.push({
        id: `approval:${card.kind}:${card.id}`, kind: 'approval', title: card.title, taskId: '', approvalId: card.id,
        approvalKind: card.kind, personaId: card.personaId, personaName: card.personaName,
      })
    }
    const root = this.product.getProject(projectId)?.rootPath
    if (root !== undefined && root !== '') {
      for (const ticket of tickets) {
        if (asking.has(ticket.id) || !hasPendingDelivery(ticket)) continue
        const owner = ownerOf(ticket)
        waiting.push({
          id: `review:${ticket.id}`, kind: 'review', title: ticket.title, taskId: ticket.id,
          personaId: owner?.id ?? '', personaName: owner?.name ?? ticket.execution?.name ?? '',
          at: latestAssignment(ticket)?.report?.at ?? ticket.updatedAt,
        })
      }
    }
    // Newest first; what has no recorded time (an approval) goes last, in a stable order.
    return waiting.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || a.id.localeCompare(b.id))
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - Persona.
   */
  getAutonomy(projectId: string, personaId: string): AutonomyRow {
    return this.repos.getAutonomy(projectId, personaId)
  }

  /**
   * @param row - Config.
   */
  setAutonomy(row: Omit<AutonomyRow, 'updatedAt'>): AutonomyRow {
    return this.repos.setAutonomy(row)
  }

  private personaNow(
    projectId: string,
    persona: StoredPersona,
    tickets: Ticket[],
    stalled: Set<string>,
    fires: InitiativeFire[],
    now: string,
  ): PersonaNowView {
    const mine = tickets.filter(ticket => ownsTicket(ticket, persona))
    const running = mine.find(ticket => latestAssignment(ticket)?.state === 'running')
    const waiting = mine.find(ticket => waitsForPerson(ticket) || ticket.attention !== undefined)
    const stuck = mine.find(ticket => stalled.has(ticket.id))
    let state: PersonaWorkState = 'resting'
    let current: Ticket | undefined
    if (stuck !== undefined) {
      state = 'stuck'
      current = stuck
    } else if (waiting !== undefined) {
      state = 'waiting'
      current = waiting
    } else if (running !== undefined) {
      state = 'working'
      current = running
    }
    const latestFire = [...fires].reverse().find(item => item.personaId === persona.id)
    const currentTask = current?.title ?? latestFire?.title ?? ''
    const currentTaskId = current?.id ?? latestFire?.ticketId ?? ''
    const lastAt = current?.updatedAt ?? latestFire?.at ?? persona.updatedAt
    const idleMinutes = state === 'resting' ? minutesBetween(lastAt, now) : 0
    const day = now.slice(0, 10)
    const deliveriesToday = mine.filter(ticket => isDelivered(ticket) && ticket.ended?.at.startsWith(day) === true).length
    const proposalsAcceptedToday = fires.filter(item => item.personaId === persona.id && item.ticketId !== undefined).length
    const changed = state === 'working' && current !== undefined ? this.draftFilesOf?.(projectId, current.id) : undefined
    const draftFiles = changed !== undefined && changed > 0 ? changed : undefined
    const sentence = state === 'working' && current !== undefined ? this.stepSentenceOf?.(projectId, current.id) : undefined
    return {
      personaId: persona.id,
      name: persona.name,
      title: persona.title,
      state,
      currentTask,
      currentTaskId,
      queueCount: mine.filter(ticket => ticket.ended === undefined).length,
      idleMinutes,
      deliveriesToday,
      proposalsAcceptedToday,
      ...(draftFiles === undefined ? {} : { draftFiles }),
      ...(sentence === undefined ? {} : { sentence }),
      ...this.restFacts(projectId, persona.id),
    }
  }

  private failingEffects(projectId: string): string[] {
    const rows = this.orchestration.store.db.prepare(
      'SELECT key AS key FROM engine_effect WHERE project_id = ? AND attempts > 0',
    ).all(projectId)
    return rows.map((row) => {
      const key = row.key
      return typeof key === 'string' ? key : ''
    }).filter(key => key.length > 0)
  }
}

/**
 * What each persona did for the person while away, and what of hers waits for them. Only personas with something are listed.
 * @param personas - The team, in its order.
 * @param events - The window's events (each already attributed).
 * @param waiting - What waits for the person now.
 */
function awayByPersona(
  personas: readonly StoredPersona[],
  events: readonly AwayEventView[],
  waiting: readonly AwayWaitingView[],
): AwayPersonaView[] {
  type TaskRef = AwayPersonaView['tasks'][number]
  const rows = new Map<string, { delivered: number; proposed: number; waitingOnYou: number; tasks: Map<string, TaskRef> }>()
  const rowOf = (personaId: string): { delivered: number; proposed: number; waitingOnYou: number; tasks: Map<string, TaskRef> } => {
    const existing = rows.get(personaId)
    if (existing !== undefined) return existing
    const created = { delivered: 0, proposed: 0, waitingOnYou: 0, tasks: new Map<string, TaskRef>() }
    rows.set(personaId, created)
    return created
  }
  // What a persona DID for the person: deliveries and proposals. The Vigia's notes are the system's, not hers.
  for (const event of events) {
    if (event.personaId === undefined || event.personaId === '' || event.kind === 'watchdog') continue
    const row = rowOf(event.personaId)
    if (event.kind === 'delivery') row.delivered += 1
    else row.proposed += 1
    if (event.taskId !== '') row.tasks.set(`${event.kind}:${event.taskId}`, { taskId: event.taskId, taskTitle: event.taskTitle, kind: event.kind, at: event.at })
  }
  for (const item of waiting) {
    if (item.personaId === '') continue
    const row = rowOf(item.personaId)
    row.waitingOnYou += 1
    if (item.taskId !== '') {
      row.tasks.set(`${item.kind}:${item.taskId}`, { taskId: item.taskId, taskTitle: item.title, kind: item.kind, ...(item.at === undefined ? {} : { at: item.at }) })
    }
  }
  return personas.flatMap((persona) => {
    const row = rows.get(persona.id)
    if (row === undefined) return []
    const tasks = [...row.tasks.values()]
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || a.taskId.localeCompare(b.taskId))
      .slice(0, AWAY_TASKS_PER_PERSONA)
    return [{ personaId: persona.id, name: persona.name, delivered: row.delivered, proposed: row.proposed, waitingOnYou: row.waitingOnYou, tasks }]
  })
}

/**
 * @param ticket - Ticket.
 * @param persona - Candidate owner.
 */
function ownsTicket(ticket: Ticket, persona: StoredPersona): boolean {
  if (ticket.execution?.name === persona.name) return true
  if (ticket.execution !== undefined) return false
  return persona.systemRoles.includes('coordination')
}

/**
 * The person's wall clock: an instant shifted by the machine's offset (minutes east of UTC), still written as an ISO string (its `HH:MM` and date are the
 * LOCAL ones). A silence window "22:00–08:00" is read on that clock, never on UTC (S1 P1-12: in Brasília it was active at 19:00 and over at 05:00).
 * @param iso - Instant.
 * @param offsetMinutes - The machine's offset at that instant; 0 (UTC, and every older caller) leaves it as it is.
 */
function wallClockOf(iso: string, offsetMinutes: number): string {
  if (offsetMinutes === 0) return iso
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? new Date(ms + offsetMinutes * 60_000).toISOString() : iso
}

/**
 * @param iso - Instant.
 * @param start - `HH:MM` (the person's clock) or undefined.
 * @param end - `HH:MM` (the person's clock) or undefined.
 * @param offsetMinutes - The machine's offset from UTC in minutes (`PersonaHost.timezoneOffsetMinutes`); default 0 = UTC.
 */
export function inSilence(iso: string, start: string | undefined, end: string | undefined, offsetMinutes = 0): boolean {
  if (start === undefined || end === undefined || start === '' || end === '') return false
  const hm = wallClockOf(iso, offsetMinutes).slice(11, 16)
  if (start <= end) return hm >= start && hm < end
  return hm >= start || hm < end
}

/**
 * Epoch-ms end of the current quiet window (a real instant), or 0 when the instant is not silent.
 * @param iso - Instant.
 * @param start - `HH:MM` (the person's clock) or undefined.
 * @param end - `HH:MM` (the person's clock) or undefined.
 * @param offsetMinutes - The machine's offset from UTC in minutes; default 0 = UTC.
 */
export function silenceUntilOf(iso: string, start: string | undefined, end: string | undefined, offsetMinutes = 0): number {
  if (!inSilence(iso, start, end, offsetMinutes)) return 0
  const wall = wallClockOf(iso, offsetMinutes)
  const date = wall.slice(0, 10)
  const hm = wall.slice(11, 16)
  const endMs = Date.parse(`${date}T${end}:00.000Z`) // the end on the person's wall, written as if it were UTC
  if (!Number.isFinite(endMs)) return 0
  const wallEnd = start !== undefined && end !== undefined && start > end && hm >= start ? endMs + 86_400_000 : endMs
  return wallEnd - offsetMinutes * 60_000
}

/**
 * @param from - Earlier iso.
 * @param to - Later iso.
 */
function minutesBetween(from: string, to: string): number {
  const delta = Date.parse(to) - Date.parse(from)
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return Math.floor(delta / 60_000)
}

/**
 * First weekly start hour, or 09:00 in the persona timezone.
 * @param persona - Stored persona.
 */
function initiativeHour(persona: StoredPersona): number {
  const start = persona.schedule?.weeklyHours?.[0]?.start
  if (start === undefined) return 9
  const hour = Number(start.slice(0, 2))
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9
}

const STALE_MS = 2 * 86_400_000

/**
 * Score a candidate against live tickets. Undefined = empty, duplicate, or no budget.
 * @param orchestration - Ticket repo.
 * @param projectId - Tenant.
 * @param personaId - Speaker.
 * @param source - Routine or event.
 * @param title - Host hint.
 * @param at - ISO now.
 * @param proposedToday - Count today.
 * @param proposalsPerDay - Cap.
 */
function scoreInitiativeProposal(
  orchestration: Orchestration,
  projectId: string,
  personaId: string,
  source: 'routine' | 'event',
  title: string,
  at: string,
  proposedToday: number,
  proposalsPerDay: number,
): string | undefined {
  void personaId
  const now = Date.parse(at)
  const tickets = orchestration.runtime(projectId).repo.tickets.list()
  const facts: ProjectFact[] = []
  const existing: ExistingWorkItem[] = []
  for (const ticket of tickets) {
    // Carbon P1-DM-2: a Task born in a private DM is never the subject of an initiative of the team: its title and the question asked there are the DM's.
    if (orchestration.conversationOfTicket(projectId, ticket.id)?.streamKind === 'dm') continue
    // A fact ABOUT a Ticket (waiting on a question, no progress) is the reason to act on it, so that Ticket must not count as
    // "work that already exists": it would be dropped as a duplicate of itself and the initiative would stay silent exactly
    // when something is stuck. An external event is compared against every Ticket.
    if (source === 'event' || ticket.ended !== undefined) {
      existing.push({ kind: 'ticket', title: ticket.title })
      continue
    }
    if (ticket.attention !== undefined) {
      facts.push({ kind: 'blocked', title: ticket.title, detail: ticket.attention.question, ticketId: ticket.id })
      continue
    }
    const updated = Date.parse(ticket.updatedAt)
    if (Number.isFinite(now) && Number.isFinite(updated) && now - updated > STALE_MS) {
      facts.push({ kind: 'stale_ticket', title: ticket.title, detail: 'Sem progresso recente.', ticketId: ticket.id })
    } else {
      existing.push({ kind: 'ticket', title: ticket.title })
    }
  }
  if (source === 'event') {
    // The event (PR, recurring error, deadline) IS the fact: the state of some Ticket never replaces it.
    facts.push({ kind: 'deadline', title, detail: title })
  } else if (facts.length === 0) {
    facts.push({ kind: 'gap', title, detail: title })
  }
  const budget: AttentionBudget = {
    proposalsPerDay,
    proposedToday,
    silenceUntil: 0,
    tokensLeft: 1,
    runsLeft: 1,
    acceptanceRate: 0.5,
  }
  const scored = scoreInitiative({
    facts,
    existing,
    budget,
    now: Number.isFinite(now) ? now : 0,
  })
  return scored.proposals[0]?.title
}
