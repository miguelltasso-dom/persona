/**
 * The gate of the REAL team round on the TREE host through the web harness (TEAM-10, Atlas 05/11 03:03 via Keel). It spends the user's quota, so it refuses unless ALL holds:
 *   - `PERSONA_REAL_E2E=1` and `PERSONA_REAL_E2E_OK=TEAM-10`, and Atlas's file `.maestri/tmp/atlas-ok-team10.txt` names TEAM-10 with `Teto de turnos: 14` and `Total máximo: 25`;
 *   - the budget allows another attempt (`team-round-budget.ts`: the 2nd only after an OFFLINE diagnosis, both together within the total);
 *   - the FAKE round was green on this very configuration (`artifacts/team10/fake-proof.json`, same git commit and same tree fingerprint);
 *   - the isolation default is answer-only (`PERSONA_CLI_ENV` unset or `answer-only`; `native`/`needed` change what a call weighs and what it can load);
 *   - the host will get a CLEAN environment: no test-mode variable, no fake CLI pin, no connector and no external-write opt-in.
 * Pure: it reads nothing, so every refusal is testable.
 */
import { assessTeam10Attempts, parseTeam10Authorization, planNextTeam10Attempt, type NextAttemptPlan, type Team10Attempt } from './team-round-budget.ts'

export interface TreeRoundGateInput {
  readonly env: Readonly<Record<string, string | undefined>>
  /** Text of Atlas's authorization file, or `undefined` when it does not exist. */
  readonly authorization: string | undefined
  /** The attempts file as parsed JSON; `undefined` when it does not exist. */
  readonly attemptsRaw: unknown
  /** Why the fake round does not count for this configuration (`fakeConfigProblem`), or `undefined` when it does. */
  readonly fakeGreenProblem: string | undefined
}

export interface TreeRoundGate {
  readonly allowed: boolean
  readonly problems: readonly string[]
  readonly plan: NextAttemptPlan | undefined
  readonly attempts: readonly Team10Attempt[]
}

/** Variables that would make the round something else than the user's own app on the user's own engine. */
const FORBIDDEN_VARIABLES: readonly RegExp[] = [
  /^VITEST/iu, /^PERSONA_SCRIPTED/iu, /SCRIPTED_STREAM/iu, /^OAR_.*_BIN$/u, /^FAKE_CLI_/u,
  /^PERSONA_E2E_EXTRA_PATH$/u, /^PERSONA_HOST_FLAGS$/u, /^PERSONA_PRODUCT_CONNECTORS/u, /^PERSONA_EXTERNAL_WRITE/u,
]

/**
 * @param env - The environment the HOST will get (already cleaned of Vitest's own variables by the caller: it passes `cleanChildEnv(process.env)` plus its overrides).
 */
export function evaluateTreeRoundGate(input: TreeRoundGateInput): TreeRoundGate {
  const problems: string[] = []
  const { env } = input
  if (env.PERSONA_REAL_E2E !== '1') problems.push('PERSONA_REAL_E2E=1 is not set')
  if (env.PERSONA_REAL_E2E_OK !== 'TEAM-10') problems.push('PERSONA_REAL_E2E_OK=TEAM-10 is not set')

  let plan: NextAttemptPlan | undefined
  const assessed = assessTeam10Attempts(input.attemptsRaw)
  for (const problem of assessed.problems) problems.push(`attempts file: ${problem} (fail closed: ask Keel before touching it)`)
  if (input.authorization === undefined) {
    problems.push('no Atlas authorization file (.maestri/tmp/atlas-ok-team10.txt): there is no OK and no ceiling')
  } else {
    const parsed = parseTeam10Authorization(input.authorization)
    problems.push(...parsed.problems)
    if (parsed.authorization !== undefined && assessed.problems.length === 0) {
      plan = planNextTeam10Attempt(assessed.attempts, parsed.authorization, env.PERSONA_REAL_E2E_DIAGNOSED)
      problems.push(...plan.problems)
      const cap = env.PERSONA_REAL_TURN_CAP
      // The harness gives the limiter the cap of THIS attempt itself: a different value in the environment is refused, never silently overridden.
      if (plan.allowed && cap !== undefined && cap !== '' && Number(cap) !== plan.cap) problems.push(`PERSONA_REAL_TURN_CAP=${cap} disagrees with the cap of this attempt (${String(plan.cap)}): the harness sets it`)
    }
  }
  if (input.fakeGreenProblem !== undefined) problems.push(`the fake round is not green on this configuration: ${input.fakeGreenProblem}`)

  // D-096 (Tally 05:40): the default isolation is `needed` from the 2nd host window on (`answer-only` before it). A round WITHOUT connector costs the same in both (the worker runs
  // with no native tools, isolated); what is refused is `native` (the person's own tools and connectors loaded) or anything else.
  const isolation = env.PERSONA_CLI_ENV
  if (isolation !== undefined && isolation !== '' && isolation !== 'answer-only' && isolation !== 'needed') problems.push(`PERSONA_CLI_ENV=${isolation}: the round runs in the product's default isolation (needed, or answer-only before D-096), not another`)
  for (const name of Object.keys(env)) {
    if (name === 'PERSONA_REAL_E2E' || name === 'PERSONA_REAL_E2E_OK' || name === 'PERSONA_REAL_E2E_DIAGNOSED') continue
    if (FORBIDDEN_VARIABLES.some(pattern => pattern.test(name))) problems.push(`forbidden variable in the host environment: ${name}`)
  }
  if (env.NODE_ENV === 'test') problems.push('NODE_ENV=test in the host environment')

  return { allowed: problems.length === 0, problems, plan, attempts: assessed.attempts }
}

/**
 * The fake rehearsal's proof must be about THIS configuration: same git commit, same fingerprint of the tree (modified files + sizes/mtimes of what the round runs), same engine
 * settings. Anything else means "green on something that is not what will run".
 * @returns Why the fake proof does not count, or `undefined`.
 */
export function fakeConfigProblem(fakeProof: unknown, current: { readonly commit: string; readonly fingerprint: string; readonly personas: number }): string | undefined {
  if (fakeProof === undefined || fakeProof === null || typeof fakeProof !== 'object') return 'no fake rehearsal proof (artifacts/team10/fake-proof.json)'
  const proof = fakeProof as { green?: unknown; commit?: unknown; fingerprint?: unknown; personas?: unknown; engine?: unknown }
  if (proof.engine !== 'fake') return 'the proof is not from the fake engine'
  if (proof.green !== true) return 'the fake rehearsal was not green'
  if (proof.commit !== current.commit) return `the fake proof is for another commit (${String(proof.commit)} ≠ ${current.commit})`
  if (proof.fingerprint !== current.fingerprint) return 'the tree changed after the fake rehearsal (fingerprint differs): run the fake again'
  if (proof.personas !== current.personas) return `the fake rehearsal seeded ${String(proof.personas)} persona(s), the real round ${String(current.personas)}`
  return undefined
}
