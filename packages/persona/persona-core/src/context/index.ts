/**
 * compileContext and recall: port of persona-spec/context.mjs.
 * Scope, snapshot, and authorize must come from trusted application services.
 */

import { createHash } from 'node:crypto'
import { ContextError } from './error.ts'
import type {
  CompiledContext, CompileContextInput, ContextAuthorize, ContextErrorCode, ContextKind,
  ContextManifest, ContextRecord, ContextScope, ContextSnapshot, RecallEventType,
  RecallInput, RecallResult, RecalledEvent,
} from './types.ts'

export type {
  CompiledContext, CompileContextInput, ContextAuthorize, ContextErrorCode, ContextKind,
  ContextManifest, ContextManifestEntry, ContextRecord, ContextScope, ContextSnapshot,
  CountTokens, RecallEvent, RecallEventType, RecallInput, RecallResult, RecalledEvent,
} from './types.ts'

export { ContextError } from './error.ts'
export { inlineRef, recallChain, spillId, spillPointer } from './chain.ts'
export type { ChainHop, ChainRecallInput, InlineRef, RecallNode } from './chain.ts'
export { formatContextBenchReport, runContextBench } from './bench.ts'
export type { BenchSample } from './bench.ts'

const SCOPE_KEYS = ['workspaceId', 'projectId', 'agentId', 'actorId', 'audienceId', 'policyRevision'] as const

const rank = {
  constraint: 0,
  decision: 1,
  brief: 2,
  task: 3,
  skill: 4,
  memory: 5,
} as const satisfies Record<ContextKind, number>

const RECALL_TYPES: readonly RecallEventType[] = ['message', 'decision', 'artifact', 'handoff']

function fail(code: ContextErrorCode): never {
  throw new ContextError(code)
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isContextKind(value: string): value is ContextKind {
  return Object.hasOwn(rank, value)
}

function isRecallEventType(value: string): value is RecallEventType {
  return (RECALL_TYPES as readonly string[]).includes(value)
}

function isArray<T>(value: readonly T[] | T[]): value is T[] {
  return Array.isArray(value)
}

function checkScope(scope: ContextScope): void {
  for (const key of SCOPE_KEYS) {
    if (!nonempty(scope[key])) fail('INVALID_SCOPE')
  }
}

function localScopeMatches(
  record: { workspaceId: string; projectId: string; agentId?: string },
  scope: ContextScope,
): boolean {
  return record.workspaceId === scope.workspaceId &&
    record.projectId === scope.projectId &&
    (!record.agentId || record.agentId === scope.agentId)
}

function indexSnapshot(snapshot: ContextSnapshot): Map<string, ContextRecord> {
  if (!nonempty(snapshot.revision) || !isArray(snapshot.records) || !isArray(snapshot.requiredIds)) {
    fail('INVALID_SNAPSHOT')
  }
  const index = new Map<string, ContextRecord>()
  for (const record of snapshot.records) {
    const sourceIds = record.sourceIds
    if (!nonempty(record.id) || index.has(record.id) ||
        !Number.isInteger(record.revision) || record.revision < 1 ||
        typeof record.body !== 'string' || !isContextKind(record.kind) ||
        !isArray(sourceIds) || sourceIds.some(id => !nonempty(id))) {
      fail('INVALID_SNAPSHOT')
    }
    index.set(record.id, record)
  }
  if (snapshot.requiredIds.some(id => !nonempty(id))) fail('INVALID_SNAPSHOT')
  return index
}

function policyReader(
  index: Map<string, ContextRecord>,
  scope: ContextScope,
  authorize: ContextAuthorize<ContextRecord>,
): (id: string, path?: Set<string>) => Promise<boolean> {
  const checked = new Map<string, boolean>()
  async function readable(id: string, path = new Set<string>()): Promise<boolean> {
    if (path.has(id)) return false
    const cached = checked.get(id)
    if (cached !== undefined) return cached
    const record = index.get(id)
    if (!record || record.status !== 'active' || !localScopeMatches(record, scope)) return false
    // authorize must include current actor AND recipient/audience grants, including
    // whether an agent may disclose a DM-derived memory in this destination.
    if (await authorize(record, scope) !== true) { checked.set(id, false); return false }
    const next = new Set(path)
    next.add(id)
    for (const sourceId of record.sourceIds) {
      if (!await readable(sourceId, next)) { checked.set(id, false); return false }
    }
    checked.set(id, true)
    return true
  }
  return readable
}

function render(records: readonly ContextRecord[]): string {
  // Deliberately stable ordering/serialization for provider prompt caching.
  // This is data. The caller wraps it under its trusted instruction hierarchy.
  return JSON.stringify({
    format: 'persona-context-v1',
    records: records.map(record => ({
      id: record.id,
      revision: record.revision,
      kind: record.kind,
      body: record.body,
      sourceIds: [...record.sourceIds].sort(),
    })),
  })
}

function order(a: ContextRecord, b: ContextRecord): number {
  return rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id)
}

function relevanceOf(record: ContextRecord): number {
  const value = record.relevance
  return value !== undefined && Number.isFinite(value) ? value : 0
}

/**
 * Assemble an authorized, budgeted data payload from a transactional snapshot.
 * Does not send instructions to a model. Freezes inputs before the first await.
 * @param input - Trusted scope, snapshot, budget, tokenizer, and authorize gate.
 * @returns Serialized records, manifest, and cache key.
 */
