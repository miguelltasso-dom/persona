// P0 (E13 do Quill, Keel 21:56): a mensagem da pessoa aparecia 2× no #geral. Causa: `postChannelMessage` põe uma linha OTIMISTA (`local-…`) no fio; o
// upsert do `followMessages` com a mensagem de verdade chega antes de o `refresh()` terminar e `applyMessageStreamFrame` somava as duas (mesmo texto,
// ids diferentes). Agora o host assentar a mensagem da pessoa TIRA a otimista correspondente (uma por mensagem, a mais antiga de mesmo texto).
import { describe, expect, it } from 'vitest'
import { applyMessageStreamFrame } from '../src/client/remote/apply-message-stream.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import { hostMessage } from './message-view-fixture.client.ts'

const team = {
  personas: [{ id: 'persona-nina', name: 'Nina', avatarRef: 'nina' }],
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
} as unknown as TeamView

const optimistic = (id: string, body: string): ChannelMessageUi => ({ id, authorId: 'user', authorName: 'Você', body, timeLabel: '10:00', reactions: [] })
const fromHost = (id: string, body: string, seq: number, actorId = 'ana') => hostMessage({
  id, seq, actorId, body, subjectId: 'subject-geral', occurredAt: `2026-11-04T13:00:0${String(seq)}.000Z`,
} as never)
const upsert = (events: ReturnType<typeof fromHost>[]) => ({ kind: 'upsert' as const, events, order: events.map(e => e.id) })

describe('a mensagem otimista não fica ao lado da mensagem de verdade', () => {
  it('o upsert da mensagem da pessoa troca a otimista (1 linha, não 2)', () => {
    const current = [optimistic('local-100', 'Monte o cardápio')]
    const next = applyMessageStreamFrame(current, upsert([fromHost('msg-100', 'Monte o cardápio', 1)]), team, 'ana')
    expect(next.map(row => row.id)).toEqual(['msg-100'])
    expect(next.filter(row => row.body === 'Monte o cardápio')).toHaveLength(1)
  })

  it('o mesmo vale na DM (local-dm-…)', () => {
    const next = applyMessageStreamFrame([optimistic('local-dm-100', 'Oi')], upsert([fromHost('msg-dm-100', 'Oi', 1)]), team, 'ana')
    expect(next.map(row => row.id)).toEqual(['msg-dm-100'])
  })

  it('a mensagem de outra pessoa/persona com o mesmo texto NÃO leva a otimista embora', () => {
    const current = [optimistic('local-100', 'Oi')]
    const next = applyMessageStreamFrame(current, upsert([fromHost('coord-x-reply', 'Oi', 2, 'persona-nina')]), team, 'ana')
    expect(next.map(row => row.id)).toEqual(['local-100', 'coord-x-reply'])
  })

  it('duas mensagens iguais enviadas seguidas: cada upsert tira UMA otimista, a mais antiga', () => {
    const current = [optimistic('local-100', 'Oi'), optimistic('local-101', 'Oi')]
    const first = applyMessageStreamFrame(current, upsert([fromHost('msg-100', 'Oi', 1)]), team, 'ana')
    expect(first.map(row => row.id)).toEqual(['local-101', 'msg-100'])
    const second = applyMessageStreamFrame(first, upsert([fromHost('msg-101', 'Oi', 2)]), team, 'ana')
    expect(second.map(row => row.id)).toEqual(['msg-100', 'msg-101'])
  })

  it('reenvio do MESMO id (a mesma mensagem de verdade de novo) não tira nada a mais', () => {
    const current = [optimistic('local-200', 'Outra coisa')]
    const first = applyMessageStreamFrame(current, upsert([fromHost('msg-100', 'Oi', 1)]), team, 'ana')
    const again = applyMessageStreamFrame(first, upsert([fromHost('msg-100', 'Oi', 1)]), team, 'ana')
    expect(again.map(row => row.id)).toEqual(['local-200', 'msg-100'])
  })

  it('a ordem do fio é a de sempre: o que veio antes continua antes', () => {
    const current = [
      applyMessageStreamFrame([], { kind: 'baseline', events: [fromHost('msg-1', 'antes', 1)], order: ['msg-1'] }, team, 'ana')[0]!,
      optimistic('local-100', 'depois'),
    ]
    const next = applyMessageStreamFrame(current, upsert([fromHost('msg-2', 'depois', 2)]), team, 'ana')
    expect(next.map(row => row.id)).toEqual(['msg-1', 'msg-2'])
  })

  it('baseline continua substituindo tudo (nenhuma otimista sobrevive a um baseline)', () => {
    const next = applyMessageStreamFrame([optimistic('local-100', 'Oi')], { kind: 'baseline', events: [fromHost('msg-100', 'Oi', 1)], order: ['msg-100'] }, team, 'ana')
    expect(next.map(row => row.id)).toEqual(['msg-100'])
  })
})
