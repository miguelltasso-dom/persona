import { expect, it } from 'vitest'
import { formatEngineBenchReport, runEngineBench } from '../src/index.ts'

it('runEngineBench reports phases for a small in-memory n', () => {
  const result = runEngineBench({ tickets: 20, triggers: 40, pipeline: 4 })
  expect(result.phases.some(phase => phase.name === 'pipeline.receive-evaluate-decide-report')).toBe(true)
  expect(result.phases.every(phase => phase.ms >= 0)).toBe(true)
  expect(formatEngineBenchReport(result)).toContain('| store.tickets |')
}, 30_000)
