/**
 * EQUIPE-REAL §0 (Atlas/Muse, 05/11) — what the host puts in the thread of a team: the thread shows PEOPLE and PERSONAS. Never an
 * internal author (`routine:manha`, `team:split`), never a title cut inside a word or the raw request, and "Precisa de você" counts only
 * what waits for a decision of the person now. (The noise lines and the plan/delivery cards are other owners' work, on top of this.)
 */
import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type PersonaHost from '../src/index.ts'
import { isTechnicalAuthor } from '../src/thread-authors.ts'
import { postTeamRequest } from '../src/proactivity-wire.ts'
import { humanTitle } from '../src/ticket-title.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

function open(on = true): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = on
  return h
}

const visible = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

function append(h: PersonaHost, id: string, actorId: string, body: string): void {
  h.events.append({ id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body, actorId, subjectId: '', occurredAt: '2026-11-05T11:00:00.000Z' })
}

it('a technical author is never visible: the thread, a search and the stored trigger are different things', () => {
  const h = open()
  append(h, 'r1', 'routine:manha', '@Lia Resumo curto da equipe')
  append(h, 's1', 'team:split', 'Texto: preciso de uma campanha')
  append(h, 'i1', 'team:initiative', '@Bia Faça o próximo passo')
  append(h, 'h1', 'ana', 'preciso de uma campanha de lançamento')
  const shown = visible(h)
  expect(shown.map(row => row.id)).toEqual(['h1'])
  expect(shown.every(row => !isTechnicalAuthor(row.actorId))).toBe(true)
  expect(h.search({ ...SCOPE, actorId: 'ana', query: 'campanha', limit: 20 }).every(row => !row.actorId.includes(':'))).toBe(true)
  // the engine still has them: they are triggers, stored as they were
  expect(['r1', 's1', 'i1'].every(id => h.events.has(id))).toBe(true)
})

it('GUARD: after a day of routines, plans and initiatives no visible message has an author with ":"', async () => {
  const h = open()
  say(h, 'u1', '@Bia escreva o texto da campanha')
  // the host's own requests, through the very path the scheduler uses (a routine due, the split of a request, an initiative)
  for (const [id, actorId, body] of [['routine-run:manha:0', 'routine:manha', '@Bia Resumo curto da equipe'], ['split:u1:texto', 'team:split', '@Teo Arte da campanha'], ['initiative:bia:0', 'team:initiative', '@Bia Faça o próximo passo']] as const) {
    postTeamRequest(h, { workspaceId: 'ws', projectId: 'pp', id, actorId, personaId: id.includes('split') ? 'teo' : 'bia', kind: id.startsWith('routine') ? 'routine' : 'initiative', body })
  }
  await h.orchestration.flush('pp')
  for (const row of visible(h)) expect(row.actorId, `${row.id}: ${row.body}`).not.toContain(':')
  const technical = h.events.listProject('pp').filter(event => isTechnicalAuthor(event.actorId))
  expect(technical.length, 'the scenario did create technical triggers').toBeGreaterThanOrEqual(3)
  expect(visible(h).some(row => technical.some(event => event.id === row.id))).toBe(false)
  expect(visible(h).some(row => row.actorId === 'ana'), 'her own words are still there').toBe(true)
})

it('the stream (followMessages) does not carry a technical author either: baseline and increments', async () => {
  const h = open()
  append(h, 'r0', 'routine:manha', '@Lia antes de abrir')
  append(h, 'h0', 'ana', 'oi')
  const abort = new AbortController()
  const frames: Array<{ ids: string[] }> = []
  const reading = (async () => {
    for await (const frame of h.followMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50 }, abort.signal)) {
      frames.push({ ids: frame.events.map(row => row.id) })
    }
  })()
  await new Promise(resolve => setTimeout(resolve, 60))
  append(h, 'r1', 'team:split', 'Arte: preciso')
  append(h, 'h1', 'ana', 'depois')
  await new Promise(resolve => setTimeout(resolve, 120))
  abort.abort()
  await reading
  const seen = frames.flatMap(frame => frame.ids)
  expect(seen).toContain('h0')
  expect(seen).toContain('h1')
  expect(seen.filter(id => id === 'r0' || id === 'r1')).toEqual([])
})

it('titles are short and human: no "@nome", no raw request, never cut inside a word', () => {
  expect(humanTitle('@Bia escreva o texto da campanha de lançamento')).toBe('Escreva o texto da campanha de lançamento')
  expect(humanTitle('Por favor, @Teo crie a arte do cartaz')).toBe('Crie a arte do cartaz')
  const raw = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts para as redes sociais da loja'
  const title = humanTitle(raw)
  expect(title.length).toBeLessThanOrEqual(80)
  expect(title.endsWith('…')).toBe(true)
  expect(raw.startsWith(title.slice(0, -1).toLocaleLowerCase('pt-BR').replace(/^./u, 'p'))).toBe(true) // a prefix of the words…
  expect(raw.charAt(title.length - 1)).toBe(' ') // …that stops right before a space: never inside a word
  expect(humanTitle('Revisar o contrato.')).toBe('Revisar o contrato')
  expect(humanTitle('   ')).toBe('Pedido')
  expect(humanTitle('@Bia')).toBe('Pedido')
  expect(humanTitle('x'.repeat(200), 40).length).toBeLessThanOrEqual(40) // one giant word: nothing better exists
  expect(humanTitle('primeira linha\nsegunda linha')).toBe('Primeira linha')
})

it('a Task made from the person\'s words gets the human title only with the team behavior on', async () => {
  const on = open(true)
  say(on, 'u1', '@Bia escreva o texto da campanha de lançamento do nosso produto novo, com três posts curtos e um chamado final bem claro')
  const titled = on.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.origin.triggerId === 'u1')
  expect(titled?.title.startsWith('Escreva o texto da campanha')).toBe(true)
  expect(titled?.title.length).toBeLessThanOrEqual(80)
  await on.orchestration.flush('pp')
  expect(titled?.title.charAt(0)).not.toBe('@')
  const off = open(false)
  say(off, 'u1', '@Bia escreva o texto da campanha')
  expect(off.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.origin.triggerId === 'u1')?.title).toBe('@Bia escreva o texto da campanha') // unchanged
  await off.orchestration.flush('pp')
})

it('"Precisa de você" counts what waits for a DECISION: a colleague\'s Task that blocked is the team\'s step, not the person\'s', () => {
  const h = open()
  const stamp = '2026-11-05T09:00:00.000Z'
  const ticket = (id: string, triggerId: string, over: Partial<Ticket> = {}): void => {
    h.orchestration.runtime('pp').repo.tickets.save({
      id, title: id, decisionId: `d-${id}`,
      mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
      channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: stamp }], inputs: [], undelivered: [],
      createdAt: stamp, updatedAt: stamp, origin: { triggerId, triggerIds: [triggerId] },
      execution: { name: 'Bia', directory: '.', assignment: 'x' }, attention: { id: `att-${id}`, question: 'Qual cor?' }, ...over,
    })
  }
  ticket('minha', 'u1') // asked by the person: waits for her
  ticket('do-colega', 'handoff:bia:c1') // a request between personas that got stuck: not hers
  ticket('da-revisao', 'handoff:lia:review')
  const count = (h as unknown as { needsYouCount: (projectId: string) => number }).needsYouCount.bind(h)
  expect(count('pp')).toBe(1)
})
