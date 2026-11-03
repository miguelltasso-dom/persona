import { expect, it } from 'vitest'
import { MemoryRepositories, overview } from '../../src/index.ts'
import { host } from '../views.fixture.ts'

it('saudável não ocupa espaço: person[] e problems[] vazios quando nada precisa da pessoa', () => {
  const view = overview(host(new MemoryRepositories('launch')))
  expect(view.person).toEqual([])
  expect(view.problems).toEqual([])
})
