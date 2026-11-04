/**
 * Runs Forge's PURE `verifyRealFirstDeliveryRun` over one run's evidence (D-069, persona-spec/contracts/first-delivery-real-proof.md)
 * through `scripts/verify-real-run.ts`, in a child process, on a COPY of the run's database. The harness only converts and forwards:
 * the verdict that decides acceptance is the verifier's `passed`, never the UI nor `run.passed` alone. Any failure to run or parse the
 * verifier is a failed verdict (fail closed), never an empty one.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalLedgerRows, type LedgerEvidence } from './ledger-evidence.ts'
import { PACKAGE_ROOT, REPO_ROOT } from './paths.ts'

export interface RealRunVerdict {
  readonly passed: boolean
  readonly failed: readonly string[]
  /** The verifier's full result (counts stay null when unknown) and a payload-free observation summary. */
  readonly detail: unknown
}

export interface RealRunVerifierInput {
  /** `PERSONA_HOME` of the run (database at `<home>/db/persona.db`). */
  readonly home: string
  /** Scratch directory for the input/output JSON (e.g. the recorder's directory). */
  readonly dir: string
  /** The ledger read after the app stopped; `null` = unreadable (the verifier then fails closed). */
  readonly ledger: LedgerEvidence | null
  /** The WHOLE authorization history including the current attempt, `paidTurns` per settled row (null = unknown). */
  readonly attempts: readonly { readonly paidTurns: number | null }[]
  /** 1-based, must be the last attempt. */
  readonly currentAttempt: number
  /** t1 − t0 of the run (ms). */
  readonly elapsedMs: number
  /** CLIs that report a logged-in account, asked independently of the run (NOT derived from the ledger). */
  readonly loggedCli?: readonly string[]
  readonly maxElapsedMs: number
}

/**
 * @param input - Evidence of the run (see {@link RealRunVerifierInput}).
 * @returns The verifier's verdict; `passed` is true only when Forge's verifier says so.
 */
export function runRealRunVerifier(input: RealRunVerifierInput): RealRunVerdict {
  const inputFile = join(input.dir, 'verifier-input.json')
  const outputFile = join(input.dir, 'verifier-output.json')
  writeFileSync(inputFile, `${JSON.stringify({
    ledger: input.ledger === null ? null : canonicalLedgerRows(input.ledger.rawRows),
    attempts: input.attempts.map(attempt => ({ paidTurns: attempt.paidTurns })),
    currentAttempt: input.currentAttempt,
    elapsedMs: input.elapsedMs,
    maxElapsedMs: input.maxElapsedMs,
    ...(input.loggedCli === undefined ? {} : { loggedCli: [...input.loggedCli] }),
  }, null, 2)}\n`)
  try {
    execFileSync(process.execPath, [
      '--import', 'tsx/esm', join(PACKAGE_ROOT, 'scripts', 'verify-real-run.ts'),
      '--home', input.home, '--input', inputFile, '--out', outputFile,
    ], { cwd: REPO_ROOT, stdio: 'ignore', timeout: 150_000 })
    const parsed = JSON.parse(readFileSync(outputFile, 'utf8')) as { passed?: unknown; result?: { failed?: unknown }; failed?: unknown }
    const failed = Array.isArray(parsed.result?.failed) ? parsed.result.failed as string[] : (Array.isArray(parsed.failed) ? parsed.failed as string[] : [])
    return { passed: parsed.passed === true, failed, detail: parsed }
  } catch (error) {
    return { passed: false, failed: ['verifier-error'], detail: { error: error instanceof Error ? error.message.slice(0, 300) : String(error) } }
  }
}
