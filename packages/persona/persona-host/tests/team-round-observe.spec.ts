import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import { observeHome, observeTeamRound, type RoundEvidence } from './support/team-round-observe.ts'
import type PersonaHost from '../src/index.ts'
import { dbPathOf, it, openJourneyFile, say, seedJourney } from './journeys/journey-host.ts'

/**
 * TEAM-10 observer: from a COPY of the database of a round, did the model use the team tools, did the bilhete stay out of the thread, was every
 * help delivered and resumed, is every seal a real review? Built on a real host (file database) for the positives, on hand-made evidence for
 * every way a round can be wrong.
 */

function open(): PersonaHost {
  const h = openJourneyFile()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = true
  return h
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(ticket => ticket.execution?.name === name)
async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}
function script(h: PersonaHost, steps: ReadonlyArray<string | (() => string)>): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const next = queue.shift(); return typeof next === 'function' ? next() : next }, set: () => undefined })
}
const NONE = { requireOpinion: false, requireBrief: false } as const
/** The scripted fake writes no measured ledger: its problems are not what these tests are about. */
const apart = (problems: readonly string[]): string[] => problems.filter(problem => !/ledger|paid turns/u.test(problem))

it('a round where the model asks, the colleague delivers, the asker resumes and a real review seals by tool: nothing left to say', async () => {
  const h = open()
  const call = (tool: 'ask_colleague' | 'review_verdict', ticket: Ticket, personaId: string, args: Record<string, unknown>) =>
    JSON.parse(h.teamTools.call({ tool, run: { personaId, ticketId: ticket.id, assignmentId: ticket.assignments[0]?.id ?? 'a1' }, args, callId: `${ticket.id}:lease:1` })) as Record<string, unknown>
  // the runs end in this order: Bia (asks Teo), Teo, Bia woken with the delivery, then Guia reviews and gives her verdict by the tool
  script(h, [
    'Texto pronto.',
    'Arte pronta.',
    'Texto e arte prontos.',
    () => { call('review_verdict', ticketOf(h, 'Guia')!, 'guia', { verdict: 'approve' }); return 'ok, obrigada' },
  ])
  say(h, 'u1', '@Bia escreva os posts e peça ao Teo a arte')
  const bia = ticketOf(h, 'Bia')!
  expect(call('ask_colleague', bia, 'bia', { colleague: 'Teo', title: 'Arte dos posts', done: ['Texto pronto'], needed: ['Arte'] })).toMatchObject({ ok: true })
  await settle(h)
  expect(latestAssignment(h.orchestration.runtime('pp').repo.tickets.get(bia.id)!)?.report?.state).toBe('ready')
  const seen = observeHome(dbPathOf(h), { ceilingTurns: 14, ...NONE })
  expect(seen.facts.requests.byTool).toEqual({ help: 1, next: 0 })
  expect(seen.facts.requests.byWords).toBe(0)
  expect(seen.facts.bilhete).toEqual({ requests: 1, reachedColleague: 1, inThread: 0 })
  expect(seen.facts.help).toMatchObject({ asked: 1, resumed: 1, leftWaiting: 0, failed: 0 })
  expect(seen.facts.reviews).toMatchObject({ sealed: 1, sealedByToolVerdict: 1, sealedByWords: 0, unreadable: 0 })
  expect(apart(seen.problems)).toEqual([])
})

it('a round where the host did it from words, not the model: "no request was made through the team tools"', async () => {
  const h = open()
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  script(h, ['Texto pronto.\n@Teo faça a arte dos 3 posts', 'Arte pronta.'])
  say(h, 'u1', '@Bia escreva os posts')
  await settle(h)
  const seen = observeHome(dbPathOf(h), { ceilingTurns: 14, requireReview: false, ...NONE })
  expect(seen.facts.requests).toMatchObject({ byTool: { help: 0, next: 0 }, byWords: 1 })
  expect(apart(seen.problems)).toEqual([expect.stringMatching(/did not use the team tools/u)])
  // relaxing what the round must show leaves it clean
  expect(apart(observeHome(dbPathOf(h), { ceilingTurns: 14, requireTools: false, requireReview: false, ...NONE }).problems)).toEqual([])
})

