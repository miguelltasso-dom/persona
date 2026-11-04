import { expect, it } from 'vitest'
import { HttpTransport } from '../src/index.ts'

it('reports revoked replay separately from an empty authorized stream', async () => {
  const refused = new HttpTransport('http://edge.test', 'ws', async () => Response.json({
    status: 'refused', code: 'ACCESS_REVOKED', seq: 0,
  }, { status: 403 }), 'bob')
  await expect(refused.after('channel:geral', 0)).rejects.toMatchObject({ code: 'ACCESS_REVOKED', status: 403 })
  const allowed = new HttpTransport('http://edge.test', 'ws', async () => Response.json({ envelopes: [] }), 'ana')
  expect(await allowed.after('channel:geral', 0)).toEqual([])
})

it('distinguishes network failure from a successful empty replay and sends the configured member', async () => {
  const offline = new HttpTransport('http://edge.test', 'ws', async () => { throw new Error('offline') }, 'bob')
  await expect(offline.after('channel:geral', 0)).rejects.toMatchObject({ code: 'SYNC_UNAVAILABLE' })
  const seen: string[] = []
  const transport = new HttpTransport('http://edge.test', 'ws', async (_url, init) => {
    seen.push(new Headers(init?.headers).get('x-persona-actor') ?? '')
    return Response.json({ envelopes: [] })
  }, 'bob')
  await transport.after('channel:geral', 0)
  expect(seen).toEqual(['bob'])
})
