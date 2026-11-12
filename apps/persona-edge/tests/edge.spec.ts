import { afterAll, beforeAll, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import { IdentityCipher } from '../../../packages/persona/persona-core/src/sync/policy.ts'
import type { SyncEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import { githubSignature } from '../src/hmac.ts'
import { json, newDevice, signedAs } from './signed-fetch.ts'

const scriptPath = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../wrangler.toml', import.meta.url))

let worker: Unstable_DevWorker | undefined

const ana = newDevice('ana')
const amigo = newDevice('amigo')
const outro = newDevice('outro')

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
  // The workspace is claimed by its owner, who registers the PUBLIC keys this call is signed with.
  const joined = await call('/w/ws/members', {
    method: 'POST',
    ...json({ kind: 'user', id: 'ana', workspaceId: 'ws', workspaceRole: 'owner', projectIds: ['launch'], keys: ana.keys }),
  })
  if (!joined.ok) throw new Error(`owner bootstrap failed: ${String(joined.status)}`)
}, 90_000)

afterAll(async () => {
  await worker?.stop()
})

/** The worker, by path (no signature: what a stranger can send). */
async function fetchEdge(path: string, init?: RequestInit): Promise<Response> {
  if (worker === undefined) throw new Error('wrangler')
  return worker.fetch(`http://edge.test${path}`, init)
}

const raw: typeof fetch = (input, init) => fetchEdge(String(input).replace('http://edge.test', ''), init)
const asAna = signedAs(raw, ana) // ONE signer for the owner: its timestamps only go up
/** A call signed as the owner, by path. */
const call = (path: string, init?: RequestInit): Promise<Response> => asAna(`http://edge.test${path}`, init)

it('two clients converge on the same sequenced stream and a DM never uploads', async () => {
  const first = envelope()
  const second = envelope({
    seq: 2,
    idempotencyKey: 'k2',
    payload: IdentityCipher.seal('segunda', 'wk1'),
  })
  const a1 = await call('/w/ws/sync/append', { method: 'POST', ...json(first) })
  const b1 = await call('/w/ws/sync/append', { method: 'POST', ...json(first) })
  expect(await a1.json()).toMatchObject({ status: 'appended', seq: 1 })
  expect(await b1.json()).toMatchObject({ status: 'duplicate', seq: 1 })
  const gap = await call('/w/ws/sync/append', { method: 'POST', ...json(envelope({ seq: 4, idempotencyKey: 'gap' })) })
  expect(await gap.json()).toMatchObject({ status: 'refused', code: 'SEQ_GAP' })
  await call('/w/ws/sync/append', { method: 'POST', ...json(second) })
  const replayA = await (await call('/w/ws/sync/after?streamId=channel:geral&afterSeq=0')).json() as {
    envelopes: Array<{ seq: number }>
  }
  const replayB = await (await call('/w/ws/sync/after?streamId=channel:geral&afterSeq=0')).json() as {
    envelopes: Array<{ seq: number }>
  }
  expect(replayA.envelopes.map(item => item.seq)).toEqual([1, 2])
  expect(replayB).toEqual(replayA)
  const dm = await call('/w/ws/sync/append', {
    method: 'POST',
    ...json(envelope({ classification: 'dm', streamId: 'dm:ana', seq: 1, idempotencyKey: 'dm1' })),
  })
  expect(dm.status).toBe(403)
  expect(await dm.json()).toMatchObject({ status: 'refused' })
})

it('a stranger who sends nothing signed gets nothing: the same calls without a signature are all 401', async () => {
  const unsigned = await fetchEdge('/w/ws/sync/after?streamId=channel:geral&afterSeq=0', { headers: { 'x-persona-actor': 'ana' } })
  expect(unsigned.status).toBe(401)
  expect((await fetchEdge('/w/ws/sync/append', { method: 'POST', ...json(envelope({ idempotencyKey: 'sem-assinatura' })) })).status).toBe(401)
})

it('issues a single-use invite: the person only ASKS, the owner approves, and a second person with the same link is refused', async () => {
  const grant = {
    workspaceRole: 'member',
    projectIds: ['launch'],
    channelIds: ['geral'],
    dmIds: ['dm-ana'],
  }
  const issued = await call('/w/ws/invites', { method: 'POST', ...json({ id: 'i1', token: 'tok', grant, ttlMs: 60_000 }) })
  expect(issued.ok).toBe(true)
  const asAmigo = signedAs(raw, amigo)
  const asked = await asAmigo('http://edge.test/w/ws/invites/tok/request', { method: 'POST', ...json({ actorId: 'amigo', keys: amigo.keys }) })
  expect(asked.ok).toBe(true)
  const request = (await asked.json() as { request: { id: string } }).request
  const approved = await call(`/w/ws/join-requests/${request.id}/approve`, { method: 'POST', ...json({ wraps: [] }) })
  expect((await approved.json() as { actor: { projectIds: string[] } }).actor.projectIds).toContain('launch')
  const second = await signedAs(raw, outro)('http://edge.test/w/ws/invites/tok/request', { method: 'POST', ...json({ actorId: 'outro', keys: outro.keys }) })
  expect(second.status).toBe(410) // the link was used by one person
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

it('puts a shared attachment on R2 for a member and refuses a private one', async () => {
  const refused = await call('/w/ws/blobs/note.txt', {
    method: 'PUT',
    headers: { 'content-type': 'text/plain', 'x-classification': 'dm', 'x-stream-id': 'dm:ana' },
    body: 'segredo',
  })
  expect(refused.status).toBe(403)
  const put = await call('/w/ws/blobs/note.txt', {
    method: 'PUT',
    headers: { 'content-type': 'text/plain', 'x-classification': 'channel', 'x-stream-id': 'channel:geral' },
    body: 'olá',
  })
  expect(put.ok).toBe(true)
  const got = await call('/w/ws/blobs/note.txt', { headers: { 'x-stream-id': 'channel:geral' } })
  expect(await got.text()).toBe('olá')
  expect((await fetchEdge('/w/ws/blobs/note.txt')).status).toBe(401) // nobody without a signature reads it
})