const base = (over: Partial<RoundEvidence> = {}): RoundEvidence => ({
  handoffs: [], verdicts: {}, reviews: [], tickets: [], events: [], attachments: [], personas: { bia: 'Bia', teo: 'Teo', guia: 'Guia' },
  ledger: [{ engine: 'claude', kind: 'execution', input: 3000, output: 200, origin: 'measured', at: '2026-11-05T10:00:00.000Z', ticketId: 't1' }],
  ...over,
})
const ask = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'handoff:t1:x', callId: 'a1:lease:1', mode: 'help', kind: 'help', fromPersonaId: 'bia', toPersonaId: 'teo', fromTicketId: 't1', status: 'resumed', ...over })
const colleagueTask = (assignment = 'Faça.\n<bilhete>\n- pronto\n</bilhete>') => ({ id: 't2', title: 'Arte', executor: 'Teo', assignment, triggerId: 'handoff:t1:x' })
const only = { requireReview: false, requireOpinion: false, requireBrief: false } as const

it('every way a round can be wrong is a named problem', () => {
  const expectation = { ceilingTurns: 14, ...only }
  // the bilhete never reached the colleague, was shown in the thread, and the asker was left waiting
  const bad = observeTeamRound(base({
    handoffs: [ask({ status: 'asked' })], tickets: [colleagueTask('Faça a arte.')],
    events: [{ id: 'e1', type: 'message', actorId: 'bia', body: 'Veja o <bilhete> pronto </bilhete>', at: '2026-11-05T10:00:01.000Z' }],
  }), expectation)
  expect(bad.passed).toBe(false)
  expect(bad.problems.join('\n')).toMatch(/did not reach the colleague's Task/u)
  expect(bad.problems.join('\n')).toMatch(/carry the bilhete/u)
  expect(bad.problems.join('\n')).toMatch(/left waiting/u)
  // a colleague that never delivered
  expect(observeTeamRound(base({ handoffs: [ask({ status: 'blocked' })], tickets: [colleagueTask()] }), expectation).problems.join('\n')).toMatch(/ended blocked/u)
  // the good one
  expect(observeTeamRound(base({ handoffs: [ask()], tickets: [colleagueTask()] }), expectation)).toMatchObject({ passed: true, problems: [] })
})

it('the seal needs a real review of ANOTHER persona that delivered; the verdict by tool is told apart from the words', () => {
  const sealed = { ticketId: 't1', state: { status: 'closed' }, authorPersonaId: 'bia', seal: { reviewerPersonaId: 'guia', at: 'x' } }
  const review = { id: 'handoff:t1:review', callId: 'review:t1:1', mode: 'help', kind: 'review', fromPersonaId: 'bia', toPersonaId: 'guia', fromTicketId: 't1', status: 'delivered' }
  const expectation = { ceilingTurns: 14, requireTools: false, requireOpinion: false, requireBrief: false }
  // a seal with nothing behind it
  expect(observeTeamRound(base({ reviews: [sealed] }), expectation).problems.join('\n')).toMatch(/no delivered review Task behind it/u)
  // the author sealing her own work
  expect(observeTeamRound(base({ reviews: [{ ...sealed, authorPersonaId: 'guia' }], handoffs: [review] }), expectation).problems.join('\n')).toMatch(/sealed her own work/u)
  // real review, verdict in words
  expect(observeTeamRound(base({ reviews: [sealed], handoffs: [review] }), expectation).facts.reviews).toMatchObject({ sealed: 1, sealedByToolVerdict: 0, sealedByWords: 1 })
  // real review, verdict by the tool
  const byTool = observeTeamRound(base({ reviews: [sealed], handoffs: [review], verdicts: { 'handoff:t1:review': { verdict: { verdict: 'approve' } } } }), expectation)
  expect(byTool).toMatchObject({ passed: true, facts: { reviews: { sealedByToolVerdict: 1, sealedByWords: 0 } } })
  // a round that required a review and has none
  expect(observeTeamRound(base(), { ceilingTurns: 14, requireTools: false, requireOpinion: false, requireBrief: false }).problems.join('\n')).toMatch(/peer review did not happen/u)
})

it('the opinion round (with an image), the morning brief (no paid turn) and the ledger', () => {
  const request = { id: 'opinion:c1:request', type: 'message', actorId: 'bia', body: 'O que acham?', at: '2026-11-05T10:00:00.000Z' }
  const reply = { id: 'opinion:c1:reply:guia', type: 'message', actorId: 'guia', body: 'Gostei do azul', at: '2026-11-05T10:00:05.000Z' }
  const closing = { id: 'opinion:c1:consolidated', type: 'message', actorId: 'bia', body: 'Troquei o fundo', at: '2026-11-05T10:00:09.000Z' }
  const expectation = { ceilingTurns: 14, requireTools: false, requireReview: false }
  const good = observeTeamRound(base({
    events: [request, reply, closing, { id: 'morning-brief:pp:2026-11-05', type: 'message', actorId: 'guia', body: 'Bom dia', at: '2026-11-05T11:00:00.000Z' }],
    attachments: [{ messageId: 'opinion:c1:request', name: 'cartaz.png' }],
  }), expectation)
  expect(good).toMatchObject({ passed: true, facts: { opinion: { rounds: 1, repliesFromOthers: 1, consolidated: 1, requestsWithImage: 1 }, brief: { present: true, paidTurnsAtItsMoment: 0 } } })
  // the REQUEST's own image (the natural round: the model names no file): it stays on the person's message and the round's card points to it
  const brief = { id: 'morning-brief:pp:2026-11-05', type: 'message', actorId: 'guia', body: 'Bom dia', at: '2026-11-05T11:00:00.000Z' }
  const fromRequest = observeTeamRound(base({
    events: [request, reply, closing, brief],
    attachments: [{ id: 'att-1', messageId: 'u-pedido', name: 'vitrine.JPG' }],
    opinionAttachments: { 'opinion:c1:request': ['att-1'] },
  }), expectation)
  expect(fromRequest).toMatchObject({ passed: true, facts: { opinion: { requestsWithImage: 1 } } })
  // a card that points to no attachment (or to one that is not an image) is not an image of the round
  for (const attachments of [[], [{ id: 'att-1', messageId: 'u-pedido', name: 'notas.txt' }]]) {
    const dangling = observeTeamRound(base({ events: [request, reply, closing, brief], attachments, opinionAttachments: { 'opinion:c1:request': ['att-1'] } }), expectation)
    expect(dangling.problems.join('\n')).toMatch(/no opinion request carries an image/u)
  }
  // no image, only the asker's own words, never consolidated, no brief
  const bad = observeTeamRound(base({ events: [request, { ...reply, actorId: 'bia' }] }), expectation)
  expect(bad.problems.join('\n')).toMatch(/no reply from another persona/u)
  expect(bad.problems.join('\n')).toMatch(/never consolidated/u)
  expect(bad.problems.join('\n')).toMatch(/no opinion request carries an image/u)
  expect(bad.problems.join('\n')).toMatch(/no morning brief/u)
  // a paid turn written at the brief's moment
  const paid = observeTeamRound(base({
    events: [request, reply, closing, { id: 'morning-brief:pp:d', type: 'message', actorId: 'guia', body: 'Bom dia', at: '2026-11-05T11:00:00.000Z' }],
    attachments: [{ messageId: 'opinion:c1:request', name: 'cartaz.png' }],
    ledger: [{ engine: 'claude', kind: 'reply', input: 3000, output: 200, origin: 'measured', at: '2026-11-05T11:00:02.000Z', ticketId: null }],
  }), expectation)
  expect(paid.problems.join('\n')).toMatch(/must cost nothing/u)
  // the ledger: above the ceiling, estimated, the fake's signature, empty
  const rows = (count: number, over: Record<string, unknown> = {}) => Array.from({ length: count }, () => ({ engine: 'claude', kind: 'execution', input: 3000, output: 200, origin: 'measured' as string | null, at: '2026-11-05T10:00:00.000Z', ticketId: 't1', ...over }))
  const only3 = { ceilingTurns: 3, requireTools: false, requireReview: false, requireOpinion: false, requireBrief: false }
  expect(observeTeamRound(base({ ledger: rows(4) }), only3).problems.join('\n')).toMatch(/above the approved ceiling of 3/u)
  expect(observeTeamRound(base({ ledger: rows(1, { origin: 'estimate' }) }), only3).problems.join('\n')).toMatch(/not fully measured/u)
  expect(observeTeamRound(base({ ledger: rows(1, { engine: 'dsh', input: 1, output: 1 }) }), only3).problems.join('\n')).toMatch(/FAKE runner signature/u)
  expect(observeTeamRound(base({ ledger: [] }), only3).problems.join('\n')).toMatch(/nothing real ran/u)
})

it('the NATURAL round (--any, TEAM-10 attempt 2): any collaboration the model chose passes, none is one named problem, and integrity still holds', () => {
  const brief = { id: 'morning-brief:pp:2026-11-05', type: 'message', actorId: 'guia', body: 'Bom dia', at: '2026-11-05T11:00:00.000Z' }
  const natural = { ceilingTurns: 14, anyCollaboration: true } as const
  // only a pass_forward by tool: no review, no opinion, and still a pass
  const passed = observeTeamRound(base({ handoffs: [ask({ mode: 'next', kind: 'next', status: 'delivered' })], tickets: [colleagueTask()], events: [brief] }), natural)
  expect(passed).toMatchObject({ passed: true, problems: [], facts: { collaborated: true, requests: { byTool: { help: 0, next: 1 } } } })
  // only a sealed review (the host's review step, the reviewer delivered)
  const sealed = { ticketId: 't1', state: { status: 'closed' }, authorPersonaId: 'bia', seal: { reviewerPersonaId: 'guia', at: 'x' } }
  const review = { id: 'handoff:t1:review', callId: 'review:t1:1', mode: 'help', kind: 'review', fromPersonaId: 'bia', toPersonaId: 'guia', fromTicketId: 't1', status: 'delivered' }
  expect(observeTeamRound(base({ reviews: [sealed], handoffs: [review], events: [brief] }), natural)).toMatchObject({ passed: true, facts: { collaborated: true } })
  // nothing at all (attempt 1): ONE problem that says so, not three
  const none = observeTeamRound(base({ events: [brief] }), natural)
  expect(none).toMatchObject({ passed: false, facts: { collaborated: false } })
  expect(none.problems).toEqual([expect.stringMatching(/did not collaborate/u)])
  // an opinion round that happened is checked whole: replies of others, consolidation and the image
  const request = { id: 'opinion:c1:request', type: 'message', actorId: 'bia', body: 'O que acham?', at: '2026-11-05T10:00:00.000Z' }
  const lonely = observeTeamRound(base({ events: [request, brief] }), natural)
  expect(lonely.facts.collaborated).toBe(true)
  expect(lonely.problems.join('\n')).toMatch(/no reply from another persona/u)
  expect(lonely.problems.join('\n')).toMatch(/no opinion request carries an image/u)
  // integrity is never relaxed: the bilhete, the help left waiting, the brief and the ledger
  const broken = observeTeamRound(base({ handoffs: [ask({ status: 'asked' })], tickets: [colleagueTask('Faça a arte.')], ledger: rows15() }), natural)
  expect(broken.problems.join('\n')).toMatch(/did not reach the colleague's Task/u)
  expect(broken.problems.join('\n')).toMatch(/left waiting/u)
  expect(broken.problems.join('\n')).toMatch(/no morning brief/u)
  expect(broken.problems.join('\n')).toMatch(/above the approved ceiling of 14/u)
})

function rows15(): RoundEvidence['ledger'] {
  return Array.from({ length: 15 }, () => ({ engine: 'claude', kind: 'execution', input: 3000, output: 200, origin: 'measured', at: '2026-11-05T10:00:00.000Z', ticketId: 't1' }))
}
