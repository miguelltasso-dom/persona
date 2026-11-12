/**
 * Carbon P1-02 (snapshot 2): `ask_vault_code` opened a card and the persona ended her turn, as the tool told her; the Task then went to `ready` (review, "Pronto!") and the owner filling the six digits woke nobody
 * (`wakeTicket` only wakes a Task that is `waiting`). Now: a Task with a code request still pending WAITS (never `ready`, never a question), the card says what is awaited, and filling the card wakes it.
 * RED first.
 */
import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import { expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

function setup(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Atendimento' },
  ])
  h.sessionMemberId = 'ana'
  // this host has no sealed store: the digits go to an in-memory slot, which is all the card needs here
  const slots = new Map<string, string>()
  ;(h.cofre.codes as unknown as { deps: { secrets: unknown } }).deps.secrets = {
    put: (_project: string, slot: string, value: string) => { slots.set(slot, value); return Promise.resolve() },
    read: (_project: string, slot: string) => Promise.resolve(slots.get(slot)),
    drop: (_project: string, slot: string) => { slots.delete(slot); return Promise.resolve() },
    has: (_project: string, slot: string) => slots.has(slot),
  }
  return h
}

const ticketOf = (h: PersonaHost) => h.orchestration.runtime('pp').repo.tickets.list()[0]
const reportOf = (h: PersonaHost): string | undefined => {
  const ticket = ticketOf(h)
  return ticket === undefined ? undefined : latestAssignment(ticket)?.report?.state
}

it('a Task whose persona asked for the code WAITS: not ready, not a question, and the card says what it waits for', async () => {
  const h = setup()
  say(h, 'u1', '@Nina preciso de um README no projeto')
  const ticket = ticketOf(h)!
  h.cofre.codes.open({ projectId: 'pp', personaId: 'nina', ticketId: ticket.id, reason: 'O banco mandou um código por SMS.', site: 'Banco' })
  await h.orchestration.flush('pp')
  expect(reportOf(h)).toBe('waiting')
  expect(ticketOf(h)?.attention).toBeUndefined() // no question is open: the code card is the ask
  expect(h.listTasks(SCOPE).find(row => row.id === ticket.id)?.stage).not.toBe('review')
})

it('with no pending code request the same Task ends as it always did (ready)', async () => {
  const h = setup()
  say(h, 'u1', '@Nina preciso de um README no projeto')
  await h.orchestration.flush('pp')
  expect(reportOf(h)).toBe('ready')
})

it('the owner filling the six digits WAKES the waiting Task (wakeTicket answers true); a request nobody filled wakes nobody', async () => {
  const h = setup()
  say(h, 'u1', '@Nina preciso de um README no projeto')
  const ticket = ticketOf(h)!
  const request = h.cofre.codes.open({ projectId: 'pp', personaId: 'nina', ticketId: ticket.id, reason: 'O banco mandou um código por SMS.', site: 'Banco' })
  await h.orchestration.flush('pp')
  expect(reportOf(h)).toBe('waiting')
  const wake = vi.spyOn(h.orchestration, 'wakeTicket')
  expect(wake).not.toHaveBeenCalled()
  await h.fillCofreCode({ ...SCOPE, id: request.id, code: '123456' })
  expect(wake).toHaveBeenCalledTimes(1)
  expect(wake.mock.results[0]?.value).toBe(true)
})

it('the pending request counts for the owner: it is what the morning brief and the badge call "precisa de você"', () => {
  const h = setup()
  say(h, 'u1', '@Nina preciso de um README no projeto')
  const before = (h as unknown as { needsYouCount: (projectId: string) => number }).needsYouCount('pp')
  h.cofre.codes.open({ projectId: 'pp', personaId: 'nina', ticketId: ticketOf(h)!.id, reason: 'O banco mandou um código por SMS.', site: 'Banco' })
  expect((h as unknown as { needsYouCount: (projectId: string) => number }).needsYouCount('pp')).toBe(before + 1)
})
