/**
 * Deterministic 7-day always-on team soak (fake clock). Memory here;
 * Anvil runs the same suite against SQLite via {@link runSoak}.
 */

import { spend, recordProposalOutcome, mayPropose, nextProposalIntervalHours, type AttentionBudget } from '../budget.ts'
import { Engine, type EngineOptions } from '../core/engine.ts'
import { MemoryRepositories } from '../core/memory.ts'
import type { Trigger } from '../core/model.ts'
import type { Assessor, Candidate, Executor, Policy, Repositories } from '../core/ports.ts'
import { FakeClock } from '../executor/fake.ts'
import { shouldRunDailyInZone, type Shift } from '../initiative.ts'
import { MemoryOutbox } from '../outbox.ts'
import type { OutboxPass } from '../outbox.ts'
import type { OutboundMessage, ReplyStatus } from '../core/ports.ts'
import { afterAssignmentSettled, type EligibleTicket } from '../pull.ts'
import { applyRetention, MemoryRetention, type RetentionPolicy, type RetentionStore } from '../retention.ts'
import { vigiaTick, type VigiaPersonaState } from '../watchdog.ts'

export const SOAK_SEED = 0x50A7
export const SOAK_DAYS = 7
export const SOAK_PROJECTS = ['alpha', 'beta', 'gamma'] as const
export const SOAK_PERSONAS = ['luna', 'sol', 'nara', 'vigo', 'cora'] as const
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

const WEEKDAY_SHIFTS: readonly Shift[] = [1, 2, 3, 4, 5].map(day => ({ day, start: '09:00', end: '18:00' }))
const RESTART_HOURS = [12, 24, 36, 48, 60, 72, 84, 96, 120, 144] as const
const RUNNER_FAIL_HOURS = [20, 50, 90] as const
const START_MS = Date.parse('2026-03-26T03:00:00.000Z')

const SOAK_RETENTION: RetentionPolicy = {
  windows: [
    { kind: 'trigger', archiveAfterMs: 2 * DAY_MS },
    { kind: 'outbox', archiveAfterMs: DAY_MS, deleteAfterMs: 3 * DAY_MS },
    { kind: 'effect', archiveAfterMs: DAY_MS, deleteAfterMs: 2 * DAY_MS },
    { kind: 'usage', archiveAfterMs: DAY_MS, deleteAfterMs: 2 * DAY_MS },
  ],
}

export interface SoakSize {
  tickets: number
  triggers: number
  outbox: number
  events: number
  liveRetention: number
  bytes: number
}

export interface SoakOutbox {
  send(message: OutboundMessage): void
  status(id: string): ReplyStatus | undefined
  withdraw(id: string): void
  pending(): OutboundMessage[]
  history(): readonly OutboxPass[]
}

export interface SoakPersistence {
  projectId: string
  repo: Repositories
  retention: RetentionStore
  outbox: SoakOutbox
}

export interface SoakOpen {
  /**
   * @param projectId - One of {@link SOAK_PROJECTS}.
   * @param clock - Shared fake clock.
   */
  (projectId: string, clock: FakeClock): SoakPersistence
}

