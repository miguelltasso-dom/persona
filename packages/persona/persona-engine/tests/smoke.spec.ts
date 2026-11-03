import { expect, it } from 'vitest'
import { PACKAGE_ENGINE } from '../src/index.ts'

it('persona-engine skeleton loads', () => {
  expect(PACKAGE_ENGINE).toBe('persona-engine')
})
