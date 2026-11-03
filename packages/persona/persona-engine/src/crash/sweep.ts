/**
 * Crash after N writes on each pipeline step, then resume. Memory here;
 * Anvil runs {@link defineCrashSuite} against SQLite.
 */

import { Engine, type EngineOptions } from '../core/engine.ts'
import { MemoryRepositories } from '../core/memory.ts'
import type { Trigger } from '../core/model.ts'
import type { Assessor, Candidate, Executor, OutboundMessage, Policy, Repositories } from '../core/ports.ts'
import { MemoryOutbox } from '../outbox.ts'
import { applyRetention, MemoryRetention } from '../retention.ts'
import { overview } from '../views/overview.ts'
import type { ViewHost } from '../views/host.ts'
import { CrashError, FaultyRepositories } from './faulty.ts'

export const CRASH_STEPS = [
  'receive', 'eval', 'decide', 'ticket', 'assignment', 'runner', 'report', 'outbox', 'reply', 'archive',
] as const

export type CrashStep = (typeof CRASH_STEPS)[number]

export interface CrashOpen {
  (): Repositories
}

export interface CrashStepResult {
  step: CrashStep
  writes: number
  smallestFailingN?: number
}

export interface CrashReport {
  steps: CrashStepResult[]
  smallestFailingN?: number
  failingStep?: CrashStep
}

const member = { source: 'chat', id: 'alice' }

