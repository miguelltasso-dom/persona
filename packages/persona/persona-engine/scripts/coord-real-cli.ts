/**
 * F3 real CLI: resolveRunner(claude/haiku), ≤10 execs/round, two rounds.
 * Run: PERSONA_REAL_CLI=1 pnpm exec tsx packages/persona/persona-engine/scripts/coord-real-cli.ts
 * No secrets in output. Every session is cancelled+disposed; the process tree
 * dies on timeout, uncaught error, SIGINT, or SIGTERM.
 */

import { disposeRunnerSessions, resolveRunner } from '@deepseek-ai/dsh-persona-runners'
import {
  COORD_PROMPT_BEFORE,
  COORD_REAL_SCENARIOS,
  PROMPT_TEMPLATES,
  collectTurnText,
  coordDecisionPrompt,
  coordPreInput,
  decideFromModelText,
  preRoute,
  preRouteToCoord,
  reviewLooksLikeCredential,
  redactSecrets,
  type CoordDecision,
  type RealCoordRound,
} from '../src/index.ts'
import {
  COORD_REAL_TOTAL_MS,
  COORD_REAL_TURN_MS,
  installProcessGuards,
  killProcessTree,
  runSessionTurn,
  shutdownCoordRunner,
  withTimeout,
} from '../src/bench/coord-real-lifecycle.ts'

const CLI = 'claude'
const MODEL = 'haiku'
/** Eval needs a JSON decision only — never hang on interactive approval. */
const PERMISSION = 'deny' as const

function safe(text: string): string {
  if (reviewLooksLikeCredential(text)) return redactSecrets(text).text
  return text.length > 240 ? `${text.slice(0, 240)}…` : text
}

const live: { runner: { dispose?: () => Promise<void> } | undefined } = { runner: undefined }

async function oneRound(round: 1 | 2): Promise<RealCoordRound> {
  const templates = round === 1
    ? COORD_PROMPT_BEFORE
    : { coordinator: PROMPT_TEMPLATES.coordinator, dispatch: PROMPT_TEMPLATES.dispatch }
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli: CLI, model: MODEL },
    permissionMode: PERMISSION,
    autonomy: 'act',
  })
  live.runner = runner
  const cells: RealCoordRound['cells'] = []
  try {
    for (const scenario of COORD_REAL_SCENARIOS) {
      const routed = preRoute(coordPreInput(scenario))
      if (!routed.modelCalled) {
        const got = preRouteToCoord(routed)
        cells.push({
          id: scenario.id,
          class: scenario.class,
          expected: scenario.expected,
          got,
          ok: got === scenario.expected,
        })
        console.log(`r${String(round)} ${scenario.id} expected=${scenario.expected} got=${got} excerpt=preroute:${routed.rule ?? 'none'}`)
        continue
      }
      const prompt = coordDecisionPrompt(scenario, templates)
      const raw = await runSessionTurn(
        runner,
        {
          ticketId: `f3-${round}-${scenario.id}`,
          assignmentId: `f3-${round}`,
          personaId: 'luna',
          cwd: process.cwd(),
          prompt,
          model: MODEL,
          permissionMode: PERMISSION,
        },
        collectTurnText,
        COORD_REAL_TURN_MS,
      )
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
  } finally {
    await shutdownCoordRunner(runner, disposeRunnerSessions)
    live.runner = undefined
  }
}

async function shutdownAll(): Promise<void> {
  await shutdownCoordRunner(live.runner, disposeRunnerSessions)
  live.runner = undefined
}

async function die(error: unknown): Promise<never> {
  await shutdownAll()
  killProcessTree(process.pid)
  const message = error instanceof Error ? error.message : String(error)
  console.error(reviewLooksLikeCredential(message) ? '[redacted]' : message)
  process.exit(1)
}

async function main(): Promise<void> {
  if (process.env.PERSONA_REAL_CLI !== '1') {
    console.error('set PERSONA_REAL_CLI=1')
    process.exit(2)
  }
  const unguard = installProcessGuards({
    shutdown: shutdownAll,
    killTree: () => {
      killProcessTree(process.pid)
    },
  })
  try {
    const rounds = await withTimeout(
      COORD_REAL_TOTAL_MS,
      (async () => [await oneRound(1), await oneRound(2)] as const)(),
      async () => {
        await shutdownAll()
        killProcessTree(process.pid)
      },
    )
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
  } finally {
    unguard()
    await shutdownAll()
  }
}

void main().catch((error: unknown) => {
  void die(error)
})