export interface SoakReport {
  days: number
  projects: number
  personas: number
  hostRestarts: number
  clockJumps: string[]
  ticketsCreated: number
  ticketsLost: number
  ticketsDuplicated: number
  triggersProcessed: number
  triggersDuplicated: number
  budgetExceeded: number
  proposalIntervalStart: number
  proposalIntervalEnd: number
  eventsPerDay: number
  tokensPerDay: number
  sizeStart: SoakSize
  sizeEnd: SoakSize
  sizePeakLive: number
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @param clock - Shared clock.
 */
export function openMemorySoak(projectId: string, clock: FakeClock): SoakPersistence {
  return {
    projectId,
    repo: new MemoryRepositories(projectId),
    retention: new MemoryRetention(),
    outbox: new MemoryOutbox(() => clock.iso()),
  }
}

function triggerOf(id: string, projectId: string, at: string, text: string): Trigger {
  return {
    id,
    source: 'chat',
    threads: [{ source: 'chat', id: `${projectId}:geral` }],
    actor: { source: 'chat', id: 'ana' },
    human: true,
    at,
    text,
    channel: { source: 'chat', thread: `${projectId}:geral`, address: { message: id } },
    meta: {},
  }
}

function sizeOf(parts: SoakPersistence, events: number): SoakSize {
  const tickets = parts.repo.tickets.list().length
  const triggers = parts.repo.threads.list().length + parts.repo.tickets.list().reduce((n, ticket) => n + ticket.inputs.length, 0)
  const outbox = parts.outbox.pending().length + parts.outbox.history().length
  const liveRetention = parts.retention.list().filter(row => row.archivedAt === undefined).length
  const bytes = JSON.stringify({
    tickets: parts.repo.tickets.list().map(row => row.id),
    outbox: parts.outbox.history().map(row => row.id),
    retention: parts.retention.list().map(row => row.id),
  }).length
  return { tickets, triggers, outbox, events, liveRetention, bytes }
}

interface WorldProject {
  parts: SoakPersistence
  engine: Engine
  requests: Candidate[]
  lastDaily: Map<string, number>
  budgets: Map<string, AttentionBudget>
  lastProposeAt: Map<string, number>
  processed: Set<string>
  backlog: EligibleTicket[]
  completed: Set<string>
}

function bindEngine(parts: SoakPersistence, clock: FakeClock, requests: Candidate[]): Engine {
  const assessor: Assessor = { request: (candidate) => { requests.push(candidate) }, release: () => {} }
  const policy: Policy = {
    version: 'v1',
    paused: false,
    evalTimeoutMs: 60_000,
    gate: t => t.human ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } } : { admissible: false, reason: 'not human' },
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
  const queued: EngineOptions['outbox'] = {
    send: (message) => { parts.outbox.send(message) },
    status: id => parts.outbox.status(id),
    withdraw: (id) => { parts.outbox.withdraw(id) },
  }
  return new Engine({
    repo: parts.repo,
    assessor,
    executor,
    outbox: queued,
    policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => clock.iso(),
  })
}

function freshBudget(): AttentionBudget {
  return {
    proposalsPerDay: 2,
    proposedToday: 0,
    silenceUntil: 0,
    tokensLeft: 50_000,
    runsLeft: 20,
    acceptanceRate: 0.8,
  }
}

/**
 * 7 days × 3 projects × 5 personas. Host restarts reuse the same persistence.
 * @param open - Memory or Anvil SQLite factory.
 * @param seed - mulberry32 seed.
 */
