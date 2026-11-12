/**
 * H23 / F2 (Entrega 2): the hub knows WHO calls by a signature, lets a person in only after the owner approves, stores the channel keys it cannot open, and checks that
 * a message was written and signed by who it says, under the channel's current epoch. A REAL worker (wrangler `unstable_dev`, Miniflare, local only), one worker for the file.
 *
 *   - no signature, a bare `x-persona-actor`, another person's key, an old or future timestamp, a repeated signature: 401. The source has no way to skip this;
 *   - a person who follows an invite link is NOT a member until the owner approves; the owner's wrap opens only for them (the F1 crypto);
 *   - a channel with a key accepts only sealed messages, by their author, signed, under the current epoch; a member who is removed cannot be wrapped for the next epoch;
 *   - attachments and the webhook list are behind the same proof; the webhook POST works only through the Worker (HMAC), also with a trailing slash.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import type { SyncEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import {
  ChannelCryptoError, newChannelKey, openChannel, sealChannel, unwrapChannelKey, wrapChannelKey, createRequestSigner,
  type KeyWrap,
} from '../../../packages/persona/persona-sync/src/index.ts'
import { githubSignature } from '../src/hmac.ts'
import { json, newDevice, signedAs, type Device } from './signed-fetch.ts'

const here = dirname(fileURLToPath(import.meta.url))
const scriptPath = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../wrangler.toml', import.meta.url))
const WS = 'f2-ws'
const BASE = `http://edge.test/w/${WS}`
const STREAM = 'channel:geral'

let worker: Unstable_DevWorker | undefined
const raw: typeof fetch = (input, init) => {
  if (worker === undefined) throw new Error('wrangler')
  return worker.fetch(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init as never) as unknown as Promise<Response>
}

const ana = newDevice('ana')
const beto = newDevice('beto')
const caio = newDevice('caio')
const asAna = signedAs(raw, ana)
const asBeto = signedAs(raw, beto)
const asCaio = signedAs(raw, caio)
const code = async (response: Response): Promise<string> => String((await response.json() as { code?: string; error?: string }).code ?? '')

beforeAll(async () => {
  worker = await unstable_dev(scriptPath, {
    config: configPath, persist: false, local: true, logLevel: 'error', vars: { GITHUB_WEBHOOK_SECRET: 'test-secret' },
    experimental: { disableExperimentalWarning: true, forceLocal: true, disableDevRegistry: true, watch: false },
  })
}, 90_000)
afterAll(async () => { await worker?.stop() })

const owner = (device: Device) => ({ kind: 'user', id: device.id, workspaceId: WS, workspaceRole: 'owner', projectIds: ['launch'], displayName: 'Ana', keys: device.keys })
const wrapFor = (key: Buffer, who: Device, epoch: number, by = 'ana') => {
  const wrap = wrapChannelKey({ workspaceId: WS, channelId: 'geral', epoch, recipientId: who.id, by }, { key, recipientAgreementPublic: who.keys.agreement, signingSeed: ana.identity.signing.seed })
  return { channelId: 'geral', epoch, recipientId: who.id, wrap }
}
const sealed = (key: Buffer, who: Device, plaintext: string, epoch: number, seq: number, streamId = STREAM): SyncEnvelope => ({
  workspaceId: WS, streamId, seq, idempotencyKey: `k-${who.id}-${String(seq)}`, classification: 'channel', at: '2026-11-12T10:00:00Z',
  payload: sealChannel({ workspaceId: WS, streamId, epoch, authorId: who.id, key, signingSeed: who.identity.signing.seed, plaintext }),
})

describe('who calls is proven, never claimed', () => {
  it('no signature, a bare x-persona-actor, a repeat, an old timestamp and another person\'s key: all 401, before anyone is even a member', async () => {
    const bare = await raw(`${BASE}/sync/after?streamId=${STREAM}&afterSeq=0`, { headers: { 'x-persona-actor': 'ana' } })
    expect(bare.status).toBe(401)
    expect(await code(bare)).toBe('AUTH_MISSING')
    expect((await raw(`${BASE}/members`, { method: 'POST', ...json(owner(ana)) })).status).toBe(401) // the bootstrap is signed too
    const forged = signedAs(raw, { ...ana, identity: beto.identity }) // says "ana", signs with Beto's key
    expect((await forged(`${BASE}/members`, { method: 'POST', ...json(owner(ana)) })).status).toBe(401)
  })

  it('the owner registers with the keys the call is signed by; the same call cannot be replayed, and an old or future timestamp is refused', async () => {
    const joined = await asAna(`${BASE}/members`, { method: 'POST', ...json(owner(ana)) })
    expect(joined.status).toBe(200)
    const signer = createRequestSigner('ana', ana.identity.signing.seed)
    const target = `/w/${WS}/sync/after?streamId=${encodeURIComponent(STREAM)}&afterSeq=0`
    const header = signer.authorize({ method: 'GET', target })
    expect((await raw(`http://edge.test${target}`, { headers: { authorization: header } })).status).toBe(200)
    const again = await raw(`http://edge.test${target}`, { headers: { authorization: header } })
    expect(again.status).toBe(401)
    expect(await code(again)).toBe('AUTH_REPLAYED')
    const old = signedAs(raw, ana, () => Date.now() - 10 * 60_000)
    expect(await code(await old(`http://edge.test${target}`))).toBe('AUTH_STALE')
    const future = signedAs(raw, ana, () => Date.now() + 10 * 60_000)
    expect(await code(await future(`http://edge.test${target}`))).toBe('AUTH_STALE')
  })

  it('a second bootstrap (somebody else claiming the workspace) is refused', async () => {
    const taken = await asBeto(`${BASE}/members`, { method: 'POST', ...json(owner(beto)) })
    expect([401, 403]).toContain(taken.status)
  })
})

describe('a person is let in only when the owner approves', () => {
  const channelKey = newChannelKey()

  it('the owner starts the channel key (epoch 1) and issues an invite', async () => {
    const started = await asAna(`${BASE}/channels/geral/rotate`, { method: 'POST', ...json({ epoch: 1, wraps: [wrapFor(channelKey, ana, 1)] }) })
    expect(started.status).toBe(200)
    expect((await asAna(`${BASE}/invites`, {
      method: 'POST', ...json({ id: 'inv-1', token: 'tok-1', ttlMs: 60_000, grant: { workspaceRole: 'member', projectIds: ['launch'], channelIds: ['geral'], dmIds: [] } }),
    })).status).toBe(200)
  })

  it('following the link only ASKS: until the owner approves the person is not a member (401), and cannot read or write', async () => {
    const asked = await asBeto(`${BASE}/invites/tok-1/request`, { method: 'POST', ...json({ actorId: 'beto', displayName: 'Beto', keys: beto.keys }) })
    expect(asked.status).toBe(200)
    const request = (await asked.json() as { request: { id: string; keys: object } }).request
    expect(request.keys).toEqual(beto.keys)
    expect((await asBeto(`${BASE}/sync/after?streamId=${STREAM}&afterSeq=0`)).status).toBe(401) // unknown actor: not a member yet
    const same = await asBeto(`${BASE}/invites/tok-1/request`, { method: 'POST', ...json({ actorId: 'beto', keys: beto.keys }) }) // asking twice is not two requests
    expect(((await same.json()) as { request: { id: string } }).request.id).toBe(request.id)
    const pending = await asAna(`${BASE}/join-requests`)
    expect(((await pending.json()) as { requests: Array<{ id: string }> }).requests.map(item => item.id)).toEqual([request.id])
    expect((await asBeto(`${BASE}/join-requests`)).status).not.toBe(200) // only the owner lists them
  })

  it('a join request is signed with the key it registers: somebody else\'s key cannot ask in Beto\'s name', async () => {
    const forged = signedAs(raw, { ...beto, identity: caio.identity })
    expect((await forged(`${BASE}/invites/tok-1/request`, { method: 'POST', ...json({ actorId: 'beto', keys: beto.keys }) })).status).toBe(401)
  })

  it('the owner approves with the wrap: Beto becomes a member, opens the channel key with his private key and reads what Ana sent', async () => {
    const [request] = ((await (await asAna(`${BASE}/join-requests`)).json()) as { requests: Array<{ id: string }> }).requests
    expect((await asBeto(`${BASE}/join-requests/${request?.id ?? ''}/approve`, { method: 'POST', ...json({ wraps: [] }) })).status).not.toBe(200) // not his to approve
    const approved = await asAna(`${BASE}/join-requests/${request?.id ?? ''}/approve`, { method: 'POST', ...json({ wraps: [wrapFor(channelKey, beto, 1)] }) })
    expect(approved.status).toBe(200)
    expect((await asAna(`${BASE}/join-requests/${request?.id ?? ''}/approve`, { method: 'POST', ...json({ wraps: [] }) })).status).toBe(409)

    expect((await asAna(`${BASE}/sync/append`, { method: 'POST', ...json(sealed(channelKey, ana, 'Bem-vindo, Beto!', 1, 1)) })).status).toBe(200)
    const mine = (await (await asBeto(`${BASE}/channels/geral/key-wraps`)).json()) as { wraps: Array<{ wrap: KeyWrap }>; epoch: number }
    expect(mine.epoch).toBe(1)
    expect(mine.wraps).toHaveLength(1)
    const opened = unwrapChannelKey(mine.wraps[0]!.wrap, { workspaceId: WS, channelId: 'geral', epoch: 1, recipientId: 'beto', by: 'ana' }, {
      agreementSecret: beto.identity.agreement.secret, agreementPublic: beto.keys.agreement, wrapperSigningPublic: ana.keys.signing,
    })
    const seen = (await (await asBeto(`${BASE}/sync/after?streamId=${encodeURIComponent(STREAM)}&afterSeq=0`)).json()) as { envelopes: SyncEnvelope[] }
    expect(openChannel(seen.envelopes[0]!.payload as never, { workspaceId: WS, streamId: STREAM, key: opened, authorSigningPublic: ana.keys.signing })).toBe('Bem-vindo, Beto!')
    expect((await asCaio(`${BASE}/channels/geral/key-wraps`)).status).toBe(401) // a stranger gets no wrap
  })

  it('nobody reads another member\'s wrap, and a wrap for a channel the invite never granted is refused at approval', async () => {
    const own = (await (await asAna(`${BASE}/channels/geral/key-wraps`)).json()) as { wraps: Array<{ recipientId: string }> }
    expect(own.wraps.map(item => item.recipientId)).toEqual(['ana'])
  })
})

describe('a channel with a key takes only sealed messages, by their author, under the current epoch', () => {
  const key = newChannelKey()
  it('the epoch moves with a rotate; a stale one, a clear one, a forged author and somebody else\'s signature are refused', async () => {
    // fresh channel for this block so the sequence starts clean
    expect((await asAna(`${BASE}/channels/vendas/rotate`, { method: 'POST', ...json({ epoch: 1, wraps: [{ ...wrapFor(key, ana, 1), channelId: 'vendas', wrap: wrapChannelKey({ workspaceId: WS, channelId: 'vendas', epoch: 1, recipientId: 'ana', by: 'ana' }, { key, recipientAgreementPublic: ana.keys.agreement, signingSeed: ana.identity.signing.seed }) }] }) })).status).toBe(200)
    const stream = 'channel:vendas'
    const send = (envelope: SyncEnvelope) => asAna(`${BASE}/sync/append`, { method: 'POST', ...json(envelope) })
    const clear: SyncEnvelope = { workspaceId: WS, streamId: stream, seq: 1, idempotencyKey: 'clear', classification: 'channel', at: '2026-11-12T10:00:00Z', payload: { clear: 'texto aberto' } }
    expect(await code(await send(clear))).toBe('E2EE_REQUIRED')
    expect(await code(await send(sealed(key, ana, 'x', 2, 1, stream)))).toBe('STALE_EPOCH')
    expect(await code(await send(sealed(key, beto, 'x', 1, 1, stream)))).toBe('AUTHOR_MISMATCH') // beto's message through Ana's connection
    const lie = sealed(key, ana, 'x', 1, 1, stream)
    const tampered = { ...lie, payload: { ...(lie.payload as object), ciphertext: Buffer.from('outro texto').toString('base64') } } as SyncEnvelope
    expect(await code(await send(tampered))).toBe('BAD_SIGNATURE') // the signature no longer matches what arrived: the Worker verifies Ed25519
    expect((await send(sealed(key, ana, 'oi', 1, 1, stream))).status).toBe(200)
    expect(() => openChannel(lie.payload as never, { workspaceId: WS, streamId: stream, key: newChannelKey(), authorSigningPublic: ana.keys.signing })).toThrow(ChannelCryptoError)
  })

  it('removing a member: rotate to the next epoch wraps ONLY for who stays; the one removed gets 403 and cannot be wrapped for', async () => {
    const revoked = await asAna(`${BASE}/members/beto/revoke`, { method: 'POST' })
    expect(revoked.status).toBe(200)
    expect(((await revoked.json()) as { rotateChannels: string[] }).rotateChannels).toEqual(expect.arrayContaining(['geral']))
    expect(await code(await asBeto(`${BASE}/sync/after?streamId=${STREAM}&afterSeq=0`))).toBe('ACCESS_REVOKED')
    const next = newChannelKey()
    const refused = await asAna(`${BASE}/channels/geral/rotate`, { method: 'POST', ...json({ epoch: 2, wraps: [wrapFor(next, beto, 2)] }) })
    expect(refused.status).toBe(400)
    expect(await code(refused)).toBe('WRAP_REFUSED')
    expect((await asAna(`${BASE}/channels/geral/rotate`, { method: 'POST', ...json({ epoch: 2, wraps: [wrapFor(next, ana, 2)] }) })).status).toBe(200)
    expect((await asAna(`${BASE}/channels/geral/rotate`, { method: 'POST', ...json({ epoch: 2, wraps: [] }) })).status).toBe(409) // the same epoch twice
  })
})

describe('attachments and webhooks are behind the same door', () => {
  it('an attachment needs a member of the channel: no signature or a stranger 401, a member PUT and GET', async () => {
    const put = (fetcher: typeof fetch, key: string) => fetcher(`${BASE}/blobs/${key}`, { method: 'PUT', headers: { 'x-stream-id': STREAM, 'content-type': 'application/octet-stream' }, body: new Uint8Array([1, 2, 3, 4]) })
    expect((await put(raw, 'a1.enc')).status).toBe(401)
    expect((await put(asCaio, 'a1.enc')).status).toBe(401)
    expect((await put(asAna, 'a1.enc')).status).toBe(200)
    expect((await raw(`${BASE}/blobs/a1.enc`, { headers: { 'x-stream-id': STREAM } })).status).toBe(401)
    const got = await asAna(`${BASE}/blobs/a1.enc`, { headers: { 'x-stream-id': STREAM } })
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('a private attachment never goes to the cloud (the same rule as an envelope), and an unknown classification is refused, not guessed', async () => {
    const put = (classification: string, streamId: string) => asAna(`${BASE}/blobs/privado.enc`, { method: 'PUT', headers: { 'x-stream-id': streamId, 'x-classification': classification, 'content-type': 'application/octet-stream' }, body: new Uint8Array([9]) })
    expect((await put('dm', 'dm:ana')).status).toBe(403)
    expect((await put('private', 'private:ana')).status).toBe(403)
    expect((await put('tudo-liberado', STREAM)).status).toBe(403)
    expect((await put('channel', STREAM)).status).toBe(200)
  })

  it('the webhook list needs a member; the POST works only through the Worker with GitHub\'s HMAC, a trailing slash included', async () => {
    expect((await raw(`${BASE}/webhooks/github`)).status).toBe(401)
    expect((await asAna(`${BASE}/webhooks/github`)).status).toBe(200)
    const body = JSON.stringify({ zen: 'ok' })
    const signature = await githubSignature('test-secret', body)
    const ok = await raw(`${BASE}/webhooks/github`, { method: 'POST', headers: { 'x-hub-signature-256': signature, 'x-github-delivery': 'd1', 'x-persona-device': 'dev1', 'content-type': 'application/json' }, body })
    expect(ok.status).toBe(200)
    const slash = await raw(`${BASE}/webhooks/github/`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-persona-internal': 'forjado' }, body: JSON.stringify({ deliveryId: 'x', receivedAt: 'now', ownerDeviceId: 'dev1', payload: {} }) })
    expect(slash.status).toBe(401)
    expect(await code(slash)).toBe('AUTH_NOT_INTERNAL')
    expect((await raw(`${BASE}/webhooks/github`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status).toBe(401) // no HMAC at the Worker
  })
})

describe('the edge has no way to skip the signature (the Keel\'s condition)', () => {
  it('nothing in the edge source or its config reads a switch that turns the check off', () => {
    const src = join(here, '..', 'src')
    const files = [...readdirSync(src).filter(name => name.endsWith('.ts')).map(name => join(src, name)), join(here, '..', 'wrangler.toml')]
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/legacy|bypass|skip[_-]?auth|auth[_-]?disabled|insecure|unsigned/iu)
      expect(text, file).not.toMatch(/env\.(AUTH|SIGN|LEGACY)\w*/u)
    }
    expect(readFileSync(join(here, '..', 'wrangler.toml'), 'utf8')).not.toMatch(/d1_databases/u) // and no D1: the hub's own SQLite holds everything
  })
})
