import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { HarnessCall } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { trackedParagraph, trackedStateOf, waitsForColleague, type TrackedRequest } from '../src/handoff-track.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * Item 1 (colheita): a request a persona made to a colleague is TRACKED. It does not expire while the colleague works, it comes back by itself ONCE (the asker is woken with the
 * delivery), the asker reads what is still out in her later turns (so she does not ask again nor do it in the colleague's place), and the end of her turn while a help is out is
 * "esperando colega" (`handoffPending`, the pure read the turn closer uses), never "Pronto". A pass-on is tracked too but never holds her.
 */

describe('the pure rules', () => {
  it('state words: the host\'s record status in the words a persona can act on', () => {
    expect(trackedStateOf('asked')).toBe('working')
    expect(trackedStateOf('held')).toBe('paused')
    expect(trackedStateOf('delivered')).toBe('delivered')
    expect(trackedStateOf('resumed')).toBe('delivered')
    expect(trackedStateOf('blocked')).toBe('failed')
    expect(trackedStateOf('blocked', true)).toBe('working') // waiting for the person to let a connector through: nothing was lost, it just did not start
  })

  const row = (over: Partial<TrackedRequest>): TrackedRequest => ({ requestId: 'r1', mode: 'help', toName: 'Teo', title: 'Arte dos 3 posts', state: 'working', ...over })

  it('only a help that is not back yet holds the persona; a pass-on and a delivered help never do', () => {
    expect(waitsForColleague([])).toBe(false)
    expect(waitsForColleague([row({})])).toBe(true)
    expect(waitsForColleague([row({ state: 'paused' })])).toBe(true)
    expect(waitsForColleague([row({ state: 'delivered' })])).toBe(false)
    expect(waitsForColleague([row({ state: 'failed' })])).toBe(false)
    expect(waitsForColleague([row({ mode: 'handoff' })])).toBe(false)
  })

  it('the paragraph: nothing handed = nothing said; each request on a line, plain words, the newest six, long titles cut', () => {
    expect(trackedParagraph([])).toBeUndefined()
    const text = trackedParagraph([row({}), row({ requestId: 'r2', toName: 'Duda', title: 'Avisar clientes', state: 'delivered' })])!
    expect(text).toContain('o app acompanha e traz o resultado de volta sozinho, uma vez')
    expect(text).toContain('- Teo — Arte dos 3 posts: ainda está fazendo.')
    expect(text).toContain('- Duda — Avisar clientes: já entregou e o resultado chegou a você.')
    const many = trackedParagraph(Array.from({ length: 9 }, (_, at) => row({ requestId: `r${String(at)}`, toName: `P${String(at)}`, title: 'x'.repeat(200) })))!
    expect(many).toContain('(e mais 3 pedidos antigos)')
    expect(many.split('\n').filter(line => line.startsWith('- '))).toHaveLength(6)
    expect(many).not.toContain('x'.repeat(100))
    // the words a person would not say never reach the model's paragraph
    expect(text).not.toMatch(/asked|resumed|handoff|ticket|status/iu)
  })
})

const TEAM = [
  { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Arte' },
  { id: 'duda', name: 'Duda', title: 'Atendimento' },
]

function rig(): PersonaHost {
  const before = process.env.PERSONA_PRODUCT_TOOLS
  process.env.PERSONA_PRODUCT_TOOLS = '1' // the paragraph about the team travels only with the product tools on
  onTestFinished(() => { if (before === undefined) delete process.env.PERSONA_PRODUCT_TOOLS; else process.env.PERSONA_PRODUCT_TOOLS = before })
  const h = openJourney('2026-11-11T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  for (const row of TEAM) {
    const persona = h.product.getPersona(row.id)!
    h.product.updatePersona({ ...persona, runner: { kind: 'cli', cli: 'claude', model: 'haiku' }, tools: {} }, 'pp')
  }
  return h
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(ticket => ticket.execution?.name === name)
const state = (h: PersonaHost, name: string) => latestAssignment(h.orchestration.runtime('pp').repo.tickets.get(ticketOf(h, name)!.id)!)?.report?.state
const turnsOf = (h: PersonaHost, personaId: string) => h.orchestration.turnInputs.filter(row => row.personaId === personaId && row.purpose === 'task')
const lines = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

function script(h: PersonaHost, steps: ReadonlyArray<string | (() => string)>): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', {
    configurable: true,
    get: () => { const next = queue.shift(); return typeof next === 'function' ? next() : next },
    set: () => undefined,
  })
}

const call = (h: PersonaHost, tool: HarnessCall['tool'], ticket: Ticket, personaId: string, args: Record<string, unknown>, callId = `${ticket.id}:l:1`): Record<string, unknown> =>
  JSON.parse(h.teamTools.call({ tool, run: { personaId, ticketId: ticket.id, assignmentId: ticket.assignments[0]?.id ?? 'a1' }, args, callId })) as Record<string, unknown>

const ASK = { colleague: 'Teo', title: 'Arte dos 3 posts', done: ['Texto dos 3 posts pronto.'], needed: ['Uma arte para cada post'] }

