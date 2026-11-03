/**
 * F3 real CLI: resolveRunner(claude/haiku), ≤10 execs/round, two rounds.
 * Run: PERSONA_REAL_CLI=1 pnpm exec tsx packages/persona/persona-engine/scripts/coord-real-cli.ts
 * No secrets in output.
 */

import { resolveRunner } from '@deepseek-ai/dsh-persona-runners'
import {
  COORD_PROMPT_BEFORE,
  COORD_REAL_SCENARIOS,
  PROMPT_TEMPLATES,
  collectTurnText,
  coordDecisionPrompt,
  decideFromModelText,
  reviewLooksLikeCredential,
  redactSecrets,
  type CoordDecision,
  type RealCoordRound,
} from '../src/index.ts'

const CLI = 'claude'
const MODEL = 'haiku'

function safe(text: string): string {
  if (reviewLooksLikeCredential(text)) return redactSecrets(text).text
  return text.length > 240 ? `${text.slice(0, 240)}…` : text
}

async function oneRound(round: 1 | 2): Promise<RealCoordRound> {
  const templates = round === 1
    ? COORD_PROMPT_BEFORE
    : { coordinator: PROMPT_TEMPLATES.coordinator, dispatch: PROMPT_TEMPLATES.dispatch }
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli: CLI, model: MODEL },
    permissionMode: 'prompt',
    autonomy: 'act',
  })
  const cells: RealCoordRound['cells'] = []
  for (const scenario of COORD_REAL_SCENARIOS) {
    const prompt = coordDecisionPrompt(scenario, templates)
    const handle = await runner.start({
      ticketId: `f3-${round}-${scenario.id}`,
      assignmentId: `f3-${round}`,
      personaId: 'luna',
      cwd: process.cwd(),
      prompt,
      model: MODEL,
      permissionMode: 'prompt',
    })
    const raw = await collectTurnText(runner.stream(handle))
    const got: CoordDecision = decideFromModelText(raw)
    cells.push({
      id: scenario.id,
      class: scenario.class,
      expected: scenario.expected,
      got,
      ok: got === scenario.expected,
    })
    console.log(`r${String(round)} ${scenario.id} expected=${scenario.expected} got=${got} excerpt=${safe(raw)}`)
  }
  return {
    round,
    cli: CLI,
    model: MODEL,
    n: cells.length,
    correct: cells.filter(cell => cell.ok).length,
    cells,
  }
}

async function main(): Promise<void> {
  if (process.env.PERSONA_REAL_CLI !== '1') {
    console.error('set PERSONA_REAL_CLI=1')
    process.exit(2)
  }
  const rounds = [await oneRound(1), await oneRound(2)]
  console.log(JSON.stringify({
    cli: CLI,
    model: MODEL,
    rounds: rounds.map(round => ({
      round: round.round,
      correct: round.correct,
      n: round.n,
      cells: round.cells,
    })),
  }))
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(reviewLooksLikeCredential(message) ? '[redacted]' : message)
  process.exit(1)
})
