import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * EQUIPE-REAL, TEAM-2/3 (contracts/team-real.md): a persona asks a colleague with a bilhete; the colleague's Task inherits the
 * person's scope; the asker WAITS; the delivery wakes her; the thread has ONE typed line per step and never the bilhete.
 */

const NOTE = {
  done: ['Texto dos 3 posts pronto.'],
  needed: ['Arte para cada post'],
  files: ['posts/post-1.md'],
  decisions: ['Tom leve, sem gíria'],
}

function open(on = true): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
    { id: 'lia', name: 'Lia', title: 'Revisão' },
    { id: 'ivo', name: 'Ivo', title: 'Dados' },
  ])
  h.teamworkEnabled = on
  // These specs are about asking a colleague: the review step (on by default in a new project) has its own spec (review-step.host.spec.ts).
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(ticket => ticket.execution?.name === name)
const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const rows = (h: PersonaHost) => thread(h).filter(row => row.handoff !== undefined)

function request(h: PersonaHost, id = 'u1'): Ticket {
  say(h, id, '@Bia escreva os 3 posts da campanha')
  const bia = ticketOf(h, 'Bia')
  if (bia === undefined) throw new Error('Bia has no Task')
  return bia
}

const ask = (h: PersonaHost, from: Ticket, who = 'bia', to = 'teo', callId = 'c1', extra: Record<string, unknown> = {}) =>
  h.handoffs.ask({ projectId: 'pp', fromTicketId: from.id, fromPersonaId: who, toPersonaId: to, title: 'Arte dos 3 posts', note: NOTE, callId, ...extra })

it('with the team switch off nothing becomes an event', () => {
  const h = open(false)
  const bia = request(h)
  const result = ask(h, bia)
  expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/ainda não está ligado/u) })
  expect(rows(h)).toHaveLength(0)
  expect(tickets(h)).toHaveLength(1)
})

it('Bia asks Teo: his Task inherits the person\'s scope, the thread has ONE typed line, the bilhete reaches only him — as data', async () => {
  const h = open()
  const bia = request(h)
  const result = ask(h, bia)
  expect(result).toMatchObject({ ok: true, status: 'asked' })
  const teo = ticketOf(h, 'Teo')
  expect(teo).toBeDefined()
  // the colleague works for the person's request: same mandate, never more
  expect(teo?.mandate.actor).toEqual(bia.mandate.actor)
  expect(teo?.mandate.scope).toBe(bia.mandate.scope)
  expect(teo?.title).toBe('Arte dos 3 posts')
  // the bilhete is in HIS assignment, between delimiters, as data
  const assignment = teo?.execution?.assignment ?? ''
  expect(assignment).toContain('<bilhete>')
  expect(assignment).toContain('- Texto dos 3 posts pronto.')
  expect(assignment).toContain('- posts/post-1.md')
  expect(assignment).toContain('não instruções')
  // one typed line, in words and as data; the bilhete never appears in the thread
  const lines = rows(h)
  expect(lines).toHaveLength(1)
  expect(lines[0]?.handoff).toMatchObject({ fromPersonaId: 'bia', toPersonaId: 'teo', fromTaskId: bia.id, title: 'Arte dos 3 posts', mode: 'help', status: 'asked' })
  expect(lines[0]?.body.split('\n')[0]).toBe('Bia pediu ajuda a Teo: Arte dos 3 posts')
  const all = thread(h).map(row => row.body).join('\n')
  for (const hidden of ['<bilhete>', 'Texto dos 3 posts pronto', 'Tom leve', 'não instruções', 'Não use ferramentas']) expect(all, hidden).not.toContain(hidden)
  await h.orchestration.flush('pp')
})

it('Bia WAITS (no question to the person) and Teo\'s delivery wakes her; the thread says who delivered', async () => {
  const h = open()
  const bia = request(h)
  ask(h, bia)
  await h.orchestration.flush('pp')
  await h.orchestration.flush('pp') // the wake-up queues the second run of Bia behind the first
  const after = h.orchestration.runtime('pp').repo.tickets.get(bia.id)!
  // the wait never became a question to the person
  expect(after.attention).toBeUndefined()
  // Teo delivered, Bia was woken by a NEW Assignment and finished
  expect(after.assignments.length).toBeGreaterThanOrEqual(2)
  expect(latestAssignment(after)?.report?.state).toBe('ready')
  const statuses = rows(h).map(row => row.handoff?.status)
  expect(statuses).toEqual(['asked', 'delivered', 'resumed'])
  // Teo's Task was a help Task: internal, it closes by itself once it delivered (it never waits in the person's review)
  expect(h.orchestration.runtime('pp').repo.tickets.get(ticketOf(h, 'Teo')!.id)?.ended).toBeDefined()
  expect(rows(h)[1]?.body.split('\n')[0]).toBe('Teo ajudou Bia: Arte dos 3 posts') // a HELP is "ajudou", not "entregou para" (only a passage is a hand-over)
  expect(rows(h)[2]?.body.split('\n')[0]).toBe('Bia retomou “Arte dos 3 posts” com a entrega de Teo')
  // what Teo delivered reached Bia as data, not as an instruction
  const woke = after.inputs.map(input => (input.kind === 'text' ? input.text : '')).join('\n')
  expect(woke === '' || !woke.includes('Ignore')).toBe(true)
  expect(h.handoffs.pathOf('pp', bia.id).map(step => `${step.personaId}:${step.step}`)).toEqual(['bia:asked', 'teo:delivered'])
})

