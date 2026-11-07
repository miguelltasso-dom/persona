import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * TEAM-4 end to end in the real host (scripted engines, no model): a persona with a live Task calls `ask_team_opinion`; the tool decides
 * (identity, caps, budget) and `TeamOpinions.run` (Bolt) writes the request, one reply line per colleague asked and the closing line.
 * The rounds per Task and the requests per day are counted by the host; the second round is allowed, the third is not.
 */

function open(on = true): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
    { id: 'lia', name: 'Lia', title: 'Revisão' },
  ])
  h.teamworkEnabled = on
  // The review step (on by default in a new project) is not what these specs are about.
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const opinionRows = (h: PersonaHost) => thread(h).filter(row => row.opinion !== undefined)

function biaTask(h: PersonaHost): Ticket {
  say(h, 'u1', '@Bia faça o cartaz do sábado')
  const found = tickets(h).find(ticket => ticket.execution?.name === 'Bia')
  if (found === undefined) throw new Error('Bia has no Task')
  return found
}

const call = (ticket: Ticket, callId: string, args: Record<string, unknown> = { question: 'O que acham do cartaz?', draft: { text: 'Cartaz do sábado: pão quente às 7h.' } }) => ({
  tool: 'ask_team_opinion' as const, run: { personaId: 'bia', ticketId: ticket.id, assignmentId: 'a-1' }, args, callId,
})
const parse = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>

it('with the team switch off nothing becomes an event and nobody is called', async () => {
  const h = open(false)
  const bia = biaTask(h)
  expect(parse(await h.opinionTool.ask(call(bia, 'c1')))).toMatchObject({ ok: false, code: 'off' })
  expect(opinionRows(h)).toHaveLength(0)
})

it('Bia asks the team: ONE request line by her, one reply per colleague (as that colleague), and the answer Bia reads is the opinions as data', async () => {
  const h = open()
  const bia = biaTask(h)
  const answer = parse(await h.opinionTool.ask(call(bia, 'c1')))
  expect(answer).toMatchObject({ ok: true, round: 1, roundsLeft: 1 })
  expect(String(answer.opinions)).toContain('<opinioes>')
  expect(String(answer.opinions)).toContain('sobre "O que acham do cartaz?"')
  const rows = opinionRows(h)
  const request = rows.find(row => row.opinion?.kind === 'request')
  expect(request).toBeDefined()
  expect(request?.opinion).toMatchObject({ kind: 'request', round: 1, maxRounds: 2 })
  // "the team" of the round = the people LINKED to Bia's work: here the Coordenação (Guia). Teo and Lia are not part of this work, so they are
  // not asked (and Bia never answers herself)
  const replies = rows.filter(row => row.opinion?.kind === 'reply')
  expect(replies).toHaveLength(1)
  expect(replies[0]?.actorId).toBe('guia')
  // counted by the host: one round on this Task and one request of the day, shown to the person as ONE number
  expect(h.opinionTool.roundsUsed('pp', bia.id)).toBe(1)
  expect(h.teamwork.view('pp', 'bia').askedToday).toBe(1)
  // LEAK-1: no instruction given to a colleague reaches the thread
  const everything = thread(h).map(row => row.body).join('\n')
  for (const hidden of ['não instrução', 'Tudo entre aspas', 'Não use ferramentas', '<opinioes>']) expect(everything, hidden).not.toContain(hidden)
})

it('the same call again is the same answer: no new round, no new lines, no second model call', async () => {
  const h = open()
  const bia = biaTask(h)
  const first = await h.opinionTool.ask(call(bia, 'same'))
  const lines = thread(h).length
  const again = await h.opinionTool.ask(call(bia, 'same'))
  expect(again).toBe(first)
  expect(thread(h)).toHaveLength(lines)
  expect(h.opinionTool.roundsUsed('pp', bia.id)).toBe(1)
})

it('the second round is allowed and the third is not: the honest line, nobody called, nothing written', async () => {
  const h = open()
  const bia = biaTask(h)
  expect(parse(await h.opinionTool.ask(call(bia, 'a')))).toMatchObject({ ok: true, round: 1 })
  expect(parse(await h.opinionTool.ask(call(bia, 'b')))).toMatchObject({ ok: true, round: 2, roundsLeft: 0 })
  const lines = thread(h).length
  const third = parse(await h.opinionTool.ask(call(bia, 'c')))
  expect(third).toMatchObject({ ok: false, code: 'rounds-cap' })
  expect(String(third.message)).toContain('2 rodadas de opinião')
  expect(thread(h)).toHaveLength(lines)
  expect(h.opinionTool.roundsUsed('pp', bia.id)).toBe(2)
  expect(h.teamwork.view('pp', 'bia').askedToday).toBe(2)
})

it('the person lowers the cap to 1 round: the second is refused', async () => {
  const h = open()
  h.teamwork.set('pp', { personaId: 'bia', maxOpinionRounds: 1 })
  const bia = biaTask(h)
  expect(parse(await h.opinionTool.ask(call(bia, 'a')))).toMatchObject({ ok: true, round: 1, roundsLeft: 0 })
  expect(parse(await h.opinionTool.ask(call(bia, 'b')))).toMatchObject({ ok: false, code: 'rounds-cap' })
})

