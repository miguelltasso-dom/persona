import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * Aceitação do item 1 (Gauge, 12/11): o DONO para a Bia (a 1ª parte da cadeia texto → arte → posts) no meio do turno dela.
 * Fatos medidos (00:50, `runTicketCommand({ command: 'stop' })` de dentro do turno): a Bia termina `ended.outcome = 'stopped'`, ninguém gasta turno, o laço termina —
 * mas Teo fica `waiting` "Esperando Bia: texto" e Caio `waiting` "Esperando Teo: arte" PARA SEMPRE, sem nenhuma linha ao dono. O caminho de `Parar` não chama `Orchestration.settled()`
 * (o conserto da falha, `holdSplitFailed`, não alcança a parada). O RED está em acceptance-item1-parada.red.ts (fora da suíte): quando consertar, renomeie para .host.spec.ts.
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]
const CAMPAIGN = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'

function rig(): PersonaHost {
  const before = process.env.PERSONA_PRODUCT_TOOLS
  process.env.PERSONA_PRODUCT_TOOLS = '1'
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
function script(h: PersonaHost, steps: ReadonlyArray<string | (() => string)>): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const next = queue.shift(); return typeof next === 'function' ? next() : next }, set: () => undefined })
}
async function settle(h: PersonaHost): Promise<void> { for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp') }
const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list().filter(item => !item.title.startsWith('Revisar:'))
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(item => item.execution?.name === name)
const order = (h: PersonaHost): string[] => h.orchestration.turnInputs.filter(row => row.purpose === 'task').map(row => row.personaId)
const fresh = (h: PersonaHost, name: string): Ticket => h.orchestration.runtime('pp').repo.tickets.get(ticketOf(h, name)!.id)!
const stateOf = (h: PersonaHost, name: string) => latestAssignment(fresh(h, name))?.report?.state

async function campaignWhereBiaIsStopped(): Promise<PersonaHost> {
  const h = rig()
  script(h, [() => { h.runTicketCommand({ ...SCOPE, ticketId: ticketOf(h, 'Bia')!.id, command: 'stop', reason: '' } as never); return 'Texto parcial da Bia...' }, 'Arte do Teo.', 'Posts do Caio.'])
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await settle(h)
  return h
}

it('o dono PARA a Bia: ela termina "stopped", o laço termina e a espera não gasta turno (Teo e Caio não fazem arte nem posts sem o texto)', async () => {
  const h = await campaignWhereBiaIsStopped()
  expect(fresh(h, 'Bia').ended).toMatchObject({ by: 'human', outcome: 'stopped' })
  expect(order(h)).toEqual(['bia'])
  expect(tickets(h).map(item => item.execution?.name).sort()).toEqual(['Bia', 'Caio', 'Teo'])
  // Hoje as duas seguem "waiting" sem custo; o RED muda isso para um estado honesto.
  expect(['waiting', 'blocked']).toContain(stateOf(h, 'Teo'))
  expect(['waiting', 'blocked']).toContain(stateOf(h, 'Caio'))
})
