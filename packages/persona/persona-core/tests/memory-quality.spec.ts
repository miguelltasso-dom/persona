import { expect, it } from 'vitest'
import { formatMemoryQualityReport, runMemoryQualityEval } from '../src/index.ts'

it('conjunto de recall/contexto: certo entra, errado fica de fora, contradição e envelhecimento', async () => {
  const report = await runMemoryQualityEval()
  expect(report.failed, formatMemoryQualityReport(report)).toBe(0)
  expect(report.total).toBeGreaterThanOrEqual(7)
  expect(report.ratio).toBe(1)
  const text = formatMemoryQualityReport(report)
  expect(text).toContain('compile-required-in')
  expect(text).toContain('recall-secret-out')
})
