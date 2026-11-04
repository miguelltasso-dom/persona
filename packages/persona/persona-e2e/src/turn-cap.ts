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
  /** The package that holds the limiter (persona-runners/host, unpacked) was present and read in full. */
  readonly ownerPackageChecked?: boolean
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
 * Where the limiter lives (Rivet: `persona-runners/src/resolve/real-turn-cap.ts`, constant `REAL_TURN_CAP_ENV`): the packaged runners and host
 * packages. Scanning them first answers in well under a second; walking the whole install (~32 000 files, 1 GB) took > 4 minutes on
 * 04/11, so the full walk is only a bounded fallback.
 */
const PRIORITY_DIRS = [
  join('app.asar.unpacked', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-persona-runners'),
  join('app.asar.unpacked', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-persona-host'),
] as const

/**
 * Look for `PERSONA_REAL_TURN_CAP` inside the installed app (`<install dir>/resources`).
 * Order: the packaged runners/host packages (JS only), then `app.asar`, then a bounded walk of everything else.
 * `found: false` with `ownerPackageChecked: true` is a DEFINITIVE answer (the package that holds the limiter was read and does not have it);
 * otherwise a miss only means "not found in the time given" and the caller must still refuse to spend.
 * @param exe - Path to the installed `Persona.exe`.
 * @param budgetMs - Deadline for the fallback walk.
 */
export function scanForTurnCap(exe: string, budgetMs = 60_000): TurnCapScan {
  const root = join(dirname(exe), 'resources')
  const needle = Buffer.from(TURN_CAP_ENV)
  const startedAt = Date.now()
  let scannedFiles = 0
  let scannedBytes = 0
  const done = (found: boolean, extra: Partial<TurnCapScan> = {}): TurnCapScan => ({ found, scannedFiles, scannedBytes, timedOut: false, ...extra })
  if (!existsSync(root)) return done(false)
  const seen = new Set<string>()
  const check = (file: string): boolean => {
    if (seen.has(file)) return false
    seen.add(file)
    scannedFiles += 1
    scannedBytes += statSync(file).size
    return fileContains(file, needle)
  }

  // 1) the owner packages (small, JS only)
  let ownerPackageChecked = false
  for (const relative of PRIORITY_DIRS) {
    const dir = join(root, relative)
    if (!existsSync(dir)) continue
    ownerPackageChecked = true
    for (const file of walk(dir)) {
      if (!/\.(?:js|cjs|mjs)$/iu.test(file)) continue
      if (statSync(file).size > 64 * 1024 * 1024) continue
      if (check(file)) return done(true, { file, ownerPackageChecked: true })
    }
  }
  // 2) the asar (holds the desktop main)
  const asar = join(root, 'app.asar')
  if (existsSync(asar) && check(asar)) return done(true, { file: asar, ownerPackageChecked })
  // 3) bounded fallback over everything else
  for (const file of walk(root)) {
    if (Date.now() - startedAt > budgetMs) return done(false, { timedOut: true, ownerPackageChecked })
    if (check(file)) return done(true, { file, ownerPackageChecked })
  }
  return done(false, { ownerPackageChecked })
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
