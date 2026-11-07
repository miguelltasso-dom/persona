/**
 * The paid-turn budget of the REAL team round (TEAM-10, Atlas 05/11 via Keel): ONE attempt with a ceiling of 14 turns; if it fails, at most ONE more attempt, only after an
 * OFFLINE diagnosis, and the TOTAL of both stays at 25 turns or less. The numbers come from the authorization file, never from code. Pure: it reads nothing, so every
 * refusal is testable; the spec persists the attempts in `artifacts/team10/real-attempts.json` and a file that cannot be trusted FAILS CLOSED (an empty list would reopen
 * the whole budget).
 */

export interface Team10Authorization {
  /** `Teto de turnos: N` — the ceiling of EACH attempt (also the app limiter's cap), shrunk to what the total leaves. */
  readonly firstCap: number
  /** `Total máximo: N` — the most turns ALL the attempts may spend together (the attempt-3 OK says "17 de 25": 3 already spent + 14). */
  readonly total: number
  /**
   * The highest attempt number this text authorizes. The original OK (05/11) covers two attempts and names none; a later attempt has its OWN written OK that names it
   * ("TENTATIVA 3", `atlas-ok-team10-3.txt`, Atlas 07/11) — never a bigger constant in code.
   */
  readonly maxAttempts: number
}

/** Where Atlas's written OK for an attempt lives (`.maestri/tmp/`): the first two attempts share the original file; every later attempt has its own. */
export function authorizationFileName(attemptNumber: number): string {
  return attemptNumber <= 2 ? 'atlas-ok-team10.txt' : `atlas-ok-team10-${String(attemptNumber)}.txt`
}

/** The number of the attempt the NEXT real round would be (a round the preflight refused does not count). */
export function nextAttemptNumber(attempts: readonly Team10Attempt[]): number {
  return attempts.filter(attempt => attempt.outcome !== 'refused').length + 1
}

/** `refused` = the preflight stopped the round BEFORE the request was posted (nothing was asked of the model): it spends nothing and does not use up an attempt. */
export type Team10Outcome = 'started' | 'passed' | 'failed' | 'overbudget' | 'unverified' | 'refused'

export interface Team10Attempt {
  readonly at: string
  /** The cap this attempt ran with (the limiter's `PERSONA_REAL_TURN_CAP`). */
  readonly cap: number
  /** Paid turns the measured ledger holds; `null` = it could not be read (then the whole cap counts as spent). */
  paidTurns: number | null
  outcome: Team10Outcome
  readonly ledgerFile: string
}

/** Attempts the ORIGINAL OK covers when its text names none. */
const ORIGINAL_ATTEMPTS = 2
const OUTCOMES: readonly string[] = ['started', 'passed', 'failed', 'overbudget', 'unverified', 'refused']

/** @returns The numbers of the authorization text, or the problems naming what is missing. */
export function parseTeam10Authorization(text: string): { authorization?: Team10Authorization; problems: string[] } {
  const number = (pattern: RegExp): number | undefined => {
    const match = pattern.exec(text)
    if (match === null) return undefined
    const value = Number(match[1])
    return Number.isInteger(value) && value >= 1 && value <= 100 ? value : undefined
  }
  const firstCap = number(/Teto de turnos\s*[:=]\s*(\d{1,3})\b/iu)
  const total = number(/Total m[áa]ximo\s*[:=]\s*(\d{1,3})\b/iu)
  const problems: string[] = []
  if (!/TEAM-10/u.test(text)) problems.push('the authorization does not name TEAM-10')
  if (firstCap === undefined) problems.push('the authorization has no "Teto de turnos: <n>" line (ceiling of the first attempt)')
  if (total === undefined) problems.push('the authorization has no "Total máximo: <n>" line (turns both attempts may spend together)')
  if (firstCap !== undefined && total !== undefined && firstCap > total) problems.push(`the first ceiling (${String(firstCap)}) is above the total (${String(total)})`)
  // "TENTATIVA 3" in the text = the OK of THAT attempt (and of the ones before it); no such words = the original OK of two attempts.
  const named = /TENTATIVA\s+(\d)\b/iu.exec(text)
  const maxAttempts = named === null ? ORIGINAL_ATTEMPTS : Math.max(ORIGINAL_ATTEMPTS, Number(named[1]))
  return problems.length > 0 || firstCap === undefined || total === undefined ? { problems } : { authorization: { firstCap, total, maxAttempts }, problems }
}

