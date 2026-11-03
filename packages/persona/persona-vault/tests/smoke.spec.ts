import { expect, it } from 'vitest'
import { PACKAGE_VAULT } from '../src/index.ts'

it('persona-vault skeleton loads', () => {
  expect(PACKAGE_VAULT).toBe('persona-vault')
})
