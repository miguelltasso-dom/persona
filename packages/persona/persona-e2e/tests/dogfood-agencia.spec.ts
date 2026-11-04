import { expect, it } from 'vitest'
import { runAgenciaDogfood } from '../src/dogfood-agencia.ts'

const run = process.env.PERSONA_E2E === '1'

it.skipIf(!run)('dogfood Agência Ponto no app real (perfil persona, dev)', async () => {
  const report = await runAgenciaDogfood()
  expect(report.stepsOk.length + report.findings.length).toBeGreaterThan(0)
  expect(report.realCliUsed).toBeLessThanOrEqual(20)
}, 600_000)
