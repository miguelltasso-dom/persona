import { expect, it } from 'vitest'
import { PACKAGE_USAGE } from '../src/index.ts'

it('persona-usage skeleton loads', () => {
  expect(PACKAGE_USAGE).toBe('persona-usage')
})
