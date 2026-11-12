// Item 1 (Gauge → Forge, 11/11 23:45; GREEN pelo Forge, 12/11): a cadeia quando a produtora falha. Veio de acceptance-item1-falhas.red.ts (o Gauge pode remover o .red.ts).
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
 * Este arquivo é só o RED do Forge. O que já vale (a espera não gasta turno, o laço termina) está em acceptance-item1-falhas.host.spec.ts, verde.
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]
const CAMPAIGN = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'
const BIA_TEXT = 'Texto da Bia: “Pão quentinho toda manhã na Padaria Lua.”'
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
const thread = (h: PersonaHost): string[] => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(row => `${row.actorId}: ${String(row.body)}`)

async function campaignWhereBiaFails(): Promise<PersonaHost> {
  const h = rig()
  script(h, [() => { throw new Error('motor caiu') }, TEO_ART, CAIO_POSTS]) // o 1º turno (da Bia) cai; se Teo/Caio rodassem, usariam os outros dois textos
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await settle(h)
  return h
}

// RED (Forge, 23:29: "produtora failed/blocked/stopped => consumidora vira 'blocked' com linha honesta e reabre sozinha quando a produtora entregar numa nova rodada").
it('RED: a Bia falha → Teo e Caio ficam "blocked" dizendo quem faltou, o dono recebe UMA linha honesta, e quando a Bia entrega numa nova rodada os dois rodam sozinhos, em ordem', async () => {
  const h = await campaignWhereBiaFails()
  // 1. Os dois dependentes não ficam "Esperando" para sempre: viram blocked, com o nome de quem faltou.
  expect(report(h, 'Teo')?.state).toBe('blocked')
  expect(String(report(h, 'Teo')?.summary)).toContain('Bia')
  expect(report(h, 'Caio')?.state).toBe('blocked')
  expect(String(report(h, 'Caio')?.summary)).toMatch(/Teo|Bia/u)
  // 2. O dono é avisado UMA vez, em palavras simples (sem jargão), de que arte e posts não saem sem o texto.
  const honest = thread(h).filter(line => /arte/iu.test(line) && /posts?/iu.test(line) && /texto/iu.test(line) && !line.startsWith('ana:') && !line.includes('Dividi')) // a frase "Dividi o pedido por função: …" do começo também cita as 3 partes: não é a linha de falha
  expect(honest).toHaveLength(1)
  expect(honest[0]).not.toMatch(/blocked|waiting|ticket|split|handoff/iu)
  // 3. Ninguém gastou turno enquanto isso.
  expect(order(h)).toEqual(['bia'])
  // 4. Nova rodada: a Bia entrega → Teo e Caio reabrem sozinhos, uma vez cada, na ordem, cada um lendo a entrega inteira de quem veio antes.
  script(h, [BIA_TEXT, TEO_ART, CAIO_POSTS])
  // A pessoa clica "Tentar de novo" na tarefa da Bia (`runTicketCommand` retry) e o ciclo da equipe a roda (`driveTicket`, como o `pull` do scheduler).
  // (`wakeTicket` é do pedido a um colega: só acorda uma tarefa que ESPERA, nunca uma que falhou.)
  expect(await h.runTicketCommand({ ...SCOPE, ticketId: ticketOf(h, 'Bia')!.id, command: 'retry', reason: '' })).toBe(true) // (async desde que o Parar foi roteado por stopTicketRun)
  void h.orchestration.driveTicket('pp', ticketOf(h, 'Bia')!.id)
  await settle(h)
  expect(order(h)).toEqual(['bia', 'bia', 'teo', 'caio'])
  expect(h.orchestration.turnInputs.filter(row => row.personaId === 'teo' && row.purpose === 'task')[0]?.prompt).toContain(BIA_TEXT)
  expect(h.orchestration.turnInputs.filter(row => row.personaId === 'caio' && row.purpose === 'task')[0]?.prompt).toContain(TEO_ART)
  for (const name of ['Bia', 'Teo', 'Caio']) expect(report(h, name)?.state, name).toBe('ready')
})
