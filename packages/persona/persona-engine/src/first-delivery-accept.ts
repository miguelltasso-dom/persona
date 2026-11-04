/**
 * V1-P0-1 machine checklist: first-use ask becomes a running Assignment.
 */

import {
  Engine,
  MemoryRepositories,
  ticketStage,
  type Assessor,
  type Candidate,
  type EngineOptions,
  type Executor,
  type Policy,
  type Trigger,
} from './core/index.ts'
import { firstDeliveryAsk } from './first-delivery.ts'
import { preRoute } from './preroute/rules.ts'
import { wantsWork, workSkipReason } from './wants-work.ts'

export interface FirstDeliveryAcceptance {
  readonly passed: number
  readonly total: 4
  readonly failed: readonly string[]
}

const AGENCIA = 'Monte a equipe da Agência Ponto para o site e a campanha do cliente.'

/**
 * Four V1-P0-1 bullets. Fake executor (no CLI). Host/Probe call this.
 * @returns Score; `failed` names the missed bullet.
 */
export function measureFirstDeliveryAcceptance(): FirstDeliveryAcceptance {
  const failed: string[] = []
  if (!wantsWork(AGENCIA) || workSkipReason(AGENCIA) !== undefined) failed.push('agencia-wants-work')
  const ask = firstDeliveryAsk({ companyBrief: 'Agência Ponto — estúdio de sites.' })
  if (!wantsWork(ask)) failed.push('first-ask')
  const routed = preRoute({
    text: AGENCIA,
    senderId: 'miguel',
    threadKey: 'channel:geral',
    at: 1,
    personas: [{ id: 'atlas', name: 'Atlas' }],
    budgetLeft: true,
    silenceUntil: 0,
    canCommand: () => true,
    window: [],
  })
  if (routed.action !== 'model' || !routed.modelCalled) failed.push('preroute-not-silent')
  if (!assignmentRuns(ask)) failed.push('accept-running')
  const total = 4
  const checks = ['agencia-wants-work', 'first-ask', 'preroute-not-silent', 'accept-running'] as const
  const missed = checks.filter(id => failed.includes(id))
  return { passed: total - missed.length, total, failed: missed }
}

function assignmentRuns(text: string): boolean {
  const repo = new MemoryRepositories()
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (c) => { requests.push(c) }, release: () => {} }
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
  const outbox: EngineOptions['outbox'] = {
    send: () => {}, status: () => undefined, withdraw: () => {},
  }
  const engine = new Engine({
    repo, assessor, executor, outbox, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => '2026-11-04T12:00:00.000Z',
  })
  const trigger: Trigger = {
    id: 'first-delivery',
    source: 'chat',
    threads: [{ source: 'chat', id: 'geral' }],
    actor: { source: 'chat', id: 'miguel' },
    human: true,
    at: '2026-11-04T12:00:00.000Z',
    text,
    channel: { source: 'chat', thread: 'geral', address: { message: 'first-delivery' } },
    meta: {},
  }
  engine.receive(trigger)
  engine.evaluateDue()
  const candidate = requests[0]
  const triggerId = candidate?.triggers[0]?.id
  if (triggerId === undefined) return false
  const decision = engine.decide(triggerId, {
    kind: 'accept', title: taskTitle(text), scope: 'small', reason: 'requested',
  })
  const launched = launches[0]
  if (launched === undefined || decision.ticketId === undefined) return false
  engine.assignmentStarted(launched.ticketId, launched.assignmentId)
  const ticket = repo.tickets.get(decision.ticketId)
  return ticket !== undefined
    && ticketStage(ticket).stage === 'working'
    && ticket.assignments.some(row => row.state === 'running')
}

function taskTitle(text: string): string {
  return text.split(/\r?\n/u, 1)[0]?.slice(0, 80) || 'Pedido'
}
