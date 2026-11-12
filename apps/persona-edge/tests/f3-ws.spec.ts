/**
 * H23 / F3 (Entrega 2): ONE multiplexed, hibernatable WebSocket per device. The hub pushes every envelope of every channel the member may READ on that socket (no per-stream
 * subscription state to lose when the Durable Object sleeps), carries the member's presence on it, answers a text `ping` by itself (an idle team keeps hibernating), and cuts a
 * member the moment the owner revokes them. A REAL worker (wrangler `unstable_dev`, Miniflare, local only — nothing is deployed), one worker for the file.
 *
 *   - the upgrade is signed like every other call: no signature, a bare `x-persona-actor`, a stranger: no socket (401). There is no legacy way in;
 *   - one socket reads two channels; a channel the member was not granted answers `refused` and the socket STAYS (one denied channel never cuts the others);
 *   - `resume` replays what the device missed from its cursor; `append` over the socket is judged exactly like the HTTP one (sealed, signed, under the current epoch);
 *   - presence travels on the same socket and the roster is derived from the live sockets; `ping` is answered with `pong`;
 *   - revoking a member closes their socket.
 */
import { request as httpRequest } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'
import type { SyncEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import { createRequestSigner, newChannelKey, sealChannel, wrapChannelKey } from '../../../packages/persona/persona-sync/src/index.ts'
import { json, newDevice, signedAs, type Device } from './signed-fetch.ts'

vi.setConfig({ testTimeout: 30_000 }) // a socket test waits for the hub (up to 8 s a message)
const scriptPath = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../wrangler.toml', import.meta.url))
const WS = 'f3-ws'
const BASE = `http://edge.test/w/${WS}`

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
const geralKey = newChannelKey()
const vendasKey = newChannelKey()

beforeAll(async () => {
  worker = await unstable_dev(scriptPath, {
    config: configPath, persist: false, local: true, logLevel: 'error', vars: { GITHUB_WEBHOOK_SECRET: 'test-secret' },
    experimental: { disableExperimentalWarning: true, forceLocal: true, disableDevRegistry: true, watch: false },
  })
}, 90_000)
afterAll(async () => { await worker?.stop() })

const wrapFor = (channelId: string, key: Buffer, who: Device, epoch = 1) => ({
  channelId, epoch, recipientId: who.id,
  wrap: wrapChannelKey({ workspaceId: WS, channelId, epoch, recipientId: who.id, by: 'ana' }, { key, recipientAgreementPublic: who.keys.agreement, signingSeed: ana.identity.signing.seed }),
})
const sealed = (key: Buffer, who: Device, plaintext: string, seq: number, streamId: string): SyncEnvelope => ({
  workspaceId: WS, streamId, seq, idempotencyKey: `k-${streamId}-${String(seq)}`, classification: 'channel', at: '2026-11-12T10:00:00Z',
  payload: sealChannel({ workspaceId: WS, streamId, epoch: 1, authorId: who.id, key, signingSeed: who.identity.signing.seed, plaintext }),
})

/** What the hub says on the socket (the fields the spec reads). */
interface Msg {
  readonly type?: string
  readonly requestId?: string
  readonly actor?: string
  readonly status?: string
  readonly code?: string
  readonly streamId?: string
  readonly head?: number
  readonly roster?: ReadonlyArray<{ readonly actor: string; readonly state: string; readonly machine?: string }>
  readonly envelope?: { readonly streamId: string; readonly seq: number; readonly idempotencyKey?: string }
}

/** A device's one socket: everything the hub says lands in `inbox` (JSON objects, or the raw text for the heartbeat). */
interface Sock {
  readonly ws: WebSocket
  readonly inbox: unknown[]
  send(value: unknown): void
  until(match: (message: Msg) => boolean, ms?: number): Promise<Msg>
  closed(): Promise<number>
}

/** Open the socket as `device` (signed upgrade). The standard client cannot set headers; undici's accepts them in the init dictionary. */
async function connect(device: Device): Promise<Sock> {
  if (worker === undefined) throw new Error('wrangler')
  const target = `/w/${WS}/sync`
  const authorization = createRequestSigner(device.id, device.identity.signing.seed).authorize({ method: 'GET', target })
  const Socket = WebSocket as unknown as new (url: string, init: { headers: Record<string, string> }) => WebSocket
  const ws = new Socket(`ws://${worker.address}:${String(worker.port)}${target}`, { headers: { authorization } })
  const inbox: unknown[] = []
  const waiters: Array<() => void> = []
  ws.addEventListener('message', (event) => {
    const text = String(event.data)
    try { inbox.push(JSON.parse(text)) } catch { inbox.push(text) }
    for (const wake of waiters.splice(0)) wake()
  })
  const closed = new Promise<number>((resolve) => { ws.addEventListener('close', (event) => { resolve(event.code) }) })
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => { resolve() })
    ws.addEventListener('error', () => { reject(new Error('o upgrade foi recusado')) })
  })
  return {
    ws, inbox,
    send: (value) => { ws.send(typeof value === 'string' ? value : JSON.stringify(value)) },
    closed: () => closed,
    until: async (match, ms = 8000) => {
      const deadline = Date.now() + ms
      for (;;) {
        const hit = inbox.find(item => typeof item === 'object' && item !== null && match(item))
        if (hit !== undefined) return hit
        if (Date.now() > deadline) throw new Error(`nenhuma mensagem casou em ${String(ms)} ms; chegou: ${JSON.stringify(inbox).slice(0, 600)}`)
        await new Promise<void>((resolve) => { waiters.push(resolve); setTimeout(resolve, 100) })
      }
    },
  }
}

