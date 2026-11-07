/**
 * TEAM-1 views (Keel/Gauge, 04/11 22:35): the Task detail carries the bilhete it received and "o caminho do trabalho"; the board cards
 * carry "Pedido por {A}" / "Esperando {B}". All behind `Config.teamwork`: with it off no card, no Task and no thread line shows any of it.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const NOTE = { done: ['Texto dos 3 posts pronto.'], needed: ['Arte para cada post'], files: ['posts/post-1.md'], decisions: ['Tom leve'] }

function open(on: boolean): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = on
  // These specs are about asking a colleague: the review step (on by default in a new project) has its own spec (review-step.host.spec.ts).
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

const ticketOf = (h: PersonaHost, name: string) => h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === name)
const card = (h: PersonaHost, ticketId: string) => h.getProjectBoard(SCOPE).cards.find(row => row.ticketId === ticketId)
const task = (h: PersonaHost, ticketId: string) => h.listTasks(SCOPE).find(row => row.id === ticketId)

function chain(h: PersonaHost): { bia: string; teo: string } {
  say(h, 'u1', '@Bia escreva os 3 posts da campanha')
  const bia = ticketOf(h, 'Bia')!
  h.handoffs.ask({ projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte dos 3 posts', note: NOTE, callId: 'c1' })
  const teo = ticketOf(h, 'Teo')
  if (teo === undefined) throw new Error('Teo has no Task')
  return { bia: bia.id, teo: teo.id }
}

it('the colleague\'s Task carries the bilhete and the path; the board says "Pedido por Bia" there and "Esperando Teo" on Bia\'s card', async () => {
  const h = open(true)
  const { bia, teo } = chain(h)
  const received = task(h, teo)
  const { at, ...note } = received?.note ?? { at: '' }
  expect(note).toEqual({
    fromPersonaId: 'bia', toPersonaId: 'teo', taskId: teo,
    done: ['Texto dos 3 posts pronto.'], needed: ['Arte para cada post'], files: ['posts/post-1.md'], decisions: ['Tom leve'],
  })
  expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T/u) // the instant the request was made
  expect(received?.path?.map(step => `${step.personaId}:${step.step}`)).toEqual(['bia:asked'])
  expect(task(h, bia)?.note).toBeUndefined() // the bilhete is for whoever received it
  expect(task(h, bia)?.path?.map(step => step.step)).toEqual(['asked'])
  expect(card(h, teo)?.handoff).toEqual({ role: 'asked', otherPersonaId: 'bia' })
  expect(card(h, bia)?.handoff).toEqual({ role: 'waiting', otherPersonaId: 'teo' })
  await h.orchestration.flush('pp')
  await h.orchestration.flush('pp')
  // Teo delivered: Bia no longer waits for anybody, the path shows the delivery
  expect(card(h, bia)?.handoff).toBeUndefined()
  expect(task(h, bia)?.path?.map(step => `${step.personaId}:${step.step}`)).toEqual(['bia:asked', 'teo:delivered'])
  expect(card(h, teo)?.handoff).toEqual({ role: 'asked', otherPersonaId: 'bia' }) // "who asked" stays on his card
})

it('a Task that never took part in a handoff has neither note, path nor chip', () => {
  const h = open(true)
  say(h, 'u1', '@Teo crie a arte da campanha')
  const teo = ticketOf(h, 'Teo')!
  expect(task(h, teo.id)).not.toHaveProperty('note')
  expect(task(h, teo.id)).not.toHaveProperty('path')
  expect(card(h, teo.id)).not.toHaveProperty('handoff')
})

it('with Config.teamwork off none of these fields exist', () => {
  const h = open(true)
  const { bia, teo } = chain(h)
  h.teamworkEnabled = false
  for (const id of [bia, teo]) {
    expect(task(h, id)).not.toHaveProperty('note')
    expect(task(h, id)).not.toHaveProperty('path')
    expect(card(h, id)).not.toHaveProperty('handoff')
  }
})
