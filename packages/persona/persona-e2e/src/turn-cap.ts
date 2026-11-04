/**
 * The app-side pre-turn limiter of the real run (Keel D-069 addendum): the installed app is launched with
 * `PERSONA_REAL_TURN_CAP=1` and `PERSONA_REAL_TURN_LEDGER=<persistent file>`; Rivet implements the cap inside the app/runner.
 * Before any real turn is spent, the harness checks that the exe under test actually CONTAINS that limiter, and after the run it
 * reads the per-attempt ledger file back so the turns it recorded count against the total budget.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const TURN_CAP_ENV = 'PERSONA_REAL_TURN_CAP'
export const TURN_LEDGER_ENV = 'PERSONA_REAL_TURN_LEDGER'

/** Result of scanning an installation for the limiter's environment variable name. */
export interface TurnCapScan {
  readonly found: boolean
  readonly file?: string
  readonly scannedFiles: number
  readonly scannedBytes: number
  readonly timedOut: boolean
}

function* walk(dir: string, depth = 0): Generator<string> {
  if (depth > 12) return
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    const full = join(dir, name)
    let info
    try { info = statSync(full) } catch { continue }
    if (info.isDirectory()) yield* walk(full, depth + 1)
    else if (/\.(?:js|cjs|mjs|asar|json)$/iu.test(name) && info.size > 0) yield full
  }
}

function fileContains(file: string, needle: Buffer): boolean {
  const fd = openSync(file, 'r')
  try {
    const chunk = Buffer.alloc(8 * 1024 * 1024)
    const overlap = needle.length - 1
    let carry = Buffer.alloc(0)
    for (;;) {
      const read = readSync(fd, chunk, 0, chunk.length, null)
      if (read === 0) return false
      const window = Buffer.concat([carry, chunk.subarray(0, read)])
      if (window.includes(needle)) return true
      carry = window.subarray(Math.max(0, window.length - overlap))
    }
  } finally {
    closeSync(fd)
  }
}

/**
 * Look for `PERSONA_REAL_TURN_CAP` inside the installed app (`<install dir>/resources`): the asar and the unpacked runtime.
 * @param exe - Path to the installed `Persona.exe`.
 * @param budgetMs - Scan deadline.
 */
export function scanForTurnCap(exe: string, budgetMs = 90_000): TurnCapScan {
  const root = join(dirname(exe), 'resources')
  const needle = Buffer.from(TURN_CAP_ENV)
  const startedAt = Date.now()
  let scannedFiles = 0
  let scannedBytes = 0
  if (!existsSync(root)) return { found: false, scannedFiles, scannedBytes, timedOut: false }
  // The asar first (small, holds the desktop main), then everything else.
  const asar = join(root, 'app.asar')
  const candidates = [...new Set([...(existsSync(asar) ? [asar] : []), ...walk(root)])]
  for (const file of candidates) {
    if (Date.now() - startedAt > budgetMs) return { found: false, scannedFiles, scannedBytes, timedOut: true }
    scannedFiles += 1
    scannedBytes += statSync(file).size
    if (fileContains(file, needle)) return { found: true, file, scannedFiles, scannedBytes, timedOut: false }
  }
  return { found: false, scannedFiles, scannedBytes, timedOut: false }
}

/**
 * What the per-attempt limiter file says after a run. Exact format (Rivet): `{"version":1,"turns":<integer>,"entries":[...]}`, written
 * atomically (`.tmp` + rename). Absent = 0 turns. Corrupt, a version other than 1, or an invalid `turns` = the limiter itself refuses
 * everything (fail closed) and so does the harness: `valid` is false and the caller must count the attempt as spent. "Prime" (opening a
 * warm session with no model turn) is not a turn; a STARTED turn counts even if it failed.
 */
export interface TurnLedgerFile {
  readonly exists: boolean
  readonly raw: string
  /** Turns booked by the limiter; `null` when the file is invalid. */
  readonly turns: number | null
  readonly valid: boolean
  readonly error?: string
}

/**
 * @param file - Path given to the app as `PERSONA_REAL_TURN_LEDGER`.
 */
export function readTurnLedgerFile(file: string): TurnLedgerFile {
  if (!existsSync(file)) return { exists: false, raw: '', turns: 0, valid: true }
  const raw = readFileSync(file, 'utf8')
  const invalid = (error: string): TurnLedgerFile => ({ exists: true, raw, turns: null, valid: false, error })
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return invalid(`not JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid('not a JSON object')
  const record = parsed as Record<string, unknown>
  if (record.version !== 1) return invalid(`version is ${JSON.stringify(record.version)}, expected 1`)
  if (typeof record.turns !== 'number' || !Number.isInteger(record.turns) || record.turns < 0) return invalid(`turns is ${JSON.stringify(record.turns)}, expected a non-negative integer`)
  if (!Array.isArray(record.entries)) return invalid('entries is not an array')
  return { exists: true, raw, turns: record.turns, valid: true }
}
