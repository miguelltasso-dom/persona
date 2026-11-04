import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const NOW = '2026-11-04T17:00:00.000Z'
const { host } = bindHostFile(NOW)

function seed() {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  return h
}

const message = { workspaceId: 'ws', projectId: 'pp', streamKind: 'channel' as const, ownerId: 'geral',
  actorId: 'ana', subjectId: 'conversation', body: 'Mensagem pelo compositor.', attachmentIds: [], topicId: '' }

it('uses the host clock when the composer omits occurredAt', () => {
  const h = seed()
  const posted = h.postMessage({ ...message, id: 'host-time' })
  expect(posted.occurredAt).toBe(NOW)
  expect(h.events.get('host-time')?.occurredAt).toBe(NOW)
})

it('preserves a supplied offset ISO timestamp for remote message ordering', () => {
  const h = seed()
  const occurredAt = '2026-11-03T12:34:56-03:00'
  expect(h.postMessage({ ...message, id: 'remote-time', occurredAt }).occurredAt).toBe(occurredAt)
  expect(h.events.get('remote-time')?.occurredAt).toBe(occurredAt)
})

it('rejects invalid timestamps with a typed error before persisting the message', () => {
  const h = seed()
  for (const occurredAt of ['', 'ontem', '2026-02-30T12:00:00Z', '2026-11-04T12:00:00']) {
    expect(() => h.postMessage({ ...message, id: 'invalid-time', occurredAt })).toThrow(expect.objectContaining({ code: 'invalid-payload' }))
    expect(h.events.has('invalid-time')).toBe(false)
  }
})