/** The status of an upgrade attempt that carries `headers` (a plain HTTP request: no socket is ever opened when it is refused). */
async function upgradeStatus(headers: Record<string, string>): Promise<number> {
  if (worker === undefined) throw new Error('wrangler')
  return await new Promise<number>((resolve, reject) => {
    const req = httpRequest({ host: worker!.address, port: worker!.port, path: `/w/${WS}/sync`, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', ...headers } }, (res) => { res.resume(); resolve(res.statusCode ?? 0) })
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(res.statusCode ?? 101) })
    req.on('error', reject)
    req.end()
  })
}

describe('the team exists: Ana owns it, Beto was let in for two channels, a third is hers alone', () => {
  it('onboards the members the way the product does (owner registers, keys, invite, request, approval with the wraps)', async () => {
    expect((await asAna(`${BASE}/members`, { method: 'POST', ...json({ kind: 'user', id: 'ana', workspaceId: WS, workspaceRole: 'owner', projectIds: ['launch'], displayName: 'Ana', keys: ana.keys }) })).status).toBe(200)
    for (const [channel, key] of [['geral', geralKey], ['vendas', vendasKey]] as const) {
      expect((await asAna(`${BASE}/channels/${channel}/rotate`, { method: 'POST', ...json({ epoch: 1, wraps: [wrapFor(channel, key, ana)] }) })).status).toBe(200)
    }
    expect((await asAna(`${BASE}/invites`, { method: 'POST', ...json({ id: 'inv-1', token: 'tok-1', ttlMs: 60_000, grant: { workspaceRole: 'member', projectIds: ['launch'], channelIds: ['geral', 'vendas'], dmIds: [] } }) })).status).toBe(200)
    expect((await asBeto(`${BASE}/invites/tok-1/request`, { method: 'POST', ...json({ actorId: 'beto', displayName: 'Beto', keys: beto.keys }) })).status).toBe(200)
    const [request] = ((await (await asAna(`${BASE}/join-requests`)).json()) as { requests: Array<{ id: string }> }).requests
    const approved = await asAna(`${BASE}/join-requests/${request?.id ?? ''}/approve`, { method: 'POST', ...json({ wraps: [wrapFor('geral', geralKey, beto), wrapFor('vendas', vendasKey, beto)] }) })
    expect(approved.status).toBe(200)
  }, 60_000)
})

describe('the upgrade is signed like every other call', () => {
  it('no signature, a bare x-persona-actor and a person who is not a member never get a socket', async () => {
    expect(await upgradeStatus({})).toBe(401)
    expect(await upgradeStatus({ 'x-persona-actor': 'ana' })).toBe(401)
    const stranger = createRequestSigner('caio', caio.identity.signing.seed).authorize({ method: 'GET', target: `/w/${WS}/sync` })
    expect(await upgradeStatus({ authorization: stranger })).toBeGreaterThanOrEqual(401)
    expect(await upgradeStatus({ authorization: stranger })).toBeLessThan(500)
  })
})

