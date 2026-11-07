/**
 * Per-turn token ledger (OPT-7). Persists core {@link TurnLedgerEntry}
 * with canonical kinds (`execution` / `evaluation`). Rivet's `exec`/`eval`
 * tags are mapped only at the usage-port boundary, never stored here.
 */

import type { SQLOutputValue } from 'node:sqlite'
import {
  LEDGER_CHOICE_FIELDS,
  assertTurnEntry,
  isLedgerChoiceValue,
  ledgerChoiceOf,
  type LedgerChoiceField,
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

/**
 * EFF-1 (no migration): the engine choice of a turn (model / effort the person chose, and what the engine dropped) is a JSON
 * detail in `screen_doc` under this kind, keyed by the ledger row id and written in the row's own transaction. Only a turn WITH
 * a choice or a drop has one; "Padrão do motor" writes nothing.
 */
export const TURN_ENGINE_DOC_KIND = 'turn_engine'

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
         ticket_id, origin, at, duration_ms, env_mode, env_mode_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          duration_ms = excluded.duration_ms,
          env_mode = excluded.env_mode,
          env_mode_reason = excluded.env_mode_reason`, [
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
        entry.envMode ?? null,
        entry.envModeReason ?? null,
      ])
      // EFF-1: the choice detail follows the row (a replaced row without a choice drops the old detail).
      const choice = ledgerChoiceOf(entry)
      if (choice === undefined) {
        run(db, 'DELETE FROM screen_doc WHERE project_id = ? AND kind = ? AND id = ?', [projectId, TURN_ENGINE_DOC_KIND, entry.id])
      } else {
        run(db, `INSERT INTO screen_doc (project_id, kind, id, body, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(project_id, kind, id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
        [projectId, TURN_ENGINE_DOC_KIND, entry.id, JSON.stringify(choice), entry.at])
      }
    })
    return entry
  }

  /**
   * @param query - Inclusive range and optional filters.
   * @returns Rows in `at`, then `id` order.
   */
  list(query: TurnLedgerQuery = {}): TurnLedgerEntry[] {
    const rows = this.store.db.prepare(
      `SELECT t.id, t.persona_id, t.engine, t.account_id, t.kind,
              t.input_tokens, t.output_tokens, t.cache_read_tokens, t.cache_write_tokens,
              t.layer_system, t.layer_tools, t.layer_required, t.layer_subject, t.layer_recall, t.layer_message,
              t.ticket_id, t.origin, t.at, t.duration_ms, t.env_mode, t.env_mode_reason,
              d.body AS engine_choice
         FROM turn_ledger t
         LEFT JOIN screen_doc d ON d.project_id = t.project_id AND d.kind = ? AND d.id = t.id
        WHERE (? IS NULL OR t.project_id = ?)
          AND (? IS NULL OR t.persona_id = ?)
          AND (? IS NULL OR t.ticket_id = ?)
          AND (? IS NULL OR t.at >= ?)
          AND (? IS NULL OR t.at <= ?)
        ORDER BY t.at ASC, t.id ASC`,
    ).all(
      TURN_ENGINE_DOC_KIND,
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
  const rawMode = optionalText(row, 'env_mode')
  const envModeReason = optionalText(row, 'env_mode_reason')
  const envMode = rawMode === 'native' || rawMode === 'answer-only' || rawMode === 'needed' ? rawMode : undefined
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
    ...(envMode === undefined ? {} : { envMode }),
    ...(envModeReason === undefined || envModeReason === '' ? {} : { envModeReason }),
    ...readChoice(optionalText(row, 'engine_choice')),
  }
}

/**
 * EFF-1: the choice detail of a row, field by field; a malformed or foreign value is left out (a read never throws for it).
 * @param body - `screen_doc.body` of the row, if any.
 * @returns The valid choice fields.
 */
function readChoice(body: string | undefined): Partial<Record<LedgerChoiceField, string>> {
  if (body === undefined || body === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}
  const choice: Partial<Record<LedgerChoiceField, string>> = {}
  for (const field of LEDGER_CHOICE_FIELDS) {
    const value: unknown = Reflect.get(parsed, field)
    if (isLedgerChoiceValue(value)) choice[field] = value
  }
  return choice
}
