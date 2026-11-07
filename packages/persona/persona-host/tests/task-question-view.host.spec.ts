import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * IV-10 "Responder": a Task with an open question tells the card WHERE it was asked and WHAT (one line, ≤ 120 characters, cut at a word).
 * TEAM-6: a Task whose review did not run says why (`reviewFailed`), for the detail and the grouped line of the delivery.
 */

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
  ])
  return h
}

const taskOf = (h: PersonaHost) => h.listTasks(SCOPE)[0]!

it('an open question gives the card its thread and a one-line version of the question; both go away when it is answered', async () => {
  const h = open()
  h.orchestration.liveQuestion = 'Qual a paleta da marca?'
  say(h, 'u1', '@Bia escreva o texto da campanha')
  await h.orchestration.flush('pp')
  expect(taskOf(h)).toMatchObject({ questionStreamId: 'channel:geral', question: 'Qual a paleta da marca?' })
  expect(h.answerAttention({ ...SCOPE, ticketId: taskOf(h).id, text: 'Azul e branco', optionIds: [] })).toBe(true)
  await h.orchestration.flush('pp')
  expect(taskOf(h).questionStreamId).toBeUndefined()
  expect(taskOf(h).question).toBeUndefined()
})

it('a long question is cut at a word with an ellipsis and never passes 120 characters', async () => {
  const h = open()
  const long = `${'Qual a paleta de cores da marca para a campanha de lançamento do produto novo, incluindo as cores secundárias e as fontes preferidas '.repeat(2)}?`
  h.orchestration.liveQuestion = long
  say(h, 'u1', '@Bia escreva o texto da campanha')
  await h.orchestration.flush('pp')
  const shown = taskOf(h).question!
  expect(shown.length).toBeLessThanOrEqual(120)
  expect(shown.endsWith('…')).toBe(true)
  expect(long.includes(shown.slice(0, -1))).toBe(true)
  expect(/\s/u.test(long.charAt(shown.length - 1))).toBe(true) // the cut is at a space
})

it('a Task with no question carries neither field', async () => {
  const h = open()
  say(h, 'u1', '@Bia escreva o texto da campanha')
  await h.orchestration.flush('pp')
  expect(taskOf(h).questionStreamId).toBeUndefined()
  expect(taskOf(h).question).toBeUndefined()
})

it('a review that did not run is said in the Task (reviewFailed), only with the team behavior on', async () => {
  const h = open()
  h.teamworkEnabled = true
  // the reviewer (Guia, by default) answers with something that is not a verdict
  const queue = ['Texto pronto.', 'Gostei muito do texto!']
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
  say(h, 'u1', '@Bia escreva o texto da campanha')
  for (let pass = 0; pass < 8; pass += 1) await h.orchestration.flush('pp')
  const bia = h.listTasks(SCOPE).find(task => task.title !== undefined && !task.title.startsWith('Revisar'))
  expect(bia?.reviewFailed).toBe('unreadable')
  h.teamworkEnabled = false
  expect(h.listTasks(SCOPE).every(task => task.reviewFailed === undefined)).toBe(true)
})
