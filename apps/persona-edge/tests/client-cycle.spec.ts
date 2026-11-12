import { afterAll, beforeAll, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import { IdentityCipher, MemorySyncLog } from '../../../packages/persona/persona-core/src/sync/index.ts'
import type { SyncEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import { HttpTransport, SyncClient, WorkspaceCipher, createRequestSigner } from '../../../packages/persona/persona-sync/src/index.ts'
import { json, newDevice, signedAs } from './signed-fetch.ts'

const scriptPath = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../wrangler.toml', import.meta.url))

let worker: Unstable_DevWorker | undefined

const ana = newDevice('ana') // the owner of the workspace: every call below is signed with this device's key

beforeAll(async () => {
  worker = await unstable_dev(scriptPath, {
    config: configPath,
    persist: false,
    local: true,
    logLevel: 'error',
    vars: { GITHUB_WEBHOOK_SECRET: 'test-secret' },
    experimental: {
      disableExperimentalWarning: true,
      forceLocal: true,
      disableDevRegistry: true,
      watch: false,
    },
  })
  const joined = await signedAs(fetchImpl, ana)('http://edge.test/w/cycle/members', {
    method: 'POST',
    ...json({ kind: 'user', id: 'ana', workspaceId: 'cycle', workspaceRole: 'owner', projectIds: [], keys: ana.keys }),
  })
  if (!joined.ok) throw new Error(`owner bootstrap failed: ${String(joined.status)}`)
}, 90_000)

afterAll(async () => {
  await worker?.stop()
})

function fetchImpl(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (worker === undefined) throw new Error('wrangler')
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url
  return worker.fetch(url, init)
}

function envelope(overrides: Partial<SyncEnvelope> = {}): SyncEnvelope {
  return {
    workspaceId: 'cycle',
    streamId: 'channel:geral',
    seq: 1,
    idempotencyKey: 'c1',
    classification: 'channel',
    at: '2026-11-03T15:00:00Z',
    payload: IdentityCipher.seal('olá', 'wk1'),
    ...overrides,
  }
}

it('two SyncClients converge on the local worker: invite, DM refused, offline resume, cipher', async () => {
  const transport = new HttpTransport('http://edge.test', 'cycle', fetchImpl, createRequestSigner('ana', ana.identity.signing.seed))
  const cipher = new WorkspaceCipher('segredo-ws', 'wk1')
  const a = new SyncClient({ log: new MemorySyncLog(), transport, cipher, workspaceKeyId: 'wk1' })
  const b = new SyncClient({ log: new MemorySyncLog(), transport, cipher, workspaceKeyId: 'wk1' })
  const sealed = a.seal('privado')
  expect('ciphertext' in sealed && sealed.ciphertext.includes('privado')).toBe(false)
  expect(await a.push(envelope({ payload: sealed }))).toMatchObject({ status: 'appended', seq: 1 })
  expect(await b.push(envelope({ payload: sealed }))).toMatchObject({ status: 'duplicate' })
  expect(await a.push(envelope({
    classification: 'dm', streamId: 'dm:ana', seq: 1, idempotencyKey: 'dm1',
  }))).toMatchObject({ status: 'refused', code: 'PRIVATE_NOT_SHARED' })
  const gate = {
    online: false,
    async append(next: SyncEnvelope) {
      if (!this.online) return { status: 'offline' as const, seq: 0 }
      return transport.append(next)
    },
    after(streamId: string, afterSeq: number) {
      return this.online ? transport.after(streamId, afterSeq) : Promise.resolve([])
    },
  }
  const parked = new SyncClient({ log: new MemorySyncLog(), transport: gate })
  expect(await parked.push(envelope({
    workspaceId: 'cycle', streamId: 'channel:geral', seq: 2, idempotencyKey: 'c2',
    payload: IdentityCipher.seal('depois', 'wk1'),
  }))).toMatchObject({ status: 'offline' })
  gate.online = true
  expect(await parked.flush()).toMatchObject([{ status: 'appended', seq: 2 }])
  await a.pull('channel:geral')
  await b.pull('channel:geral')
  expect(a.log.after('channel:geral', 0).map(item => item.seq)).toEqual([1, 2])
  expect(b.log.after('channel:geral', 0).map(item => item.seq)).toEqual([1, 2])
  const issued = await signedAs(fetchImpl, ana)('http://edge.test/w/cycle/invites', {
    method: 'POST',
    ...json({
      id: 'inv-c', token: 'tok-c',
      grant: { workspaceRole: 'member', projectIds: ['pp'], channelIds: ['geral'], dmIds: [] },
      ttlMs: 60_000,
    }),
  })
  expect(issued.ok).toBe(true)
})
