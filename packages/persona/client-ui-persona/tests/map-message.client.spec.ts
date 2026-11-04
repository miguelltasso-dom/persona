import { describe, expect, it } from 'vitest'
import { mapMessage, mapSortedMessageStream } from '../src/client/remote/map-host-ui.ts'
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

describe('mapSortedMessageStream', () => {
  it('never shows clock going backwards along seq order', () => {
    const events: MessageView[] = [
      hostMessage({ id: 'a', seq: 1, type: 'message', actorId: 'gallery-bento', body: '1', subjectId: 'a', occurredAt: '2026-11-03T09:05:00.000Z' }),
      hostMessage({ id: 'b', seq: 2, type: 'message', actorId: 'ana', body: '2', subjectId: 'b', occurredAt: '2026-11-03T09:06:00.000Z' }),
      hostMessage({ id: 'c', seq: 3, type: 'message', actorId: 'gallery-bento', body: '3', subjectId: 'c', occurredAt: '2026-11-03T09:05:00.000Z' }),
    ]
    const rows = mapSortedMessageStream(events, team, 'ana')
    const minutes = rows.map((row) => {
      const parts = row.timeLabel.split(':')
      const hour = Number.parseInt(parts[0] ?? '0', 10)
      const minute = Number.parseInt(parts[1] ?? '0', 10)
      return hour * 60 + minute
    })
    expect(minutes[1]).toBeGreaterThan(minutes[0]!)
    expect(minutes[2]).toBeGreaterThan(minutes[1]!)
  })
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

  it('maps runError from wire field and strips inline marker', () => {
    const wire = hostMessage({
      id: 'e-run',
      seq: 9,
      type: 'message',
      actorId: 'gallery-bento',
      body: 'legado\n\n[[run-error:{"code":"not_logged_in","provider":"Claude","command":"claude login"}]]',
      subjectId: 'gallery-bento',
      occurredAt: '2026-11-04T10:00:00.000Z',
      runError: { code: 'quota_exhausted', provider: 'Claude', resetAt: '2026-11-04T18:00:00.000Z' },
    })
    const row = mapMessage(wire, team, 'ana', new Map())
    expect(row.runError?.code).toBe('quota_exhausted')
    expect(row.body).toBe('legado')
    expect(row.authorPersonaId).toBe('gallery-bento')
  })

  it('parses run-error marker when wire field is absent', () => {
    const event = hostMessage({
      id: 'e-mark',
      seq: 10,
      type: 'message',
      actorId: 'gallery-bento',
      body: '[[run-error:{"code":"engine_unavailable","provider":"Cursor","persona":"Bento"}]]',
      subjectId: 'gallery-bento',
      occurredAt: '2026-11-04T10:05:00.000Z',
    })
    const row = mapMessage(event, team, 'ana', new Map())
    expect(row.runError?.code).toBe('engine_unavailable')
    expect(row.body).toBe('')
  })

  it('prefers wire runError over legacy text in body', () => {
    const event = hostMessage({
      id: 'e-wire-legacy',
      seq: 14,
      type: 'message',
      actorId: 'gallery-bento',
      body: 'CLI codex não está logada. Abra o terminal e rode codex login',
      subjectId: 'gallery-bento',
      occurredAt: '2026-11-04T11:10:00.000Z',
      runError: { code: 'quota_exhausted', provider: 'Codex', resetAt: '2026-11-04T18:00:00.000Z' },
    })
    const row = mapMessage(event, team, 'ana', new Map())
    expect(row.runError?.code).toBe('quota_exhausted')
  })

  it('legacyRunErrorFromText on persona messages without marker (Rivet/histórico)', () => {
    const event = hostMessage({
      id: 'e-legacy',
      seq: 11,
      type: 'message',
      actorId: 'gallery-bento',
      body: 'CLI codex não está logada. Abra o terminal e rode codex login',
      subjectId: 'gallery-bento',
      occurredAt: '2026-11-04T11:00:00.000Z',
    })
    const row = mapMessage(event, team, 'ana', new Map())
    expect(row.runError).toEqual({ code: 'not_logged_in', provider: 'Codex', command: 'codex login', persona: 'Bento' })
  })

  it('does not legacy-map human or casual chat that mentions errors', () => {
    const personaChat = hostMessage({
      id: 'e-chat',
      seq: 12,
      type: 'message',
      actorId: 'gallery-bento',
      body: 'Bati no rate limit ontem',
      subjectId: 'gallery-bento',
      occurredAt: '2026-11-04T11:01:00.000Z',
    })
    expect(mapMessage(personaChat, team, 'ana', new Map()).runError).toBeUndefined()
    const userMsg = hostMessage({
      id: 'e-user',
      seq: 13,
      type: 'message',
      actorId: 'ana',
      body: 'CLI codex não está logada. Abra o terminal e rode codex login',
      subjectId: 'ana',
      occurredAt: '2026-11-04T11:02:00.000Z',
    })
    expect(mapMessage(userMsg, team, 'ana', new Map()).runError).toBeUndefined()
  })
})
