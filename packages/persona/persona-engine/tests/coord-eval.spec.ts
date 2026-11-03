import { expect, it } from 'vitest'
import {
  COORD_PROMPT_BEFORE,
  COORD_REAL_SCENARIOS,
  COORD_SCENARIOS,
  coordDecisionPrompt,
  decideFake,
  decideFromModelText,
  formatCoordEvalReport,
  runCoordEval,
} from '../src/index.ts'

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

it('escolhe 10 cenários discriminantes e não usa o prefixo do corpus', () => {
  expect(COORD_REAL_SCENARIOS).toHaveLength(10)
  const classes = new Set(COORD_REAL_SCENARIOS.map(row => row.class))
  expect(classes.size).toBe(9)
  expect(COORD_REAL_SCENARIOS.map(row => row.id)).not.toEqual(COORD_SCENARIOS.slice(0, 10).map(row => row.id))
  expect(coordDecisionPrompt(COORD_REAL_SCENARIOS[0]!, COORD_PROMPT_BEFORE)).toContain('Só o JSON')
  expect(decideFromModelText('```json\n{"decision":"ignore"}\n```')).toBe('ignore')
  expect(decideFromModelText('não entendi')).toBe('ask')
})
