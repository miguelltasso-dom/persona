/**
 * Paired real run (OPT-8): same task straight on the CLI and as the prompts Persona builds.
 *
 * DRY (default, no CLI, no quota):
 *   node --import tsx/esm packages/persona/persona-engine/scripts/pair-real.ts
 * REAL (Atlas 13:32: one pair, Claude haiku both sides, 5 min per call, cap 20 calls; only after the
 * W wirings are in and Probe's V1-P0-5 real run is done; serialized by the `real` lock; Rivet's turn limiter ON as a
 * second guard, so the CLI is never started past the cap):
 *   PERSONA_PAIR_REAL=1 PERSONA_REAL_E2E=1 PERSONA_REAL_TURN_CAP=20 PERSONA_REAL_TURN_LEDGER=<abs path> \
 *     node scripts/persona/with-lock.mjs "Tally real" --lock real \
 *     --wait-max 3600000 -- node --import tsx/esm packages/persona/persona-engine/scripts/pair-real.ts
 *
 * Real mode refuses to start unless both env flags are set AND it runs inside the `real` lock.
 * Every call: start → fold → cancel; whole-run timeout; runner and warm pool disposed; process tree killed on error.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COORD_REAL_TURN_MS,
  installProcessGuards,
  killProcessTree,
  withTimeout,
  type CoordRealHandle,
} from '../src/bench/coord-real-lifecycle.ts'
import {
  PAIR_REAL_CALL_CAP,
  PAIR_REAL_SIDE_MS,
  assertRealRunGuards,
  buildPairRealPlan,
  formatPairRealMarkdown,
  runPairReal,
  summarizePairReal,
  type PairRealEvent,
  type PairRealResult,
  type PairRealRunner,
} from '../src/bench/pair-real.ts'

const REAL = process.env.PERSONA_PAIR_REAL === '1'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
/** Whole real run: 9 calls, each up to 5 min, plus the 6 min TTL gap. */
const REAL_TOTAL_MS = 60 * 60_000

function dryRunner(): PairRealRunner {
  let seq = 0
  return {
    async start() {
      seq += 1
      return await Promise.resolve({ runId: `dry-${String(seq)}` })
    },
    stream() {
      return (async function* (): AsyncGenerator<PairRealEvent> {
        await Promise.resolve()
        yield { type: 'delta', text: 'resposta de ensaio (sem CLI)' }
        yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 } }
        yield { type: 'ended', report: { summary: 'ok' } }
      })()
    },
    async cancel() { /* nothing live */ },
  }
}

interface RealParts {
  readonly runner: PairRealRunner
  readonly shutdown: () => Promise<void>
}

async function realRunner(): Promise<RealParts> {
  assertRealRunGuards(process.env)
  const runners = await import('@deepseek-ai/dsh-persona-runners')
  const inner = await runners.resolveRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
    permissionMode: 'deny',
    autonomy: 'act',
  })
  let seq = 0
  // An EMPTY directory: the CLI reads the CLAUDE.md of its cwd, and this repo's would be counted as the vendor base.
  const cwd = mkdtempSync(join(tmpdir(), 'persona-pair-real-'))
  const handles = new Map<string, Awaited<ReturnType<typeof inner.start>>>()
  const adapted: PairRealRunner = {
    async start(input) {
      seq += 1
      const handle = await inner.start({
        ticketId: `pair-${String(seq)}`,
        assignmentId: `pair-${input.step}-${String(seq)}`,
        // One persona id per call: the runner pool keys warm sessions by persona|cwd|model, and a reused session would carry the
        // previous turns into the next call's input. The provider cache is by prefix, so it still crosses fresh sessions.
        personaId: `tally-pair-${String(seq)}`,
        cwd,
        prompt: input.prompt,
        model: 'haiku',
        permissionMode: 'deny',
      })
      handles.set(handle.runId, handle)
      return { runId: handle.runId }
    },
    stream(handle: CoordRealHandle) {
      const live = handles.get(handle.runId)
      if (live === undefined) throw new Error('unknown handle')
      return (async function* (): AsyncGenerator<PairRealEvent> {
        let sawUsage = false
        for await (const event of inner.stream(live)) {
          if (event.type === 'usage') sawUsage = true
          yield event as PairRealEvent
        }
        // Some adapters report the counters through `usage()` after the stream, not as an event: ask once.
        if (!sawUsage) {
          try {
            const spent = await inner.usage(live)
            yield { type: 'usage', usage: spent }
          } catch (error) {
            void error // no counters: the row stays n/d, never 0
          }
        }
      })()
    },
    async cancel(handle: CoordRealHandle) {
      const live = handles.get(handle.runId)
      if (live !== undefined) await inner.cancel(live)
    },
    async dispose() {
      await inner.dispose?.()
    },
  }
  return {
    runner: adapted,
    shutdown: async () => {
      try {
        await adapted.dispose?.()
      } catch (error) {
        void error
      }
      try {
        rmSync(cwd, { recursive: true, force: true })
      } catch (error) {
        void error
      }
      try {
        await runners.disposeRunnerSessions()
      } catch (error) {
        void error
      }
    },
  }
}

async function main(): Promise<void> {
  const plan = buildPairRealPlan()
  process.stdout.write(`pair-real ${REAL ? 'REAL' : 'DRY'}: ${String(plan.callCount)} calls (cap ${String(PAIR_REAL_CALL_CAP)}), ${plan.cli} ${plan.model}\n`)
  const parts: RealParts = REAL
    ? await realRunner()
    : { runner: dryRunner(), shutdown: async () => { /* nothing to drop */ } }
  const unguard = installProcessGuards({
    shutdown: parts.shutdown,
    killTree: () => {
      killProcessTree(process.pid)
    },
  })
  let results: PairRealResult[] = []
  try {
    results = await withTimeout(REAL ? REAL_TOTAL_MS : 60_000, runPairReal(parts.runner, plan, {
      turnMs: REAL ? PAIR_REAL_SIDE_MS : COORD_REAL_TURN_MS,
      ...(REAL ? {} : { sleep: async () => { /* dry: no real gap */ }, gapMs: 0 }),
      onCall: (row, index, total) => {
        process.stdout.write(`  ${String(index)}/${String(total)} ${row.arm} ${row.step} ${row.pass} in=${String(row.inputTokens ?? 'n/d')} out=${String(row.outputTokens ?? 'n/d')} cacheRead=${String(row.cacheReadTokens ?? 'n/d')} ${String(row.durationMs)}ms\n`)
      },
    }), async () => {
      await parts.shutdown()
      killProcessTree(process.pid)
    })
  } finally {
    unguard()
    await parts.shutdown()
  }
  const name = REAL ? 'pair-real' : 'pair-real-dry'
  writeFileSync(resolve(root, `persona-spec/reports/${name}.md`), formatPairRealMarkdown(results, REAL ? 'real' : 'dry'))
  writeFileSync(resolve(root, `persona-spec/reports/${name}.json`), `${JSON.stringify({ mode: REAL ? 'real' : 'dry', summary: summarizePairReal(results), results }, null, 2)}\n`)
  process.stdout.write(`wrote persona-spec/reports/${name}.md (${String(results.length)} calls)\n`)
}

void main().catch((error: unknown) => {
  // Say why first: killing the tree ends this process too.
  process.stderr.write(`pair-real refused/failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
  killProcessTree(process.pid)
})
