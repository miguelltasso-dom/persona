import { expect, it } from 'vitest'
import { PACKAGE_CORE } from '../src/index.ts'

it('persona-core skeleton loads', () => {
  expect(PACKAGE_CORE).toBe('persona-core')
})
