import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * Aceitação do item 1 (Gauge, 11/11): o que o dono vê da cadeia texto → arte → posts quando a parte da FRENTE não entrega.
 * A cadeia (D-100) solta a próxima parte só quando a anterior termina `ready` (`Orchestration.settled`).
 *
 * Fatos medidos na árvore (23:32): se a Bia falha, a Bia fica `blocked`, o Teo fica `waiting` "Esperando Bia: texto" e o Caio `waiting` "Esperando Teo: arte", PARA SEMPRE,
 * sem custo (nenhum turno deles), mas SEM NENHUMA linha ao dono dizendo que arte e posts não vão sair: no fio só aparece o cartão de erro da Bia.
 * O 1º teste fixa o que já vale (não gasta turno, não trava o laço). O RED do conserto está em acceptance-item1-falhas.red.ts (fora da suíte; renomeie para .host.spec.ts quando consertar).
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]
const CAMPAIGN = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'
const TEO_ART = 'Arte do Teo: cartaz verde-sálvia com a frase da Bia.'
const CAIO_POSTS = 'Posts do Caio: 3 posts curtos a partir da arte.'

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
const order = (h: PersonaHost): string[] => h.orchestration.turnInputs.filter(row => row.purpose === 'task').map(row => row.personaId)
const report = (h: PersonaHost, name: string) => latestAssignment(h.orchestration.runtime('pp').repo.tickets.get(ticketOf(h, name)!.id)!)?.report

async function campaignWhereBiaFails(): Promise<PersonaHost> {
  const h = rig()
  script(h, [() => { throw new Error('motor caiu') }, TEO_ART, CAIO_POSTS]) // o 1º turno (da Bia) cai; se Teo/Caio rodassem, usariam os outros dois textos
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await settle(h)
  return h
}

it('a Bia falha: o laço termina e a espera NÃO gasta turno (só a Bia rodou; Teo e Caio não fizeram arte nem posts sem o texto)', async () => {
  const h = await campaignWhereBiaFails()
  expect(order(h)).toEqual(['bia'])
  expect(tickets(h).map(item => item.execution?.name).sort()).toEqual(['Bia', 'Caio', 'Teo'])
  expect(report(h, 'Bia')?.state).toBe('blocked')
  // Hoje as duas seguem "waiting" sem custo. O RED abaixo muda isso para uma linha honesta ao dono.
  expect(['waiting', 'blocked']).toContain(report(h, 'Teo')?.state)
  expect(['waiting', 'blocked']).toContain(report(h, 'Caio')?.state)
})