describe('one socket carries everything the member may read', () => {
  it('says hello with who they are and who is here; the heartbeat is answered without waking the hub (ping -> pong)', async () => {
    const a = await connect(ana)
    const hello = await a.until(message => message.type === 'hello')
    expect(hello.actor).toBe('ana')
    expect((hello.roster ?? []).map(row => row.actor)).toContain('ana')
    a.send('ping')
    for (let round = 0; round < 80 && !a.inbox.includes('pong'); round += 1) await new Promise(resolve => setTimeout(resolve, 50))
    expect(a.inbox).toContain('pong')
    a.ws.close()
  })

  it('Beto reads TWO channels on his single socket, in order, as Ana writes them (sealed; the hub never opens them)', async () => {
    const a = await connect(ana)
    const b = await connect(beto)
    await b.until(message => message.type === 'hello')
    a.send({ type: 'append', requestId: 'g1', envelope: sealed(geralKey, ana, 'bom dia, time', 1, 'channel:geral') })
    a.send({ type: 'append', requestId: 'v1', envelope: sealed(vendasKey, ana, 'meta da semana', 1, 'channel:vendas') })
    a.send({ type: 'append', requestId: 'g2', envelope: sealed(geralKey, ana, 'reunião às 10', 2, 'channel:geral') })
    expect((await a.until(message => message.type === 'ack' && message.requestId === 'g2')).status).toBe('appended')
    const geral = [] as number[]
    await b.until(message => message.type === 'envelope' && message.envelope?.streamId === 'channel:vendas')
    await b.until(message => message.type === 'envelope' && message.envelope?.streamId === 'channel:geral' && message.envelope?.seq === 2)
    for (const item of b.inbox) {
      const message = item as { type?: string; envelope?: { streamId: string; seq: number } }
      if (message.type === 'envelope' && message.envelope?.streamId === 'channel:geral') geral.push(message.envelope?.seq)
    }
    expect(geral).toEqual([1, 2])
    a.ws.close(); b.ws.close()
  })

  it('a channel Beto was not granted answers `refused` and his socket STAYS: the other channels keep flowing', async () => {
    const b = await connect(beto)
    await b.until(message => message.type === 'hello')
    b.send({ type: 'resume', requestId: 'r-denied', streamId: 'channel:diretoria', afterSeq: 0 })
    const refused = await b.until(message => message.type === 'refused' && message.requestId === 'r-denied')
    expect(refused.streamId).toBe('channel:diretoria')
    b.send({ type: 'resume', requestId: 'r-geral', streamId: 'channel:geral', afterSeq: 1 })
    const resumed = await b.until(message => message.type === 'resumed' && message.requestId === 'r-geral')
    expect(resumed.head).toBe(2)
    expect(b.inbox.filter(item => (item as { type?: string; envelope?: { seq: number } }).type === 'envelope' && (item as { envelope: { seq: number } }).envelope.seq === 2)).toHaveLength(1) // only what he missed (afterSeq 1)
    b.ws.close()
  })

  it('an append over the socket is judged like the HTTP one: a clear message in a keyed channel is refused, not stored, not pushed', async () => {
    const a = await connect(ana)
    const b = await connect(beto)
    await b.until(message => message.type === 'hello')
    const clear: SyncEnvelope = { workspaceId: WS, streamId: 'channel:geral', seq: 3, idempotencyKey: 'k-clear', classification: 'channel', at: '2026-11-12T10:00:00Z', payload: { clear: 'em claro' } }
    a.send({ type: 'append', requestId: 'c1', envelope: clear })
    const ack = await a.until(message => message.type === 'ack' && message.requestId === 'c1')
    expect(ack.status).toBe('refused')
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(b.inbox.some(item => (item as { envelope?: { idempotencyKey?: string } }).envelope?.idempotencyKey === 'k-clear')).toBe(false)
    a.ws.close(); b.ws.close()
  })
})

describe('presence rides the same socket', () => {
  it('Beto says he is busy: Ana is told (roster), and when Beto leaves the roster loses him', async () => {
    const a = await connect(ana)
    const b = await connect(beto)
    await a.until(message => message.type === 'roster' && (message.roster ?? []).some(row => row.actor === 'beto'))
    b.send({ type: 'presence', state: 'busy', machine: 'Notebook do Beto' })
    const busy = await a.until(message => message.type === 'roster' && (message.roster ?? []).some(row => row.actor === 'beto' && row.state === 'busy'))
    expect(busy.roster?.find(row => row.actor === 'beto')?.machine).toBe('Notebook do Beto')
    b.send({ type: 'presence', state: 'not-a-state' })
    await b.until(message => message.type === 'refused' && message.code === 'BAD_REQUEST')
    b.ws.close()
    await a.until(message => message.type === 'roster' && !(message.roster ?? []).some(row => row.actor === 'beto'))
    a.ws.close()
  })
})

describe('a member who is revoked is cut', () => {
  it('the owner revokes Beto: his socket is closed by the hub, and he cannot open another', async () => {
    const b = await connect(beto)
    await b.until(message => message.type === 'hello')
    expect((await asAna(`${BASE}/members/beto/revoke`, { method: 'POST' })).status).toBe(200)
    // The hub sent its close frame (policy violation): the client leaves OPEN at once. (Miniflare keeps the TCP connection, so the standard `close` event can lag behind: the state is what proves the cut.)
    for (let round = 0; round < 160 && b.ws.readyState < 2; round += 1) await new Promise(resolve => setTimeout(resolve, 50))
    expect(b.ws.readyState, `o socket do membro revogado tem de ser fechado pelo hub (caixa: ${JSON.stringify(b.inbox).slice(0, 300)})`).toBeGreaterThanOrEqual(2)
    const again = createRequestSigner('beto', beto.identity.signing.seed).authorize({ method: 'GET', target: `/w/${WS}/sync` })
    expect(await upgradeStatus({ authorization: again })).toBeGreaterThanOrEqual(401)
  })
})
