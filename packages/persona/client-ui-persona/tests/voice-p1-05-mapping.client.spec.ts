// COLHEITA-S1 · P1-05 (Carbon): a mensagem do fio leva os ids dos anexos (a bolha de áudio decide pelo tipo do anexo).
import { describe, expect, it } from 'vitest'
import { mapMessage } from '../src/client/remote/map-host-ui.ts'

describe('P1-05 · mensagem do fio com anexo', () => {
  it('os ids dos anexos da mensagem chegam ao fio como attachments', () => {
    const event = {
      id: 'msg-voz-1',
      seq: 1,
      actorId: 'ana',
      body: '',
      subjectId: 'msg-voz-1',
      occurredAt: '2026-11-12T10:00:00.000Z',
      type: 'message',
      source: 'host',
      attachmentIds: ['att-7'],
      replyToId: '',
      reactions: [],
      topicId: '',
      pinned: false,
      editedAt: '',
      streamId: 'geral',
      streaming: undefined,
    } as never
    const team = { personas: [], members: [] } as never
    const row = mapMessage(event, team, 'ana')
    expect(row.attachments).toEqual([{ id: 'att-7' }])
  })

  it('sem anexos, a mensagem não leva o campo', () => {
    const event = {
      id: 'msg-texto-1',
      seq: 2,
      actorId: 'ana',
      body: 'oi',
      subjectId: 'msg-texto-1',
      occurredAt: '2026-11-12T10:01:00.000Z',
      type: 'message',
      source: 'host',
      attachmentIds: [],
      replyToId: '',
      reactions: [],
      topicId: '',
      pinned: false,
      editedAt: '',
      streamId: 'geral',
    } as never
    const team = { personas: [], members: [] } as never
    expect(mapMessage(event, team, 'ana').attachments).toBeUndefined()
  })
})
