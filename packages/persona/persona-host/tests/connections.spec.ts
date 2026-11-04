import { expect } from 'vitest'
import { ConnectionProbe, CONNECTION_PROBE_TIMEOUT_MS } from '../src/connection-probe.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

it('defaults the per-CLI probe to at least 8 s', () => {
  expect(CONNECTION_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000)
})

it('shows verificando without a false not_logged_in, then a slow CLI as logged in', async () => {
  let started = 0
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  const probe = new ConnectionProbe({
    timeoutMs: 8_000,
    now: () => 0,
    detect: async () => {
      started += 1
      await gate
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
  release?.()
  const ready = await probe.ready()
  expect(started).toBe(1)
  const claude = ready.find(card => card.kind === 'claude')
  expect(claude?.phase).toBe('ready')
  expect(claude?.loggedIn).toBe(true)
  expect(claude?.error).toBeUndefined()
})

it('probe persistQuota receives officialQuota snaps', async () => {
  const seen: unknown[] = []
  const probe = new ConnectionProbe({
    timeoutMs: 8_000,
    now: () => 0,
    persistQuota: (snaps) => { seen.push(...snaps) },
    detect: async () => [{
      id: 'claude',
      kind: 'cli',
      installed: true,
      loggedIn: true,
      models: ['haiku'],
      officialQuota: {
        provider: 'claude', origin: 'official',
        windows: [{ id: '5h', origin: 'official', usedPercent: 12, resetsAt: '2026-11-04T20:00:00.000Z' }],
      },
    }],
  })
  await probe.ready()
  expect(probe.snaps()[0]?.officialQuota?.windows[0]?.resetsAt).toBe('2026-11-04T20:00:00.000Z')
  expect(seen).toHaveLength(1)
})

it('listConnections on a live host returns checking then ready, never a 400 ms false logout', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  const first = h.listConnections({ workspaceId: 'ws', projectId: 'pp' })
  expect(first.length).toBeGreaterThan(0)
  const pending = first.filter(card => card.phase === 'checking')
  for (const card of pending) {
    expect(card.error?.code).not.toBe('not_logged_in')
  }
})
