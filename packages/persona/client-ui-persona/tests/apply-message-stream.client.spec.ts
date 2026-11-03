import { describe, expect, it } from 'vitest'
import { applyMessageStreamFrame } from '../src/client/remote/apply-message-stream.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

const team: TeamView = {
  personas: [],
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
}

const msg = (id: string, body: string) => ({
  id,
  streamId: 'channel:geral',
  seq: 1,
  actorId: 'ana',
  body,
  subjectId: 't1',
  occurredAt: '2026-11-03T12:00:00.000Z',
})

describe('applyMessageStreamFrame', () => {
  it('replaces messages on baseline', () => {
    const frame = {
      kind: 'baseline' as const,
      events: [msg('m1', 'oi')],
      order: ['m1'],
    }
    const rows = applyMessageStreamFrame([], frame, team, 'ana')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.body).toBe('oi')
  })

  it('appends upserts in order', () => {
    const baseline = applyMessageStreamFrame([], {
      kind: 'baseline',
      events: [msg('m1', 'a')],
      order: ['m1'],
    }, team, 'ana')
    const next = applyMessageStreamFrame(baseline, {
      kind: 'upsert',
      events: [{ ...msg('m2', 'b'), occurredAt: '2026-11-03T12:01:00.000Z' }],
      order: ['m2'],
    }, team, 'ana')
    expect(next.map(row => row.id)).toEqual(['m1', 'm2'])
  })
})
