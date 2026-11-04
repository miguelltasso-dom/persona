/** OPT-2 local CI: scripted scenarios fail if tokens regress > 10%. */
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
process.stdout.write('OPT-2 ok\n')
