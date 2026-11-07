import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * "Bom dia" must not lie and must not say one thing three ways (Keel 04:16, from the Atlas's reading of the day):
 *  (A) a finished REQUEST is one line without a person ("Campanha … ficou pronta (…)") — never "Lia terminou …", the Coordenação only carries the line;
 *  (B) one Task is in ONE place: a passage Task that was delivered and waits for the person's review is "Precisa de você", never also "Hoje".
 */

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]

const flush = async (h: PersonaHost): Promise<void> => { for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp') }

function rig(): PersonaHost {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.timezoneOffsetMinutes = () => -180
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

const cardOf = (h: PersonaHost, id: string) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.find(row => row.id === id)

it('(A) a finished request is one line WITHOUT a person: "… ficou pronta (…)", never "Lia terminou …"', async () => {
  const h = rig()
  const queue = ['Texto da campanha pronto.', 'Arte da campanha pronta.', 'Posts da campanha prontos.']
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
  say(h, 'c1', 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts')
  await flush(h)
  for (const ticket of h.orchestration.runtime('pp').repo.tickets.list()) { // the person accepted them yesterday afternoon
    h.orchestration.runtime('pp').repo.tickets.save({ ...ticket, ended: { at: '2026-11-04T18:00:00.000Z', by: 'human', outcome: 'completed' } })
  }
  h.orchestration.now = () => '2026-11-05T11:00:00.000Z' // the next morning, 08:00 local
  const posted = h.postDailyBriefNow({ ...SCOPE })
  expect(posted.outcome).toBe('posted')
  const card = cardOf(h, posted.messageId ?? '')
  expect(card?.body).toMatch(/ficou pronta/u)
  expect(card?.body).not.toMatch(/Lia terminou/u)
  expect(card?.body).not.toMatch(/terminou Campanha/u)
})

function running(id: string, title: string, by: string): Ticket {
  const stamp = '2026-11-04T11:00:00.000Z'
  return {
    id, title, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: stamp }], inputs: [], undelivered: [],
    createdAt: stamp, updatedAt: stamp, origin: { triggerId: 'c1', triggerIds: ['c1'] },
    execution: { name: by, directory: '.', assignment: title },
  }
}

it('(B) one Task, one place: a delivered passage Task that waits for the person is in "Precisa de você" and NOT in "Hoje"', async () => {
  const h = rig()
  h.orchestration.runtime('pp').repo.tickets.save(running('texto-final', 'Texto final dos 3 posts', 'Bia'))
  say(h, 'c1', 'Bia, escreva o texto final dos 3 posts')
  h.handoffs.ask({
    projectId: 'pp', fromTicketId: 'texto-final', fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte dos 3 posts da campanha', kind: 'next', callId: 'bia-teo-1',
    note: { done: ['Texto dos 3 posts aprovado'], needed: ['Uma arte por post'], files: [], decisions: [] },
  })
  await flush(h)
  await flush(h)
  const passage = h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Teo')
  expect(passage, 'the passage Task exists').toBeDefined()
  h.orchestration.now = () => '2026-11-05T11:00:00.000Z'
  const posted = h.postDailyBriefNow({ ...SCOPE })
  expect(posted.outcome, 'there is something to say').toBe('posted')
  const view = cardOf(h, posted.messageId ?? '')?.dailyBrief
  const where = (id: string) => [view?.yesterday.some(line => line.taskId === id) ? 'Ontem' : '', view?.today.some(line => line.taskId === id) ? 'Hoje' : ''].filter(Boolean)
  expect(where(passage?.id ?? ''), 'the passage Task is in at most ONE list of the card').not.toContain('Hoje')
  expect(view?.needsYou.count, 'it waits for the person: "Precisa de você" says so').toBeGreaterThanOrEqual(1)
})
