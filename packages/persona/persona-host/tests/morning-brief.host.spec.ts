/**
 * TEAM-7 (D-090): "Bom dia", the morning meeting, at zero cost. The facts come from a pure function of the engine; the host posts ONE card
 * in #geral per day, only when there is something to say, the first time the app is opened after 6:00 (else at 9:00, never after noon),
 * and the person can pause it. Nothing here calls a model and nothing carries an internal text (LEAK-1).
 */
import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type PersonaHost from '../src/index.ts'
import { MORNING_ROUTINE_PREFIX } from '../src/morning-brief-host.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const SECRET = 'SEGREDO_DA_ATRIBUICAO_LEAK1'
const TODAY = '2026-11-05'
const at = (hhmm: string, day: string = TODAY): string => `${day}T${hhmm}:00.000Z` // São Paulo is UTC-3: 11:00Z = 08:00 local

function open(on = true): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = on
  h.timezoneOffsetMinutes = () => -180
  return h
}

function clock(h: PersonaHost, hhmm: string, day: string = TODAY): void {
  h.orchestration.now = () => at(hhmm, day)
}

function ticket(h: PersonaHost, id: string, title: string, by: 'Bia' | 'Teo', over: Partial<Ticket> = {}): void {
  const stamp = '2026-11-05T09:00:00.000Z'
  h.orchestration.runtime('pp').repo.tickets.save({
    id, title, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: stamp }], inputs: [], undelivered: [],
    createdAt: stamp, updatedAt: stamp, origin: { triggerId: `t-${id}`, triggerIds: [`t-${id}`] },
    execution: { name: by, directory: '.', assignment: `${SECRET} ${title}` }, ...over,
  })
}

/** Bia delivered yesterday (15:00 local), Teo is on something now. */
function seedDay(h: PersonaHost): void {
  ticket(h, 'texto', 'Texto dos 3 posts', 'Bia', { ended: { at: at('18:00', '2026-11-04'), by: 'executor', outcome: 'completed' } })
  ticket(h, 'arte', 'Arte da campanha', 'Teo', { updatedAt: at('10:00') })
}

const cards = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 })
  .events.filter(row => row.dailyBrief !== undefined)

it('with the flag off nothing is posted and no routine appears', () => {
  const h = open(false)
  seedDay(h)
  clock(h, '11:00')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('off')
  expect(cards(h)).toHaveLength(0)
  expect(h.routines.list('pp').some(row => row.id.startsWith(MORNING_ROUTINE_PREFIX))).toBe(false)
})

it('the first opening after 6:00 posts ONE card by the Coordenação: Ontem, Hoje, in words and as data with the real ids', () => {
  const h = open()
  seedDay(h)
  clock(h, '11:00')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
  const [card] = cards(h)
  expect(card?.actorId).toBe('guia') // the Coordenação speaks, not the person
  expect(card?.body).toBe('Bom dia. Ontem: Bia terminou Texto dos 3 posts. Hoje: Teo: Arte da campanha.')
  expect(card?.dailyBrief).toEqual({
    day: TODAY, coordinatorPersonaId: 'guia',
    yesterday: [{ taskId: 'texto', personaId: 'bia', title: 'Texto dos 3 posts' }], yesterdayMore: 0,
    today: [{ taskId: 'arte', personaId: 'teo', title: 'Arte da campanha' }],
    needsYou: { count: 0 }, paused: false, routineId: `${MORNING_ROUTINE_PREFIX}pp`, variant: 'morning',
  })
  // at most one a day, whatever opens the app afterwards
  expect(h.morningBrief.check('pp', 'app-open')).toBe('not-due')
  expect(h.morningBrief.check('pp', 'tick')).toBe('not-due')
  expect(cards(h)).toHaveLength(1)
})

