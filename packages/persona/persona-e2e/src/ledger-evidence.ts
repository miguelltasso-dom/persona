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
  /** D-085: how the call's environment was set up (`native` | `answer-only` | `needed`); `null` when the runner did not say (or the column does not exist yet). */
  readonly envMode: string | null
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
      if (!existsSync(source + suffix)) continue
      try {
        copyFileSync(source + suffix, copy + suffix)
      } catch (error) {
        // A LIVE host keeps `-shm` locked on Windows (EBUSY). It is only the shared-memory index, rebuilt from the WAL when the copy is opened; the WAL itself must copy.
        if (suffix !== '-shm') throw error
      }
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
        envMode: row.env_mode === null || row.env_mode === undefined ? null : String(row.env_mode),
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

/** The six layers of a model request as `turn_ledger` books them (`layer_*` columns). */
export interface LedgerLayers {
  readonly system: number
  readonly tools: number
  readonly required: number
  readonly subject: number
  readonly recall: number
  readonly message: number
}

/**
 * D-085 baseline (Atlas/Keel, 04/11): the REAL "before" of the first delivery, run in the engine's NATIVE mode (the bloated call, with the
 * MCP tool layer). It is only usable when EVERY turn was measured: otherwise it says why and `valid` is false (fail closed — the proof
 * accuses instead of accepting an estimate as a baseline).
 */
export interface BaselineD085 {
  readonly id: 'D-085'
  /** Declared by the decree, not detected: the first real delivery of this round runs native. The `layers.tools` total is the evidence. */
  readonly mode: 'native'
  readonly valid: boolean
  /** Why the baseline cannot be used; `null` when valid. */
  readonly reason: string | null
  readonly turns: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  /**
   * What the request carried in. The engine's `inputTokens` ALREADY INCLUDES the cache-write tokens (measured in the D-069 real run, 05/11: input 308 902 =
   * 2 fresh + 308 900 written to cache), so adding the cache columns again would double count. When `inputTokens` is at least as large as the two cache
   * columns together it is taken as inclusive; otherwise (the columns are separate counters) they are added.
   */
  readonly totalRequestTokens: number
  /** Sum of each layer over the turns (`tools` = the MCP weight). */
  readonly layers: LedgerLayers
  readonly perTurn: ReadonlyArray<{ readonly kind: string; readonly engine: string; readonly origin: string | null; readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens: number; readonly cacheWriteTokens: number }>
}

const LAYER_COLUMNS = { system: 'layer_system', tools: 'layer_tools', required: 'layer_required', subject: 'layer_subject', recall: 'layer_recall', message: 'layer_message' } as const

/**
 * @param ledger - Evidence read after the run (`null` when the database could not be read).
 * @returns The D-085 baseline block for the proof; `valid:false` with the reason when no measured turn exists or any turn is an estimate.
 */
export function baselineD085(ledger: LedgerEvidence | null): BaselineD085 {
  const zero: LedgerLayers = { system: 0, tools: 0, required: 0, subject: 0, recall: 0, message: 0 }
  if (ledger === null) {
    return { id: 'D-085', mode: 'native', valid: false, reason: 'no ledger could be read after the run', turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalRequestTokens: 0, layers: zero, perTurn: [] }
  }
  const layer = (column: string): number => ledger.rawRows.reduce((total, row) => total + Number(row[column] ?? 0), 0)
  const layers: LedgerLayers = {
    system: layer(LAYER_COLUMNS.system), tools: layer(LAYER_COLUMNS.tools), required: layer(LAYER_COLUMNS.required),
    subject: layer(LAYER_COLUMNS.subject), recall: layer(LAYER_COLUMNS.recall), message: layer(LAYER_COLUMNS.message),
  }
  const reason = ledger.turns === 0
    ? 'the ledger holds no turn'
    : ledger.allMeasured ? null : 'turn_ledger is not fully measured (allMeasured=false): an estimate is not a baseline'
  return {
    id: 'D-085',
    mode: 'native',
    valid: reason === null,
    reason,
    turns: ledger.turns,
    inputTokens: ledger.inputTokens,
    outputTokens: ledger.outputTokens,
    cacheReadTokens: ledger.cacheReadTokens,
    cacheWriteTokens: ledger.cacheWriteTokens,
    totalRequestTokens: ledger.inputTokens >= ledger.cacheReadTokens + ledger.cacheWriteTokens
      ? ledger.inputTokens
      : ledger.inputTokens + ledger.cacheReadTokens + ledger.cacheWriteTokens,
    layers,
    perTurn: ledger.rows.map(row => ({ kind: row.kind, engine: row.engine, origin: row.origin, inputTokens: row.inputTokens, outputTokens: row.outputTokens, cacheReadTokens: row.cacheReadTokens, cacheWriteTokens: row.cacheWriteTokens })),
  }
}

/**
 * The scripted FAKE runner's fingerprint in `turn_ledger` (Forge, 04/11): engine `dsh` and/or exactly 1 input + 1 output token. A REAL run
 * whose ledger carries it ran the fake (for instance because `VITEST=true` leaked into the app's environment), whatever the screen says.
 * @param ledger - Evidence read after the run.
 * @returns One line per fake-looking row; empty when none.
 */
export function fakeRunnerSignature(ledger: LedgerEvidence | null): string[] {
  if (ledger === null) return []
  return ledger.rows.flatMap((row, index) => {
    const reasons = [
      ...(row.engine === 'dsh' ? ['engine is "dsh" (the scripted fake), not a real CLI engine'] : []),
      ...(row.inputTokens === 1 && row.outputTokens === 1 ? ['1 input / 1 output token (the fake runner\'s counters)'] : []),
    ]
    return reasons.length === 0 ? [] : [`turn ${String(index + 1)} (${row.kind}): ${reasons.join('; ')}`]
  })
}
