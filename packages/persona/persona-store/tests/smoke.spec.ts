import { expect, it } from 'vitest'
import { PACKAGE_STORE } from '../src/index.ts'

it('persona-store skeleton loads', () => {
  expect(PACKAGE_STORE).toBe('persona-store')
})
