// FL-11 / IV-5: QUEM o Parar para. A resposta que cresce manda; sem ela, só quem está prestes a responder à última mensagem DA PESSOA (o critério do "está escrevendo…");
// persona trabalhando numa Tarefa NÃO é alvo (Muse 03:26: o ✕ aparecia em todas as cenas).
import { describe, expect, it } from 'vitest'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pickStopTarget } from '../src/client/remote/working-turn.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

const team = { personas: [
  { id: 'persona-atlas', name: 'Atlas', avatarRef: 'atlas' },
  { id: 'persona-nina', name: 'Nina', avatarRef: 'nina' },
] } as unknown as TeamView

const member = (id: string, name: string, state: ChannelPersonaMember['state']): ChannelPersonaMember => ({ id: id as never, name, role: 'x', state })
const message = (over: Partial<ChannelMessageUi>): ChannelMessageUi => ({ id: 'coord-m1-reply', authorId: 'nina', authorName: 'Nina', body: 'Vou explicar', timeLabel: '10:00', reactions: [], ...over })
const ask = (over: Partial<ChannelMessageUi> = {}): ChannelMessageUi => ({ id: 'm1', authorId: 'user', authorName: 'Ana', body: 'Explique o plano', timeLabel: '10:00', reactions: [], ...over })

describe('pickStopTarget', () => {
  it('a resposta que cresce manda: a persona dela e o eventId da mensagem da pessoa (replyToId)', () => {
    const target = pickStopTarget({
      messages: [message({ streaming: true, replyToId: 'm1', authorPersonaId: 'persona-nina' })],
      members: [member('atlas', 'Atlas', 'working')], team, responderMemberId: 'atlas',
    })
    expect(target).toEqual({ personaId: 'persona-nina', personaName: 'Nina', eventId: 'm1' })
  })

  it('sem replyToId, o eventId sai do id "coord-<id>-reply"', () => {
    const target = pickStopTarget({ messages: [message({ streaming: true, authorPersonaId: 'persona-nina' })], members: [], team, responderMemberId: '' })
    expect(target?.eventId).toBe('m1')
  })

  it('várias respostas em andamento: a mais recente', () => {
    const target = pickStopTarget({
      messages: [
        message({ id: 'coord-a-reply', streaming: true, authorName: 'Atlas', authorPersonaId: 'persona-atlas', replyToId: 'a' }),
        message({ id: 'coord-b-reply', streaming: true, authorPersonaId: 'persona-nina', replyToId: 'b' }),
      ],
      members: [], team, responderMemberId: '',
    })
    expect(target?.personaName).toBe('Nina')
    expect(target?.eventId).toBe('b')
  })

  it('resposta já assentada não é alvo', () => {
    expect(pickStopTarget({ messages: [message({ authorPersonaId: 'persona-nina' })], members: [], team, responderMemberId: '' })).toBeNull()
  })

  it('MUSE 03:26: persona trabalhando numa Tarefa NÃO é alvo (fio vazio, ou a última mensagem é de uma persona): o botão é o Enviar', () => {
    const working = [member('nina', 'Nina', 'working'), member('atlas', 'Atlas', 'working')]
    expect(pickStopTarget({ messages: [], members: working, team, responderMemberId: 'atlas' })).toBeNull()
    expect(pickStopTarget({ messages: [message({ authorPersonaId: 'persona-nina' })], members: working, team, responderMemberId: 'atlas' })).toBeNull()
    expect(pickStopTarget({ messages: [ask(), message({ authorPersonaId: 'persona-nina' })], members: working, team, responderMemberId: 'atlas' })).toBeNull()
  })

  it('a última mensagem é da pessoa e ninguém respondeu ainda ("está escrevendo…"): quem responde (preferido), sem eventId', () => {
    const target = pickStopTarget({
      messages: [ask()], members: [member('nina', 'Nina', 'working'), member('atlas', 'Atlas', 'working')], team, responderMemberId: 'atlas',
    })
    expect(target).toEqual({ personaId: 'persona-atlas', personaName: 'Atlas' })
  })

  it('quem responde está ocioso: o primeiro que trabalha (só com a pergunta da pessoa sem resposta)', () => {
    const target = pickStopTarget({
      messages: [ask()], members: [member('atlas', 'Atlas', 'resting'), member('nina', 'Nina', 'working')], team, responderMemberId: 'atlas',
    })
    expect(target?.personaId).toBe('persona-nina')
  })

  it('o envio da pessoa que falhou não espera resposta: nada a parar', () => {
    expect(pickStopTarget({ messages: [ask({ sendFailed: true })], members: [member('atlas', 'Atlas', 'working')], team, responderMemberId: 'atlas' })).toBeNull()
  })

  it('ninguém escrevendo nem trabalhando: nada a parar (o botão continua sendo o de enviar)', () => {
    expect(pickStopTarget({ messages: [ask()], members: [member('atlas', 'Atlas', 'resting'), member('nina', 'Nina', 'waiting')], team, responderMemberId: 'atlas' })).toBeNull()
  })
})
