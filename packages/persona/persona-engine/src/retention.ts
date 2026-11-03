/**
 * Retention and archive port (spec §6). Memory implementation + contract suite.
 * Anvil persists the same methods in SQLite (VACUUM / FTS).
 */

export const RETENTION_KINDS = [
  'trigger',
  'disposition',
  'decision',
  'outbox',
  'effect',
  'input',
  'message',
  'usage',
] as const

export type RetentionKind = (typeof RETENTION_KINDS)[number]

export const DAY_MS = 86_400_000

export interface RetentionWindow {
  kind: RetentionKind
  /** Age after which a live row is archived. Archive does not delete. */
  archiveAfterMs: number
  /** Age after which an archived row may be deleted. Omitted = never delete. */
  deleteAfterMs?: number
}

export interface RetentionPolicy {
  windows: readonly RetentionWindow[]
}

/** Defaults: keep the working set a year; usage/outbox may later delete. */
export const DEFAULT_RETENTION: RetentionPolicy = {
  windows: [
    { kind: 'trigger', archiveAfterMs: 365 * DAY_MS },
    { kind: 'disposition', archiveAfterMs: 365 * DAY_MS },
    { kind: 'decision', archiveAfterMs: 365 * DAY_MS },
    { kind: 'outbox', archiveAfterMs: 90 * DAY_MS, deleteAfterMs: 365 * DAY_MS },
    { kind: 'effect', archiveAfterMs: 30 * DAY_MS, deleteAfterMs: 90 * DAY_MS },
    { kind: 'input', archiveAfterMs: 365 * DAY_MS },
    { kind: 'message', archiveAfterMs: 365 * DAY_MS },
    { kind: 'usage', archiveAfterMs: 90 * DAY_MS, deleteAfterMs: 365 * DAY_MS },
  ],
}

export interface RetentionRecord {
  id: string
  kind: RetentionKind
  createdAt: number
  archivedAt?: number
  /** Live records that cite this one. Delete is refused while any remain. */
  derivativeIds: readonly string[]
  indexKeys: readonly string[]
}

export interface RetentionApplyResult {
  archived: string[]
  deleted: string[]
  refused: string[]
}

/**
 * Durable retention store. Every method is synchronous so a host transaction
 * can wrap apply. Delete must drop derivatives, indexes, and caches.
 */
export interface RetentionStore {
  get(id: string): RetentionRecord | undefined
  list(kind?: RetentionKind): readonly RetentionRecord[]
  save(record: RetentionRecord): void
  archive(id: string, at: number): void
  /** Irreversible. Implementers drop FTS/index/cache entries for `id`. */
  delete(id: string): void
  hasIndex(key: string): boolean
  hasCache(id: string): boolean
}

/**
 * @param policy - Documented windows.
 * @param kind - Record kind.
 */
export function windowOf(policy: RetentionPolicy, kind: RetentionKind): RetentionWindow | undefined {
  return policy.windows.find(row => row.kind === kind)
}

/**
 * Archive then delete by age. Archive never deletes. Delete is refused while
 * derivatives still exist, and leaves no index or cache residue.
 * @param store - Retention store.
 * @param policy - Windows.
 * @param now - Clock reading (ms).
 */
export function applyRetention(
  store: RetentionStore,
  policy: RetentionPolicy,
  now: number,
): RetentionApplyResult {
  const archived: string[] = []
  const deleted: string[] = []
  const refused: string[] = []
  for (const record of store.list()) {
    const window = windowOf(policy, record.kind)
    if (window === undefined) continue
    const age = now - record.createdAt
    if (record.archivedAt === undefined && age >= window.archiveAfterMs) {
      store.archive(record.id, now)
      archived.push(record.id)
    }
    const current = store.get(record.id)
    if (current === undefined) continue
    if (window.deleteAfterMs === undefined || age < window.deleteAfterMs) continue
    if (current.derivativeIds.length > 0) {
      refused.push(current.id)
      continue
    }
    store.delete(current.id)
    deleted.push(current.id)
  }
  return { archived, deleted, refused }
}

/**
 * In-memory store for the contract suite and ephemeral hosts.
 */
export class MemoryRetention implements RetentionStore {
  private readonly rows = new Map<string, RetentionRecord>()
  private readonly indexes = new Set<string>()
  private readonly cache = new Set<string>()

  get(id: string): RetentionRecord | undefined {
    const row = this.rows.get(id)
    return row === undefined ? undefined : { ...row, derivativeIds: [...row.derivativeIds], indexKeys: [...row.indexKeys] }
  }

  list(kind?: RetentionKind): readonly RetentionRecord[] {
    return [...this.rows.values()]
      .filter(row => kind === undefined || row.kind === kind)
      .map(row => this.get(row.id)!)
  }

  save(record: RetentionRecord): void {
    this.rows.set(record.id, {
      ...record,
      derivativeIds: [...record.derivativeIds],
      indexKeys: [...record.indexKeys],
    })
    for (const key of record.indexKeys) this.indexes.add(key)
    this.cache.add(record.id)
  }

  archive(id: string, at: number): void {
    const row = this.rows.get(id)
    if (row === undefined || row.archivedAt !== undefined) return
    this.rows.set(id, { ...row, archivedAt: at })
  }

  delete(id: string): void {
    const row = this.rows.get(id)
    if (row === undefined) return
    this.rows.delete(id)
    for (const key of row.indexKeys) this.indexes.delete(key)
    this.cache.delete(id)
  }

  hasIndex(key: string): boolean {
    return this.indexes.has(key)
  }

  hasCache(id: string): boolean {
    return this.cache.has(id)
  }
}
