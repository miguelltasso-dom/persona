/**
 * COLHEITA item 14 — the RED scenarios of the Padaria Lua eval, END TO END on the fake engine (0 AI): for each scenario the stub plays a persona that does ONE thing wrong in the real host's thread
 * (a false "Pronto!", a silly question, jargon, a heavy turn) and `evaluatePadariaRound` must flag exactly that (`src/eval-padaria-scenarios.ts`).
 *
 *   node scripts/persona/eval-padaria.mjs --scenarios [pronto-falso,pergunta-boba,jargao,pesado]      (takes the `build` lock; ~2.5 min per scenario)
 *
 * A green fake round proves the plumbing; this proves the READERS: one that has never been seen failing is not proven. The spec FAILS when a scenario is not caught (the reader is blind), when
 * it flips something the defect does not explain (the reader cries wolf), or when its round was not a valid observation (the host failed, the watchdog killed it, it did not settle).
 */
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { runPadariaScenarios } from '../src/eval-padaria-run.ts'
import { PADARIA_SCENARIO_IDS, type PadariaScenarioId } from '../src/eval-padaria-scenarios.ts'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { treeFingerprint, treeManifest } from '../src/tree-fingerprint.ts'

const enabled = process.env.PERSONA_E2E === '1' && process.env.PERSONA_EVAL === 'scenarios'

describe('Eval Padaria Lua — cenários RED fim a fim (0 IA)', () => {
  it.skipIf(!enabled)('cada defeito do stub é pego pelo check dono dele, e nada mais reprova sem culpa do defeito', async () => {
    const asked = (process.env.PERSONA_EVAL_SCENARIOS ?? '').split(',').map(item => item.trim()).filter(Boolean)
    const scenarios = (asked.length === 0 ? PADARIA_SCENARIO_IDS : asked) as PadariaScenarioId[]
    const before = treeFingerprint(treeManifest())
    const outcome = await runPadariaScenarios({ outRoot: join(ARTIFACTS_DIR, 'eval-padaria'), scenarios, fingerprint: before })
    // the page of the run is on disk (`summary.md` in `outcome.outDir`, with the tree fingerprint it ran on); the harness keeps the console quiet
    for (const run of outcome.runs) {
      expect(run.invalid, `${run.scenario.id}: the round is not a valid observation (see ${outcome.outDir})`).toBeUndefined()
      // "pego" (the reader flagged it) and "barrado" (the product stopped it before the person read it: `missed` is non-empty BY DESIGN there) are right; only "cego" is a blind reader (Carbon P2-02).
      expect(run.verdict.outcome, `${run.scenario.id}: the defect reached the person and the reader did NOT flag it (blind); missed: ${run.verdict.missed.join(', ')}`).not.toBe('cego')
      expect(run.verdict.extra, `${run.scenario.id}: the reader flagged more than the defect explains (cries wolf)`).toEqual([])
    }
    expect(outcome.ok).toBe(true)
  }, 60 * 60_000)
})
