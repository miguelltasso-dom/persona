/**
 * Real-turn cap: a PERSISTENT, fail-closed limit on paid model turns, applied BEFORE the CLI starts a turn.
 *
 * Opt-in through the environment (D-069 real run). Without `PERSONA_REAL_TURN_CAP` nothing changes. With it, every model
 * turn a real CLI runner would start (`start`, `startTurn`, `resume`) first reserves one slot in a ledger file that
 * survives restarts and temporary homes. A turn that was STARTED counts (conservative: it may have cost money even if it
 * later failed). `prime` opens a warm session without a model turn and does not count.
 *
 * Fail closed: an unreadable, corrupt or unwritable ledger, a missing/relative ledger path or an invalid cap refuses every
 * turn. The refusal happens before `inner.start`, so the CLI is never spawned.
 *
 * Contract: persona-spec/contracts/real-turn-cap.md
 */

import {
  closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import type { RunHandle, Runner, StartTurnInput } from '../contract.ts'

/** Integer >= 1. Turns the cap on. */
export const REAL_TURN_CAP_ENV = 'PERSONA_REAL_TURN_CAP'
/** Absolute file path of the persistent ledger (outside any temporary Persona home). */
export const REAL_TURN_LEDGER_ENV = 'PERSONA_REAL_TURN_LEDGER'

export type RealTurnCapReason = 'cap_reached' | 'misconfigured' | 'ledger_unavailable' | 'ledger_corrupt'

const REACHED = (used: number, cap: number): string =>
  `Precisa de você: o limite de execuções reais desta rodada foi atingido (${String(used)} de ${String(cap)}). Nada foi iniciado.`
const UNCHECKABLE = 'Precisa de você: não consegui conferir o limite de execuções reais desta rodada, então não iniciei nada.'

/** Refusal raised before a real turn starts. The message is user-facing pt-BR with no technical detail. */
export class RealTurnCapError extends Error {
  readonly code = 'real_turn_cap' as const
  readonly reason: RealTurnCapReason
  readonly used?: number
  readonly cap?: number

  /**
   * @param reason - Why the turn was refused.
   * @param counts - Turns already reserved and the cap, when known.
   */
  constructor(reason: RealTurnCapReason, counts: { used?: number; cap?: number } = {}) {
    super(reason === 'cap_reached' && counts.used !== undefined && counts.cap !== undefined
      ? REACHED(counts.used, counts.cap)
      : UNCHECKABLE)
    this.name = 'RealTurnCapError'
    this.reason = reason
    if (counts.used !== undefined) this.used = counts.used
    if (counts.cap !== undefined) this.cap = counts.cap
  }

  /** The engine stores `String(error)` as the delivery failure shown to the person: no class name, just the sentence. */
  override toString(): string {
    return this.message
  }
}

/**
 * @param error - Caught value.
 * @returns true for a refusal by the real-turn cap.
 */
export function isRealTurnCapError(error: unknown): error is RealTurnCapError {
  return error instanceof RealTurnCapError
}

export interface RealTurnCapOptions {
  /** Maximum model turns, across restarts. Anything but an integer >= 1 refuses everything. */
  readonly cap: number
  /** Absolute path of the ledger file. Missing or relative refuses everything. */
  readonly ledgerPath: string | undefined
  readonly now?: () => Date
}

interface LedgerEntry {
  readonly at: string
  readonly kind: 'start' | 'resume'
  readonly ticketId: string
  readonly assignmentId: string
  readonly personaId: string
}

interface Ledger {
  readonly version: 1
  readonly turns: number
  readonly entries: readonly LedgerEntry[]
}

const MAX_ENTRIES = 100
const LOCK_WAIT_MS = 5_000
const LOCK_POLL_MS = 25
const LOCK_STALE_MS = 30_000
const RENAME_TRIES = 8

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Exclusive cross-process lock: `wx` create is atomic. A lock older than LOCK_STALE_MS belongs to a dead process. */
function acquireLock(lockPath: string): () => void {
  const deadline = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx')
      closeSync(fd)
      return () => { try { unlinkSync(lockPath) } catch { /* already gone */ } }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new RealTurnCapError('ledger_unavailable')
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) unlinkSync(lockPath)
      } catch { /* raced with the owner releasing it */ }
      if (Date.now() >= deadline) throw new RealTurnCapError('ledger_unavailable')
      sleepSync(LOCK_POLL_MS)
    }
  }
}

