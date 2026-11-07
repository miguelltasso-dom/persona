import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * EQUIPE-REAL: what the team finished and waits in the person's review for three days is asked for: ONE line of the Coordenação in
 * #geral, with the days said; at most one line a day, a Task again only after three more days, several Tasks as one line. No model.
 */

const DAY = 86_400_000
const T0 = Date.parse('2026-11-03T15:00:00.000Z')

function open(on = true): { h: PersonaHost; clock: { ms: number } } {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = on
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } }) // the colleagues' review has its own spec
  const clock = { ms: T0 }
  h.orchestration.now = () => new Date(clock.ms).toISOString()
  return { h, clock }
}

const lines = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const reminders = (h: PersonaHost) => lines(h).filter(row => row.subjectId === 'person-waiting')

async function finished(h: PersonaHost, id: string, who: string): Promise<void> {
  say(h, id, `@${who} escreva o texto ${id}`)
  await h.orchestration.flush('pp')
}

it('a Task that waited three days for the person is mentioned by the Coordenação, once, with the days said', async () => {
  const { h, clock } = open()
  await finished(h, 'a1', 'Bia')
  expect(h.listTasks(SCOPE).filter(task => task.stage === 'review')).toHaveLength(1)
  // too early: nothing
  clock.ms = T0 + 2 * DAY
  expect(h.personWaiting.check('pp')).toBe('nothing')
  expect(reminders(h)).toHaveLength(0)
  // three days: one line, by the Coordenação
  clock.ms = T0 + 3 * DAY
  expect(h.personWaiting.check('pp')).toBe('posted')
  const said = reminders(h)
  expect(said).toHaveLength(1)
  expect(said[0]?.actorId).toBe('guia')
  expect(said[0]?.body).toMatch(/^“.+”, de Bia, espera a sua revisão há 3 dias\.$/u)
  // the same day: no second line (the attention budget)
  expect(h.personWaiting.check('pp')).toBe('nothing')
  // the next days: not again before three more days
  clock.ms = T0 + 4 * DAY
  expect(h.personWaiting.check('pp')).toBe('nothing')
  clock.ms = T0 + 5 * DAY
  expect(h.personWaiting.check('pp')).toBe('nothing')
  clock.ms = T0 + 6 * DAY
  expect(h.personWaiting.check('pp')).toBe('posted')
  expect(reminders(h)).toHaveLength(2)
  expect(reminders(h)[1]?.body).toMatch(/há 6 dias\.$/u)
})

it('several Tasks are ONE line that names the oldest, never one line each', async () => {
  const { h, clock } = open()
  await finished(h, 'a1', 'Bia')
  clock.ms += 1000
  await finished(h, 'a2', 'Teo')
  clock.ms = T0 + 4 * DAY
  expect(h.personWaiting.check('pp')).toBe('posted')
  const said = reminders(h)
  expect(said).toHaveLength(1)
  expect(said[0]?.body).toMatch(/^2 tarefas esperam a sua revisão há mais de 3 dias: “.+”, “.+”\.$/u)
})

it('a person who already answered is not reminded, and with the team behavior off nothing is said', async () => {
  const off = open(false)
  await finished(off.h, 'a1', 'Bia')
  off.clock.ms = T0 + 5 * DAY
  expect(off.h.personWaiting.check('pp')).toBe('off')
  expect(reminders(off.h)).toHaveLength(0)

  const { h, clock } = open()
  await finished(h, 'a1', 'Bia')
  const task = h.listTasks(SCOPE).find(row => row.stage === 'review')!
  h.orchestration.completeReview('pp', task.id) // the person approved it
  clock.ms = T0 + 5 * DAY
  expect(h.personWaiting.check('pp')).toBe('nothing')
})
