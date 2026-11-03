/**
 * In-memory microbench for receive → evaluateDue → decide → report, outbox, views.
 * Insumo do marco F. Measure first; do not optimize from these numbers alone.
 */

import { Engine, MemoryRepositories } from '../core/index.ts'
import type { Assessor, Candidate, EngineOptions, Executor, OutboundMessage, Policy, Ticket, Trigger } from '../core/index.ts'
import { MemoryOutbox } from '../outbox.ts'
import { overview, search, ticketList } from '../views/index.ts'
import type { ViewHost } from '../views/index.ts'

export interface EngineBenchSizes {
  tickets: number
  triggers: number
  pipeline: number
}

export interface EngineBenchPhase {
  name: string
  n: number
  ms: number
}

export interface EngineBenchResult {
  sizes: EngineBenchSizes
  phases: EngineBenchPhase[]
}

const at = (i: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, i % 1000)).toISOString()

function triggerOf(id: string, i: number): Trigger {
  return {
    id,
    source: 'chat',
    threads: [{ source: 'chat', id: 'geral' }],
    actor: { source: 'chat', id: 'ana' },
    human: true,
    at: at(i),
    text: `msg ${id}`,
    channel: { source: 'chat', thread: 'geral', address: { message: id } },
    meta: {},
  }
}

function ticketOf(id: string, i: number): Ticket {
  return {
    id,
    title: `Tarefa ${id}`,
    decisionId: `d-${id}`,
    mandate: {
      strength: 'explicit',
      policyVersion: 'v1',
      basis: { via: 'listed' },
      actor: { source: 'chat', id: 'ana' },
      scope: 'small',
    },
    channels: [{ source: 'chat', thread: 'geral', address: { message: id } }],
    assignments: [],
    inputs: [],
    undelivered: [],
    createdAt: at(i),
    updatedAt: at(i),
    origin: { triggerId: `tr-${id}`, triggerIds: [`tr-${id}`] },
  }
}

function viewHost(repo: MemoryRepositories): ViewHost {
  return {
    projectId: repo.projectId,
    repo,
    now: () => '2026-01-02T00:00:00.000Z',
    canReadTicket: () => true,
    canReadThread: () => true,
    load: { running: 0, queued: 0, maxWorkers: 4 },
  }
}

function timed(name: string, n: number, work: () => void): EngineBenchPhase {
  const start = performance.now()
  work()
  return { name, n, ms: performance.now() - start }
}

function pipelineHarness() {
  const repo = new MemoryRepositories('bench')
  const outbox = new MemoryOutbox()
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (candidate) => { requests.push(candidate) }, release: () => {} }
  const launches: Array<{ ticketId: string; assignmentId: string }> = []
  const executor: Executor = {
    start: (ticket, assignment) => { launches.push({ ticketId: ticket.id, assignmentId: assignment.id }) },
    deliver: () => {},
    stop: () => {},
  }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const queued: EngineOptions['outbox'] = {
    send: (message: OutboundMessage) => { outbox.send(message) },
    status: id => outbox.status(id),
    withdraw: (id) => { outbox.withdraw(id) },
  }
  const engine = new Engine({
    repo, assessor, executor, outbox: queued, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => '2026-01-01T00:00:00.000Z',
  })
  return { repo, engine, requests, launches, outbox }
}

/**
 * Run the in-memory microbench.
 * @param sizes - Ticket/trigger counts and full-pipeline iterations.
 */
export function runEngineBench(sizes: EngineBenchSizes): EngineBenchResult {
  const phases: EngineBenchPhase[] = []
  const store = new MemoryRepositories('bench')
  phases.push(timed('store.triggers', sizes.triggers, () => {
    for (let i = 0; i < sizes.triggers; i += 1) {
      const id = `tr${String(i)}`
      store.triggers.save(triggerOf(id, i))
    }
  }))
  phases.push(timed('store.tickets', sizes.tickets, () => {
    for (let i = 0; i < sizes.tickets; i += 1) {
      store.tickets.save(ticketOf(`t${String(i)}`, i))
    }
  }))
  phases.push(timed('trigger.get', sizes.triggers, () => {
    for (let i = 0; i < sizes.triggers; i += 1) store.triggers.get(`tr${String(i)}`)
  }))
  const host = viewHost(store)
  phases.push(timed('views.ticketList', sizes.tickets, () => {
    ticketList(host, 'open', 0, 50)
  }))
  phases.push(timed('views.overview', sizes.tickets, () => {
    overview(host)
  }))
  phases.push(timed('views.search', sizes.tickets, () => {
    search(host, 'Tarefa')
  }))

  const h = pipelineHarness()
  phases.push(timed('pipeline.receive-evaluate-decide-report', sizes.pipeline, () => {
    for (let i = 0; i < sizes.pipeline; i += 1) {
      const id = String(i + 1).padStart(2, '0')
      const trigger = triggerOf(`p${id}`, i)
      trigger.threads = [{ source: 'chat', id: `th${id}` }]
      trigger.channel = { source: 'chat', thread: `th${id}`, address: { message: id } }
      h.engine.receive(trigger)
      h.engine.evaluateDue()
      const candidate = h.requests.at(-1)
      if (candidate === undefined) continue
      const decision = h.engine.decide(candidate.triggers[0]!.id, {
        kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested', acknowledgement: 'ok',
      })
      const launched = h.launches.shift()
      if (launched) h.engine.assignmentStarted(launched.ticketId, launched.assignmentId)
      if (decision.ticketId) {
        h.engine.report(decision.ticketId, { state: 'progress', summary: 'ok' })
      }
    }
  }))
  phases.push(timed('outbox.send', sizes.pipeline, () => {
    for (let i = 0; i < sizes.pipeline; i += 1) {
      h.outbox.send({
        id: `ob${String(i)}`,
        channel: { source: 'chat', thread: 'geral', address: { message: String(i) } },
        text: 'n',
        kind: 'notice',
      })
    }
  }))
  return { sizes, phases }
}

/**
 * @param result - Bench result.
 */
export function formatEngineBenchReport(result: EngineBenchResult): string {
  const lines = [
    '# Microbench — engine receive / views / outbox',
    '',
    'Insumo do marco F. Repositório em memória; máquina local; números não são SLA.',
    'Views e `trigger.get` medem o estoque (10k tickets / 100k triggers).',
    'A esteira `receive → evaluateDue → decide → report` e o outbox medem um lote representativo.',
    'Não otimizar sem medir de novo.',
    '',
    '| fase | n | ms |',
    '|---|---:|---:|',
    ...result.phases.map(phase => `| ${phase.name} | ${String(phase.n)} | ${phase.ms.toFixed(1)} |`),
    '',
  ]
  return lines.join('\n')
}
