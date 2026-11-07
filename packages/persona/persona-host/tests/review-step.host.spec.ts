import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * EQUIPE-REAL, TEAM-6 (contracts/review-step.md, team-real.md): before a Task's work reaches the person, a colleague (by default the
 * Coordenação) reviews it in a Task of their own. Approved: the work goes on with the seal. Returned: it goes back to its author with
 * the notes as a bilhete, twice at most; the third time it goes on WITHOUT the seal and the points in plain sight. A reviewer that
 * fails, or answers with something that is not a verdict, never holds a delivery.
 */

function open(policy?: 'off'): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = true
  if (policy === 'off') h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

/** What each Task's run says, in the order the runs end (the author, the reviewer, the author again…). */
function script(h: PersonaHost, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const byName = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(ticket => ticket.execution?.name === name)
const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const reviews = (h: PersonaHost) => thread(h).flatMap(row => row.review === undefined ? [] : [row.review])

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp') // each wake-up queues the next run behind the current one
}

const REQUEST = '@Bia escreva os 3 posts da campanha'

it('approved: the work goes on to the person with the seal, after a review Task of the Coordenação', async () => {
  const h = open()
  script(h, ['Texto dos 3 posts pronto.', 'APROVADO\nTudo certo.'])
  say(h, 'u1', REQUEST)
  await settle(h)
  const bia = byName(h, 'Bia')!
  const guia = byName(h, 'Guia')!
  expect(guia.title).toMatch(/^Revisar:/u)
  expect(latestAssignment(bia)?.report?.state).toBe('ready')
  expect(h.handoffs.reviewedBy('pp', bia.id)).toMatchObject({ personaId: 'guia' })
  expect(h.handoffs.reviewing('pp', bia.id)).toBeUndefined()
  expect(reviews(h)).toMatchObject([{ kind: 'reviewed', reviewerPersonaId: 'guia', authorPersonaId: 'bia', taskId: bia.id, round: 0 }])
  // the request to the reviewer is ONE typed line in the thread; the bilhete is not in the thread
  // the review is INTERNAL (EQUIPE-REAL-SPEC §0): no "pediu a revisão" line and no "Esperando a revisão" line in the thread — only its result
  expect(thread(h).filter(row => row.handoff?.purpose === 'review')).toHaveLength(0)
  expect(thread(h).some(row => /Esperando a revisão|pediu a revisão/u.test(row.body))).toBe(false)
  expect(h.events.listProject('pp').filter(event => event.type === 'handoff' && event.actorId === 'team:review')).toHaveLength(1) // it exists for the engine
  expect(thread(h).map(row => row.body).join('\n')).not.toContain('<bilhete>')
  // a review is announced by its typed line only: no progress line of the reviewer, and her verdict words are not shown as a message
  expect(thread(h).some(row => row.body.startsWith('Em andamento: Revisar'))).toBe(false)
  expect(thread(h).some(row => row.body.includes('Tudo certo.'))).toBe(false)
  expect(h.handoffs.pathOf('pp', bia.id).map(step => `${step.personaId}:${step.step}`)).toContain('guia:reviewed')
})

it('returned once: the author gets the notes as a bilhete (data), adjusts, and the second pass approves — "ajustou e aprovou"', async () => {
  const h = open()
  script(h, ['Texto dos 3 posts pronto.', 'AJUSTES\n- falta o preço no 2º post', 'Ajustei o preço.', 'APROVADO'])
  say(h, 'u1', REQUEST)
  await settle(h)
  const bia = byName(h, 'Bia')!
  expect(bia.assignments.length).toBeGreaterThanOrEqual(2)
  expect(latestAssignment(bia)?.report?.state).toBe('ready')
  expect(reviews(h).map(card => `${card.kind}:${String(card.round)}`)).toEqual(['returned:1', 'reviewed:1'])
  expect(reviews(h)[0]).toMatchObject({ summary: 'falta o preço no 2º post' })
  expect(h.handoffs.reviewedBy('pp', bia.id)).toMatchObject({ personaId: 'guia' })
  // the notes went back to HER as a bilhete between delimiters, never into the thread
  const woke = bia.assignments.length >= 2 ? (h.orchestration.runtime('pp').repo.tickets.get(bia.id)?.inputs ?? []) : []
  const text = woke.map(input => (input.kind === 'text' ? input.text : '')).join('\n')
  expect(text === '' || text.includes('<bilhete>')).toBe(true)
  expect(thread(h).filter(row => row.body.includes('falta o preço no 2º post') && row.review === undefined)).toHaveLength(0)
})

it('the third time the reviewer still has points: the work goes on WITHOUT the seal and with the points in plain sight', async () => {
  const h = open()
  script(h, ['Texto pronto.', 'AJUSTES\n- a', 'Ajustei a.', 'AJUSTES\n- b', 'Ajustei b.', 'AJUSTES\n- c\n- d'])
  say(h, 'u1', REQUEST)
  await settle(h)
  const bia = byName(h, 'Bia')!
  expect(latestAssignment(bia)?.report?.state).toBe('ready')
  expect(reviews(h).map(card => card.kind)).toEqual(['returned', 'returned', 'returned'])
  expect(reviews(h)[2]).toMatchObject({ openPoints: 2 })
  expect(h.handoffs.reviewedBy('pp', bia.id)).toMatchObject({ personaId: 'guia', openPoints: 2 })
  expect(h.handoffs.reviewing('pp', bia.id)).toBeUndefined()
})