export function runSoak(open: SoakOpen = openMemorySoak, seed: number = SOAK_SEED): SoakReport {
  const clock = new FakeClock(START_MS)
  const rand = mulberry32(seed)
  let zone = 'America/Sao_Paulo'
  const clockJumps: string[] = []
  let hostRestarts = 0
  let tokensProxy = 0
  let events = 0
  let budgetExceeded = 0
  let triggersProcessed = 0
  let triggersDuplicated = 0
  const ticketIds = new Set<string>()
  let ticketsDuplicated = 0
  const worlds: WorldProject[] = SOAK_PROJECTS.map((projectId) => {
    const parts = open(projectId, clock)
    const requests: Candidate[] = []
    return {
      parts,
      requests,
      engine: bindEngine(parts, clock, requests),
      lastDaily: new Map<string, number>(),
      budgets: new Map(SOAK_PERSONAS.map(id => [id, freshBudget()])),
      lastProposeAt: new Map<string, number>(),
      processed: new Set<string>(),
      backlog: [] as EligibleTicket[],
      completed: new Set<string>(),
    }
  })

  const snapshot = (): SoakSize => worlds.reduce<SoakSize>((acc, world) => {
    const row = sizeOf(world.parts, events)
    return {
      tickets: acc.tickets + row.tickets,
      triggers: acc.triggers + row.triggers,
      outbox: acc.outbox + row.outbox,
      events: acc.events + row.events,
      liveRetention: acc.liveRetention + row.liveRetention,
      bytes: acc.bytes + row.bytes,
    }
  }, { tickets: 0, triggers: 0, outbox: 0, events: 0, liveRetention: 0, bytes: 0 })

  const sizeStart = snapshot()
  let sizePeakLive = sizeStart.liveRetention
  const intervalStart = nextProposalIntervalHours(4, 0.8)

  const ingest = (world: WorldProject, trigger: Trigger, accept: boolean): void => {
    const result = world.engine.receive(trigger)
    if (result === 'duplicate') {
      triggersDuplicated += 1
      return
    }
    if (world.processed.has(trigger.id)) {
      triggersDuplicated += 1
      return
    }
    world.processed.add(trigger.id)
    triggersProcessed += 1
    world.engine.evaluateDue()
    const candidate = world.requests.at(-1)
    if (candidate === undefined) return
    if (!accept) {
      world.engine.decide(candidate.triggers[0]!.id, { kind: 'ignore', reason: 'fora / silêncio' })
      return
    }
    const before = new Set(world.parts.repo.tickets.list().map(row => row.id))
    world.engine.decide(candidate.triggers[0]!.id, {
      kind: 'accept', title: trigger.text.slice(0, 48), scope: 'small', reason: 'rotina',
    })
    for (const ticket of world.parts.repo.tickets.list()) {
      if (before.has(ticket.id)) continue
      if (ticketIds.has(ticket.id)) ticketsDuplicated += 1
      ticketIds.add(ticket.id)
      world.backlog.push({
        id: ticket.id,
        personaId: SOAK_PERSONAS[Math.floor(rand() * SOAK_PERSONAS.length)]!,
        priority: 1,
        deps: [],
        tools: ['files'],
        estimatedTokens: 200,
      })
    }
  }

  for (let hour = 0; hour < SOAK_DAYS * 24; hour += 1) {
    if (hour === 10) {
      clock.advance(8 * HOUR_MS)
      clockJumps.push('laptop-sleep-8h')
    }
    if (hour === 48) {
      zone = 'Europe/Lisbon'
      clockJumps.push('user-tz-America/Sao_Paulo→Europe/Lisbon')
    }
    if (clock.now() >= Date.parse('2026-03-29T00:30:00.000Z') && clock.now() < Date.parse('2026-03-29T02:30:00.000Z')
      && !clockJumps.includes('dst-Europe/Lisbon-spring')) {
      clockJumps.push('dst-Europe/Lisbon-spring')
    }
    if (hour === 5 && !clockJumps.includes('zone-America/Sao_Paulo')) {
      clockJumps.push('zone-America/Sao_Paulo')
    }
    if (hour === 100 && !clockJumps.includes('dst-Europe/Lisbon-fall')) {
      clockJumps.push('dst-Europe/Lisbon-fall')
    }
    if (RESTART_HOURS.includes(hour as typeof RESTART_HOURS[number])) {
      for (const world of worlds) world.engine = bindEngine(world.parts, clock, world.requests)
      hostRestarts += 1
    }

    for (const world of worlds) {
      const runnerFailed = RUNNER_FAIL_HOURS.includes(hour as typeof RUNNER_FAIL_HOURS[number])
      for (const personaId of SOAK_PERSONAS) {
        let budget = world.budgets.get(personaId)!
        const localHour = new Date(clock.now()).toLocaleString('en-US', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' })
        const hourNum = Number(localHour)
        if (hourNum >= 22 || hourNum < 8) {
          budget = { ...budget, silenceUntil: clock.now() + HOUR_MS }
        }
        if (hourNum === 0) budget = { ...budget, proposedToday: 0 }
        const lastDailyAt = world.lastDaily.get(personaId)
        const dailyClock = lastDailyAt === undefined
          ? { now: clock.now(), silenceUntil: budget.silenceUntil, shifts: WEEKDAY_SHIFTS }
          : { now: clock.now(), lastDailyAt, silenceUntil: budget.silenceUntil, shifts: WEEKDAY_SHIFTS }
        if (shouldRunDailyInZone(dailyClock, zone)) {
          world.lastDaily.set(personaId, clock.now())
          const id = `${world.parts.projectId}:${personaId}:daily:${zonedYmd(clock.now(), zone)}`
          ingest(world, triggerOf(id, world.parts.projectId, clock.iso(), `rotina diária ${personaId}`), budget.runsLeft > 0)
          tokensProxy += 80
          events += 1
        }
        if (hour % 6 === 0 && mayPropose(budget, clock.now())) {
          const interval = nextProposalIntervalHours(4, budget.acceptanceRate) * HOUR_MS
          const last = world.lastProposeAt.get(personaId) ?? 0
          if (clock.now() - last >= interval) {
            world.lastProposeAt.set(personaId, clock.now())
            const accepted = budget.acceptanceRate > 0.35 && rand() > 0.55
            budget = recordProposalOutcome(budget, accepted)
            tokensProxy += 40
            events += 1
          }
        }
        if (budget.tokensLeft < 0 || budget.runsLeft < 0 || budget.proposedToday > budget.proposalsPerDay) {
          budgetExceeded += 1
        }
        budget = spend(budget, 12, 0)
        if (budget.tokensLeft < 0 || budget.runsLeft < 0) budgetExceeded += 1
        world.budgets.set(personaId, budget)
      }

      const personas: VigiaPersonaState[] = SOAK_PERSONAS.map(personaId => ({
        personaId,
        idle: true,
        queueLength: world.backlog.filter(row => row.personaId === personaId).length,
        lastProgressAt: clock.now() - (runnerFailed ? 40 * 60_000 : 60_000),
        sameReportCount: 0,
        ...(runnerFailed ? { runnerFailed: true } : {}),
      }))
      vigiaTick({
        now: clock.now(),
        openGoal: true,
        personas,
        stalledTicketIds: [],
        failingEffectKeys: [],
        unavailableEvalIds: [],
      })
      events += 1
      tokensProxy += 20

      for (const personaId of SOAK_PERSONAS) {
        const budget = world.budgets.get(personaId)!
        const next = afterAssignmentSettled('ready', undefined, world.backlog, {
          now: clock.now(),
          personaId,
          running: 0,
          maxConcurrent: 1,
          remainingTokens: budget.tokensLeft,
          remainingRuns: budget.runsLeft,
          allowedTools: ['files'],
          canAssign: () => true,
          completedIds: world.completed,
        })
        if (next.next !== undefined) {
          world.backlog = world.backlog.filter(row => row.id !== next.next!.id)
          world.completed.add(next.next.id)
          const ticket = world.parts.repo.tickets.get(next.next.id)
          if (ticket !== undefined && ticket.assignments[0] !== undefined) {
            world.engine.assignmentStarted(ticket.id, ticket.assignments[0].id)
            world.engine.report(ticket.id, { state: 'ready', summary: 'ok' })
          }
          world.budgets.set(personaId, spend(budget, 200, 1))
          events += 1
        }
      }

      if (hour % 3 === 1) {
        const pr = triggerOf(`${world.parts.projectId}:pr:${String(hour)}`, world.parts.projectId, clock.iso(), 'PR aberto')
        ingest(world, pr, true)
        events += 1
      }
      if (hour % 3 === 1) {
        ingest(world, triggerOf(`${world.parts.projectId}:pr:${String(hour)}`, world.parts.projectId, clock.iso(), 'PR aberto'), true)
      }

      const seq = `${world.parts.projectId}:h${String(hour)}`
      world.parts.retention.save({
        id: seq,
        kind: 'usage',
        createdAt: clock.now(),
        derivativeIds: [],
        indexKeys: [`idx:${seq}`],
      })
      world.parts.retention.save({
        id: `ob:${seq}`,
        kind: 'outbox',
        createdAt: clock.now(),
        derivativeIds: [],
        indexKeys: [`idx:ob:${seq}`],
      })
      applyRetention(world.parts.retention, SOAK_RETENTION, clock.now())
    }

    const live = snapshot().liveRetention
    if (live > sizePeakLive) sizePeakLive = live
    clock.advance(HOUR_MS)
  }

  const sizeEnd = snapshot()
  const ticketsNow = worlds.reduce((n, world) => n + world.parts.repo.tickets.list().length, 0)
  const uniqueListed = new Set(worlds.flatMap(world => world.parts.repo.tickets.list().map(row => row.id)))
  const intervalEnd = nextProposalIntervalHours(4, medianRate(worlds))

  return {
    days: SOAK_DAYS,
    projects: SOAK_PROJECTS.length,
    personas: SOAK_PERSONAS.length,
    hostRestarts,
    clockJumps,
    ticketsCreated: ticketIds.size,
    ticketsLost: Math.max(0, ticketIds.size - ticketsNow),
    ticketsDuplicated: ticketsDuplicated + Math.max(0, ticketsNow - uniqueListed.size),
    triggersProcessed,
    triggersDuplicated,
    budgetExceeded,
    proposalIntervalStart: intervalStart,
    proposalIntervalEnd: intervalEnd,
    eventsPerDay: events / SOAK_DAYS,
    tokensPerDay: tokensProxy / SOAK_DAYS,
    sizeStart,
    sizeEnd,
    sizePeakLive,
  }
}

function medianRate(worlds: WorldProject[]): number {
  const rates = worlds.flatMap(world => [...world.budgets.values()].map(row => row.acceptanceRate)).sort((a, b) => a - b)
  return rates[Math.floor(rates.length / 2)] ?? 0
}

function zonedYmd(at: number, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(new Date(at))
}

/**
 * @param report - Soak totals.
 */
export function formatSoakReport(report: SoakReport): string {
  return [
    '# Soak 7 dias (relógio falso)',
    '',
    `${String(report.days)} dias × ${String(report.projects)} projetos × ${String(report.personas)} personas. Semente ${SOAK_SEED.toString(16)}.`,
    `Reinícios do host: ${String(report.hostRestarts)}. Saltos: ${report.clockJumps.join(', ') || 'nenhum'}.`,
    '',
    '| métrica | valor |',
    '|---|---:|',
    `| Tarefas criadas | ${String(report.ticketsCreated)} |`,
    `| Tarefas perdidas | ${String(report.ticketsLost)} |`,
    `| Tarefas duplicadas | ${String(report.ticketsDuplicated)} |`,
    `| Triggers processados | ${String(report.triggersProcessed)} |`,
    `| Triggers repetidos (recusados) | ${String(report.triggersDuplicated)} |`,
    `| Orçamento ultrapassado | ${String(report.budgetExceeded)} |`,
    `| Intervalo proposta início (h) | ${report.proposalIntervalStart.toFixed(2)} |`,
    `| Intervalo proposta fim (h) | ${report.proposalIntervalEnd.toFixed(2)} |`,
    `| Eventos/dia | ${report.eventsPerDay.toFixed(1)} |`,
    `| Tokens/dia (proxy) | ${report.tokensPerDay.toFixed(0)} |`,
    `| Bytes início | ${String(report.sizeStart.bytes)} |`,
    `| Bytes fim | ${String(report.sizeEnd.bytes)} |`,
    `| Retenção viva pico | ${String(report.sizePeakLive)} |`,
    `| Retenção viva fim | ${String(report.sizeEnd.liveRetention)} |`,
    `| Outbox fim | ${String(report.sizeEnd.outbox)} |`,
    '',
  ].join('\n')
}
