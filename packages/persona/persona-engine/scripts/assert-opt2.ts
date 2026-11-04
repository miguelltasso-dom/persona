/**
 * OPT-2 local CI: scripted scenarios fail if tokens regress > 10%.
 * The legacy synthetic rows below are kept for continuity; the faithful gate
 * (real prompt composers, cache model, quality) is `gate-tokens.ts`, run last.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { faithfulSnapshot, gateFaithful, type FaithfulBaseline } from '../src/bench/token-gate.ts'
import { measureOpt5Acceptance } from '../src/engine-policy.ts'
import { measureOpt6Acceptance } from '../src/lean-output.ts'
import { measureOpt3Acceptance, measureOpt4Acceptance } from '../src/prompts/stable-prefix.ts'
import {
  TOKEN_SCENARIO_BASELINES,
  TOKEN_SCENARIO_IDS,
  assertScenarioRegression,
  runTokenScenario,
} from '../src/token-measure.ts'
import { assertV1Close } from '../src/v1-close.ts'

function assertOpt(name: string, failed: readonly string[]): void {
  if (failed.length > 0) throw new Error(`${name} ${failed.join(',')}`)
}

for (const id of TOKEN_SCENARIO_IDS) {
  const report = runTokenScenario(id)
  assertScenarioRegression(TOKEN_SCENARIO_BASELINES[id], report.totalTokens)
}
assertV1Close()
assertOpt('OPT-3', measureOpt3Acceptance().failed)
assertOpt('OPT-4', measureOpt4Acceptance().failed)
assertOpt('OPT-5', measureOpt5Acceptance().failed)
assertOpt('OPT-6', measureOpt6Acceptance().failed)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const frozen = JSON.parse(readFileSync(resolve(root, 'persona-spec/baselines/token-faithful.json'), 'utf8')) as FaithfulBaseline
const faithful = gateFaithful(frozen, faithfulSnapshot())
if (faithful.length > 0) throw new Error(`OPT-2 faithful ${faithful.map(row => `${row.id}:${row.reason}`).join(',')}`)
process.stdout.write('OPT-2 ok\n')
