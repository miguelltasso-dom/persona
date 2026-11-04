import { MemorySyncLog, IdentityCipher, type SyncEnvelope } from '@deepseek-ai/dsh-persona-core'
import { expect, it } from 'vitest'
import { SyncClient, MemoryTransport, WorkspaceCipher } from '../src/index.ts'

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

it('refuses teach recordings and provider account homes', async () => {
  const cloud = new MemorySyncLog()
  const client = new SyncClient({ log: new MemorySyncLog(), transport: new MemoryTransport(cloud) })
  expect(await client.push(envelope({
    classification: 'private', streamId: 'teach:nina', shared: true,
  }))).toMatchObject({ status: 'refused', code: 'PRIVATE_NOT_SHARED' })
  expect(await client.push(envelope({
    classification: 'workspace', streamId: 'account:claude',
  }))).toMatchObject({ status: 'refused', code: 'PRIVATE_NOT_SHARED' })
  expect(client.outbox).toHaveLength(0)
  expect(cloud.head('teach:nina')).toBe(0)
})

it('refuses to upload a DM and never puts it on the transport', async () => {
  const cloud = new MemorySyncLog()
  const client = new SyncClient({ log: new MemorySyncLog(), transport: new MemoryTransport(cloud) })
  const result = await client.push(envelope({ classification: 'dm', streamId: 'dm:ana' }))
  expect(result).toMatchObject({ status: 'refused', code: 'PRIVATE_NOT_SHARED' })
  expect(client.outbox).toHaveLength(0)
  expect(cloud.head('dm:ana')).toBe(0)
})

it('converges two hosts on the same sequenced shared stream', async () => {
  const cloud = new MemorySyncLog()
  const transport = new MemoryTransport(cloud)
  const a = new SyncClient({ log: new MemorySyncLog(), transport })
  const b = new SyncClient({ log: new MemorySyncLog(), transport })
  expect(await a.push(envelope())).toMatchObject({ status: 'appended' })
  expect(await b.push(envelope())).toMatchObject({ status: 'duplicate' })
  expect(await b.push(envelope({
    seq: 2,
    idempotencyKey: 'k2',
    payload: IdentityCipher.seal('segunda', 'wk1'),
  }))).toMatchObject({ status: 'appended' })
  await a.pull('channel:geral')
  await b.pull('channel:geral')
  expect(a.log.after('channel:geral', 0).map(item => item.seq)).toEqual([1, 2])
  expect(b.log.after('channel:geral', 0)).toEqual(a.log.after('channel:geral', 0))
})

it('queues while offline and resumes from the saved cursor', async () => {
  const cloud = new MemorySyncLog()
  const transport = new MemoryTransport(cloud, false)
  const a = new SyncClient({ log: new MemorySyncLog(), transport })
  expect(await a.push(envelope())).toMatchObject({ status: 'offline' })
  expect(a.outbox).toHaveLength(1)
  expect(cloud.head('channel:geral')).toBe(0)
  transport.online = true
  expect(await a.flush()).toMatchObject([{ status: 'appended', seq: 1 }])
  expect(a.outbox).toHaveLength(0)
  const b = new SyncClient({ log: new MemorySyncLog(), transport })
  b.restoreCursors({ 'channel:geral': 0 })
  const pulled = await b.pull('channel:geral')
  expect(pulled.map(item => item.seq)).toEqual([1])
  expect(b.cursorSnapshot()).toEqual({ 'channel:geral': 1 })
  expect(await b.pull('channel:geral')).toEqual([])
})

it('seals with the workspace key so the transport only sees ciphertext', async () => {
  const cipher = new WorkspaceCipher('segredo-ws', 'wk1')
  const cloud = new MemorySyncLog()
  const client = new SyncClient({
    log: new MemorySyncLog(),
    transport: new MemoryTransport(cloud),
    cipher,
    workspaceKeyId: 'wk1',
  })
  const sealed = client.seal('privado')
  expect('ciphertext' in sealed).toBe(true)
  if ('ciphertext' in sealed) expect(sealed.ciphertext).not.toContain('privado')
  expect(client.open(sealed)).toBe('privado')
  await client.push(envelope({ payload: sealed }))
  const stored = cloud.after('channel:geral', 0)[0]
  expect(stored).toBeDefined()
  if (stored !== undefined && 'ciphertext' in stored.payload) {
    expect(stored.payload.ciphertext).not.toContain('privado')
  }
})
