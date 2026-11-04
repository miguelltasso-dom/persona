import { expect, it } from 'vitest'
import { formatRouterBenchReport, formatRouterScaleReport, runRouterExperiment, runRouterScaleBench } from '../src/index.ts'

it('measures batching and pass-through ablation on a deterministic clock', () => {
  const result = runRouterExperiment()
  expect(result.batched.inferences).toBeLessThan(result.oneByOne.inferences)
  expect(result.batched.decisions).toBeLessThan(result.oneByOne.decisions)
  expect(result.passThroughOn.decisions).toBeLessThan(result.passThroughOff.decisions)
  expect(result.passThroughOn.tokenProxy).toBeLessThan(result.passThroughOff.tokenProxy)
  expect(result.deltas.batchingInferencesPct).toBeGreaterThan(0)
  expect(result.deltas.passThroughDecisionsPct).toBeGreaterThan(0)
  const report = formatRouterBenchReport(result)
  expect(report).toContain('pass-through')
  expect(report).not.toMatch(/\bAtlas\b/)
})

it('escala: vários projetos na mesma rajada; o barulhento não starve o quieto; batch < um-a-um', () => {
  const scale = runRouterScaleBench()
  expect(scale.fairnessMin).toBeGreaterThan(0)
  expect(scale.evalsAfterOnePump).toBeGreaterThanOrEqual(scale.projects)
  expect(scale.quietEvals).toBeGreaterThan(0)
  expect(scale.batchInferences).toBeLessThan(scale.oneByOneInferences)
  expect(formatRouterScaleReport(scale)).toContain('Projetos')
})
