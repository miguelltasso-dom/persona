import { MemoryImportStore, applyImport } from '@deepseek-ai/dsh-persona-core'
import { afterEach, expect, it } from 'vitest'
import { openPersonaStore, openTempStore, SqliteImportStore, type PersonaStore, type TempStore } from '../src/index.ts'
import { defineImportStoreContract, samplePreview } from './contract/import.contract.ts'

const memories: PersonaStore[] = []
const temps: TempStore[] = []

afterEach(async () => {
  for (const store of memories.splice(0)) store.close()
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

function sqliteImport(): SqliteImportStore {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  return new SqliteImportStore(store)
}

defineImportStoreContract('memory', () => new MemoryImportStore())
defineImportStoreContract('sqlite', () => sqliteImport())

it('sqlite reopen preserves applied batches and external-id occupancy', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const first = new SqliteImportStore(handle.store)
  applyImport(first, samplePreview(), 'b1')
  handle.store.close()
  const again = openPersonaStore({ path: handle.path })
  memories.push(again)
  const reopened = new SqliteImportStore(again)
  expect(reopened.hasExternalId('claude:c1')).toBe(true)
  expect(reopened.getBatch('b1')?.applied).toHaveLength(1)
})
