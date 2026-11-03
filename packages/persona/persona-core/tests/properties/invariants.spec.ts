import { expect, it } from 'vitest'
import {
  MemorySyncLog,
  applyGrant,
  can,
  commitEnvelope,
  mayUpload,
  revokeGrant,
} from '../../src/index.ts'
import type { Actor, Grant, SyncEnvelope } from '../../src/index.ts'

const SEED = 0xC0FFEE
const N = 64

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function envelope(seq: number, key: string, classification: SyncEnvelope['classification'], shared?: true): SyncEnvelope {
  const row: SyncEnvelope = {
    workspaceId: 'ws',
    streamId: 's1',
    seq,
    idempotencyKey: key,
    classification,
    at: '2026-11-03T13:00:00.000Z',
    payload: { clear: key },
  }
  if (shared === true) row.shared = true
  return row
}

it('propriedade: SyncLog seq monotônica sem lacuna (semente relatada se falhar)', () => {
  const rand = mulberry32(SEED)
  const log = new MemorySyncLog()
  let head = 0
  for (let i = 0; i < N; i += 1) {
    const replay = rand() < 0.25 && i > 0
    const key = replay ? `k${String(Math.floor(rand() * i))}` : `k${String(i)}`
    const existing = log.byIdempotency(key)
    if (existing !== undefined) {
      expect(commitEnvelope(log, { ...existing }), `semente ${String(SEED)} i=${String(i)}`).toBe('duplicate')
      continue
    }
    const next = envelope(head + 1, key, 'project')
    expect(commitEnvelope(log, next), `semente ${String(SEED)} i=${String(i)}`).toBe('appended')
    head += 1
    expect(log.head('s1'), `semente ${String(SEED)} i=${String(i)}`).toBe(head)
  }
  const rows = log.after('s1', 0)
  expect(rows.map(row => row.seq)).toEqual(Array.from({ length: head }, (_, i) => i + 1))
})

it('propriedade: DM nunca sai sem compartilhamento (semente relatada se falhar)', () => {
  const rand = mulberry32(SEED)
  for (let i = 0; i < N; i += 1) {
    const kind: SyncEnvelope['classification'] = rand() < 0.5 ? 'dm' : 'private'
    const shared = rand() < 0.3
    const env = envelope(1, `dm${String(i)}`, kind, shared ? true : undefined)
    if (shared) expect(mayUpload(env), `semente ${String(SEED)} i=${String(i)}`).toBe(true)
    else expect(mayUpload(env), `semente ${String(SEED)} i=${String(i)}`).toBe(false)
  }
})

it('propriedade: can() é monotônico sob revogação (semente relatada se falhar)', () => {
  const rand = mulberry32(SEED)
  const base: Actor = {
    kind: 'user', id: 'guest', workspaceId: 'ws', workspaceRole: 'guest', projectIds: [],
  }
  const grant: Grant = {
    workspaceRole: 'member',
    projectIds: ['launch', 'ops'],
    channelIds: ['geral'],
    dmIds: ['dm-ana'],
  }
  const resource = { type: 'project' as const, workspaceId: 'ws', projectId: 'launch' }
  for (let i = 0; i < N; i += 1) {
    const inside = applyGrant(base, grant)
    expect(can(inside, 'read', resource), `semente ${String(SEED)} i=${String(i)}`).toBe(true)
    const after = revokeGrant(inside, grant)
    expect(can(after, 'read', resource), `semente ${String(SEED)} i=${String(i)}`).toBe(false)
    expect(can(after, 'read', resource), `semente ${String(SEED)} i=${String(i)} recheck`).toBe(false)
    void rand()
  }
})
