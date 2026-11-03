import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'
import { ConnectionProbe, CONNECTION_PROBE_TIMEOUT_MS } from '../src/connection-probe.ts'

const roots: Context[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => root.fiber.dispose()))
})

it('defaults the per-CLI probe to at least 8 s', () => {
  expect(CONNECTION_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000)
})

it('shows verificando without a false not_logged_in, then a 6 s CLI as logged in', async () => {
  let started = 0
  const probe = new ConnectionProbe({
    timeoutMs: 8_000,
    detect: async () => {
      started += 1
      await new Promise<void>((resolve) => { setTimeout(resolve, 6_000) })
      return [{
        id: 'claude',
        kind: 'cli',
        installed: true,
        loggedIn: true,
        models: ['haiku'],
      }]
    },
  })
  const first = probe.list()
  expect(first.some(card => card.phase === 'checking')).toBe(true)
  expect(first.every(card => card.error === undefined)).toBe(true)
  expect(first.some(card => card.error?.code === 'not_logged_in')).toBe(false)
  const ready = await probe.ready()
  expect(started).toBe(1)
  const claude = ready.find(card => card.kind === 'claude')
  expect(claude?.phase).toBe('ready')
  expect(claude?.loggedIn).toBe(true)
  expect(claude?.error).toBeUndefined()
}, 15_000)

it('listConnections on a live host returns checking then ready, never a 400 ms false logout', async () => {
  const ctx = new Context()
  roots.push(ctx)
  const h = new PersonaHost(ctx)
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  const first = await h.listConnections({ workspaceId: 'ws', projectId: 'pp' })
  expect(first.length).toBeGreaterThan(0)
  const pending = first.filter(card => card.phase === 'checking')
  for (const card of pending) {
    expect(card.error?.code).not.toBe('not_logged_in')
  }
})
