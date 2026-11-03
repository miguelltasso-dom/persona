/**
 * Microbench for compileContext / recall / Inline&Spill (marco F input).
 */

import { compileContext, recall } from './index.ts'
import { inlineRef, spillPointer, type RecallNode } from './chain.ts'
import type { ContextRecord, ContextScope, RecallEvent } from './types.ts'

export interface BenchSample {
  n: number
  compile: { p50: number; p95: number; bytes: number }
  recall: { p50: number; p95: number; bytes: number }
  spill: { inlineBytes: number; spilled: number }
}

const scope: ContextScope = {
  workspaceId: 'bench',
  projectId: 'bench',
  agentId: 'worker',
  actorId: 'bench',
  audienceId: 'channel',
  policyRevision: '1',
}

function record(i: number): ContextRecord {
  return {
    id: `r${i}`,
    workspaceId: 'bench',
    projectId: 'bench',
    revision: 1,
    kind: i % 7 === 0 ? 'decision' : 'memory',
    status: 'active',
    body: `fact-${i} ${'x'.repeat(24)}`,
    sourceIds: [],
    relevance: i % 11,
  }
}

function event(i: number): RecallEvent {
  return {
    id: `e${i}`,
    sequence: i + 1,
    occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 60)).toISOString(),
    subjectId: 'subject',
    workspaceId: 'bench',
    projectId: 'bench',
    type: 'message',
    body: `event-${i}`,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index] ?? 0
}

async function time<T>(fn: () => Promise<T>, rounds: number): Promise<{ ms: number[]; value: T }> {
  const ms: number[] = []
  let value!: T
  for (let i = 0; i < rounds; i += 1) {
    const start = performance.now()
    value = await fn()
    ms.push(performance.now() - start)
  }
  ms.sort((a, b) => a - b)
  return { ms, value }
}

function spillSample(n: number): { inlineBytes: number; spilled: number } {
  const nodes: RecallNode[] = Array.from({ length: Math.min(n, 200) }, (_, i) => ({
    id: `n${i}`,
    summary: `sum ${i}`,
    body: 'body '.repeat(80),
    neighborIds: i + 1 < n ? [`n${i + 1}`] : [],
  }))
  let inlineBytes = 0
  let spilled = 0
  for (const node of nodes) {
    const inline = JSON.stringify(inlineRef(node)).length
    inlineBytes += inline
    if (node.body.length > 80) {
      spilled += 1
      inlineBytes += spillPointer(node.id).length
    }
  }
  return { inlineBytes, spilled }
}

/**
 * @param sizes - Record counts to measure.
 * @param rounds - Timed repetitions per size.
 */
export async function runContextBench(sizes: readonly number[] = [1_000, 10_000, 100_000], rounds = 5): Promise<BenchSample[]> {
  const samples: BenchSample[] = []
  for (const n of sizes) {
    const records = Array.from({ length: n }, (_, i) => record(i))
    const events = Array.from({ length: n }, (_, i) => event(i))
    const compiled = await time(() => compileContext({
      scope,
      snapshot: { revision: `s${n}`, requiredIds: [], records },
      budgetTokens: 50_000,
      countTokens: text => Math.ceil(text.length / 4),
      authorize: async () => true,
    }), rounds)
    const recalled = await time(() => recall({
      scope,
      events,
      subjectId: 'subject',
      limit: 50,
      authorize: async () => true,
    }), rounds)
    samples.push({
      n,
      compile: {
        p50: percentile(compiled.ms, 50),
        p95: percentile(compiled.ms, 95),
        bytes: compiled.value.text.length,
      },
      recall: {
        p50: percentile(recalled.ms, 50),
        p95: percentile(recalled.ms, 95),
        bytes: JSON.stringify(recalled.value.events).length,
      },
      spill: spillSample(n),
    })
  }
  return samples
}

/**
 * @param samples - Bench rows.
 */
export function formatContextBenchReport(samples: readonly BenchSample[]): string {
  const rows = samples.map(sample =>
    `| ${sample.n} | ${sample.compile.p50.toFixed(1)} | ${sample.compile.p95.toFixed(1)} | ${sample.compile.bytes} | ${sample.recall.p50.toFixed(1)} | ${sample.recall.p95.toFixed(1)} | ${sample.recall.bytes} | ${sample.spill.inlineBytes} | ${sample.spill.spilled} |`)
  return [
    '# Microbench — compileContext / recall / Inline&Spill',
    '',
    'Insumo do marco F. Tokenizer sintético (`ceil(bytes/4)`), `authorize` sempre `true`.',
    'Máquina local; números não são SLA. Inline&Spill: 200 nós amostrados por tamanho, corpo longo vira `persona-spill:<id>`.',
    '',
    '| n | compile p50 ms | compile p95 ms | compile bytes | recall p50 ms | recall p95 ms | recall bytes (50 ev) | inline bytes | spilled |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows,
    '',
  ].join('\n')
}
