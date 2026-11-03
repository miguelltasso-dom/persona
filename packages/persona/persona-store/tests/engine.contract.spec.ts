import { afterEach } from 'vitest'
import { defineRepositoryContract } from '../../persona-engine/tests/contract/repositories.contract.ts'
import { openPersonaStore, openSqliteRepositories, type PersonaStore } from '../src/index.ts'

let current: PersonaStore | undefined
afterEach(() => {
  current?.close()
  current = undefined
})

defineRepositoryContract((projectId: string) => {
  current ??= openPersonaStore({ path: ':memory:' })
  return openSqliteRepositories(current, projectId)
})
