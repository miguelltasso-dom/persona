/**
 * P1-07 (Carbon, colheita-s1), item 1 under the person's hand:
 *  - the chain (texto → arte → posts) was released from "Esperando…" only on `runTicketCommand('stop')`: the composer's Parar (`stopTurn`), "Parar por aqui" and Descartar all stop a Task through
 *    `stopTicketRun` and left Teo and Caio waiting for ever;
 *  - stopping the Task of a colleague asked with `ask_colleague` left the request `asked` for ever: whoever asked stayed in "esperando colega";
 *  - a SHORT turn after a review ("Ajustei o telefone.") overwrote the text the consumer was to read, so the art was made from a sentence, not from the text.
 * No real CLI, no model.
 */
import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { HarnessCall } from '@deepseek-ai/dsh-persona-runners'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]
const CAMPAIGN = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'

function rig(review: 'on' | 'off' = 'off'): PersonaHost {
  const before = process.env.PERSONA_PRODUCT_TOOLS
  process.env.PERSONA_PRODUCT_TOOLS = '1'
  onTestFinished(() => { if (before === undefined) delete process.env.PERSONA_PRODUCT_TOOLS; else process.env.PERSONA_PRODUCT_TOOLS = before })
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  if (review === 'off') h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  for (const row of TEAM) {
    const persona = h.product.getPersona(row.id)!
    h.product.updatePersona({ ...persona, runner: { kind: 'cli', cli: 'claude', model: 'haiku' }, tools: {} }, 'pp')
  }
  return h
}

function script(h: PersonaHost, steps: ReadonlyArray<string | (() => string | Promise<string>)>): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', {
    configurable: true,
    get: () => { const next = queue.shift(); return typeof next === 'function' ? next() : next },
    set: () => undefined,
  })
}

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list().filter(item => !item.title.startsWith('Revisar:'))
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(item => item.execution?.name === name)
const fresh = (h: PersonaHost, name: string): Ticket => h.orchestration.runtime('pp').repo.tickets.get(ticketOf(h, name)!.id)!
const report = (h: PersonaHost, name: string) => latestAssignment(fresh(h, name))?.report
const order = (h: PersonaHost): string[] => h.orchestration.turnInputs.filter(row => row.purpose === 'task').map(row => row.personaId)
const thread = (h: PersonaHost): string[] => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(row => `${row.actorId}: ${String(row.body)}`)
const honestLines = (h: PersonaHost): string[] => thread(h).filter(line => !line.startsWith('ana:') && !/Dividi/u.test(line) && /arte/iu.test(line) && /posts?/iu.test(line) && /texto/iu.test(line))

/** Bia's turn is where the owner presses the button; the chain's other parts have not started. */
async function stopBiaWith(press: (h: PersonaHost) => Promise<unknown>): Promise<PersonaHost> {
  const h = rig()
  script(h, [async () => { await press(h); return 'Texto parcial da Bia...' }, 'Arte do Teo.', 'Posts do Caio.'])
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await settle(h)
  return h
}

function chainStopped(h: PersonaHost): void {
  expect(report(h, 'Teo')?.state).toBe('blocked')
  expect(String(report(h, 'Teo')?.summary)).toContain('Bia')
  expect(report(h, 'Caio')?.state).toBe('blocked')
  expect(order(h)).toEqual(['bia']) // nobody spent a turn
  const honest = honestLines(h)
  expect(honest).toHaveLength(1)
  expect(honest[0]).not.toMatch(/blocked|waiting|ticket|split|handoff|stopped/iu)
}

it('the composer\'s Parar (stopTurn) on the first part releases the chain: the dependents are blocked and the owner reads ONE honest line', async () => {
  const h = await stopBiaWith(async host => host.stopTurn({ ...SCOPE, personaId: 'bia', ticketId: ticketOf(host, 'Bia')!.id }))
  chainStopped(h)
})

it('every other road to a stop (the card "Parar por aqui", Descartar) goes through stopTicketRun: it releases the chain too', async () => {
  const h = await stopBiaWith(async host => host.orchestration.stopTicketRun('pp', ticketOf(host, 'Bia')!.id, 'Parado por você'))
  chainStopped(h)
})

it('stopping the Task of a colleague asked with ask_colleague tells whoever asked (not left "esperando colega" for ever): the request is closed as not done and she is woken', async () => {
  const h = rig()
  script(h, ['Começo o texto, mas preciso da arte antes.', 'Arte do Teo (parcial).', 'Sigo sem a ajuda do Teo.'])
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia escreva o texto da campanha', actorId: 'ana', subjectId: 'u1' })
  const bia = ticketOf(h, 'Bia')!
  const asked = JSON.parse(h.teamTools.call({
    tool: 'ask_colleague' as HarnessCall['tool'], run: { personaId: 'bia', ticketId: bia.id, assignmentId: bia.assignments[0]?.id ?? 'a1' },
    args: { colleague: 'Teo', title: 'A arte do cartaz', done: ['Texto pronto'], needed: ['Uma arte'] }, callId: `${bia.id}:l:1`,
  })) as { ok: boolean }
  expect(asked.ok).toBe(true)
  const teo = ticketOf(h, 'Teo')!
  expect(h.orchestration.handoffPending?.('pp', bia.id)).toBe(true)
  // the person stops Teo's help Task before it delivers
  await h.orchestration.stopTicketRun('pp', teo.id, 'Parado por você')
  await settle(h)
  expect(h.orchestration.handoffPending?.('pp', bia.id)).toBe(false) // RED today: the request stays `asked` for ever
  expect(h.handoffs.trackedOf('pp', bia.id)).toMatchObject([{ toName: 'Teo', state: 'failed' }])
})

it('a short turn after a review ("Ajustei o telefone.") does not erase the text the next part is to read: it still gets the whole text, plus what she said after', async () => {
  const h = rig('on')
  const LONG = `Texto da campanha: ${'Pão quentinho toda manhã na Padaria Lua, com receitas da vovó e entrega rápida no bairro. '.repeat(8)}Telefone: 1111-1111.`
  script(h, [LONG, 'AJUSTES\n- o telefone está errado', 'Ajustei o telefone.', 'APROVADO\nAgora sim.', 'Arte do Teo.', 'APROVADO\nTudo certo.', 'Posts do Caio.', 'APROVADO\nTudo certo.'])
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await settle(h)
  const teoPrompt = h.orchestration.turnInputs.find(row => row.personaId === 'teo' && row.purpose === 'task')?.prompt ?? ''
  expect(teoPrompt).toContain('Pão quentinho toda manhã na Padaria Lua') // RED today: only "Ajustei o telefone." reached the art
  expect(teoPrompt).toContain('Ajustei o telefone.')
})