function trigger(id: string, text = `message ${id}`): Trigger {
  return {
    id,
    source: 'chat',
    threads: [{ source: 'chat', id: 't1' }],
    actor: member,
    human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`,
    text,
    channel: { source: 'chat', thread: 't1', address: { message: id } },
    meta: {},
  }
}

interface World {
  fault: FaultyRepositories
  engine: Engine
  requests: Candidate[]
  outbox: MemoryOutbox
  messages: OutboundMessage[]
  launches: Array<{ ticketId: string; assignmentId: string }>
  retention: MemoryRetention
}

function bind(repo: FaultyRepositories): World {
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (candidate) => { requests.push(candidate) }, release: () => {} }
  const policy: Policy = {
    version: 'v1',
    paused: false,
    evalTimeoutMs: 60_000,
    gate: t => t.human
      ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } }
      : { admissible: false, reason: 'not human' },
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const launches: World['launches'] = []
  const executor: Executor = {
    start: (ticket, assignment) => { launches.push({ ticketId: ticket.id, assignmentId: assignment.id }) },
    deliver: () => {},
    stop: () => {},
  }
  const messages: OutboundMessage[] = []
  const outbox = new MemoryOutbox(() => '2026-09-23T00:00:00.000Z')
  const queued: EngineOptions['outbox'] = {
    send: (message) => {
      if (messages.some(item => item.id === message.id)) return
      messages.push(message)
      outbox.send(message)
    },
    status: id => outbox.status(id),
    withdraw: (id) => { outbox.withdraw(id) },
  }
  const engine = new Engine({
    repo,
    assessor,
    executor,
    outbox: queued,
    policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => '2026-09-23T00:00:00.000Z',
  })
  return { fault: repo, engine, requests, outbox, messages, launches, retention: new MemoryRetention() }
}

/**
 * @param open - Fresh repositories (memory or SQLite).
 */
export function openCrashWorld(open: CrashOpen = () => new MemoryRepositories()): World {
  return bind(new FaultyRepositories(open()))
}

function viewHost(world: World): ViewHost {
  return {
    projectId: world.fault.projectId,
    repo: world.fault,
    now: () => '2026-09-23T00:00:00.000Z',
    canReadTicket: () => true,
    canReadThread: () => true,
    load: { running: 0, queued: 0, maxWorkers: 4 },
  }
}

function invariants(world: World): string[] {
  const problems: string[] = []
  const tickets = world.fault.tickets.list()
  const ids = tickets.map(row => row.id)
  if (new Set(ids).size !== ids.length) problems.push('duplicate-ticket')
  const origins = tickets.map(row => row.origin.triggerId)
  if (new Set(origins).size !== origins.length) problems.push('duplicate-origin')
  const outboxIds = world.messages.map(row => row.id)
  if (new Set(outboxIds).size !== outboxIds.length) problems.push('duplicate-reply')
  for (const ticket of tickets) {
    if (ticket.mandate.scope === undefined || ticket.mandate.policyVersion === undefined) problems.push('mandate-broken')
    const live = ticket.ended === undefined
    const reports = ticket.assignments.map(row => row.report?.state).filter(state => state !== undefined)
    if (live && reports.includes('ready') && reports.includes('failed') && ticket.attention === undefined) {
      problems.push('half-applied-report')
    }
  }
  const view = overview(viewHost(world))
  if (view.person.some(row => !ids.includes(row.id))) problems.push('ghost-needs-you')
  return problems
}

function accept(world: World): void {
  const candidate = world.requests.at(-1)
  if (candidate === undefined) return
  world.engine.decide(candidate.triggers[0]!.id, {
    kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested', acknowledgement: 'ok',
  })
}

function startAssignment(world: World): void {
  const launch = world.launches[0]
  if (launch !== undefined) world.engine.assignmentStarted(launch.ticketId, launch.assignmentId)
}

function deliverInputs(world: World): void {
  const ticket = world.fault.tickets.list()[0]
  const assignment = ticket?.assignments[0]
  if (ticket !== undefined && assignment !== undefined && ticket.undelivered.length > 0) {
    world.engine.inputsDelivered(ticket.id, assignment.id, [...ticket.undelivered])
  }
}

function prefix(world: World, step: CrashStep): void {
  world.fault.crashAfter = undefined
  if (step === 'receive') return
  world.engine.receive(trigger('1'))
  if (step === 'eval') return
  world.engine.evaluateDue()
  if (step === 'decide' || step === 'ticket') return
  accept(world)
  if (step === 'assignment') return
  startAssignment(world)
  if (step === 'runner') return
  deliverInputs(world)
  if (step === 'report') return
  const ticket = world.fault.tickets.list()[0]
  if (ticket !== undefined) world.engine.report(ticket.id, { state: 'progress', summary: 'andando' })
}

function runStep(world: World, step: CrashStep): void {
  if (step === 'receive') {
    world.engine.receive(trigger('1'))
    return
  }
  if (step === 'eval') {
    world.engine.evaluateDue()
    return
  }
  if (step === 'decide' || step === 'ticket') {
    accept(world)
    return
  }
  if (step === 'assignment') {
    startAssignment(world)
    return
  }
  if (step === 'runner') {
    deliverInputs(world)
    return
  }
  if (step === 'report') {
    const ticket = world.fault.tickets.list()[0]
    if (ticket !== undefined) world.engine.report(ticket.id, { state: 'progress', summary: 'andando' })
    return
  }
  if (step === 'outbox') {
    const ticket = world.fault.tickets.list()[0]
    if (ticket !== undefined) {
      world.engine.reply({ purpose: 'acknowledgement', ticketId: ticket.id, triggerId: '1', text: 'ok' })
      world.outbox.pass('sent')
    }
    return
  }
  if (step === 'reply') {
    const ticket = world.fault.tickets.list()[0]
    if (ticket !== undefined) {
      world.engine.reply({ purpose: 'acknowledgement', ticketId: ticket.id, triggerId: '1', text: 'visto' })
    }
    return
  }
  const ticket = world.fault.tickets.list()[0]
  if (ticket !== undefined) {
    world.retention.save({
      id: `t:${ticket.id}`,
      kind: 'trigger',
      createdAt: 0,
      derivativeIds: [],
      indexKeys: [`idx:${ticket.id}`],
    })
    applyRetention(world.retention, { windows: [{ kind: 'trigger', archiveAfterMs: 1 }] }, 10)
  }
}

function resume(world: World): void {
  const engine = new Engine({
    repo: world.fault,
    assessor: { request: (candidate) => { world.requests.push(candidate) }, release: () => {} },
    executor: {
      start: (ticket, assignment) => { world.launches.push({ ticketId: ticket.id, assignmentId: assignment.id }) },
      deliver: () => {},
      stop: () => {},
    },
    outbox: {
      send: (message) => {
        if (world.messages.some(item => item.id === message.id)) return
        world.messages.push(message)
        world.outbox.send(message)
      },
      status: id => world.outbox.status(id),
      withdraw: (id) => { world.outbox.withdraw(id) },
    },
    policy: () => ({
      version: 'v1',
      paused: false,
      evalTimeoutMs: 60_000,
      gate: t => t.human
        ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } }
        : { admissible: false, reason: 'not human' },
      revalidate: () => true,
      admitsInferred: () => true,
    }),
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => '2026-09-23T00:00:00.000Z',
  })
  world.engine = engine
  world.engine.evaluateDue()
}

/**
 * Sweep N = 0…cap on each step. Returns the smallest failing N, if any.
 * @param open - Fresh repo factory.
 * @param cap - Max writes to try per step.
 */
export function runCrashSweep(open: CrashOpen = () => new MemoryRepositories(), cap: number = 24): CrashReport {
  const steps: CrashStepResult[] = []
  let smallestFailingN: number | undefined
  let failingStep: CrashStep | undefined
  for (const step of CRASH_STEPS) {
    let writes = 0
    let smallest: number | undefined
    for (let n = 0; n <= cap; n += 1) {
      const world = openCrashWorld(open)
      prefix(world, step)
      world.fault.resetWrites()
      world.fault.crashAfter = n
      let crashed = false
      try {
        runStep(world, step)
        writes = world.fault.writes
      }
      catch (error) {
        if (!(error instanceof CrashError)) throw error
        crashed = true
      }
      world.fault.crashAfter = undefined
      resume(world)
      const problems = invariants(world)
      if (problems.length > 0 && smallest === undefined) {
        smallest = n
        if (smallestFailingN === undefined || n < smallestFailingN) {
          smallestFailingN = n
          failingStep = step
        }
      }
      if (!crashed) break
    }
    const row: CrashStepResult = { step, writes }
    if (smallest !== undefined) row.smallestFailingN = smallest
    steps.push(row)
  }
  const report: CrashReport = { steps }
  if (smallestFailingN !== undefined) report.smallestFailingN = smallestFailingN
  if (failingStep !== undefined) report.failingStep = failingStep
  return report
}

/**
 * @param report - Sweep result.
 */
export function formatCrashReport(report: CrashReport): string {
  const rows = report.steps
    .map(row => `| ${row.step} | ${String(row.writes)} | ${row.smallestFailingN === undefined ? '—' : String(row.smallestFailingN)} |`)
    .join('\n')
  const headline = report.smallestFailingN === undefined
    ? 'Nenhum N falhou. Transação aborta; resume não duplica.'
    : `Menor N que falhou: **${String(report.smallestFailingN)}** (${report.failingStep ?? '?'}).`
  return [
    '# Consistência sob queda',
    '',
    headline,
    '',
    '| passo | escritas | menor N que falhou |',
    '|---|---:|---:|',
    rows,
    '',
  ].join('\n')
}
