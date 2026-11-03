import { afterEach } from 'vitest'
import { defineCrashSuite } from '../../persona-engine/tests/contract/crash.contract.ts'
import { openPersonaStore, openSqliteRepositories, type PersonaStore } from '../src/index.ts'

const stores: PersonaStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

let seq = 0
defineCrashSuite(() => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  seq += 1
  return openSqliteRepositories(store, `crash-${String(seq)}`)
}, 'sqlite')
