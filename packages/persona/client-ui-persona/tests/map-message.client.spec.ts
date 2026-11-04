import { describe, expect, it } from 'vitest'
import { mapMessage } from '../src/client/remote/map-host-ui.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { hostMessage } from './message-view-fixture.client.ts'

const team: TeamView = {
  personas: [{
    id: 'gallery-bento',
    workspaceId: 'ws',
    projectId: 'pp',
    name: 'Bento',
    title: 'Eng',
    description: '',
    avatarKind: 'gallery',
    avatarRef: 'bento',
    systemRoles: [],
    canRecruit: false,
  }],
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
}

const taskEvent = (subjectId: string): MessageView => hostMessage({
  id: 'e1',
  seq: 1,
  type: 'task_update',
  actorId: 'gallery-bento',
  body: 'Atualizei o ticket.',
  subjectId,
  occurredAt: '2026-11-03T15:00:00.000Z',
})

describe('mapMessage task cards (C5b)', () => {
  it('resolves task title from host task map', () => {
    const titles = new Map([['t-42', 'Contrato v2']])
    const row = mapMessage(taskEvent('t-42'), team, 'ana', titles)
    expect(row.taskTitle).toBe('Contrato v2')
    expect(row.ticketId).toBe('t-42')
  })

  it('falls back to subject id when title is unknown', () => {
    const row = mapMessage(taskEvent('t-unknown'), team, 'ana', new Map())
    expect(row.taskTitle).toBe('t-unknown')
    expect(row.ticketId).toBe('t-unknown')
  })

  it('treats missing reactions as empty (legacy fake host)', () => {
    const event = hostMessage({
      id: 'e0',
      seq: 0,
      type: 'message',
      actorId: 'gallery-bento',
      body: 'oi',
      subjectId: 'gallery-bento',
      occurredAt: '2026-11-03T15:00:00.000Z',
    })
    delete (event as { reactions?: unknown }).reactions
    const row = mapMessage(event, team, 'ana', new Map())
    expect(row.reactions).toEqual([])
  })

  it('maps host sticker reactions', () => {
    const event = hostMessage({
      id: 'e2',
      seq: 2,
      type: 'message',
      actorId: 'gallery-bento',
      body: 'ok',
      subjectId: 'gallery-bento',
      occurredAt: '2026-11-03T16:00:00.000Z',
      reactions: [{ stickerId: 'joinha', actorIds: ['ana', 'bob'] }],
    })
    const row = mapMessage(event, team, 'ana', new Map())
    expect(row.reactions).toEqual([{ stickerId: 'joinha', count: 2, actorIds: ['ana', 'bob'] }])
  })
})
