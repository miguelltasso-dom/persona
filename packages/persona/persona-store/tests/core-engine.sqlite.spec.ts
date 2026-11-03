import { afterEach } from 'vitest'
import { defineCoreEngineSuite } from '../../persona-engine/tests/core-engine.suite.ts'
import { openPersonaStore, openSqliteRepositories, type PersonaStore } from '../src/index.ts'

const stores: PersonaStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

defineCoreEngineSuite(() => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  return openSqliteRepositories(store, 'default')
})
