import { describe, expect, it } from 'vitest'
import { applyMessageStreamFrame } from '../src/client/remote/apply-message-stream.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

const team: TeamView = {
  personas: [],
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
}

import { hostMessage } from './message-view-fixture.client.ts'

const msg = (id: string, body: string, seq: number, occurredAt: string) => hostMessage({
  id,
  seq,
  actorId: 'ana',
  body,
  subjectId: 't1',
  occurredAt,
})

describe('applyMessageStreamFrame', () => {
  it('replaces messages on baseline', () => {
    const frame = {
      kind: 'baseline' as const,
      events: [msg('m1', 'oi', 1, '2026-11-03T12:00:00.000Z')],
      order: ['m1'],
    }
    const rows = applyMessageStreamFrame([], frame, team, 'ana')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.body).toBe('oi')
  })

  it('appends upserts in order', () => {
    const baseline = applyMessageStreamFrame([], {
      kind: 'baseline',
      events: [msg('m1', 'a', 1, '2026-11-03T12:00:00.000Z')],
      order: ['m1'],
    }, team, 'ana')
    const next = applyMessageStreamFrame(baseline, {
      kind: 'upsert',
      events: [msg('m2', 'b', 2, '2026-11-03T12:01:00.000Z')],
      order: ['m2'],
    }, team, 'ana')
    expect(next.map(row => row.id)).toEqual(['m1', 'm2'])
  })

  it('baseline sorts by seq, not frame.order (display time is not sort key)', () => {
    const frame = {
      kind: 'baseline' as const,
      events: [
        msg('late', 'coord welcome', 1, '2026-11-03T21:00:00.000Z'),
        msg('early', 'user hello', 2, '2026-11-03T14:00:00.000Z'),
      ],
      order: ['late', 'early'],
    }
    const rows = applyMessageStreamFrame([], frame, team, 'ana')
    expect(rows.map(row => row.id)).toEqual(['late', 'early'])
  })

  // P0 duplicata no #geral: a linha otimista (`local-…`) e o eco do host (upsert do followMessages) são a MESMA mensagem da pessoa.
  describe('mensagem da própria pessoa: a linha otimista e o eco do host', () => {
    const optimistic = (id: string, body: string) => ({ id, authorId: 'user', authorName: 'Você', body, timeLabel: '12:00', reactions: [] })

    it('o eco do host SUBSTITUI a otimista com o mesmo texto (nunca duas linhas)', () => {
      const current = [optimistic('local-1', 'Oi, equipe')]
      const next = applyMessageStreamFrame(current, { kind: 'upsert', events: [msg('msg-1', 'Oi, equipe', 3, '2026-11-03T12:02:00.000Z')], order: ['msg-1'] }, team, 'ana')
      expect(next.map(row => row.id)).toEqual(['msg-1'])
      expect(next.filter(row => row.body === 'Oi, equipe')).toHaveLength(1)
    })

    it('duas mensagens iguais seguidas: cada eco troca UMA otimista (a 2ª continua até o seu eco)', () => {
      const current = [optimistic('local-1', 'ok'), optimistic('local-2', 'ok')]
      const first = applyMessageStreamFrame(current, { kind: 'upsert', events: [msg('msg-1', 'ok', 3, '2026-11-03T12:02:00.000Z')], order: ['msg-1'] }, team, 'ana')
      expect(first.map(row => row.id)).toEqual(['local-2', 'msg-1'])
      const second = applyMessageStreamFrame(first, { kind: 'upsert', events: [msg('msg-2', 'ok', 4, '2026-11-03T12:03:00.000Z')], order: ['msg-2'] }, team, 'ana')
      expect(second.map(row => row.id)).toEqual(['msg-1', 'msg-2'])
    })

    it('texto diferente não troca nada; mensagem de OUTRA pessoa nunca apaga a otimista', () => {
      const current = [optimistic('local-1', 'Oi, equipe')]
      const other = hostMessage({ id: 'msg-9', seq: 5, actorId: 'bia', body: 'Oi, equipe', subjectId: 't1', occurredAt: '2026-11-03T12:05:00.000Z' })
      const teamWithBia: TeamView = { ...team, members: [...team.members, { id: 'bia', workspaceId: 'ws', displayName: 'Bia', handle: 'bia', role: 'member' }] }
      const next = applyMessageStreamFrame(current, { kind: 'upsert', events: [other, msg('msg-2', 'Outra coisa', 6, '2026-11-03T12:06:00.000Z')], order: ['msg-9', 'msg-2'] }, teamWithBia, 'ana')
      expect(next.map(row => row.id)).toEqual(['local-1', 'msg-9', 'msg-2'])
    })

    it('reenvio do mesmo id do host (upsert idempotente) não duplica', () => {
      const first = applyMessageStreamFrame([], { kind: 'upsert', events: [msg('msg-1', 'a', 1, '2026-11-03T12:00:00.000Z')], order: ['msg-1'] }, team, 'ana')
      const again = applyMessageStreamFrame(first, { kind: 'upsert', events: [msg('msg-1', 'a', 1, '2026-11-03T12:00:00.000Z')], order: ['msg-1'] }, team, 'ana')
      expect(again.map(row => row.id)).toEqual(['msg-1'])
    })
  })
})
