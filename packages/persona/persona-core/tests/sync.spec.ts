import { expect, it } from 'vitest'
import {
  IdentityCipher,
  MemorySyncLog,
  assertMayUpload,
  commitEnvelope,
  mayUpload,
  resumeFromCursor,
  sameWebhookDelivery,
  webhookEnvelope,
} from '../src/index.ts'
import type { SyncEnvelope } from '../src/index.ts'

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

it('refuses to upload a DM or private event without an explicit share', () => {
  const dm = envelope({ classification: 'dm', streamId: 'dm:ana' })
  expect(mayUpload(dm)).toBe(false)
  expect(() => assertMayUpload(dm)).toThrow('SYNC_REFUSED')
  expect(mayUpload({ ...dm, shared: true })).toBe(true)
  expect(mayUpload(envelope({ classification: 'private' }))).toBe(false)
  expect(mayUpload(envelope({ classification: 'workspace' }))).toBe(true)
})

it('replays the same idempotency key as a duplicate and resumes from a cursor', () => {
  const log = new MemorySyncLog()
  expect(commitEnvelope(log, envelope())).toBe('appended')
  expect(commitEnvelope(log, envelope())).toBe('duplicate')
  expect(() => commitEnvelope(log, envelope({ seq: 3, idempotencyKey: 'k2' }))).toThrow('SYNC_REFUSED')
  expect(commitEnvelope(log, envelope({ seq: 2, idempotencyKey: 'k2' }))).toBe('appended')
  expect(resumeFromCursor(log, 'channel:geral', 1).map(item => item.seq)).toEqual([2])
})

it('converges two replicas that apply the same sequenced stream', () => {
  const a = new MemorySyncLog()
  const b = new MemorySyncLog()
  const first = envelope()
  const second = envelope({ seq: 2, idempotencyKey: 'k2', payload: IdentityCipher.seal('segunda', 'wk1') })
  commitEnvelope(a, first)
  commitEnvelope(b, first)
  commitEnvelope(b, second)
  commitEnvelope(a, second)
  expect(a.snapshot()).toEqual(b.snapshot())
})

it('forwards a webhook by delivery id without interpreting the payload', () => {
  const hook = webhookEnvelope({
    source: 'github',
    deliveryId: 'del-1',
    receivedAt: '2026-11-03T15:00:00Z',
    ownerDeviceId: 'desk-1',
    payload: { zen: 'ok' },
  })
  expect(sameWebhookDelivery(hook, { ...hook, payload: { other: true } })).toBe(true)
  expect(sameWebhookDelivery(hook, { ...hook, deliveryId: 'del-2' })).toBe(false)
})
