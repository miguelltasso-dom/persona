/**
 * Read the paid-turn evidence (`turn_ledger`) out of a Persona home after a run: kinds, engines, tokens
 * (input / output / cache read / cache write), `measured` vs `estimate`. Read-only: the database and its WAL/SHM files are
 * COPIED to a scratch directory and the copy is queried, so the evidence stays byte-for-byte as the app left it.
 * No secrets are read (the table holds counters and ids only).
 */
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** One paid (or estimated) model turn as the engine booked it. */
export interface LedgerRow {
  readonly kind: string
  readonly engine: string
  readonly origin: string | null
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly ticketId: string | null
  readonly at: string
}

/** Ledger totals for the report. */
export interface LedgerEvidence {
  readonly dbPath: string
  readonly rows: readonly LedgerRow[]
  /** Every column of every `turn_ledger` row exactly as stored (snake_case), for an external canonicalizer/verifier. */
  readonly rawRows: readonly Record<string, unknown>[]
  /** Paid turns = entries booked as `execution`, `triage`, `reply`… (everything the ledger holds is a model turn). */
  readonly turns: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly allMeasured: boolean
}

/**
 * @param home - `PERSONA_HOME` of the run (database at `<home>/db/persona.db`).
 * @returns Ledger rows and totals, or `undefined` when the database does not exist.
 */
export function readLedgerEvidence(home: string): LedgerEvidence | undefined {
  const source = join(home, 'db', 'persona.db')
  if (!existsSync(source)) return undefined
  const scratch = mkdtempSync(join(tmpdir(), 'persona-ledger-evidence-'))
  try {
    const copy = join(scratch, 'persona.db')
    copyFileSync(source, copy)
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(source + suffix)) copyFileSync(source + suffix, copy + suffix)
    }
    const db = new DatabaseSync(copy)
    try {
      const raw = db.prepare('SELECT * FROM turn_ledger ORDER BY at').all() as Record<string, unknown>[]
      const rows: LedgerRow[] = raw.map(row => ({
        kind: String(row.kind),
        engine: String(row.engine),
        origin: row.origin === null || row.origin === undefined ? null : String(row.origin),
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens),
        cacheReadTokens: Number(row.cache_read_tokens),
        cacheWriteTokens: Number(row.cache_write_tokens),
        ticketId: row.ticket_id === null || row.ticket_id === undefined ? null : String(row.ticket_id),
        at: String(row.at),
      }))
      const sum = (pick: (row: LedgerRow) => number): number => rows.reduce((total, row) => total + pick(row), 0)
      return {
        dbPath: source,
        rows,
        rawRows: raw.map(row => ({ ...row })),
        turns: rows.length,
        inputTokens: sum(row => row.inputTokens),
        outputTokens: sum(row => row.outputTokens),
        cacheReadTokens: sum(row => row.cacheReadTokens),
        cacheWriteTokens: sum(row => row.cacheWriteTokens),
        allMeasured: rows.length > 0 && rows.every(row => row.origin === 'measured'),
      }
    } finally {
      db.close()
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/**
 * SQL `turn_ledger` rows → the canonical `TurnLedgerEntry` shape Forge's pure verifier decodes (id, personaId, engine, kind, the four
 * counters, the six layers, at; optional ticketId/accountId/origin). NO defaults are invented: a missing or NULL required column stays
 * as stored so the verifier rejects it; only OPTIONAL columns that are NULL are omitted (contract: first-delivery-real-proof.md).
 * @param rawRows - Every column of every row, as {@link LedgerEvidence.rawRows}.
 */
export function canonicalLedgerRows(rawRows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return rawRows.map((row) => {
    const entry: Record<string, unknown> = {
      id: row.id,
      personaId: row.persona_id,
      engine: row.engine,
      kind: row.kind,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      layers: {
        system: row.layer_system,
        tools: row.layer_tools,
        required: row.layer_required,
        subject: row.layer_subject,
        recall: row.layer_recall,
        message: row.layer_message,
      },
      at: row.at,
    }
    if (row.ticket_id !== null && row.ticket_id !== undefined) entry.ticketId = row.ticket_id
    if (row.account_id !== null && row.account_id !== undefined) entry.accountId = row.account_id
    if (row.origin !== null && row.origin !== undefined) entry.origin = row.origin
    return entry
  })
}
