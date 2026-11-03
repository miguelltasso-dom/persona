import { expect, it } from 'vitest'
import { COORD_SCENARIOS, decideFake, formatCoordEvalReport, runCoordEval } from '../src/index.ts'

it('corpus tem ~40 cenários pt-BR e o fake acerta todos', async () => {
  expect(COORD_SCENARIOS.length).toBeGreaterThanOrEqual(40)
  const classes = new Set(COORD_SCENARIOS.map(row => row.class))
  expect(classes.size).toBeGreaterThanOrEqual(8)
  for (const scenario of COORD_SCENARIOS) {
    expect(decideFake(scenario), scenario.id).toBe(scenario.expected)
  }
  const report = await runCoordEval()
  expect(report.accuracy).toBe(1)
  expect(report.realCli.ran).toBe(false)
  expect(formatCoordEvalReport(report)).toContain('| prompt_injection |')
  expect(formatCoordEvalReport(report)).toContain('| batch |')
})
