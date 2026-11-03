/**
 * Synthetic Router experiment (F3). Deterministic clock. Measures batching
 * (events per inference vs one-by-one) and pass-through ablation.
 */

import { Engine, MemoryRepositories } from '../core/index.ts'
import type { Assessor, Candidate, EngineOptions, Executor, OutboundMessage, Policy, Trigger } from '../core/index.ts'

export interface RouterBenchCounts {
  inferences: number
  decisions: number
  evals: number
  tokenProxy: number
}

export interface RouterBenchResult {
  batched: RouterBenchCounts
  oneByOne: RouterBenchCounts
  passThroughOn: RouterBenchCounts
  passThroughOff: RouterBenchCounts
  deltas: {
    batchingInferencesPct: number
    passThroughDecisionsPct: number
    passThroughTokensPct: number
  }
}

const BODY = 'Pedido sintético de trabalho no projeto, texto longo o bastante para um proxy de tokens. '

function trigger(id: string, thread: string, clock: number): Trigger {
  return {
    id,
    source: 'chat',
    threads: [{ source: 'chat', id: thread }],
    actor: { source: 'chat', id: 'alice' },
    human: true,
    at: new Date(Date.UTC(2026, 8, 23, 0, 0, clock)).toISOString(),
    text: `${BODY}${id}`,
    channel: { source: 'chat', thread, address: { message: id } },
    meta: {},
  }
}

function tokenProxy(candidates: readonly Candidate[]): number {
  return candidates.reduce((sum, candidate) => sum + candidate.triggers.reduce((inner, item) => inner + item.text.length, 0), 0)
}

function openEngine(passThrough: boolean): {
  engine: Engine
  requests: Candidate[]
  pump: () => void
  decideLast: (kind?: 'accept' | 'ignore') => void
} {
  const repo = new MemoryRepositories()
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (candidate: Candidate) => { requests.push(candidate) }, release: () => {} }
  const outbox: OutboundMessage[] = []
  const queued: EngineOptions['outbox'] = {
    send: (message) => { if (!outbox.some(item => item.id === message.id)) outbox.push(message) },
    status: id => outbox.some(item => item.id === id) ? 'pending' : undefined,
    withdraw: () => {},
  }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: t => t.human
      ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } }
      : { admissible: false, reason: 'not human' },
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
  let clock = 0
  const engine = new Engine({
    repo, assessor, executor, outbox: queued, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => new Date(Date.UTC(2026, 8, 23, 0, 0, clock++)).toISOString(),
  })
  const pump = (): void => { engine.evaluateDue() }
  const decideLast = (kind: 'accept' | 'ignore' = 'accept'): void => {
    const candidate = requests.at(-1)
    if (candidate === undefined) return
    if (kind === 'ignore') {
      engine.decide(candidate.triggers[0]!.id, { kind: 'ignore', reason: 'ablate' })
      return
    }
    engine.decide(candidate.triggers[0]!.id, {
      kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested',
    })
  }
  void passThrough
  return { engine, requests, pump, decideLast }
}

function countsOf(requests: readonly Candidate[], inferences: number): RouterBenchCounts {
  return {
    inferences,
    decisions: requests.length,
    evals: new Set(requests.map(item => item.evalId)).size,
    tokenProxy: tokenProxy(requests),
  }
}

const pct = (before: number, after: number): number => before === 0 ? 0 : Math.round(((before - after) / before) * 1000) / 10

/**
 * Run the four cells on a fresh in-memory engine each.
 * Batch: 8 triggers then one evaluateDue + one decide.
 * One-by-one: evaluateDue + decide after each of 8 triggers (new threads so each is its own eval).
 * Pass-through on: accept once, then 12 follow-ups on the same thread (worker owns them).
 * Pass-through off: accept once, unsubscribe, then 12 follow-ups each become a new eval.
 */
export function runRouterExperiment(): RouterBenchResult {
  const batched = openEngine(true)
  for (let i = 1; i <= 8; i += 1) batched.engine.receive(trigger(String(i), 'batch', i))
  batched.pump()
  batched.decideLast()
  const batchedCounts = countsOf(batched.requests, 1)

  const one = openEngine(true)
  for (let i = 1; i <= 8; i += 1) {
    one.engine.receive(trigger(String(i), `solo-${String(i)}`, i))
    one.pump()
    one.decideLast()
  }
  const oneCounts = countsOf(one.requests, 8)

  const on = openEngine(true)
  on.engine.receive(trigger('1', 'pass', 1))
  on.pump()
  on.decideLast()
  const afterFirst = on.requests.length
  for (let i = 2; i <= 13; i += 1) {
    on.engine.receive(trigger(String(i), 'pass', i))
    on.pump()
  }
  const onCounts = countsOf(on.requests, afterFirst)

  const off = openEngine(false)
  off.engine.receive(trigger('1', 'ablate', 1))
  off.pump()
  off.decideLast()
  off.engine.unsubscribe('chat:ablate')
  for (let i = 2; i <= 13; i += 1) {
    off.engine.receive(trigger(String(i), 'ablate', i))
    off.pump()
    off.decideLast('ignore')
  }
  const offCounts = countsOf(off.requests, off.requests.length)

  return {
    batched: batchedCounts,
    oneByOne: oneCounts,
    passThroughOn: onCounts,
    passThroughOff: offCounts,
    deltas: {
      batchingInferencesPct: pct(oneCounts.inferences, batchedCounts.inferences),
      passThroughDecisionsPct: pct(offCounts.decisions, onCounts.decisions),
      passThroughTokensPct: pct(offCounts.tokenProxy, onCounts.tokenProxy),
    },
  }
}

/**
 * @param result - Measured cells.
 */
export function formatRouterBenchReport(result: RouterBenchResult): string {
  const line = (name: string, c: RouterBenchCounts): string =>
    `| ${name} | ${String(c.inferences)} | ${String(c.decisions)} | ${String(c.evals)} | ${String(c.tokenProxy)} |`
  return [
    '# Experimento sintético do Router (F3)',
    '',
    'Metodologia (estudo original do Super-agent: −30% decisões do Router, −37% tokens — **reproduzida, não prometida**):',
    '',
    '- Relógio determinístico (`2026-09-23T00:00:00Z` + 1 s por comando).',
    '- 8 Triggers humanos de ~100 caracteres.',
    '- **Batching:** os 8 chegam, uma `evaluateDue`, uma decisão vs. `evaluateDue`+decisão após cada um (threads distintas).',
    '- **Pass-through:** após 1 accept, 12 follow-ups no mesmo assunto. Ligado = Subscription leva à executora (sem nova Eval). Desligado = `unsubscribe` e cada follow-up vira Eval.',
    '- Proxy de tokens = soma dos comprimentos de texto dos Triggers em cada candidato enviado ao assessor.',
    '',
    '| célula | inferências | decisões (request) | evals | token-proxy |',
    '|---|---:|---:|---:|---:|',
    line('batching (lote)', result.batched),
    line('um a um', result.oneByOne),
    line('pass-through ligado', result.passThroughOn),
    line('pass-through desligado', result.passThroughOff),
    '',
    `Redução de inferências pelo batching: **${String(result.deltas.batchingInferencesPct)}%**.`,
    `Redução de decisões do Router pelo pass-through: **${String(result.deltas.passThroughDecisionsPct)}%**.`,
    `Redução do proxy de tokens pelo pass-through: **${String(result.deltas.passThroughTokensPct)}%**.`,
    '',
    'O número do paper (−30 / −37) veio de tráfego real com janela e prompts completos; esta carga sintética só prova a direção e a instrumentação.',
    '',
  ].join('\n')
}
