/**
 * OPT-8b: the 2nd paired REAL round, as PRE-REGISTERED (persona-spec/reports/opt8b-prereg.md + Addenda 1 and 2). Same task straight on the CLI
 * and as the prompts Persona builds, n = 3 per cell, Claude haiku, both arms in `answer-only`.
 *
 * DRY (default; no CLI, no quota; proves the plan, the files and the verdict wiring):
 *   node --import tsx/esm packages/persona/persona-engine/scripts/pair-real-b.ts
 * REAL (only with Atlas's OK, AFTER Probe's real D-069 run, inside the `real` lock, limiter ON with a FRESH absolute ledger, ceiling 40):
 *   PERSONA_PAIR_REAL_B=1 PERSONA_REAL_E2E=1 PERSONA_CLI_ENV=answer-only PERSONA_REAL_TURN_CAP=40 PERSONA_REAL_TURN_LEDGER=<abs fresh path> \
 *     node scripts/persona/with-lock.mjs "Tally opt8b" --lock real --wait-max 3600000 -- \
 *     node --import tsx/esm packages/persona/persona-engine/scripts/pair-real-b.ts
 *
 * Real mode refuses to start unless every guard holds, and PROVES `answer-only` for the installed CLI version (zero model) BEFORE the first paid
 * call: an unproven mode would run native and make the whole round invalid. A call that fails for a reason of the CLI is replaced ONCE and both
 * stay in the raw; every attempt counts against the ceiling of 40. The verdict is `evaluatePairRealB` (bench/pair-real-b.ts, 21 tests written
 * before any data); this script only runs the plan and writes `reports/pair-real-b.{md,json}`.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installProcessGuards, killProcessTree, withTimeout } from '../src/bench/coord-real-lifecycle.ts'
import {
  PAIR_REAL_B_CALL_CAP,
  assertPairRealBGuards,
  buildPairRealBPlan,
  evaluatePairRealB,
  renderPairRealBReport,
  type PairBCall,
  type PairBRow,
} from '../src/bench/pair-real-b.ts'

const REAL = process.env.PERSONA_PAIR_REAL_B === '1'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SIDE_MS = 5 * 60_000
/** Whole real round: up to 40 attempts of up to 5 minutes. */
const REAL_TOTAL_MS = 150 * 60_000

/** What one attempt produced. `failed` = a reason of the CLI (limit, network, no counters): it is replaced once. */
interface Attempt {
  readonly failed: boolean
  readonly text: string
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly mainLoopInputTokens?: number
  readonly envMode?: string
  readonly envModeRequested?: string
}

type Exec = (call: PairBCall, seq: number) => Promise<Attempt>

function dryExec(): Exec {
  return async (call) => {
    await Promise.resolve()
    const input = 1000 + Math.ceil(call.prompt.length / 4)
    return { failed: false, text: 'implementei o filtro de pedidos (ensaio, sem CLI)', inputTokens: input, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, mainLoopInputTokens: input, envMode: 'answer-only' }
  }
}

interface RealParts {
  readonly exec: Exec
  readonly shutdown: () => Promise<void>
}

async function realParts(): Promise<RealParts> {
  assertPairRealBGuards(process.env)
  const ledger = process.env.PERSONA_REAL_TURN_LEDGER ?? ''
  if (existsSync(ledger)) throw new Error('the ledger must be FRESH: this file already exists, so a previous round may have spent calls (a repeat needs a new OK from Atlas)')
  if (process.env.VITEST !== undefined || process.env.PERSONA_SCRIPTED !== undefined) throw new Error('clean environment required: VITEST / PERSONA_SCRIPTED must not be set')
  const runners = await import('@deepseek-ai/dsh-persona-runners')
  // Zero model: the mode must be PROVEN for this CLI version before any paid call.
  const proof = await runners.proveCliIsolation({ mode: 'answer-only', modelArg: 'haiku', env: process.env })
  if (!proof.ok) throw new Error(proof.reason)
  process.stdout.write(`isolation: ${proof.reason}\n`)
  const inner = await runners.resolveRunner({ spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'deny', autonomy: 'act' })
  // An EMPTY directory: the CLI reads the CLAUDE.md of its cwd, and this repo's would be counted as the vendor base.
  const cwd = mkdtempSync(join(tmpdir(), 'persona-pair-real-b-'))
  const exec: Exec = async (call, seq) => {
    let text = ''
    let handle: Awaited<ReturnType<typeof inner.start>> | undefined
    try {
      handle = await inner.start({
        ticketId: `pairb-${String(seq)}`,
        assignmentId: `pairb-${call.cell}-${String(call.repeat)}-${String(seq)}`,
        // One persona id per ATTEMPT: a reused warm session would carry the previous turns into the next call's input.
        personaId: `tally-pairb-${String(seq)}`,
        cwd,
        prompt: call.prompt,
        model: 'haiku',
        permissionMode: 'deny',
      })
      const live = handle
      let ended = false
      await withTimeout(SIDE_MS, (async () => {
        for await (const event of inner.stream(live)) {
          if (event.type === 'delta') text += event.text
          if (event.type === 'ended') ended = event.report.state !== 'failed' && event.report.state !== 'dropped'
        }
      })(), async () => { await inner.cancel(live) })
      const usage = await inner.usage(live)
      if (!ended || usage.inputTokens <= 0) return { failed: true, text }
      return {
        failed: false, text, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        ...(usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens }),
        ...(usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens }),
        ...(usage.mainLoopInputTokens === undefined ? {} : { mainLoopInputTokens: usage.mainLoopInputTokens }),
        ...(usage.envMode === undefined ? {} : { envMode: usage.envMode }),
        ...(usage.envModeRequested === undefined ? {} : { envModeRequested: usage.envModeRequested }),
      }
    } catch (error) {
      void error // a reason of the CLI or the network: the attempt is recorded as failed (and replaced once), never retried silently
      return { failed: true, text }
    } finally {
      if (handle !== undefined) {
        try { await inner.cancel(handle) } catch (error) { void error }
      }
    }
  }
  return {
    exec,
    shutdown: async () => {
      try { await inner.dispose?.() } catch (error) { void error }
      try { rmSync(cwd, { recursive: true, force: true }) } catch (error) { void error }
      try { await runners.disposeRunnerSessions() } catch (error) { void error }
    },
  }
}

