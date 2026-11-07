// FL-11 / IV-5: o que o host manda na mensagem (resposta que cresce, Parar, Direcionar) chega à UI sem inventar nada. A mesma mensagem, reenviada
// como upsert, SUBSTITUI a anterior (o balão cresce; não duplica).
import { describe, expect, it } from 'vitest'
import { applyMessageStreamFrame } from '../src/client/remote/apply-message-stream.ts'
import { mapMessage } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import { hostMessage } from './message-view-fixture.client.ts'

const team = {
  personas: [{ id: 'persona-nina', name: 'Nina', avatarRef: 'nina' }],
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
} as unknown as TeamView

const reply = (over: Record<string, unknown> = {}) => hostMessage({
  id: 'coord-m1-reply', seq: 2, actorId: 'persona-nina', body: 'Vou explicar em três passos:', subjectId: 'subject-geral',
  occurredAt: '2026-11-04T20:00:02.000Z', replyToId: 'm1', ...over,
} as never)

describe('campos do IV-5 na mensagem da UI', () => {
  it('resposta em andamento: streaming e o id da mensagem respondida (o eventId do Parar)', () => {
    const ui = mapMessage(reply({ streaming: true }), team, 'ana')
    expect(ui.streaming).toBe(true)
    expect(ui.replyToId).toBe('m1')
    expect(ui.stopped).toBeUndefined()
  })

  it('resposta que o Parar deixou: stopped', () => {
    const ui = mapMessage(reply({ stopped: true }), team, 'ana')
    expect(ui.stopped).toBe(true)
    expect(ui.streaming).toBeUndefined()
  })

  it('mensagem direcionada: o nome da persona vira o chip "Direcionou {persona}"', () => {
    const ui = mapMessage(hostMessage({ id: 'm2', seq: 3, actorId: 'ana', body: 'Corrija o rumo', subjectId: 'subject-geral', occurredAt: '2026-11-04T20:00:03.000Z', steeredPersonaId: 'persona-nina' } as never), team, 'ana')
    expect(ui.steeredPersonaName).toBe('Nina')
  })

  it('direcionada a quem não está no time: sem chip (nunca o id cru)', () => {
    const ui = mapMessage(hostMessage({ id: 'm2', seq: 3, actorId: 'ana', body: 'x', subjectId: 'subject-geral', occurredAt: '2026-11-04T20:00:03.000Z', steeredPersonaId: 'persona-fantasma' } as never), team, 'ana')
    expect(ui.steeredPersonaName).toBeUndefined()
  })

  it('mensagem comum não ganha nenhum campo novo (replyToId vazio é ausente)', () => {
    const ui = mapMessage(hostMessage({ id: 'm3', seq: 4, actorId: 'ana', body: 'oi', subjectId: 'subject-geral', occurredAt: '2026-11-04T20:00:04.000Z', replyToId: '' } as never), team, 'ana')
    expect('streaming' in ui).toBe(false)
    expect('stopped' in ui).toBe(false)
    expect('replyToId' in ui).toBe(false)
    expect('steeredPersonaName' in ui).toBe(false)
  })
})

describe('o balão que cresce é UMA mensagem', () => {
  it('upserts do mesmo id substituem o texto e, no fim, tiram o streaming', () => {
    const base = applyMessageStreamFrame([], { kind: 'baseline', events: [reply({ streaming: true })], order: ['coord-m1-reply'] }, team, 'ana')
    const grown = applyMessageStreamFrame(base, { kind: 'upsert', events: [reply({ streaming: true, body: 'Vou explicar em três passos: primeiro' })], order: ['coord-m1-reply'] }, team, 'ana')
    expect(grown).toHaveLength(1)
    expect(grown[0]?.body).toBe('Vou explicar em três passos: primeiro')
    expect(grown[0]?.streaming).toBe(true)
    const done = applyMessageStreamFrame(grown, { kind: 'upsert', events: [reply({ body: 'Texto final.', type: 'runner' })], order: ['coord-m1-reply'] }, team, 'ana')
    expect(done).toHaveLength(1)
    expect(done[0]?.body).toBe('Texto final.')
    expect(done[0]?.streaming).toBeUndefined()
  })
})
