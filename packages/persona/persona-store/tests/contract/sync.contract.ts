/**
 * Forge sync contract (persona-core/tests/sync.spec.ts) parameterized by SyncLog.
 */

import {
  IdentityCipher,
  assertMayUpload,
  commitEnvelope,
  mayUpload,
  resumeFromCursor,
  sameWebhookDelivery,
  webhookEnvelope,
  type SyncEnvelope,
  type SyncLog,
} from '@deepseek-ai/dsh-persona-core'
import { expect, it } from 'vitest'

/** {@link SyncLog} plus the snapshot the memory log exposes for convergence. */
export type SyncLogHarness = SyncLog & { snapshot(): readonly SyncEnvelope[] }

/**
 * @param overrides - Envelope fields to replace.
 */
export function sampleEnvelope(overrides: Partial<SyncEnvelope> = {}): SyncEnvelope {
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

/**
 * Same cases as Forge `sync.spec.ts`, against any {@link SyncLogHarness}.
 * @param label - Backend name (`memory` / `sqlite`).
 * @param open - Fresh log factory.
 */
export function defineSyncLogContract(label: string, open: () => SyncLogHarness): void {
  it(`${label} refuses to upload a DM or private event without an explicit share`, () => {
    const dm = sampleEnvelope({ classification: 'dm', streamId: 'dm:ana' })
    expect(mayUpload(dm)).toBe(false)
    expect(() => {
      assertMayUpload(dm)
    }).toThrow('SYNC_REFUSED')
    expect(mayUpload({ ...dm, shared: true })).toBe(true)
    expect(mayUpload(sampleEnvelope({ classification: 'private' }))).toBe(false)
    expect(mayUpload(sampleEnvelope({ classification: 'workspace' }))).toBe(true)
  })

  it(`${label} replays the same idempotency key as a duplicate and resumes from a cursor`, () => {
    const log = open()
    expect(commitEnvelope(log, sampleEnvelope())).toBe('appended')
    expect(commitEnvelope(log, sampleEnvelope())).toBe('duplicate')
    expect(() => commitEnvelope(log, sampleEnvelope({ seq: 3, idempotencyKey: 'k2' }))).toThrow('SYNC_REFUSED')
    expect(commitEnvelope(log, sampleEnvelope({ seq: 2, idempotencyKey: 'k2' }))).toBe('appended')
    expect(resumeFromCursor(log, 'channel:geral', 1).map(item => item.seq)).toEqual([2])
  })

  it(`${label} converges two replicas that apply the same sequenced stream`, () => {
    const a = open()
    const b = open()
    const first = sampleEnvelope()
    const second = sampleEnvelope({
      seq: 2,
      idempotencyKey: 'k2',
      payload: IdentityCipher.seal('segunda', 'wk1'),
    })
    commitEnvelope(a, first)
    commitEnvelope(b, first)
    commitEnvelope(b, second)
    commitEnvelope(a, second)
    expect(a.snapshot()).toEqual(b.snapshot())
  })

  it(`${label} forwards a webhook by delivery id without interpreting the payload`, () => {
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
}
