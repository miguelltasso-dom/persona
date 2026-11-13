import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect, vi } from 'vitest'
import { it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * Marco Dogfood M2 on a REAL host: the responsible posts the day summary in the project's #geral at the end of the LOCAL day (23:30 in UTC-3 is 02:30Z of the next day) as herself, ONCE (stable id), only in a project whose
 * owner turned the autopilot on. A card born in a DM never appears (not even as a count): a day that had only that is a quiet day and posts nothing. The model is never called.
 */
const SP = { workspaceId: 'ws', projectId: 'sp' } as const
const SECRET = 'segredo-da-ana-5521'
const UTC_MINUS_3 = -180

function open() {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, [])
  seedProject(h, { id: 'sp', name: 'Equipe', team: [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }] })
  h.sessionMemberId = 'ana'
  h.timezoneOffsetMinutes = () => UTC_MINUS_3
  const clock = { iso: '2026-11-12T20:00:00.000Z' } // 17:00 local on 12/11
  h.orchestration.now = () => clock.iso
  vi.spyOn(h.orchestration, 'driveTicket').mockResolvedValue()
  h.setProjectAutopilot({ ...SP, on: true })
  return { h, clock }
}

function doneTicket(id: string, title: string, endedAt: string): Ticket {
  return {
    id, title, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'ended', createdAt: '2026-11-12T13:00:00.000Z' }], inputs: [], undelivered: [],
    createdAt: '2026-11-12T13:00:00.000Z', updatedAt: endedAt, origin: { triggerId: `e-${id}`, triggerIds: [`e-${id}`] },
    execution: { name: 'Bia', directory: '.', assignment: 'go' }, ended: { at: endedAt, by: 'executor', outcome: 'completed' },
  }
}

const summaries = (h: ReturnType<typeof open>['h']) => {
  const channel = h.product.listChannels('sp').find(row => row.name === 'geral')
  if (channel === undefined) throw new Error('no #geral')
  return h.listMessages({ ...SP, streamKind: 'channel', ownerId: channel.id, actorId: 'ana', afterSeq: 0, limit: 200 }).events.filter(row => row.id.startsWith('day-summary-'))
}

it('at 23:30 LOCAL (02:30Z of the next day) the summary of the local day goes ONCE, as the responsible, with the stable id; before that, nothing', async () => {
  const { h, clock } = open()
  h.orchestration.runtime('sp').repo.tickets.save(doneTicket('t1', 'Cardápio da semana', '2026-11-12T19:00:00.000Z')) // 16:00 local on 12/11
  clock.iso = '2026-11-13T02:00:00.000Z' // 23:00 local: not yet
  await h.proactivityScheduler.cycle()
  expect(summaries(h)).toEqual([])
  clock.iso = '2026-11-13T02:30:00.000Z' // 23:30 local on 12/11
  await h.proactivityScheduler.cycle()
  const posted = summaries(h)
  expect(posted).toHaveLength(1)
  expect(posted[0]).toMatchObject({ id: 'day-summary-sp-2026-11-12', actorId: 'lia' })
  expect(posted[0]?.body).toContain('Hoje o quadro andou: 1 cartão ficou pronto.')
  expect(posted[0]?.body).toContain('Cardápio da semana')
  clock.iso = '2026-11-13T02:40:00.000Z'
  await h.proactivityScheduler.cycle()
  expect(summaries(h)).toHaveLength(1) // idempotent
})

/** A Task born in the DM between Ana and Bia, ended on 12/11 (16:00 local): its title carries the DM's words (and a secret). */
async function dmDone(h: ReturnType<typeof open>['h']) {
  h.teamworkEnabled = true
  h.screens.screens.put('sp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  h.createMember({ id: 'bob', ...SP, displayName: 'Bob', handle: 'bob', role: 'member' })
  h.createDm({ id: 'dm-ab', ...SP, participantA: 'ana', participantB: 'bia' })
  const queue = [`Anotado: guardei o ${SECRET}.`]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
  h.postMessage({ id: 'd1', ...SP, streamKind: 'dm', ownerId: 'dm-ab', body: `Bia, escreva a lista do cliente e guarde o ${SECRET}`, actorId: 'ana', subjectId: 'd1' })
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sp')
  const dmTicket = h.orchestration.runtime('sp').repo.tickets.list().find(row => row.execution?.name === 'Bia')
  if (dmTicket === undefined) throw new Error('a DM não abriu Tarefa')
  const { ended, ...open2 } = dmTicket
  void ended
  h.orchestration.runtime('sp').repo.tickets.save({ ...open2, assignments: [{ id: 'a-dm', state: 'ended', createdAt: '2026-11-12T13:00:00.000Z' }], ended: { at: '2026-11-12T19:00:00.000Z', by: 'executor', outcome: 'completed' }, updatedAt: '2026-11-12T19:00:00.000Z' })
  return dmTicket
}

it('a card BORN IN A DM never appears in the summary (not even as a count): a day with only that is a quiet day and posts nothing', async () => {
  const { h, clock } = open()
  await dmDone(h)
  clock.iso = '2026-11-13T02:30:00.000Z'
  await h.proactivityScheduler.cycle()
  expect(summaries(h), 'a day with only a DM-born card is a quiet day').toEqual([])
})

it('control, same day: with a card of the CHANNEL beside the DM-born one the summary goes, counts ONE card and carries none of the DM\'s words', async () => {
  const { h, clock } = open()
  const dmTicket = await dmDone(h)
  h.orchestration.runtime('sp').repo.tickets.save(doneTicket('t-open', 'Cartaz da promoção', '2026-11-12T18:00:00.000Z'))
  clock.iso = '2026-11-13T02:30:00.000Z'
  await h.proactivityScheduler.cycle()
  const posted = summaries(h)
  expect(posted, 'the channel card made the day worth a summary').toHaveLength(1)
  expect(posted[0]?.body).toContain('Cartaz da promoção')
  expect(posted[0]?.body).toContain('1 cartão ficou pronto') // the DM-born one is not even counted
  expect(posted[0]?.body.includes(dmTicket.title) || posted[0]?.body.includes(SECRET)).toBe(false)
})
