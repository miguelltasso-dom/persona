import { afterAll, beforeAll, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import { IdentityCipher } from '../../../packages/persona/persona-core/src/sync/policy.ts'
import type { SyncEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import { githubSignature } from '../src/hmac.ts'

const scriptPath = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../wrangler.toml', import.meta.url))

let worker: Unstable_DevWorker | undefined

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
}, 90_000)

afterAll(async () => {
  await worker?.stop()
})

async function fetchEdge(path: string, init?: RequestInit): Promise<Response> {
  if (worker === undefined) throw new Error('wrangler')
  return worker.fetch(`http://edge.test${path}`, init)
}

it('two clients converge on the same sequenced stream and a DM never uploads', async () => {
  const first = envelope()
  const second = envelope({
    seq: 2,
    idempotencyKey: 'k2',
    payload: IdentityCipher.seal('segunda', 'wk1'),
  })
  const a1 = await fetchEdge('/w/ws/sync/append', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(first),
  })
  const b1 = await fetchEdge('/w/ws/sync/append', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(first),
  })
  expect(await a1.json()).toMatchObject({ status: 'appended', seq: 1 })
  expect(await b1.json()).toMatchObject({ status: 'duplicate', seq: 1 })
  const gap = await fetchEdge('/w/ws/sync/append', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope({ seq: 4, idempotencyKey: 'gap' })),
  })
  expect(await gap.json()).toMatchObject({ status: 'refused', code: 'SEQ_GAP' })
  await fetchEdge('/w/ws/sync/append', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(second),
  })
  const replayA = await (await fetchEdge('/w/ws/sync/after?streamId=channel:geral&afterSeq=0')).json() as {
    envelopes: Array<{ seq: number }>
  }
  const replayB = await (await fetchEdge('/w/ws/sync/after?streamId=channel:geral&afterSeq=0')).json() as {
    envelopes: Array<{ seq: number }>
  }
  expect(replayA.envelopes.map(item => item.seq)).toEqual([1, 2])
  expect(replayB).toEqual(replayA)
  const dm = await fetchEdge('/w/ws/sync/append', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope({
      classification: 'dm',
      streamId: 'dm:ana',
      seq: 1,
      idempotencyKey: 'dm1',
    })),
  })
  expect(dm.status).toBe(403)
  expect(await dm.json()).toMatchObject({ status: 'refused' })
})

it('issues a single-use invite and refuses a second redeem', async () => {
  const grant = {
    workspaceRole: 'member',
    projectIds: ['launch'],
    channelIds: ['geral'],
    dmIds: ['dm-ana'],
  }
  const issued = await fetchEdge('/w/ws/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'i1', token: 'tok', grant, ttlMs: 60_000 }),
  })
  expect(issued.ok).toBe(true)
  const actor = {
    kind: 'user', id: 'amigo', workspaceId: 'ws', workspaceRole: 'guest', projectIds: [],
  }
  const first = await fetchEdge('/w/ws/invites/tok/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(actor),
  })
  expect((await first.json() as { actor: { projectIds: string[] } }).actor.projectIds).toContain('launch')
  const second = await fetchEdge('/w/ws/invites/tok/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(actor),
  })
  expect(second.status).toBe(409)
})

it('stores a signed GitHub webhook and ignores a replay of the same delivery', async () => {
  const body = JSON.stringify({ zen: 'ok' })
  const signature = await githubSignature('test-secret', body)
  const accepted = await fetchEdge('/w/ws/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
      'x-github-delivery': 'del-1',
      'x-persona-device': 'desk-1',
    },
    body,
  })
  expect(await accepted.json()).toMatchObject({ status: 'accepted' })
  const replay = await fetchEdge('/w/ws/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
      'x-github-delivery': 'del-1',
      'x-persona-device': 'desk-1',
    },
    body,
  })
  expect(await replay.json()).toMatchObject({ status: 'duplicate' })
  const unsigned = await fetchEdge('/w/ws/webhooks/github', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-github-delivery': 'del-2' },
    body,
  })
  expect(unsigned.status).toBe(401)
})

it('puts a shared attachment on R2 and refuses a private one', async () => {
  const refused = await fetchEdge('/w/ws/blobs/note.txt', {
    method: 'PUT',
    headers: { 'content-type': 'text/plain', 'x-classification': 'dm', 'x-stream-id': 'dm:ana' },
    body: 'segredo',
  })
  expect(refused.status).toBe(403)
  const put = await fetchEdge('/w/ws/blobs/note.txt', {
    method: 'PUT',
    headers: { 'content-type': 'text/plain', 'x-classification': 'channel', 'x-stream-id': 'channel:geral' },
    body: 'olá',
  })
  expect(put.ok).toBe(true)
  const got = await fetchEdge('/w/ws/blobs/note.txt')
  expect(await got.text()).toBe('olá')
})