it('the window: not before 6:00 on opening, not before 9:00 on the clock, never after noon', () => {
  const h = open()
  seedDay(h)
  clock(h, '08:30') // 05:30 local
  expect(h.morningBrief.check('pp', 'app-open')).toBe('not-due')
  clock(h, '11:59') // 08:59 local: the clock does not post before 9:00
  expect(h.morningBrief.check('pp', 'tick')).toBe('not-due')
  clock(h, '12:00') // 09:00 local
  expect(h.morningBrief.check('pp', 'tick')).toBe('posted') // the app was not opened: the clock brings it
  const h2 = open()
  seedDay(h2)
  clock(h2, '15:30') // 12:30 local
  expect(h2.morningBrief.check('pp', 'app-open')).toBe('not-due')
  expect(cards(h2)).toHaveLength(0)
})

it('only when there is something to say: nothing happened, nobody busy, nothing waits ⇒ no card, no "dia calmo"', () => {
  const h = open()
  clock(h, '11:00')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('nothing-to-say')
  expect(cards(h)).toHaveLength(0)
  // Teo is busy, nothing finished: the card goes out once ...
  ticket(h, 'arte', 'Arte da campanha', 'Teo', { updatedAt: at('10:00') })
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
  // ... and the next day, with the very same facts and nothing waiting for the person, nothing goes out
  clock(h, '11:00', '2026-11-06')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('nothing-to-say')
  expect(cards(h)).toHaveLength(1)
})

it('something that waits for the person brings the card even when nothing else changed', () => {
  const h = open()
  ticket(h, 'arte', 'Arte da campanha', 'Teo', { updatedAt: at('10:00') })
  clock(h, '11:00')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
  clock(h, '11:00', '2026-11-06')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('nothing-to-say') // same facts, nobody waits
  // two things now wait for the person (approvals, reviews): the same facts still bring the card, with the count
  ;(h as unknown as { needsYouCount: (projectId: string) => number }).needsYouCount = () => 2
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
  expect(cards(h).at(-1)?.dailyBrief?.needsYou).toEqual({ count: 2 })
  expect(cards(h).at(-1)?.body).toContain('Precisa de você: 2 coisas esperam você.')
})

it('the routine "Resumo da manhã" is the team\'s: shown, pausable, never edited or deleted; pausing stops the card and the view says so', async () => {
  const h = open()
  seedDay(h)
  clock(h, '11:00')
  h.morningBrief.ensureRoutine('pp')
  const id = `${MORNING_ROUTINE_PREFIX}pp`
  const listed = h.listRoutines(SCOPE).find(row => row.id === id)
  expect(listed).toMatchObject({ name: 'Resumo da manhã', system: true, paused: false })
  expect(() => h.deleteRoutine({ ...SCOPE, id })).toThrow(/da própria equipe/iu)
  expect(() => h.updateRoutine({ ...SCOPE, id, name: 'Outro nome' })).toThrow(/pausar/iu)
  h.routines.setPaused(id, true)
  expect(h.morningBrief.check('pp', 'app-open')).toBe('paused')
  expect(cards(h)).toHaveLength(0)
  h.routines.setPaused(id, false)
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
  h.routines.setPaused(id, true) // paused AFTER it went out: the card says so, live
  expect(cards(h)[0]?.dailyBrief?.paused).toBe(true)
  await h.orchestration.flush('pp')
})

it('no model, no Task: a scheduler cycle with the routine due starts nothing for it', async () => {
  const h = open()
  seedDay(h)
  clock(h, '12:00') // 09:00 local
  const before = h.orchestration.runtime('pp').repo.tickets.list().length
  await h.proactivityScheduler.cycle()
  expect(h.orchestration.runtime('pp').repo.tickets.list().filter(item => item.title.includes('Resumo da manhã'))).toHaveLength(0)
  expect(h.orchestration.runtime('pp').repo.tickets.list().length).toBeGreaterThanOrEqual(before) // nothing was removed
  expect(cards(h)).toHaveLength(1) // the clock brought the card (the app was not opened)
})

it('LEAK-1: the card and its body carry ids, titles and numbers only — never the assignment or any prompt', () => {
  const h = open()
  seedDay(h)
  clock(h, '11:00')
  h.morningBrief.check('pp', 'app-open')
  const everything = JSON.stringify(cards(h)) + h.events.listProject('pp').map(event => event.body).join('\n')
  for (const hidden of [SECRET, 'Não use ferramentas', 'assignment', 'resuma somente']) expect(everything, hidden).not.toContain(hidden)
})
