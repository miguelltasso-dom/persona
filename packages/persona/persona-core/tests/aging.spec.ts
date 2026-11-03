import { expect, it } from 'vitest'
import {
  contradicts,
  decayMemory,
  findNearDuplicate,
  nearDuplicate,
  reinforceMemory,
  restoreMemory,
  supersedeMemory,
} from '../src/index.ts'
import type { AgedMemory } from '../src/index.ts'

function memory(overrides: Partial<AgedMemory> = {}): AgedMemory {
  return {
    id: 'm1',
    layer: 'episodic',
    body: 'O cliente prefere fatura semanal.',
    score: 0.8,
    uses: 0,
    archived: false,
    ...overrides,
  }
}

it('decays working memory faster than semantic and archives a near-zero score', () => {
  const working = decayMemory(memory({ layer: 'working', score: 1 }))
  const semantic = decayMemory(memory({ layer: 'semantic', score: 1 }))
  expect(working.score).toBeLessThan(semantic.score)
  expect(decayMemory(memory({ layer: 'working', score: 0.04 })).archived).toBe(true)
})

it('reinforces a used memory and un-archives it', () => {
  const next = reinforceMemory(memory({ archived: true, score: 0.1, uses: 2 }))
  expect(next.uses).toBe(3)
  expect(next.score).toBeGreaterThan(0.1)
  expect(next.archived).toBe(false)
})

it('collapses a near-duplicate in the same layer', () => {
  expect(nearDuplicate('O cliente prefere fatura semanal.', 'O cliente prefere fatura semanal agora.')).toBe(true)
  const hit = findNearDuplicate([memory()], memory({ id: 'm2', body: 'O cliente prefere fatura semanal agora.' }))
  expect(hit).toBe('m1')
  expect(findNearDuplicate([memory({ archived: true })], memory({ id: 'm2' }))).toBeUndefined()
})

it('flags a negation as a contradiction of a near-duplicate', () => {
  expect(contradicts('O cliente prefere fatura semanal.', 'O cliente não prefere fatura semanal.')).toBe(true)
  expect(contradicts('O cliente prefere fatura semanal.', 'O cliente prefere fatura semanal.')).toBe(false)
})

it('supersedes without deleting and restores from the replacement id', () => {
  const archived = supersedeMemory(memory(), 'm2')
  expect(archived).toMatchObject({ archived: true, supersededBy: 'm2' })
  const restored = restoreMemory(archived)
  expect(restored.archived).toBe(false)
  expect(restored.restoredFrom).toBe('m2')
  expect(restored.score).toBeGreaterThanOrEqual(0.4)
  expect(restored).not.toHaveProperty('supersededBy')
})

it('omits restoredFrom when the archived memory had no successor', () => {
  const restored = restoreMemory(memory({ archived: true }))
  expect(restored).not.toHaveProperty('restoredFrom')
})