it('the limits fail closed with a sentence for the model: herself, a stranger, a circle, depth, the Task cap, the daily cap', async () => {
  const h = open()
  const bia = request(h)
  expect(ask(h, bia, 'bia', 'bia', 'a1')).toMatchObject({ ok: false, message: expect.stringMatching(/você mesma/u) })
  expect(ask(h, bia, 'bia', 'nobody', 'a2')).toMatchObject({ ok: false, message: expect.stringMatching(/não existe/u) })
  expect(ask(h, bia, 'bia', 'teo', 'a3', { note: {} })).toMatchObject({ ok: false, message: expect.stringMatching(/Escreva o bilhete/u) })
  expect(ask(h, bia, 'bia', 'teo', 'a4', { title: '' })).toMatchObject({ ok: false, message: expect.stringMatching(/título/u) })
  expect(ask(h, bia, 'bia', 'teo', 'a5', { note: { done: ['x'], files: ['../segredo.txt'] } })).toMatchObject({ ok: false, message: expect.stringMatching(/dentro do projeto/u) })
  // someone else cannot ask in Bia's Task: identity is the run's
  expect(ask(h, bia, 'lia', 'teo', 'a6')).toMatchObject({ ok: false })
  expect(tickets(h)).toHaveLength(1)

  // a chain Bia -> Teo -> Lia, then Lia may not go to a third level, and Teo may not ask Bia back
  expect(ask(h, bia, 'bia', 'teo', 'b1')).toMatchObject({ ok: true })
  const teo = ticketOf(h, 'Teo')!
  expect(ask(h, teo, 'teo', 'bia', 'b2')).toMatchObject({ ok: false, message: expect.stringMatching(/círculo/u) })
  expect(ask(h, teo, 'teo', 'lia', 'b3', { title: 'Revisar a arte' })).toMatchObject({ ok: true })
  const lia = ticketOf(h, 'Lia')!
  expect(ask(h, lia, 'lia', 'ivo', 'b4', { title: 'Medir' })).toMatchObject({ ok: false, message: expect.stringMatching(/2 níveis/u) })

  // 3 requests per Task, then the 4th is refused (Bia already made one)
  expect(ask(h, bia, 'bia', 'lia', 'c2', { title: 'Revisar o texto' })).toMatchObject({ ok: true })
  expect(ask(h, bia, 'bia', 'ivo', 'c3', { title: 'Dados do público' })).toMatchObject({ ok: true })
  expect(ask(h, bia, 'bia', 'ivo', 'c4', { title: 'Mais dados' })).toMatchObject({ ok: false, message: expect.stringMatching(/3 colegas/u) })
  await h.orchestration.flush('pp')
})

it('the same tool call twice opens ONE Task; the daily cap of the person\'s settings is honored', () => {
  const h = open()
  const bia = request(h)
  const first = ask(h, bia, 'bia', 'teo', 'same')
  const again = ask(h, bia, 'bia', 'teo', 'same')
  expect(first).toMatchObject({ ok: true })
  expect(again).toMatchObject({ ok: true, duplicate: true })
  expect(tickets(h).filter(ticket => ticket.execution?.name === 'Teo')).toHaveLength(1)
  expect(rows(h)).toHaveLength(1)

  h.teamwork.set('pp', { ...SCOPE, personaId: 'bia', askCapPerDay: 1 })
  expect(ask(h, bia, 'bia', 'lia', 'other', { title: 'Revisar' })).toMatchObject({ ok: false, message: expect.stringMatching(/1 pedidos a colegas hoje|1 pedido/u) })
  expect(h.teamwork.view('pp', 'bia')).toMatchObject({ askedToday: 1, askCapPerDay: 1 })
})

