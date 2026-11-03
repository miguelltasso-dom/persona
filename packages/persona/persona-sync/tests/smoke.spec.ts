import { expect, it } from 'vitest'
import { PACKAGE_SYNC } from '../src/index.ts'

it('persona-sync skeleton loads', () => {
  expect(PACKAGE_SYNC).toBe('persona-sync')
})