/** Absent file = no attempts yet (the caller passes `undefined`); present but malformed = problems (fail closed). */
export function assessTeam10Attempts(raw: unknown): { attempts: Team10Attempt[]; problems: string[] } {
  if (raw === undefined) return { attempts: [], problems: [] }
  if (!Array.isArray(raw)) return { attempts: [], problems: ['the attempts file is not a list'] }
  const attempts: Team10Attempt[] = []
  const problems: string[] = []
  raw.forEach((row: unknown, index: number) => {
    const item = row as Partial<Team10Attempt> | null
    if (item === null || typeof item !== 'object') { problems.push(`attempt ${String(index + 1)} is not an object`); return }
    if (typeof item.at !== 'string' || typeof item.cap !== 'number' || !Number.isInteger(item.cap) || item.cap < 1) { problems.push(`attempt ${String(index + 1)} has no valid date/cap`); return }
    if (typeof item.outcome !== 'string' || !OUTCOMES.includes(item.outcome)) { problems.push(`attempt ${String(index + 1)} has an unknown outcome`); return }
    if (item.paidTurns !== null && (typeof item.paidTurns !== 'number' || !Number.isInteger(item.paidTurns) || item.paidTurns < 0)) { problems.push(`attempt ${String(index + 1)} has an invalid paidTurns`); return }
    attempts.push({ at: item.at, cap: item.cap, paidTurns: item.paidTurns ?? null, outcome: item.outcome as Team10Outcome, ledgerFile: typeof item.ledgerFile === 'string' ? item.ledgerFile : '' })
  })
  return { attempts, problems }
}

/** Turns an attempt is charged: what its ledger booked; an attempt that never settled (or whose ledger is unreadable) is charged its WHOLE cap. */
export function chargedTurns(attempt: Team10Attempt): number {
  return attempt.paidTurns === null ? attempt.cap : Math.max(attempt.paidTurns, 0)
}

export function spentTurns(attempts: readonly Team10Attempt[]): number {
  return attempts.reduce((sum, attempt) => sum + chargedTurns(attempt), 0)
}

export interface NextAttemptPlan {
  readonly allowed: boolean
  readonly problems: readonly string[]
  /** 1-based number of the attempt this plan is for. */
  readonly attemptNumber: number
  /** The cap to give the limiter; `0` when not allowed. */
  readonly cap: number
  readonly spentSoFar: number
}

/**
 * @param attempts - Earlier attempts, oldest first.
 * @param authorization - The two numbers Atlas wrote.
 * @param diagnosed - `PERSONA_REAL_E2E_DIAGNOSED`: what the OFFLINE diagnosis of the previous failure found (required from the 2nd attempt on).
 */
export function planNextTeam10Attempt(attempts: readonly Team10Attempt[], authorization: Team10Authorization, diagnosed: string | undefined): NextAttemptPlan {
  const spent = spentTurns(attempts)
  // A round the preflight refused before any request used no attempt (its turns, if the file ever says so, are still charged above).
  const attemptNumber = nextAttemptNumber(attempts)
  const problems: string[] = []
  if (attempts.some(attempt => attempt.outcome === 'passed')) problems.push('the round already PASSED: it is not repeated')
  if (attemptNumber > authorization.maxAttempts) problems.push(`${String(authorization.maxAttempts)} attempt(s) are authorized and ${String(attemptNumber - 1)} were already made: attempt ${String(attemptNumber)} needs its own written OK from Atlas (.maestri/tmp/${authorizationFileName(attemptNumber)} naming "TENTATIVA ${String(attemptNumber)}")`)
  const remaining = authorization.total - spent
  if (remaining < 1) problems.push(`the budget is spent (${String(spent)} of ${String(authorization.total)} turns charged)`)
  if (attemptNumber > 1 && (diagnosed ?? '').trim() === '') problems.push('from the 2nd attempt on, PERSONA_REAL_E2E_DIAGNOSED must say what the OFFLINE diagnosis of the failure found (never repeat straight after a failure)')
  // Atlas 07/11: the 2nd attempt ALSO has the ceiling of 14 ("teto 14; total <= 25"), not "whatever is left": the cap of every attempt is the written ceiling, shrunk to what remains.
  const cap = authorization.firstCap
  if (problems.length > 0) return { allowed: false, problems, attemptNumber, cap: 0, spentSoFar: spent }
  return { allowed: true, problems, attemptNumber, cap: Math.min(cap, remaining), spentSoFar: spent }
}