export async function compileContext(input: CompileContextInput): Promise<CompiledContext> {
  let { scope, snapshot } = input
  const { budgetTokens, countTokens, authorize } = input
  checkScope(scope)
  if (!Number.isInteger(budgetTokens) || budgetTokens < 1 ||
      typeof countTokens !== 'function' || typeof authorize !== 'function') fail('INVALID_OPTIONS')
  // Freeze the input view before the first await. Concurrent edits belong to the
  // next snapshot, not to a partially assembled prompt.
  scope = structuredClone(scope)
  snapshot = structuredClone(snapshot)
  const index = indexSnapshot(snapshot)
  const readable = policyReader(index, scope, authorize)
  const selected: ContextRecord[] = []
  const requiredIds = [...new Set(snapshot.requiredIds)].sort()
  for (const id of requiredIds) {
    if (!await readable(id)) fail('REQUIRED_CONTEXT_UNAVAILABLE')
    const record = index.get(id)
    if (record === undefined) fail('REQUIRED_CONTEXT_UNAVAILABLE')
    selected.push(record)
  }
  selected.sort(order)
  // A semantic key represents one authoritative fact, e.g. publish.policy.
  // Conflicting mandatory facts must be resolved by the application/user.
  const facts = new Map<string, string>()
  for (const record of selected) {
    if (!record.factKey) continue
    const held = facts.get(record.factKey)
    if (held !== undefined && held !== record.body) fail('CONTEXT_CONFLICT')
    facts.set(record.factKey, record.body)
  }
  function tokens(records: readonly ContextRecord[]): number {
    const count = countTokens(render(records))
    if (!Number.isInteger(count) || count < 0) fail('INVALID_TOKEN_COUNT')
    return count
  }
  if (tokens(selected) > budgetTokens) fail('REQUIRED_CONTEXT_OVERFLOW')
  const candidates = [...index.values()].filter(record => !requiredIds.includes(record.id))
  candidates.sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) ||
    relevanceOf(b) - relevanceOf(a) || order(a, b))
  for (const record of candidates) {
    if (!await readable(record.id)) continue
    // An optional memory cannot override an authoritative fact already loaded.
    if (record.factKey) {
      const held = facts.get(record.factKey)
      if (held !== undefined && held !== record.body) continue
    }
    const next = [...selected, record]
    if (tokens(next) <= budgetTokens) {
      selected.push(record)
      if (record.factKey) facts.set(record.factKey, record.body)
    }
  }
  const manifest: ContextManifest = {
    version: 1,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    agentId: scope.agentId,
    actorId: scope.actorId,
    audienceId: scope.audienceId,
    policyRevision: scope.policyRevision,
    snapshotRevision: snapshot.revision,
    requiredIds,
    records: selected.map(({ id, revision }) => ({ id, revision })),
    tokenCount: tokens(selected),
  }
  const cacheKey = createHash('sha256').update(JSON.stringify(manifest)).update(render(selected)).digest('hex')
  return { text: render(selected), manifest, cacheKey }
}

function timestamp(value: string): number {
  // Explicit offset required; no machine-local date interpretation.
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value))) fail('INVALID_TIMESTAMP')
  return Date.parse(value)
}

/**
 * Filter a bounded, already-scoped storage batch. Does not load a transcript
 * or perform semantic search. Storage must query within scope.
 * @param input - Trusted scope, event batch, subject, optional time window, and authorize gate.
 * @returns Exact authorized events and a cursor at the last returned sequence.
 */
export async function recall({
  scope, events, subjectId, since, until, afterSequence = 0, limit = 50, authorize,
}: RecallInput): Promise<RecallResult> {
  checkScope(scope)
  if (!nonempty(subjectId) || !isArray(events) || typeof authorize !== 'function' ||
      !Number.isInteger(limit) || limit < 1 || limit > 200 ||
      !Number.isInteger(afterSequence) || afterSequence < 0) fail('INVALID_RECALL')
  const from = since === undefined ? -Infinity : timestamp(since)
  const to = until === undefined ? Infinity : timestamp(until)
  if (from > to) fail('INVALID_TIME_RANGE')
  scope = structuredClone(scope)
  const ordered = structuredClone(events).slice()
  ordered.sort((a, b) => a.sequence - b.sequence)
  const seen = new Set<number>()
  const rows: RecalledEvent[] = []
  for (const event of ordered) {
    if (!Number.isInteger(event.sequence) || event.sequence < 1 || seen.has(event.sequence)) fail('INVALID_EVENTS')
    seen.add(event.sequence)
    if (event.sequence <= afterSequence || event.subjectId !== subjectId ||
        !localScopeMatches(event, scope) || event.deleted === true) continue
    const at = timestamp(event.occurredAt)
    if (at < from || at > to || await authorize(event, scope) !== true) continue
    if (!isRecallEventType(event.type)) continue
    if (!nonempty(event.id) || typeof event.body !== 'string') fail('INVALID_EVENTS')
    rows.push({
      id: event.id,
      sequence: event.sequence,
      occurredAt: event.occurredAt,
      subjectId: event.subjectId,
      type: event.type,
      body: event.body,
    })
    if (rows.length === limit) break
  }
  return { events: rows, nextSequence: rows.at(-1)?.sequence ?? afterSequence }
}
