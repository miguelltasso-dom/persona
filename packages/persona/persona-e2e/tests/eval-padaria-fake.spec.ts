/**
 * COLHEITA item 14 — the Padaria Lua eval on the FAKE engine (0 AI): N rounds of the TEAM-10 driver with stubs, each evaluated by `evaluatePadariaRound`, one summary on disk.
 *
 *   node scripts/persona/eval-padaria.mjs [--repeat 3] [--strict]        (takes the `build` lock, starts the web host with a temp home and a free port)
 *   or by hand:  PERSONA_E2E=1 PERSONA_EVAL=fake PERSONA_EVAL_REPEAT=3 [PERSONA_EVAL_STRICT=1]  under  `node scripts/persona/with-lock.mjs "Probe eval" --lock build -- node scripts/persona/run-persona-e2e-vitest.mjs <this file>`
 *
 * What the default run ASSERTS is the plumbing: every round started, settled and left a transcript the eval could read (a round that failed, timed out or was killed fails this spec — nothing is
 * measured then). The verdict on the PRODUCT (turns, tokens, false "Pronto!", silly questions, jargon, one art…) is REPORTED in `summary.md`; it becomes a failure only with
 * `PERSONA_EVAL_STRICT=1` / `--strict`, which is what the pre-acceptance and the real round's "fake green" use once items 1–4 of the harvest are integrated.
 * The tokens of the fake are the stub's: they prove the wiring, not the cost. The real round (a written OK from Atlas with a ceiling) measures the cost.
 */
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runPadariaEval } from '../src/eval-padaria-run.ts'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { treeFingerprint, treeManifest } from '../src/tree-fingerprint.ts'

const enabled = process.env.PERSONA_E2E === '1' && process.env.PERSONA_EVAL === 'fake'

describe('Eval Padaria Lua — fake (0 IA)', () => {
  it.skipIf(!enabled)('N rodadas do fake, cada uma avaliada; o encanamento é afirmado, o veredito do produto é reportado (e exigido com --strict)', async () => {
    const repeat = Number(process.env.PERSONA_EVAL_REPEAT ?? '3')
    const strict = process.env.PERSONA_EVAL_STRICT === '1'
    const before = treeFingerprint(treeManifest())
    const choreography = process.env.PERSONA_EVAL_CHOREOGRAPHY === 'd100' ? 'd100' as const : undefined
    const outcome = await runPadariaEval({ engine: 'fake', repeat, outRoot: join(ARTIFACTS_DIR, 'eval-padaria'), fingerprint: before, ...(choreography === undefined ? {} : { choreography }) })
    const after = treeFingerprint(treeManifest())
    // eslint-disable-next-line no-console
    console.log(`\n${outcome.markdown}\nsummary: ${outcome.outDir}${after === before ? '' : `\nATENÇÃO: a árvore mudou durante a rodada (${before} → ${after}): este resultado não prova o código final`}`)

    // The plumbing: a round that failed before it could be read, did not settle or was killed measured nothing.
    expect(Object.values(outcome.meta.notes ?? {}), `see ${outcome.outDir}`).toEqual([])
    expect(outcome.reports).toHaveLength(repeat)
    for (const report of outcome.reports) expect(report.metrics.turns, 'a round that books no turn never made a persona work').toBeGreaterThanOrEqual(1)
    if (strict) {
      expect(after, 'the tree changed while the rehearsal ran: this run proves nothing about the final code').toBe(before)
      expect(outcome.summary.ok, outcome.reports.flatMap((report, index) => report.problems.map(problem => `r${String(index + 1)}: ${problem}`)).join('\n')).toBe(true)
      expect(outcome.summary.stable).toBe(true)
    }
  }, 40 * 60_000)
})
