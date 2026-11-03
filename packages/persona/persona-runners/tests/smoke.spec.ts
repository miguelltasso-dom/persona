import { expect, it } from 'vitest'
import { PACKAGE_RUNNERS } from '../src/index.ts'

it('persona-runners skeleton loads', () => {
  expect(PACKAGE_RUNNERS).toBe('persona-runners')
})
