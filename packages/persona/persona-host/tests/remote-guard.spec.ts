import { expect } from 'vitest'
import { RemoteFault, RemoteGuard, sanitizeRemoteError } from '../src/remote-guard.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

it('rejects a non-object payload, a huge body, and a bursting peer', () => {
  const guard = new RemoteGuard({
    payloadLimit: 80,
    rateMax: 2,
    rateWindowMs: 10_000,
    now: () => 0,
    peerOf: () => 'peer-a',
  })
  expect(() => { guard.admit('createProject', [1]) }).toThrow(RemoteFault)
  expect(() => { guard.admit('createProject', [{ workspaceId: 1 }]) }).toThrow(/invalid-payload/)
  expect(() => { guard.admit('listProjects', [{ workspaceId: 'ws', blob: 'x'.repeat(200) }]) })
    .toThrow(/payload-too-large/)
  guard.admit('ping', [])
  guard.admit('ping', [])
  try {
    guard.admit('ping', [])
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(RemoteFault)
    expect((error as RemoteFault).code).toBe('rate-limited')
    expect((error as RemoteFault).isDSHRemoteError).toBe(true)
    expect((error as RemoteFault).details.retryAfterMs).toBeGreaterThan(0)
  }
})

it('production read cap absorbs a boot-sized listConversationSubjects burst', () => {
  let clock = 0
  const guard = new RemoteGuard({
    rateMax: 2_000,
    writeRateMax: 240,
    rateWindowMs: 10_000,
    now: () => clock,
    peerOf: () => 'local',
  })
  for (let i = 0; i < 400; i += 1) {
    guard.admit('listConversationSubjects', [{
      workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    }])
  }
  expect(() => {
    for (let i = 0; i < 241; i += 1) {
      guard.admit('createProject', [{ workspaceId: 'ws', projectId: 'pp' }])
    }
  }).toThrow(RemoteFault)
  clock = 10_000
  guard.admit('createProject', [{ workspaceId: 'ws', projectId: 'pp' }])
})

it('attachFile may exceed the 256 KB JSON cap (8 MB upload)', () => {
  const guard = new RemoteGuard({ payloadLimit: 256_000, now: () => 0, peerOf: () => 'local' })
  const blob = 'x'.repeat(300_000)
  expect(() => { guard.admit('listProjects', [{ workspaceId: 'ws', blob }]) }).toThrow(/payload-too-large/)
  expect(() => { guard.admit('attachFile', [{ workspaceId: 'ws', bytesBase64: blob }]) }).not.toThrow()
})

it('strips a hidden dm id from a typed fault', () => {
  expect(() => sanitizeRemoteError(new Error('forbidden: dm:secret-99'), ['ws'])).toThrow(RemoteFault)
  try {
    sanitizeRemoteError(new Error('forbidden: dm:secret-99'), ['ws'])
  } catch (error) {
    expect(error).toBeInstanceOf(RemoteFault)
    expect((error as RemoteFault).code).toBe('forbidden')
    expect((error as RemoteFault).message).not.toMatch(/secret-99/)
  }
})

it('listProjects still works through the installed gateway', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  expect(h.listProjects({ workspaceId: 'ws', projectId: 'pp' }).map(row => row.id)).toEqual(['pp'])
  expect(() => h.listProjects({ workspaceId: 1 } as never)).toThrow(/invalid-payload/)
})
