import { expect, it } from 'vitest'
import {
  MemoryRepositories, UserError, capped, personaRead, personaRecall, readable, resourceSpillPointer,
  ticketCard, triggerCard,
} from '../src/index.ts'
import { filledRepo, ticket, trigger } from './views.fixture.ts'

it('triggerCard e ticketCard usam capped() e ponteiro de leitura', () => {
  const long = 'palavra '.repeat(40)
  expect(capped(long, 10)).toMatchObject({ spilled: true, preview: long.replace(/\s+/g, ' ').trim().slice(0, 10) })
  const card = triggerCard(trigger('tr1', { text: long }))
  expect(card.read).toBe('trigger/tr1')
  expect(card.spilled).toBe(true)
  expect(ticketCard(ticket('need')).read).toBe('ticket/need')
})

it('persona_read escopa o worker ao próprio Ticket; trigger alheio é notReached', async () => {
  const repo = filledRepo()
  const host = { repo }
  const own = await personaRead(host, 'ticket/need', 'need')
  expect(own).toMatchObject({ ticket_id: 'need' })
  await expect(personaRead(host, 'ticket/work', 'need')).rejects.toBeInstanceOf(UserError)
  await expect(personaRead(host, 'trigger/tr1', 'hidden')).rejects.toMatchObject({ code: 'notReached' })
  const coordinator = await personaRead(host, 'tickets')
  expect((coordinator as { items: { ticket_id: string }[] }).items.some(item => item.ticket_id === 'need')).toBe(true)
})

it('readable admite origem; persona_recall autoriza por salto e para no vizinho de outro ticket', async () => {
  const repo = new MemoryRepositories('launch')
  const t = trigger('tr9')
  repo.triggers.save(t)
  const own = ticket('w1', { origin: { triggerId: 'tr9', triggerIds: ['tr9'] } })
  repo.tickets.save(own)
  expect(readable(own, t, () => undefined)).toBe(true)
  expect(readable(ticket('other'), t, () => undefined)).toBe(false)
  const hops = await personaRecall({
    repo,
    loadSpill: (id) => {
      if (id === 'ticket/w1') return { id, summary: 'own', body: 'body', neighborIds: ['ticket/other'] }
      return { id, summary: 'no', body: 'secret', neighborIds: [] }
    },
  }, resourceSpillPointer('ticket/w1'), 'w1')
  expect(hops.map(hop => hop.id)).toEqual(['ticket/w1'])
})