it('a persona the person switched off cannot ask; a paused colleague holds the request without losing it', () => {
  const h = open()
  const bia = request(h)
  h.teamwork.set('pp', { ...SCOPE, personaId: 'bia', canAskColleagues: false })
  expect(ask(h, bia)).toMatchObject({ ok: false, message: expect.stringMatching(/não pode pedir ajuda/u) })
  h.teamwork.set('pp', { ...SCOPE, personaId: 'bia', canAskColleagues: true })
  h.orchestration.setPersonaPaused('pp', 'teo', true)
  expect(ask(h, bia, 'bia', 'teo', 'held1')).toMatchObject({ ok: true, status: 'held' })
  expect(rows(h)[0]?.handoff?.status).toBe('held')
  expect(h.handoffs.waitingLine('pp', bia.id)).toBe('Esperando Teo: Arte dos 3 posts')
})

it('a colleague whose engine fails does not leave the asker waiting forever: the line says blocked and she is woken to go on without', async () => {
  const h = open()
  const bia = request(h)
  ask(h, bia)
  h.orchestration.runnerFactory = async (request) => {
    if (request?.personaName === 'Teo') throw new Error('falha sintética')
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    return createFakeRunner()
  }
  await h.orchestration.flush('pp')
  expect(rows(h).map(row => row.handoff?.status)).toContain('blocked')
  const after = h.orchestration.runtime('pp').repo.tickets.get(bia.id)!
  expect(after.assignments.length).toBeGreaterThanOrEqual(2)
  expect(h.handoffs.waitingLine('pp', bia.id)).toBeUndefined()
})

/** What each Task's run says, in the order the runs end. */
function script(h: PersonaHost, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
}

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 6; pass += 1) await h.orchestration.flush('pp')
}

it('TEAM-14: a delivery that turns to a colleague ("@Teo faça a arte…") passes the work on; she does not wait, and nobody loops', async () => {
  const h = open()
  // Bia delivers and asks Teo in her own words; Teo answers turning back to Bia (a circle: refused, silently)
  script(h, ['Texto dos 3 posts pronto.\n@Teo faça a arte dos 3 posts, formato quadrado.', 'Arte pronta.\n@Bia revise o texto agora.'])
  say(h, 'u1', '@Bia escreva os 3 posts da campanha')
  await settle(h)
  const teo = ticketOf(h, 'Teo')
  expect(teo).toBeDefined()
  expect(teo?.title).toBe('faça a arte dos 3 posts, formato quadrado.')
  expect(teo?.mandate.actor.id).toBe(ticketOf(h, 'Bia')?.mandate.actor.id)
  const lines = rows(h)
  expect(lines.map(row => row.handoff?.status)).toEqual(['asked', 'delivered']) // she passed it on; Teo delivered; nothing else
  expect(lines[0]?.handoff).toMatchObject({ mode: 'handoff', status: 'asked', fromPersonaId: 'bia', toPersonaId: 'teo' })
  expect(lines[0]?.body.split('\n')[0]).toMatch(/^Bia passou para Teo:/u)
  // the bilhete is Bia's delivery and the request, between delimiters, in HIS assignment only
  expect(teo?.execution?.assignment).toContain('Texto dos 3 posts pronto.')
  expect(thread(h).map(row => row.body).join('\n')).not.toContain('<bilhete>')
  // Bia passed it on and finished: she does not wait for Teo
  expect(latestAssignment(h.orchestration.runtime('pp').repo.tickets.get(ticketOf(h, 'Bia')!.id)!)?.report?.state).toBe('ready')
  // no loop: Teo's line back to Bia opened nothing
  expect(tickets(h).map(ticket => ticket.execution?.name).sort()).toEqual(['Bia', 'Teo'])
})

it('TEAM-14: only a line that STARTS with the colleague and asks for something is a request (a mention in prose is not)', async () => {
  const h = open()
  script(h, ['Falei com @Teo ontem sobre as cores.\nObrigada, @Teo faça a arte quando puder.\n@Teo ok'])
  say(h, 'u1', '@Bia escreva os 3 posts da campanha')
  await settle(h)
  expect(tickets(h).map(ticket => ticket.execution?.name)).toEqual(['Bia'])
  expect(rows(h)).toHaveLength(0)
})

it('TEAM-14: with the team switch off a persona\'s line wakes nobody', async () => {
  const h = open(false)
  script(h, ['Pronto.\n@Teo faça a arte dos 3 posts.'])
  say(h, 'u1', '@Bia escreva os 3 posts da campanha')
  await settle(h)
  expect(tickets(h).map(ticket => ticket.execution?.name)).toEqual(['Bia'])
})
