/**
 * The shared paid-turn budget of the real run (D-069), as PURE functions: the attempt history in, the validated attempts / spent
 * turns / problems out. No file access, no environment. Fail closed: anything that is not a well-formed attempt is a problem and the
 * caller must refuse to spend (a negative count edited by hand must never reopen balance).
 */

/** One attempt as persisted in `real-attempts.json`. */
export interface BudgetAttempt {
  readonly at: string
  readonly nsisCommit: string | null
  readonly sha256: string
  outcome: string
  /** Rows the app's `turn_ledger` booked for this attempt; `null` = could not be read. */
  paidTurns: number | null
  /** Turns the app's own limiter ledger recorded; `null`/absent = unknown. */
  capTurns?: number | null
  capLedger?: string
}

/** Authorization ceilings (Atlas D-069): 3 paid turns and 3 attempts in total. */
export const REAL_RUN_MAX_PAID_TURNS = 3
export const REAL_RUN_MAX_ATTEMPTS = 3
/** The verifier accepts at most ONE paid turn in each attempt of the whole history (`attempt-turn-budget`); equals FIRST_DELIVERY_MAX_PAID_TURNS. */
export const REAL_RUN_MAX_TURNS_PER_ATTEMPT = 1

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export interface AttemptsAssessment {
  /** Well-formed attempts (empty when `problems` is not). */
  readonly attempts: readonly BudgetAttempt[]
  readonly problems: readonly string[]
}

/**
 * @param raw - The parsed content of `real-attempts.json` (any shape).
 * @returns The attempts, or the reasons the history cannot be trusted.
 */
export function assessAttempts(raw: unknown): AttemptsAssessment {
  if (!Array.isArray(raw)) return { attempts: [], problems: ['the attempt history is not a list'] }
  const problems: string[] = []
  const attempts: BudgetAttempt[] = []
  raw.forEach((row: unknown, index: number) => {
    const label = `attempt ${String(index + 1)}`
    if (row === null || typeof row !== 'object' || Array.isArray(row)) { problems.push(`${label} is not an object`); return }
    const record = row as Record<string, unknown>
    if (typeof record.at !== 'string' || record.at === '') problems.push(`${label}: at is missing`)
    if (typeof record.sha256 !== 'string' || record.sha256 === '') problems.push(`${label}: sha256 is missing`)
    if (typeof record.outcome !== 'string' || record.outcome === '') problems.push(`${label}: outcome is missing`)
    if (record.paidTurns !== null && !isCount(record.paidTurns)) problems.push(`${label}: paidTurns is not a non-negative integer or null (${JSON.stringify(record.paidTurns)})`)
    if (record.paidTurns === undefined) problems.push(`${label}: paidTurns is absent`)
    if (record.capTurns !== undefined && record.capTurns !== null && !isCount(record.capTurns)) problems.push(`${label}: capTurns is not a non-negative integer or null (${JSON.stringify(record.capTurns)})`)
    if (record.nsisCommit !== null && record.nsisCommit !== undefined && typeof record.nsisCommit !== 'string') problems.push(`${label}: nsisCommit is not text`)
    attempts.push(record as unknown as BudgetAttempt)
  })
  return problems.length === 0 ? { attempts, problems } : { attempts: [], problems }
}

/**
 * Paid turns an attempt is charged: what its ledger booked, what the app's limiter booked, whichever is larger, and ONE when
 * neither could be read (a crash may still have spent).
 * @param attempt - A validated attempt.
 */
export function chargedTurns(attempt: Pick<BudgetAttempt, 'paidTurns' | 'capTurns'>): number {
  return Math.max(attempt.paidTurns ?? 1, attempt.capTurns ?? 0)
}

/**
 * @param attempts - Validated attempts.
 * @returns Paid turns spent so far across every attempt.
 */
export function spentTurns(attempts: readonly Pick<BudgetAttempt, 'paidTurns' | 'capTurns'>[]): number {
  return attempts.reduce((total, attempt) => total + chargedTurns(attempt), 0)
}

/** Why a new attempt may not start (empty = allowed). `perAttempt` is the turns one attempt is expected to cost. */
export function refusalsForNextAttempt(attempts: readonly BudgetAttempt[], perAttempt: number): string[] {
  const refusals: string[] = []
  if (attempts.length >= REAL_RUN_MAX_ATTEMPTS) refusals.push(`${String(attempts.length)} attempts already used (max ${String(REAL_RUN_MAX_ATTEMPTS)})`)
  if (attempts.some(attempt => attempt.outcome === 'delivered')) refusals.push('an earlier attempt already delivered: stop at the first green')
  // A history holding an attempt that cost more than one turn can never close green: the verifier rejects it for ever
  // (attempt-turn-budget), so a new attempt would spend a paid turn for nothing. Stop and ask the owner instead.
  const overspent = attempts.findIndex(attempt => chargedTurns(attempt) > REAL_RUN_MAX_TURNS_PER_ATTEMPT)
  if (overspent >= 0) {
    refusals.push(`attempt ${String(overspent + 1)} was charged ${String(chargedTurns(attempts[overspent]!))} paid turns (max ${String(REAL_RUN_MAX_TURNS_PER_ATTEMPT)} per attempt): the verifier rejects this history for ever (attempt-turn-budget), a new attempt cannot close green; ask Keel/Atlas`)
  }
  const spent = spentTurns(attempts)
  if (spent + perAttempt > REAL_RUN_MAX_PAID_TURNS) refusals.push(`${String(spent)} paid turn(s) already charged, ${String(perAttempt)} more would pass the ${String(REAL_RUN_MAX_PAID_TURNS)}-turn total`)
  return refusals
}

/**
 * The history as the verifier must see it: every settled attempt with a KNOWN `paidTurns` equal to what the guard charges it, so the
 * guard and the verifier can never disagree (an unreadable ledger is charged 1, not "corrupt"). The current attempt is the last row and
 * is charged at least what the app's own limiter recorded.
 * @param attempts - Validated attempts, the current one last.
 */
export function attemptsForVerifier(attempts: readonly BudgetAttempt[]): { paidTurns: number }[] {
  return attempts.map(attempt => ({ paidTurns: chargedTurns(attempt) }))
}