describe('tracked requests in the host', () => {
  it('a help is tracked from the call: pending while the colleague works (even days later), told to the asker, and the end of her turn is not "Pronto"', async () => {
    const h = rig()
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    const bia = ticketOf(h, 'Bia')!
    expect(h.handoffs.trackedOf('pp', bia.id)).toEqual([]) // nothing handed yet: nothing said
    expect(h.teamTools.guidanceFor('pp', h.product.getPersona('bia')!, bia.id)).not.toContain('Trabalho que você repassou')
    expect(call(h, 'ask_colleague', bia, 'bia', ASK)).toMatchObject({ ok: true, status: 'asked' })
    expect(h.handoffs.trackedOf('pp', bia.id)).toMatchObject([{ mode: 'help', toName: 'Teo', title: 'Arte dos 3 posts', state: 'working' }])
    expect(h.orchestration.handoffPending?.('pp', bia.id)).toBe(true)
    // It does not expire while the colleague works: three days later the request is still there, still hers, still pending.
    h.orchestration.now = () => '2026-11-14T12:00:00.000Z'
    expect(h.handoffs.trackedOf('pp', bia.id)).toMatchObject([{ toName: 'Teo', state: 'working' }])
    expect(h.orchestration.handoffPending?.('pp', bia.id)).toBe(true)
    // What she reads in her next turn: the one still out, in plain words.
    const guidance = h.teamTools.guidanceFor('pp', h.product.getPersona('bia')!, bia.id)!
    expect(guidance).toContain('- Teo — Arte dos 3 posts: ainda está fazendo.')
    await settle(h)
  })

  it('it comes back by itself, ONCE: the colleague delivers, the asker is woken with the delivery and reads that it arrived; a repeat of the delivery wakes nobody', async () => {
    const h = rig()
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    const bia = ticketOf(h, 'Bia')!
    call(h, 'ask_colleague', bia, 'bia', ASK)
    script(h, ['Texto pronto; espero a arte do Teo.', 'Arte pronta: cartaz verde com os 3 posts.', 'Texto e arte prontos.'])
    await settle(h)
    expect(turnsOf(h, 'bia')).toHaveLength(2) // her turn, and ONE return with the delivery
    const back = turnsOf(h, 'bia')[1]!.prompt
    expect(back).toContain('Teo entregou o que você pediu')
    expect(back).toContain('Arte pronta: cartaz verde com os 3 posts.')
    expect(back).toContain('- Teo — Arte dos 3 posts: já entregou e o resultado chegou a você.') // the tracked paragraph says it arrived
    expect(h.handoffs.trackedOf('pp', bia.id)).toMatchObject([{ toName: 'Teo', state: 'delivered' }])
    expect(h.orchestration.handoffPending?.('pp', bia.id)).toBe(false)
    expect(state(h, 'Bia')).toBe('ready')
    // The same delivery arriving again (a restart, a double event) wakes no one and writes no second line.
    const resumedLines = lines(h).filter(row => row.id.endsWith(':resumed')).length
    h.handoffs.settled({ projectId: 'pp', ticketId: ticketOf(h, 'Teo')!.id, state: 'ready' })
    await settle(h)
    expect(turnsOf(h, 'bia')).toHaveLength(2)
    expect(lines(h).filter(row => row.id.endsWith(':resumed'))).toHaveLength(resumedLines)
  })

  it('a pass-on is tracked but never holds the persona: she is not "esperando colega"', async () => {
    const h = rig()
    say(h, 'u1', '@Bia escreva os 3 posts e depois a Duda avisa os clientes')
    const bia = ticketOf(h, 'Bia')!
    expect(call(h, 'pass_forward', bia, 'bia', { ...ASK, colleague: 'Duda', title: 'Avisar clientes' })).toMatchObject({ ok: true, colleague: 'Duda' })
    expect(h.handoffs.trackedOf('pp', bia.id)).toMatchObject([{ mode: 'handoff', toName: 'Duda', state: 'working' }])
    expect(h.orchestration.handoffPending?.('pp', bia.id)).toBe(false)
    await settle(h)
  })

  it('a colleague who is paused: the request waits in the queue, the asker is told so (not lost), and it is still pending', async () => {
    const h = rig()
    h.orchestration.setPersonaPaused('pp', 'teo', true)
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    const bia = ticketOf(h, 'Bia')!
    expect(call(h, 'ask_colleague', bia, 'bia', ASK)).toMatchObject({ ok: true, status: 'held' })
    expect(h.handoffs.trackedOf('pp', bia.id)).toMatchObject([{ toName: 'Teo', state: 'paused' }])
    expect(h.orchestration.handoffPending?.('pp', bia.id)).toBe(true)
    expect(h.teamTools.guidanceFor('pp', h.product.getPersona('bia')!, bia.id)).toContain('está em pausa; o pedido volta quando a pessoa retomar')
    await settle(h)
  })

  it('the team switch off: nothing is tracked or told', async () => {
    const h = rig()
    say(h, 'u1', '@Bia escreva os 3 posts da campanha')
    const bia = ticketOf(h, 'Bia')!
    call(h, 'ask_colleague', bia, 'bia', ASK)
    h.teamworkEnabled = false
    expect(h.handoffs.trackedOf('pp', bia.id)).toEqual([])
    expect(h.orchestration.handoffPending?.('pp', bia.id)).toBe(false)
  })
})