it('opinion rounds and requests to colleagues add up to ONE daily number against the persona\'s cap', async () => {
  const h = open()
  h.teamwork.set('pp', { personaId: 'bia', askCapPerDay: 2, maxOpinionRounds: 3 })
  const bia = biaTask(h)
  expect(parse(await h.opinionTool.ask(call(bia, 'a')))).toMatchObject({ ok: true })
  const ask = h.handoffs.ask({
    projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte do cartaz', callId: 'h1',
    note: { done: ['Texto pronto'], needed: ['Arte'], files: [], decisions: [] },
  })
  expect(ask).toMatchObject({ ok: true })
  expect(h.teamwork.view('pp', 'bia').askedToday).toBe(2)
  // the cap (2) is reached by one opinion + one help request: a new round is refused
  const capped = parse(await h.opinionTool.ask(call(bia, 'b')))
  expect(capped).toMatchObject({ ok: false, code: 'daily-cap' })
})

it('the autonomy is not a gate: a persona in the DEFAULT "Sugere e espera" asks the team (the switch and the caps decide)', async () => {
  const h = open()
  expect(h.proactivity.getAutonomy('pp', 'bia').mode).not.toBe('act')
  const bia = biaTask(h)
  const answer = parse(await h.opinionTool.ask(call(bia, 'a')))
  expect(answer).toMatchObject({ ok: true, round: 1 })
  expect(opinionRows(h).length).toBeGreaterThan(0)
  expect(h.opinionTool.roundsUsed('pp', bia.id)).toBe(1)
})

it('the switch "Pode pedir ajuda a colegas" off: the persona is told to ask the person to turn it on; nothing is written', async () => {
  const h = open()
  h.teamwork.set('pp', { personaId: 'bia', canAskColleagues: false })
  const bia = biaTask(h)
  const answer = parse(await h.opinionTool.ask(call(bia, 'a')))
  expect(answer).toMatchObject({ ok: false, code: 'not-allowed' })
  expect(String(answer.message)).toContain('persona_ask')
  expect(opinionRows(h)).toHaveLength(0)
  expect(h.opinionTool.roundsUsed('pp', bia.id)).toBe(0)
})

it('the people linked to the work are asked: a request that names two personas is ONE Task with a collaborator, and the collaborator joins the round', async () => {
  const h = open()
  say(h, 'u1', '@Bia @Teo façam o cartaz do sábado')
  const bia = tickets(h).find(ticket => ticket.execution?.name === 'Bia')
  if (bia === undefined) throw new Error('Bia has no Task')
  expect(parse(await h.opinionTool.ask(call(bia, 'c1')))).toMatchObject({ ok: true })
  const replies = opinionRows(h).filter(row => row.opinion?.kind === 'reply')
  // Teo (collaborator) and Guia (Coordenação) answer; Lia, who has nothing to do with this work, is not asked
  expect(new Set(replies.map(row => row.actorId))).toEqual(new Set(['teo', 'guia']))
})

it('"everyone" asks the whole project, on purpose', async () => {
  const h = open()
  const bia = biaTask(h)
  expect(parse(await h.opinionTool.ask(call(bia, 'c1', { question: 'Olhem todos?', draft: { text: 'Cartaz.' }, audience: 'everyone' })))).toMatchObject({ ok: true })
  const replies = opinionRows(h).filter(row => row.opinion?.kind === 'reply')
  expect(new Set(replies.map(row => row.actorId))).toEqual(new Set(['guia', 'teo', 'lia']))
})

it('the parts of a SPLIT request are linked: a campaign for "texto, arte e posts" asks the campaign team, never the freshly hired Finance or People', async () => {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Design' },
    { id: 'caio', name: 'Caio', title: 'Redes sociais' },
    { id: 'fin', name: 'Fábio', title: 'Financeiro' },
    { id: 'rh', name: 'Rita', title: 'Pessoas' },
  ])
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  say(h, 'u1', 'preciso de uma campanha de lançamento: texto, arte e posts')
  const mine = tickets(h).filter(ticket => ['Bia', 'Teo', 'Caio'].includes(ticket.execution?.name ?? ''))
  expect(mine.map(ticket => ticket.execution?.name).sort()).toEqual(['Bia', 'Caio', 'Teo'])
  const bia = mine.find(ticket => ticket.execution?.name === 'Bia')
  if (bia === undefined) throw new Error('Bia has no Task')
  expect(parse(await h.opinionTool.ask(call(bia, 'c1')))).toMatchObject({ ok: true })
  const replies = opinionRows(h).filter(row => row.opinion?.kind === 'reply')
  // Teo and Caio (the other parts of the campaign) and Guia (Coordenação) answer; Finance and People are not asked
  expect(new Set(replies.map(row => row.actorId))).toEqual(new Set(['teo', 'caio', 'guia']))
})
