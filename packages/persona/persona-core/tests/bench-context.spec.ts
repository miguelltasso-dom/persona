import { expect, it } from 'vitest'
import { formatContextBenchReport, runContextBench } from '../src/index.ts'

it('runContextBench reports p50/p95 and bytes for a small n', async () => {
  const samples = await runContextBench([32], 2)
  expect(samples[0]?.n).toBe(32)
  expect(samples[0]?.compile.bytes).toBeGreaterThan(0)
  expect(samples[0]?.recall.bytes).toBeGreaterThan(0)
  expect(formatContextBenchReport(samples)).toContain('| 32 |')
}, 30_000)
