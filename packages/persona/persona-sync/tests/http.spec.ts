import { expect, it } from 'vitest'
import { HttpTransport, MemoryReplayStore, createRequestSigner, generateIdentity, verifyRequest } from '../src/index.ts'

const bob = generateIdentity()
const ana = generateIdentity()
const asBob = createRequestSigner('bob', bob.signing.seed)
const asAna = createRequestSigner('ana', ana.signing.seed)

it('reports revoked replay separately from an empty authorized stream', async () => {
  const refused = new HttpTransport('http://edge.test', 'ws', async () => Response.json({
    status: 'refused', code: 'ACCESS_REVOKED', seq: 0,
  }, { status: 403 }), asBob)
  await expect(refused.after('channel:geral', 0)).rejects.toMatchObject({ code: 'ACCESS_REVOKED', status: 403 })
  const allowed = new HttpTransport('http://edge.test', 'ws', async () => Response.json({ envelopes: [] }), asAna)
  expect(await allowed.after('channel:geral', 0)).toEqual([])
})

it('distinguishes network failure from a successful empty replay', async () => {
  const offline = new HttpTransport('http://edge.test', 'ws', async () => { throw new Error('offline') }, asBob)
  await expect(offline.after('channel:geral', 0)).rejects.toMatchObject({ code: 'SYNC_UNAVAILABLE' })
})

it('proves who calls by a signature over the request, and never sends the bare x-persona-actor header', async () => {
  const seen: Array<{ url: string; method: string; headers: Headers; body: string }> = []
  const fetchImpl: typeof fetch = async (url, init) => {
    seen.push({ url: String(url), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: typeof init?.body === 'string' ? init.body : '' })
    return Response.json({ envelopes: [], status: 'appended', seq: 1 })
  }
  const transport = new HttpTransport('http://edge.test', 'ws', fetchImpl, asBob)
  await transport.after('channel:geral', 0)
  await transport.append({
    workspaceId: 'ws', streamId: 'channel:geral', seq: 1, idempotencyKey: 'k1', classification: 'channel', at: '2026-11-12T10:00:00Z', payload: { clear: 'oi' },
  })
  expect(seen).toHaveLength(2)
  for (const call of seen) expect(call.headers.get('x-persona-actor')).toBeNull()

  // what the hub receives verifies against Bob's public key: GET (no body) and POST (body covered by the signature)
  const roster = (actor: string): string | undefined => (actor === 'bob' ? bob.signing.publicKey : undefined)
  for (const call of seen) {
    const target = call.url.replace('http://edge.test', '')
    const verified = await verifyRequest(
      { method: call.method, target, authorization: call.headers.get('authorization'), body: new TextEncoder().encode(call.body) },
      roster, new MemoryReplayStore(), Date.now(),
    )
    expect(verified, call.url).toEqual({ ok: true, actor: 'bob' })
  }
  // another body under the same header is refused
  const post = seen[1]
  const swapped = await verifyRequest(
    { method: 'POST', target: '/w/ws/sync/append', authorization: post?.headers.get('authorization') ?? null, body: new TextEncoder().encode('{"outro":1}') },
    roster, new MemoryReplayStore(), Date.now(),
  )
  expect(swapped).toEqual({ ok: false, code: 'BAD_SIGNATURE' })
})

it('without a signer nothing identifies the caller: no Authorization header at all (the hub then answers 401)', async () => {
  const seen: Headers[] = []
  const transport = new HttpTransport('http://edge.test', 'ws', async (_url, init) => { seen.push(new Headers(init?.headers)); return Response.json({ envelopes: [] }) })
  await transport.after('channel:geral', 0)
  expect(seen[0]?.get('authorization')).toBeNull()
  expect(seen[0]?.get('x-persona-actor')).toBeNull()
})
