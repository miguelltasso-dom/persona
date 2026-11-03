import { IdentityCipher, MemorySyncLog, type SyncEnvelope } from '@deepseek-ai/dsh-persona-core'
import { it } from './host-harness.ts'
import { MemoryTransport } from '@deepseek-ai/dsh-persona-sync'
import { openPersonaStore } from '@deepseek-ai/dsh-persona-store'
import { expect } from 'vitest'
import { openHostSync } from '../src/index.ts'

function envelope(overrides: Partial<SyncEnvelope> = {}): SyncEnvelope {
  return {
    workspaceId: 'ws',
    streamId: 'channel:geral',
    seq: 1,
    idempotencyKey: 'k1',
    classification: 'channel',
    at: '2026-11-03T15:00:00Z',
    payload: IdentityCipher.seal('olá', 'wk1'),
    ...overrides,
  }
}

it('host sync uses SQLite and refuses a DM', async () => {
  const store = openPersonaStore({ path: ':memory:' })
  try {
    const cloud = new MemorySyncLog()
    const client = openHostSync(store, new MemoryTransport(cloud))
    expect(await client.push(envelope({ classification: 'dm', streamId: 'dm:ana' }))).toMatchObject({
      status: 'refused', code: 'PRIVATE_NOT_SHARED',
    })
    expect(await client.push(envelope())).toMatchObject({ status: 'appended' })
    expect(client.log.head('channel:geral')).toBe(1)
    expect(cloud.head('channel:geral')).toBe(1)
  } finally {
    store.close()
  }
})
