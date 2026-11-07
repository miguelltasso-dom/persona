/**
 * TEAM-4 ("Dar minha opinião", Flint): the PERSON answers a round of opinion a persona asked of the team. Her line is stored as hers,
 * returned as `opinion.kind = 'reply'` under the request, and — an answer, not a new request — it is never routed (no Task, nobody woken).
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

function open(on = true): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
  ])
  h.teamworkEnabled = on
  // a request line the way the round writes it (the round itself is Tally's/Bolt's and has its own specs)
  h.events.append({
    id: 'opinion:r1:request', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: 'O que acham da arte?', actorId: 'bia', subjectId: 't1', occurredAt: '2026-11-04T12:00:00.000Z',
  })
  h.messageFlags.set('pp', 'opinion:r1:request', { opinion: { kind: 'request', requestId: 'r1', taskId: 't1', round: 1, maxRounds: 2, audience: 'team' } })
  return h
}

const post = (h: PersonaHost, id: string, body: string, over: Partial<Parameters<PersonaHost['postMessage']>[0]> = {}) =>
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id, ...over })

it('the person\'s answer is HER line, returned as the reply of that round, with her mark', () => {
  const h = open()
  const view = post(h, 'p1', 'Gostei das cores, mas o título está pequeno', { opinionOn: { requestId: 'r1', mark: 'suggestion' } })
  expect(view.actorId).toBe('ana')
  expect(view.opinion).toEqual({ kind: 'reply', requestId: 'r1', taskId: 't1', round: 1, maxRounds: 2, mark: 'suggestion' })
  const listed = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50 }).events.find(row => row.id === 'p1')
  expect(listed?.opinion).toMatchObject({ kind: 'reply', requestId: 'r1' })
  expect(h.events.get('p1')?.actorId).toBe('ana')
})

it('an answer is not a new request: even words that sound like work open no Task and wake nobody', async () => {
  const h = open()
  const before = h.orchestration.runtime('pp').repo.tickets.list().length
  post(h, 'p1', 'Crie uma versão com o título maior e envie para mim', { opinionOn: { requestId: 'r1' } })
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(before)
  // the very same words, without the answer flag, are a normal request
  say(h, 'p2', 'Crie uma versão com o título maior e envie para mim')
  expect(h.orchestration.runtime('pp').repo.tickets.list().length).toBeGreaterThan(before)
  await h.orchestration.flush('pp') // let that Task settle before the host closes
})

it('a refused answer writes nothing: team behavior off, unknown request, another conversation, unknown mark', () => {
  const h = open(false)
  expect(() => post(h, 'p1', 'ok', { opinionOn: { requestId: 'r1' } })).toThrow(/ainda não pede opinião/iu)
  expect(h.events.has('p1')).toBe(false)
  h.teamworkEnabled = true
  expect(() => post(h, 'p2', 'ok', { opinionOn: { requestId: 'nope' } })).toThrow(/não existe mais/iu)
  h.createChannel({ id: 'outro', ...SCOPE, name: 'outro', topic: '' })
  expect(() => post(h, 'p3', 'ok', { ownerId: 'outro', opinionOn: { requestId: 'r1' } })).toThrow(/não existe mais/iu) // the request is in #geral
  expect(() => post(h, 'p4', 'ok', { opinionOn: { requestId: 'r1', mark: 'nothing' as unknown as 'liked' } })).toThrow(/Gostei, Sugestão ou Ponto de atenção/iu)
  for (const id of ['p2', 'p3', 'p4']) expect(h.events.has(id)).toBe(false)
})

it('a reply of a colleague is not a request either: only a line of the round that asked can be answered', () => {
  const h = open()
  h.events.append({
    id: 'opinion:r1:reply:teo', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: '[sugestão] Mais contraste.', actorId: 'bia', subjectId: 't1', occurredAt: '2026-11-04T12:01:00.000Z',
  })
  h.messageFlags.set('pp', 'opinion:r1:reply:teo', { opinion: { kind: 'reply', requestId: 'r1', taskId: 't1', round: 1, maxRounds: 2, mark: 'suggestion' } })
  expect(() => post(h, 'p1', 'ok', { opinionOn: { requestId: 'r1:reply:teo' } })).toThrow(/não existe mais/iu)
})
