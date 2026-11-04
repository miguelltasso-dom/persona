import { expect, it } from 'vitest'
import {
  leftoverOnProject,
  maySpendOnProject,
  spendOnProject,
  type ProjectSpend,
} from '../src/index.ts'

function book(): ProjectSpend[] {
  return [
    { projectId: 'site', tokensLeft: 1_000, runsLeft: 4 },
    { projectId: 'contratacao', tokensLeft: 800, runsLeft: 2 },
  ]
}

it('gasto num projeto não reduz o outro no mesmo PERSONA_HOME (THREAT-MODEL)', () => {
  const next = spendOnProject(book(), 'site', 300, 1)
  expect(leftoverOnProject(next, 'site')).toEqual({ projectId: 'site', tokensLeft: 700, runsLeft: 3 })
  expect(leftoverOnProject(next, 'contratacao')).toEqual({
    projectId: 'contratacao', tokensLeft: 800, runsLeft: 2,
  })
  expect(maySpendOnProject(next, 'contratacao', 800, 2)).toBe(true)
  expect(maySpendOnProject(next, 'site', 701, 1)).toBe(false)
  expect(maySpendOnProject(book(), 'ausente', 1, 1)).toBe(false)
})