async function runPlan(exec: Exec): Promise<PairBRow[]> {
  const plan = buildPairRealBPlan()
  const rows: PairBRow[] = []
  let seq = 0
  const answers = (call: PairBCall): boolean => call.cell !== 'triage-warm'
  for (const call of plan.calls) {
    for (const attempt of [1, 2] as const) {
      // Every attempt counts against the ceiling; the replacement exists only after a failure.
      if (rows.length >= PAIR_REAL_B_CALL_CAP) break
      seq += 1
      const done = await exec(call, seq)
      const ready = answers(call) ? plan.needles.every(needle => done.text.toLowerCase().includes(needle.toLowerCase())) : undefined
      rows.push({
        cell: call.cell, repeat: call.repeat, attempt, ...(done.failed ? { failed: true as const } : {}),
        ...(done.inputTokens === undefined ? {} : { inputTokens: done.inputTokens }),
        ...(done.outputTokens === undefined ? {} : { outputTokens: done.outputTokens }),
        ...(done.cacheReadTokens === undefined ? {} : { cacheReadTokens: done.cacheReadTokens }),
        ...(done.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: done.cacheWriteTokens }),
        ...(done.mainLoopInputTokens === undefined ? {} : { mainLoopInputTokens: done.mainLoopInputTokens }),
        ...(done.envMode === undefined ? {} : { envMode: done.envMode }),
        ...(done.envModeRequested === undefined ? {} : { envModeRequested: done.envModeRequested }),
        ...(ready === undefined || done.failed ? {} : { ready }),
      })
      process.stdout.write(`  ${String(seq)} ${call.cell} #${String(call.repeat)}.${String(attempt)} ${done.failed ? 'FAILED' : `in=${String(done.inputTokens ?? 'n/d')} out=${String(done.outputTokens ?? 'n/d')} mode=${done.envMode ?? '?'}`}\n`)
      if (!done.failed) break
    }
  }
  return rows
}

async function main(): Promise<void> {
  const plan = buildPairRealBPlan()
  process.stdout.write(`pair-real-b ${REAL ? 'REAL' : 'DRY'}: ${String(plan.calls.length)} planned calls (ceiling ${String(PAIR_REAL_B_CALL_CAP)}), ${plan.cli} ${plan.model}, answer-only\n`)
  const parts: RealParts = REAL ? await realParts() : { exec: dryExec(), shutdown: async () => { /* nothing to drop */ } }
  const unguard = installProcessGuards({ shutdown: parts.shutdown, killTree: () => { killProcessTree(process.pid) } })
  let rows: PairBRow[] = []
  try {
    rows = await withTimeout(REAL ? REAL_TOTAL_MS : 60_000, runPlan(parts.exec), async () => {
      await parts.shutdown()
      killProcessTree(process.pid)
    })
  } finally {
    unguard()
    await parts.shutdown()
  }
  const evaluation = evaluatePairRealB(rows)
  const name = REAL ? 'pair-real-b' : 'pair-real-b-dry'
  writeFileSync(resolve(root, `persona-spec/reports/${name}.md`), `${renderPairRealBReport(evaluation)}\n`)
  writeFileSync(resolve(root, `persona-spec/reports/${name}.json`), `${JSON.stringify({ mode: REAL ? 'real' : 'dry', note: 'raw vendor counters of every attempt, then the verdict by the pre-registered rule', rows, evaluation }, null, 2)}\n`)
  process.stdout.write(`verdict: ${evaluation.verdict} — ${evaluation.reasons.join(' | ')}\nwrote persona-spec/reports/${name}.md (${String(rows.length)} attempts)\n`)
}

void main().catch((error: unknown) => {
  // Say why first: killing the tree ends this process too.
  process.stderr.write(`pair-real-b refused/failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
  killProcessTree(process.pid)
})
