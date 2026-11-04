/**
 * Initiative routines, event sources, autonomy/budget, Visão geral "agora"
 * and "Enquanto você estava fora", Vigia on the host scheduler.
 */

import {
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
import type { Orchestration } from './orchestration.ts'
import type { ProductRepos } from '@deepseek-ai/dsh-persona-store'

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
}

/** Visão geral — agora. */
export interface OverviewNowView {
  readonly personas: readonly PersonaNowView[]
}

/** One line of "Enquanto você estava fora". */
export interface AwayEventView {
  readonly id: string
  readonly at: string
  readonly body: string
  readonly taskId: string
  readonly taskTitle: string
  readonly kind: 'delivery' | 'proposal' | 'watchdog'
}

/** Peak-end summary since the last visit. */
export interface WhileAwayView {
  readonly since: string
  readonly events: readonly AwayEventView[]
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
    if (this.routines.get(id) !== undefined) return
    const timeZone = persona.schedule?.timeZone ?? 'UTC'
    const hour = initiativeHour(persona)
    this.routines.create({
      id,
      workspaceId: persona.workspaceId,
      projectId: persona.projectId,
      name: id,
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
    if (inSilence(at, autonomy.silenceStart, autonomy.silenceEnd)) return false
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
      personas: personas.map(persona => this.personaNow(persona, tickets, stalled, fires, now)),
    }
  }

  /**
   * Events since the last visit; then records this visit.
   * @param projectId - Tenant.
   */
  whileAway(projectId: string): WhileAwayView {
    const since = this.repos.lastVisit(projectId) ?? EPOCH
    const tickets = this.orchestration.runtime(projectId).repo.tickets.list()
    const events: AwayEventView[] = []
    for (const fire of this.repos.firesSince(projectId, since)) {
      events.push({
        id: fire.id,
        at: fire.at,
        body: fire.title,
        taskId: fire.ticketId ?? '',
        taskTitle: fire.title,
        kind: 'proposal',
      })
    }
    for (const audit of this.repos.auditsSince(projectId, since)) {
      events.push({
        id: audit.id,
        at: audit.at,
        body: audit.detail,
        taskId: audit.subjectId,
        taskTitle: audit.subjectId,
        kind: 'watchdog',
      })
    }
    for (const ticket of tickets) {
      if (ticket.ended === undefined || ticket.ended.at <= since) continue
      events.push({
        id: `delivery:${ticket.id}`,
        at: ticket.ended.at,
        body: ticket.title,
        taskId: ticket.id,
        taskTitle: ticket.title,
        kind: 'delivery',
      })
    }
    events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    this.repos.markVisit(projectId, this.now())
    return { since, events }
  }

  /**
   * @param projectId - Tenant.
   */
  markVisit(projectId: string): void {
    this.repos.markVisit(projectId, this.now())
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
    const deliveriesToday = mine.filter(ticket => ticket.ended?.at.startsWith(day)).length
    const proposalsAcceptedToday = fires.filter(item => item.personaId === persona.id && item.ticketId !== undefined).length
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
 * @param ticket - Ticket.
 * @param persona - Candidate owner.
 */
function ownsTicket(ticket: Ticket, persona: StoredPersona): boolean {
  if (ticket.execution?.name === persona.name) return true
  if (ticket.execution !== undefined) return false
  return persona.systemRoles.includes('coordination')
}

/**
 * @param iso - Instant.
 * @param start - `HH:MM` or undefined.
 * @param end - `HH:MM` or undefined.
 */
export function inSilence(iso: string, start: string | undefined, end: string | undefined): boolean {
  if (start === undefined || end === undefined || start === '' || end === '') return false
  const hm = iso.slice(11, 16)
  if (start <= end) return hm >= start && hm < end
  return hm >= start || hm < end
}

/**
 * Epoch-ms end of the current quiet window, or 0 when the instant is not silent.
 * @param iso - Instant.
 * @param start - `HH:MM` or undefined.
 * @param end - `HH:MM` or undefined.
 */
export function silenceUntilOf(iso: string, start: string | undefined, end: string | undefined): number {
  if (!inSilence(iso, start, end)) return 0
  const date = iso.slice(0, 10)
  const hm = iso.slice(11, 16)
  const endMs = Date.parse(`${date}T${end}:00.000Z`)
  if (!Number.isFinite(endMs)) return 0
  if (start !== undefined && end !== undefined && start > end && hm >= start) return endMs + 86_400_000
  return endMs
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
    existing.push({ kind: 'ticket', title: ticket.title })
    if (ticket.ended !== undefined) continue
    if (ticket.attention !== undefined) {
      facts.push({ kind: 'blocked', title: ticket.title, detail: ticket.attention.question })
      continue
    }
    const updated = Date.parse(ticket.updatedAt)
    if (Number.isFinite(now) && Number.isFinite(updated) && now - updated > STALE_MS) {
      facts.push({ kind: 'stale_ticket', title: ticket.title, detail: 'Sem progresso recente.' })
    }
  }
  if (facts.length === 0) {
    facts.push({
      kind: source === 'event' ? 'deadline' : 'gap',
      title,
      detail: title,
    })
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
