import { expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

it('client entry loads', () => {
  expect(inject).toEqual(['locale'])
  expect(apply).toBeTypeOf('function')
})
