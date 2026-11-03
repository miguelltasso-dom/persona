/**
 * SQLite {@link UsageStore} (D5). Rivet owns the port in persona-usage;
 * this is the persistence. Retention kind `usage` deletes rows older than the window.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { integer, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

export type UsageOrigin = 'measured' | 'estimate' | 'official' | 'unavailable'

/** One ledger row (persona-usage `UsageRecord` + tenant). */
export interface StoredUsageEvent {
  readonly id: string
  readonly projectId: string
  readonly personaId: string
  readonly provider: string
  readonly model: string
  readonly window: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly origin: UsageOrigin
  readonly at: string
}

/** Inclusive ISO-instant range plus optional tenant filters. */
export interface UsageQuery {
  readonly projectId?: string
  readonly personaId?: string
  readonly from: string
  readonly to: string
}

/** Official quota snapshot (persona-usage `OfficialQuota`). */
export interface StoredOfficialQuota {
  readonly provider: string
  readonly origin: UsageOrigin
  readonly windows: readonly {
    readonly id: string
    readonly origin: UsageOrigin
    readonly usedPercent?: number
    readonly windowMinutes?: number
    readonly resetsAt?: string
  }[]
  readonly detail?: string
}

/**
 * Persist measured/estimated turns and official quota snapshots.
 */
export interface UsageTotals {
  readonly tokens: number
  readonly runs: number
  readonly origin: UsageOrigin
}

export interface UsageStore {
  record(row: StoredUsageEvent): void
  query(query: UsageQuery): StoredUsageEvent[]
  totals(query: UsageQuery): UsageTotals
  list(query: UsageQuery): StoredUsageEvent[]
  tokens(query: UsageQuery): number
  runs(query: UsageQuery): number
  putQuota(projectId: string, quota: StoredOfficialQuota): void
  listQuota(projectId: string, provider?: string): StoredOfficialQuota[]
  purgeBefore(at: string): number
}

/**
 * SQLite book for `usage_record` / `usage_quota` (schema ≥ 7).
 */
export class SqliteUsageStore implements UsageStore {
  /**
   * @param store - Open Persona store.
   */
  constructor(readonly store: PersonaStore) {}

  /**
   * @param row - One turn or estimate. Same id replaces the row.
   */
  record(row: StoredUsageEvent): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO usage_record
        (id, project_id, persona_id, provider, model, window, input_tokens, output_tokens, origin, at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          persona_id = excluded.persona_id,
          provider = excluded.provider,
          model = excluded.model,
          window = excluded.window,
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          origin = excluded.origin,
          at = excluded.at`, [
        row.id,
        row.projectId,
        row.personaId === '' ? null : row.personaId,
        row.provider,
        row.model,
        row.window,
        row.inputTokens,
        row.outputTokens,
        row.origin,
        row.at,
      ])
    })
  }

  /**
   * Port alias for {@link list}.
   * @param query - Inclusive range.
   */
  query(query: UsageQuery): StoredUsageEvent[] {
    return this.list(query)
  }

  /**
   * Port totals. Empty book is `unavailable`, not 0% quota.
   * @param query - Inclusive range.
   */
  totals(query: UsageQuery): UsageTotals {
    const rows = this.list(query)
    const origin = rows.length === 0
      ? 'unavailable'
      : rows.reduce((weak, row) => weaker(weak, row.origin), rows[0]!.origin)
    return { tokens: this.tokens(query), runs: rows.length, origin }
  }

  /**
   * @param query - Inclusive `from`/`to` (ISO) plus optional tenant.
   */
  list(query: UsageQuery): StoredUsageEvent[] {
    const rows = this.store.db.prepare(
      `SELECT id, project_id AS projectId, persona_id AS personaId, provider, model, window,
              input_tokens AS inputTokens, output_tokens AS outputTokens, origin, at
         FROM usage_record
        WHERE at >= ? AND at <= ?
          AND (? IS NULL OR project_id = ?)
          AND (? IS NULL OR persona_id = ?)
        ORDER BY at ASC, id ASC`,
    ).all(
      query.from,
      query.to,
      query.projectId ?? null,
      query.projectId ?? null,
      query.personaId ?? null,
      query.personaId ?? null,
    )
    return rows.map(readEvent)
  }

  /**
   * Sum of input+output tokens in the window. Empty book is 0 tokens, not 0%.
   * @param query - Range.
   */
  tokens(query: UsageQuery): number {
    let sum = 0
    for (const row of this.list(query)) sum += row.inputTokens + row.outputTokens
    return sum
  }

  /**
   * Count of ledger rows (one turn each).
   * @param query - Range.
   */
  runs(query: UsageQuery): number {
    return this.list(query).length
  }

  /**
   * @param projectId - Tenant.
   * @param quota - Latest official snapshot for one provider.
   */
  putQuota(projectId: string, quota: StoredOfficialQuota): void {
    const updatedAt = new Date().toISOString()
    this.store.tx((db) => {
      run(db, `INSERT INTO usage_quota (project_id, provider, origin, body, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id, provider) DO UPDATE SET
          origin = excluded.origin, body = excluded.body, updated_at = excluded.updated_at`, [
        projectId, quota.provider, quota.origin, JSON.stringify(quota), updatedAt,
      ])
    })
  }

  /**
   * @param projectId - Tenant.
   * @param provider - Optional filter.
   */
  listQuota(projectId: string, provider?: string): StoredOfficialQuota[] {
    const rows = provider === undefined
      ? this.store.db.prepare(
        'SELECT body FROM usage_quota WHERE project_id = ? ORDER BY provider',
      ).all(projectId)
      : this.store.db.prepare(
        'SELECT body FROM usage_quota WHERE project_id = ? AND provider = ?',
      ).all(projectId, provider)
    return rows.map(readQuota)
  }

  /**
   * Drop usage events older than `at` (retention kind `usage`).
   * @param at - Exclusive ISO upper bound.
   * @returns Deleted row count.
   */
  purgeBefore(at: string): number {
    const before = this.store.db.prepare(
      'SELECT COUNT(*) AS n FROM usage_record WHERE at < ?',
    ).get(at) as { n: number }
    this.store.tx((db) => {
      run(db, 'DELETE FROM usage_record WHERE at < ?', [at])
    })
    return before.n
  }
}

function weaker(left: UsageOrigin, right: UsageOrigin): UsageOrigin {
  const rank: Record<UsageOrigin, number> = {
    official: 4, measured: 3, estimate: 2, unavailable: 1,
  }
  return rank[left] <= rank[right] ? left : right
}

function readEvent(row: Record<string, SQLOutputValue>): StoredUsageEvent {
  return {
    id: text(row, 'id'),
    projectId: text(row, 'projectId'),
    personaId: optionalText(row, 'personaId') ?? '',
    provider: text(row, 'provider'),
    model: text(row, 'model'),
    window: text(row, 'window'),
    inputTokens: integer(row, 'inputTokens'),
    outputTokens: integer(row, 'outputTokens'),
    origin: text(row, 'origin') as UsageOrigin,
    at: text(row, 'at'),
  }
}

function readQuota(row: Record<string, SQLOutputValue>): StoredOfficialQuota {
  return structuredClone(JSON.parse(text(row, 'body')) as StoredOfficialQuota)
}
