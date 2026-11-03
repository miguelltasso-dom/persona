import { expect, it } from 'vitest'
import { PACKAGE_E2E } from '../src/index.ts'

it('persona-e2e skeleton loads', () => {
  expect(PACKAGE_E2E).toBe('persona-e2e')
})