it('a reviewer whose engine fails never holds the delivery: the work goes on unsealed', async () => {
  const h = open()
  script(h, ['Texto pronto.'])
  h.orchestration.runnerFactory = async (request) => {
    if (request?.personaName === 'Guia' && request.purpose === 'task') throw new Error('falha sintética')
    return createFakeRunner()
  }
  say(h, 'u1', REQUEST)
  await settle(h)
  const bia = byName(h, 'Bia')!
  expect(latestAssignment(bia)?.report?.state).toBe('ready')
  expect(h.handoffs.reviewedBy('pp', bia.id)).toBeUndefined()
  expect(reviews(h)).toHaveLength(0)
})

it('an answer that is not a verdict counts as a reviewer that failed (unsealed, never held)', async () => {
  const h = open()
  script(h, ['Texto pronto.', 'Gostei muito do texto, ficou ótimo!'])
  say(h, 'u1', REQUEST)
  await settle(h)
  const bia = byName(h, 'Bia')!
  expect(latestAssignment(bia)?.report?.state).toBe('ready')
  expect(h.handoffs.reviewedBy('pp', bia.id)).toBeUndefined()
  // no line per Task, and never the reviewer's free text: the reason is in the review's record (the Task detail and the grouped line of the delivery)
  expect(thread(h).some(row => /não conseguiu revisar/u.test(row.body))).toBe(false)
  expect(thread(h).some(row => row.body.includes('Gostei muito'))).toBe(false)
  expect(h.handoffs.reviewFailure('pp', bia.id)).toBe('unreadable')
  // the reviewer's Task is closed by itself: it is not a delivery to the person, so it never waits in her review nor in "Precisa de você"
  expect(h.orchestration.runtime('pp').repo.tickets.get(byName(h, 'Guia')!.id)?.ended).toBeDefined()
})

it('review off: no review Task; the first delivery and the Tasks a colleague was asked to do are never reviewed', async () => {
  const off = open('off')
  script(off, ['Texto pronto.'])
  say(off, 'u1', REQUEST)
  await settle(off)
  expect(tickets(off).map(ticket => ticket.execution?.name)).toEqual(['Bia'])
  expect(latestAssignment(byName(off, 'Bia')!)?.report?.state).toBe('ready')

  // review on: Bia asks Teo for help — Teo's Task is a help Task (not reviewed); only Bia's own delivery is
  const h = open()
  script(h, ['Texto pronto, falta a arte.', 'Arte pronta.', 'Texto e arte prontos.', 'APROVADO'])
  say(h, 'u1', REQUEST)
  const bia = byName(h, 'Bia')!
  expect(h.handoffs.ask({
    projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte dos 3 posts',
    note: { done: ['Texto pronto'], needed: ['Arte'] }, callId: 'c1',
  })).toMatchObject({ ok: true })
  await settle(h)
  const reviewTasks = tickets(h).filter(ticket => ticket.title.startsWith('Revisar:'))
  expect(reviewTasks).toHaveLength(1) // Bia's work, once; never Teo's help Task
  expect(latestAssignment(h.orchestration.runtime('pp').repo.tickets.get(bia.id)!)?.report?.state).toBe('ready')
  expect(h.handoffs.reviewedBy('pp', bia.id)).toMatchObject({ personaId: 'guia' })
})

it('Config.teamwork off: NO review Task, no extra ticket, and the one-shot liveText hook is left for the reply that waits for it', async () => {
  const h = open() // a Coordenação is on the team and the review policy is the default (on)…
  h.teamworkEnabled = false // …but the team behaviors are not (VITEST default; `Config.teamwork: false`; PERSONA_TEAMWORK=0)
  const spoken: string[] = []
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { spoken.push('read'); return 'Texto pronto.' }, set: () => undefined })
  say(h, 'u1', REQUEST)
  await settle(h)
  expect(tickets(h).map(ticket => ticket.execution?.name)).toEqual(['Bia']) // no "Revisar: …" Task for Guia
  expect(tickets(h).some(ticket => ticket.title.startsWith('Revisar:'))).toBe(false)
  expect(spoken).toHaveLength(1) // only Bia's run read the hook: a review run would have taken a second
  expect(latestAssignment(byName(h, 'Bia')!)?.report?.state).toBe('ready')
  expect(h.handoffs.reviewing('pp', byName(h, 'Bia')!.id)).toBeUndefined()
  expect(h.events.listProject('pp').filter(event => event.type === 'handoff' || event.type === 'review')).toHaveLength(0)
  expect(h.screens.screens.list('pp', 'review_state')).toHaveLength(0)
})

it('the author never reviews her own work: with only the author on the team there is no reviewer and the work is not held', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'bia', name: 'Bia', title: 'Redação' }])
  h.teamworkEnabled = true
  script(h, ['Texto pronto.'])
  say(h, 'u1', REQUEST)
  await settle(h)
  expect(tickets(h).map(ticket => ticket.execution?.name)).toEqual(['Bia'])
  expect(latestAssignment(byName(h, 'Bia')!)?.report?.state).toBe('ready')
})
