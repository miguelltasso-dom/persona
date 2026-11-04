import { expect, it } from 'vitest'
import { runPadariaDogfood } from '../src/dogfood-padaria.ts'

const run = process.env.PERSONA_E2E === '1'

it.skipIf(!run)('dogfood Padaria Lua no app real (home limpo)', async () => {
  const report = await runPadariaDogfood()
  expect(report.stepsOk.length + report.findings.length).toBeGreaterThan(0)
}, 600_000)
