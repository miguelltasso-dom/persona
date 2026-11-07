/**
 * The gate of the REAL team round (TEAM-10, D-090 acceptance b). It spends the user's quota, so it refuses unless ALL of this holds — and the ceiling of
 * paid turns comes from Atlas's own authorization file at the time, never from a default in code:
 *
 *   - `PERSONA_REAL_E2E=1` and `PERSONA_REAL_E2E_OK=TEAM-10`;
 *   - `.maestri/tmp/atlas-ok-team10.txt` exists, names `TEAM-10` and carries a line `Teto de turnos: <n>` (1–40); that `n` is the ceiling the limiter gets;
 *   - `PERSONA_INSTALLED_EXE` is the exe under test and `PERSONA_NSIS_COMMIT` its commit;
 *   - the fake round was GREEN on this very exe (same sha256) — checked by the caller, passed in as `fakeGreenProblem`;
 *   - the app is launched with the team opt-in (`PERSONA_TEAMWORK=1`, `PERSONA_FANOUT=1`, `PERSONA_PRODUCT_TOOLS=1` — the last offers persona_ask / ask-for-opinion to CLI workers; Bolt 05/11) and a CLEAN environment (no test-mode variables, no fake CLI);
 *   - answer-only is the default in the exe under test (`answerOnlyDefault`, declared by the caller from the exe's own proof): in the native mode a call weighs ~309 mil
 *     tokens and the round would cost millions.
 * Pure: it reads nothing and returns the problems, so every refusal is testable.
 */

export interface TeamRoundGateInput {
  readonly env: Readonly<Record<string, string | undefined>>
  /** Text of the Atlas authorization file, or `undefined` when it does not exist. */
  readonly authorization: string | undefined
  readonly exeExists: boolean
  /** Why the fake round does not count on this exe (see `fakeGreenProblem`), or `undefined` when it does. */
  readonly fakeGreenProblem: string | undefined
  /** The exe under test has answer-only ON by default (AO-1). `undefined` = not established. */
  readonly answerOnlyDefault: boolean | undefined
}

export interface TeamRoundGate {
  readonly allowed: boolean
  readonly problems: readonly string[]
  /** The ceiling of paid turns Atlas wrote; `undefined` when the file has none (then not allowed). */
  readonly ceilingTurns: number | undefined
}

const MAX_CEILING = 40

/** @returns The ceiling written in the authorization (`Teto de turnos: 14`), or `undefined`. */
export function ceilingFromAuthorization(text: string): number | undefined {
  const match = /Teto(?: de (?:turnos|chamadas))?\s*[:=]\s*(\d{1,3})\b/iu.exec(text)
  if (match === null) return undefined
  const value = Number(match[1])
  return Number.isInteger(value) && value >= 1 && value <= MAX_CEILING ? value : undefined
}

/**
 * @param input - Environment, authorization text, exe presence, fake-green status and the answer-only declaration.
 * @returns Every reason the real team round must NOT start; `allowed` only when there is none.
 */
export function evaluateTeamRoundGate(input: TeamRoundGateInput): TeamRoundGate {
  const problems: string[] = []
  const { env } = input
  if (env.PERSONA_REAL_E2E !== '1') problems.push('PERSONA_REAL_E2E=1 is not set')
  if (env.PERSONA_REAL_E2E_OK !== 'TEAM-10') problems.push('PERSONA_REAL_E2E_OK=TEAM-10 is not set')

  let ceilingTurns: number | undefined
  if (input.authorization === undefined) {
    problems.push('no Atlas authorization file (.maestri/tmp/atlas-ok-team10.txt): there is no OK and no ceiling')
  } else {
    if (!/TEAM-10/u.test(input.authorization)) problems.push('the authorization file does not name TEAM-10')
    ceilingTurns = ceilingFromAuthorization(input.authorization)
    if (ceilingTurns === undefined) problems.push(`the authorization file has no valid "Teto de turnos: <1–${String(MAX_CEILING)}>" line`)
    // The ceiling must be what the limiter is told: a different PERSONA_REAL_TURN_CAP in the environment is refused, never silently overridden.
    const cap = env.PERSONA_REAL_TURN_CAP
    if (cap !== undefined && cap !== '' && ceilingTurns !== undefined && Number(cap) !== ceilingTurns) {
      problems.push(`PERSONA_REAL_TURN_CAP=${cap} disagrees with the authorized ceiling (${String(ceilingTurns)}): the harness sets the cap itself`)
    }
  }

  if (!input.exeExists || (env.PERSONA_INSTALLED_EXE ?? '') === '') problems.push('PERSONA_INSTALLED_EXE does not point to an existing exe')
  if ((env.PERSONA_NSIS_COMMIT ?? '') === '') problems.push('PERSONA_NSIS_COMMIT is not set: the proof must say which build it is')
  if (input.fakeGreenProblem !== undefined) problems.push(`the fake round is not green on this exe: ${input.fakeGreenProblem}`)
  // `answerOnlyDefault` = "the exe ISOLATES by default" (answer-only before D-096, `needed` after it — a round without connector weighs the same in both; Tally 05/11).
  if (input.answerOnlyDefault !== true) {
    problems.push(input.answerOnlyDefault === false
      ? 'the exe does NOT isolate by default (neither answer-only nor needed): in the native mode each call weighs ~309 mil tokens and the round would cost millions'
      : 'an isolated default (answer-only, or needed since D-096) was not established for this exe')
  }

  // The environment the app will get must be a user's: no test mode, no fake CLI pins.
  for (const name of Object.keys(env)) {
    if (/^VITEST/iu.test(name) || /^PERSONA_SCRIPTED/iu.test(name) || /SCRIPTED_STREAM/iu.test(name)) problems.push(`test-mode variable in the environment: ${name}`)
    if (/^OAR_.*_BIN$/u.test(name) || name === 'PERSONA_E2E_EXTRA_PATH') problems.push(`fake CLI pin in the environment: ${name}`)
  }
  if (env.NODE_ENV === 'test') problems.push('NODE_ENV=test in the environment')

  return { allowed: problems.length === 0, problems, ceilingTurns }
}

/** The opt-in the app needs to show/produce the team behaviours (Flint/Keel/Anvil, 05/11): passed to the exe, recorded in the proof. */
export const TEAM_ROUND_APP_ENV: Readonly<Record<string, string>> = { PERSONA_TEAMWORK: '1', PERSONA_FANOUT: '1', PERSONA_PRODUCT_TOOLS: '1' }
