/** Trusted compilation scope from authentication and ACLs, never from model arguments. */
export interface ContextScope {
  workspaceId: string
  projectId: string
  agentId: string
  actorId: string
  audienceId: string
  policyRevision: string
}

/** Record kinds admitted by the compiler, in descending priority order. */
export type ContextKind = 'constraint' | 'decision' | 'brief' | 'task' | 'skill' | 'memory'

/**
 * One snapshot record. `agentId` omitted means project-scoped, still subject to ACL.
 * Optional `pinned`, `relevance`, and `factKey` are assigned by the repository.
 */
export interface ContextRecord {
  id: string
  workspaceId: string
  projectId: string
  revision: number
  kind: ContextKind
  status: string
  body: string
  sourceIds: readonly string[]
  agentId?: string
  pinned?: boolean
  relevance?: number
  factKey?: string
  /** Conversation subject (WAVE2). Omitted = vault/global; compile keeps requireds. */
  subjectId?: string
  /** Cofre document title when this record is a file citation. */
  title?: string
  /** Page or section for Contexto usado (no schema bump — v14 stays). */
  locator?: string
}

/** Transactional view: revision, mandatory ids, and the complete record set. */
export interface ContextSnapshot {
  revision: string
  requiredIds: readonly string[]
  records: readonly ContextRecord[]
}

/**
 * Trusted async gate. Must return exactly `true` to admit a record or event.
 * Checks requester read, agent use, and disclosure to the current audience.
 * @param item - Candidate already present in the supplied snapshot or batch.
 * @param scope - Frozen compilation or recall scope.
 */
export type ContextAuthorize<T> = (item: T, scope: ContextScope) => Promise<unknown>

/** Tokenizer supplied by the integrator; must return a non-negative integer. */
export type CountTokens = (text: string) => number

/** Arguments for {@link compileContext}. */
export interface CompileContextInput {
  scope: ContextScope
  snapshot: ContextSnapshot
  budgetTokens: number
  countTokens: CountTokens
  authorize: ContextAuthorize<ContextRecord>
  /** Stable prefix; optional records already in it are dropped (OPT-4). */
  prefix?: string
}

/** Selected record identity stored on the manifest. */
export interface ContextManifestEntry {
  id: string
  revision: number
}

/** Cache and audit identity of one compiled prompt payload. */
export interface ContextManifest {
  version: 1
  workspaceId: string
  projectId: string
  agentId: string
  actorId: string
  audienceId: string
  policyRevision: string
  snapshotRevision: string
  requiredIds: string[]
  records: ContextManifestEntry[]
  tokenCount: number
}

/** Serialized data payload, manifest, and cache key. Contains no instructions. */
export interface CompiledContext {
  text: string
  manifest: ContextManifest
  cacheKey: string
}

/** Event types visible to recall; others are skipped. */
export type RecallEventType = 'message' | 'decision' | 'artifact' | 'handoff'

/**
 * One storage event in a bounded, already-authorized batch.
 * `sequence` is a positive integer unique within the stream.
 */
export interface RecallEvent {
  id: string
  workspaceId: string
  projectId: string
  sequence: number
  subjectId: string
  occurredAt: string
  type: string
  body: string
  agentId?: string
  deleted?: boolean
}

/** Arguments for {@link recall}. `afterSequence` defaults to 0; `limit` defaults to 50. */
export interface RecallInput {
  scope: ContextScope
  events: readonly RecallEvent[]
  subjectId: string
  since?: string
  until?: string
  afterSequence?: number
  limit?: number
  authorize: ContextAuthorize<RecallEvent>
}

/** One authorized event returned by recall. */
export interface RecalledEvent {
  id: string
  sequence: number
  occurredAt: string
  subjectId: string
  type: RecallEventType
  body: string
}

/** Filtered events and a numeric cursor at the last returned sequence. */
export interface RecallResult {
  events: RecalledEvent[]
  nextSequence: number
}

/** Machine codes from the integration contract. */
export type ContextErrorCode =
  | 'INVALID_SCOPE'
  | 'INVALID_SNAPSHOT'
  | 'INVALID_OPTIONS'
  | 'INVALID_TOKEN_COUNT'
  | 'REQUIRED_CONTEXT_UNAVAILABLE'
  | 'REQUIRED_CONTEXT_OVERFLOW'
  | 'CONTEXT_CONFLICT'
  | 'INVALID_RECALL'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TIME_RANGE'
  | 'INVALID_EVENTS'