function readLedger(path: string): Ledger {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    // A ledger that does not exist yet is an empty one; anything else (directory, permission, I/O) is unreadable.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, turns: 0, entries: [] }
    throw new RealTurnCapError('ledger_unavailable')
  }
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new RealTurnCapError('ledger_corrupt') }
  if (typeof value !== 'object' || value === null) throw new RealTurnCapError('ledger_corrupt')
  const record = value as Record<string, unknown>
  if (record.version !== 1 || typeof record.turns !== 'number' || !Number.isInteger(record.turns) || record.turns < 0
    || !Array.isArray(record.entries)) {
    throw new RealTurnCapError('ledger_corrupt')
  }
  return { version: 1, turns: record.turns, entries: record.entries as LedgerEntry[] }
}

/** Write to a sibling temp file, flush it, then rename over the ledger (readers never see a partial file). */
function writeLedgerAtomic(path: string, ledger: Ledger): void {
  const tmp = `${path}.${String(process.pid)}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    const fd = openSync(tmp, 'wx')
    try {
      writeFileSync(fd, `${JSON.stringify(ledger)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        renameSync(tmp, path)
        return
      } catch (error) {
        // Windows: an antivirus/indexer can briefly hold the target.
        const code = (error as NodeJS.ErrnoException).code
        if (attempt >= RENAME_TRIES || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error
        sleepSync(20 * attempt)
      }
    }
  } catch {
    try { unlinkSync(tmp) } catch { /* nothing to clean */ }
    throw new RealTurnCapError('ledger_unavailable')
  }
}

/**
 * Reserve one model turn in the ledger, or refuse. Synchronous on purpose: no await between the read and the write,
 * so concurrent callers in one process cannot both see the same count.
 * @param options - Cap and ledger path.
 * @param meta - Who is starting the turn (audit trail).
 * @returns Turns used including this one.
 * @throws RealTurnCapError when the turn must not start.
 */
export function reserveRealTurn(
  options: RealTurnCapOptions,
  meta: { kind: 'start' | 'resume'; input: StartTurnInput },
): number {
  const { cap, ledgerPath } = options
  if (!Number.isInteger(cap) || cap < 1) throw new RealTurnCapError('misconfigured')
  if (typeof ledgerPath !== 'string' || ledgerPath.length === 0 || !isAbsolute(ledgerPath)) {
    throw new RealTurnCapError('misconfigured')
  }
  let release: (() => void) | undefined
  try {
    mkdirSync(dirname(ledgerPath), { recursive: true })
    release = acquireLock(`${ledgerPath}.lock`)
    const ledger = readLedger(ledgerPath)
    if (ledger.turns >= cap) throw new RealTurnCapError('cap_reached', { used: ledger.turns, cap })
    const entry: LedgerEntry = {
      at: (options.now ?? (() => new Date()))().toISOString(),
      kind: meta.kind,
      ticketId: meta.input.ticketId,
      assignmentId: meta.input.assignmentId,
      personaId: meta.input.personaId,
    }
    const turns = ledger.turns + 1
    writeLedgerAtomic(ledgerPath, { version: 1, turns, entries: [...ledger.entries, entry].slice(-MAX_ENTRIES) })
    return turns
  } catch (error) {
    if (error instanceof RealTurnCapError) throw error
    throw new RealTurnCapError('ledger_unavailable')
  } finally {
    release?.()
  }
}

/**
 * Wrap a REAL CLI runner so no model turn starts past the cap. Counting happens before delegating.
 * @param inner - The CLI runner.
 * @param options - Cap and ledger path.
 */
export function withRealTurnCap(inner: Runner, options: RealTurnCapOptions): Runner {
  const gate = (kind: 'start' | 'resume', method: (input: StartTurnInput) => Promise<RunHandle>) =>
    async (input: StartTurnInput): Promise<RunHandle> => {
      reserveRealTurn(options, { kind, input })
      return method(input)
    }
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: gate('start', input => inner.start(input)),
    startTurn: gate('start', input => inner.startTurn(input)),
    stream: handle => inner.stream(handle),
    events: handle => inner.events(handle),
    cancel: handle => inner.cancel(handle),
    resume: gate('resume', input => inner.resume(input)),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

/**
 * Read the cap from the environment.
 * @param env - Process environment.
 * @returns undefined when `PERSONA_REAL_TURN_CAP` is unset (no effect); otherwise the options. A set but invalid value
 *   (empty, 0, negative, fractional, text) yields `cap: 0`, which refuses every turn.
 */
export function realTurnCapFromEnv(env: NodeJS.ProcessEnv): RealTurnCapOptions | undefined {
  const raw = env[REAL_TURN_CAP_ENV]
  if (raw === undefined) return undefined
  const cap = /^[0-9]+$/u.test(raw.trim()) ? Number(raw.trim()) : 0
  return { cap, ledgerPath: env[REAL_TURN_LEDGER_ENV] }
}
