/**
 * Per-turn token ledger (OPT-7). Persists core {@link TurnLedgerEntry}
 * with canonical kinds (`execution` / `evaluation`). Rivet's `exec`/`eval`
 * tags are mapped only at the usage-port boundary, never stored here.
 */

import type { SQLOutputValue } from 'node:sqlite'
import {
  assertTurnEntry,
  type LedgerOrigin,
  type TurnKind,
  type TurnLedgerEntry,
} from '@deepseek-ai/dsh-persona-core'
import { StoreError } from '../errors.ts'
import { integer, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

const TURN_KINDS: readonly TurnKind[] = [
  'triage', 'reply', 'execution', 'initiative', 'librarian', 'watchdog', 'evaluation',
]

/** Inclusive ISO range plus optional tenant / persona / ticket. */
export interface TurnLedgerQuery {
  readonly projectId?: string
  readonly personaId?: string
  readonly ticketId?: string
  readonly from?: string
  readonly to?: string
}

/**
 * SQLite book for `turn_ledger` (schema ≥ 18; the measured wall time `duration_ms` arrives with schema 20 and stays absent on older rows).
 */
export class TurnLedgerRepos {
  /**
   * @param store - Open store.
   */
  constructor(readonly store: PersonaStore) {}

  /**
   * Append or replace one canonical turn. Rejects Rivet port tags.
   * @param projectId - Tenant.
   * @param entry - Core ledger row.
   * @returns The stored row.
   */
  put(projectId: string, entry: TurnLedgerEntry): TurnLedgerEntry {
    if (projectId === '') throw new StoreError('constraint', 'project')
    assertTurnKind(entry.kind)
    assertTurnEntry(entry)
    this.store.tx((db) => {
      run(db, `INSERT INTO turn_ledger
        (id, project_id, persona_id, engine, account_id, kind,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         layer_system, layer_tools, layer_required, layer_subject, layer_recall, layer_message,
         ticket_id, origin, at, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          persona_id = excluded.persona_id,
          engine = excluded.engine,
          account_id = excluded.account_id,
          kind = excluded.kind,
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          cache_read_tokens = excluded.cache_read_tokens,
          cache_write_tokens = excluded.cache_write_tokens,
          layer_system = excluded.layer_system,
          layer_tools = excluded.layer_tools,
          layer_required = excluded.layer_required,
          layer_subject = excluded.layer_subject,
          layer_recall = excluded.layer_recall,
          layer_message = excluded.layer_message,
          ticket_id = excluded.ticket_id,
          origin = excluded.origin,
          at = excluded.at,
          duration_ms = excluded.duration_ms`, [
        entry.id,
        projectId,
        entry.personaId,
        entry.engine,
        entry.accountId === undefined || entry.accountId === '' ? null : entry.accountId,
        entry.kind,
        entry.inputTokens,
        entry.outputTokens,
        entry.cacheReadTokens,
        entry.cacheWriteTokens,
        entry.layers.system,
        entry.layers.tools,
        entry.layers.required,
        entry.layers.subject,
        entry.layers.recall,
        entry.layers.message,
        entry.ticketId === undefined || entry.ticketId === '' ? null : entry.ticketId,
        entry.origin === undefined ? null : entry.origin,
        entry.at,
        entry.durationMs ?? null,
      ])
    })
    return entry
  }

  /**
   * @param query - Inclusive range and optional filters.
   * @returns Rows in `at`, then `id` order.
   */
  list(query: TurnLedgerQuery = {}): TurnLedgerEntry[] {
    const rows = this.store.db.prepare(
      `SELECT id, persona_id, engine, account_id, kind,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
              layer_system, layer_tools, layer_required, layer_subject, layer_recall, layer_message,
              ticket_id, origin, at, duration_ms
         FROM turn_ledger
        WHERE (? IS NULL OR project_id = ?)
          AND (? IS NULL OR persona_id = ?)
          AND (? IS NULL OR ticket_id = ?)
          AND (? IS NULL OR at >= ?)
          AND (? IS NULL OR at <= ?)
        ORDER BY at ASC, id ASC`,
    ).all(
      query.projectId ?? null,
      query.projectId ?? null,
      query.personaId ?? null,
      query.personaId ?? null,
      query.ticketId ?? null,
      query.ticketId ?? null,
      query.from ?? null,
      query.from ?? null,
      query.to ?? null,
      query.to ?? null,
    )
    return rows.map(readEntry)
  }
}

function assertTurnKind(kind: string): asserts kind is TurnKind {
  if ((TURN_KINDS as readonly string[]).includes(kind)) return
  throw new StoreError('constraint', 'kind')
}

function readOrigin(value: string | undefined): LedgerOrigin | undefined {
  if (value === 'measured' || value === 'estimate') return value
  return undefined
}

function readEntry(row: Record<string, SQLOutputValue>): TurnLedgerEntry {
  const kind = text(row, 'kind')
  assertTurnKind(kind)
  const ticketId = optionalText(row, 'ticket_id')
  const accountId = optionalText(row, 'account_id')
  const origin = readOrigin(optionalText(row, 'origin'))
  const durationMs = row.duration_ms === null || row.duration_ms === undefined ? undefined : integer(row, 'duration_ms')
  return {
    id: text(row, 'id'),
    personaId: text(row, 'persona_id'),
    engine: text(row, 'engine'),
    kind,
    inputTokens: integer(row, 'input_tokens'),
    outputTokens: integer(row, 'output_tokens'),
    cacheReadTokens: integer(row, 'cache_read_tokens'),
    cacheWriteTokens: integer(row, 'cache_write_tokens'),
    layers: {
      system: integer(row, 'layer_system'),
      tools: integer(row, 'layer_tools'),
      required: integer(row, 'layer_required'),
      subject: integer(row, 'layer_subject'),
      recall: integer(row, 'layer_recall'),
      message: integer(row, 'layer_message'),
    },
    at: text(row, 'at'),
    ...(ticketId === undefined || ticketId === '' ? {} : { ticketId }),
    ...(accountId === undefined || accountId === '' ? {} : { accountId }),
    ...(origin === undefined ? {} : { origin }),
    ...(durationMs === undefined ? {} : { durationMs }),
  }
}
