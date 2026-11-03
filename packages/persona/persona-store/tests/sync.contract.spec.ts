import { MemorySyncLog } from '@deepseek-ai/dsh-persona-core'
import { afterEach, expect, it } from 'vitest'
import { openPersonaStore, openTempStore, SqliteSyncLog, type PersonaStore, type TempStore } from '../src/index.ts'
import { defineSyncLogContract, sampleEnvelope } from './contract/sync.contract.ts'
import { commitEnvelope } from '@deepseek-ai/dsh-persona-core'

const memories: PersonaStore[] = []
const temps: TempStore[] = []

afterEach(async () => {
  for (const store of memories.splice(0)) store.close()
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

function sqliteLog(): SqliteSyncLog {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  return new SqliteSyncLog(store)
}

defineSyncLogContract('memory', () => new MemorySyncLog())
defineSyncLogContract('sqlite', () => sqliteLog())

it('sqlite reopen preserves committed envelopes', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const log = new SqliteSyncLog(handle.store)
  expect(commitEnvelope(log, sampleEnvelope())).toBe('appended')
  handle.store.close()
  const again = openPersonaStore({ path: handle.path })
  memories.push(again)
  const reopened = new SqliteSyncLog(again)
  expect(reopened.head('channel:geral')).toBe(1)
  expect(reopened.byIdempotency('k1')?.seq).toBe(1)
  expect(reopened.after('channel:geral', 0)).toHaveLength(1)
})
