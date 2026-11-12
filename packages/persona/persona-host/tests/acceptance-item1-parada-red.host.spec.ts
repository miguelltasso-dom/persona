// Item 1, caso "PARADA pelo dono" (Gauge → Forge, 12/11 00:52; GREEN pelo Forge, 12/11 01:00): vinha de acceptance-item1-parada.red.ts (o Gauge pode removê-lo).
// FICA DE FORA daqui (é do Zinc, item 2b): "parar de propósito não vira cartão de erro" — `runTicketCommand('stop')` chama `engine.stopTicket` direto, sem marcar `stopped` nem cancelar o turno
// vivo, e o turno que termina depois posta "Não consegui responder. engine_unavailable". O conserto é rotear a parada por `Orchestration.stopTicketRun` (ver o pedido ao Zinc).
import { latestAssignment, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * O dono clica em Parar na Bia (1ª parte). Hoje: Teo "Esperando Bia: texto" e Caio "Esperando Teo: arte" para sempre, sem aviso (o caminho de `Parar` não chama `Orchestration.settled()`;
 * `stopTicketRun` é do Zinc). Esperado (mesmo contrato do conserto da falha, `holdSplitFailed`): os dois viram `blocked` sem turno e o dono recebe UMA linha honesta, em palavras simples,
 * dizendo que a arte e os posts ficaram esperando o texto porque ele parou a Bia; e quando a Bia entregar numa nova rodada os dois rodam sozinhos, em ordem.
 * Observação: nesta medição o fio também mostrou "Não consegui responder. engine_unavailable" da Bia depois da parada: parar de PROPÓSITO não pode virar cartão de erro (pode ser artefato de parar de dentro do turno no harness: confira com um stop real).
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
const report = (h: PersonaHost, name: string) => latestAssignment(fresh(h, name))?.report
const thread = (h: PersonaHost): string[] => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(row => `${row.actorId}: ${String(row.body)}`)

it('RED: o dono para a Bia → Teo e Caio ficam "blocked" (não "Esperando" para sempre), o dono recebe UMA linha honesta e, numa nova rodada da Bia, os dois rodam sozinhos em ordem', async () => {
  const h = rig()
  script(h, [() => { h.runTicketCommand({ ...SCOPE, ticketId: ticketOf(h, 'Bia')!.id, command: 'stop', reason: '' } as never); return 'Texto parcial da Bia...' }, 'Arte do Teo.', 'Posts do Caio.'])
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await settle(h)
  expect(report(h, 'Teo')?.state).toBe('blocked')
  expect(String(report(h, 'Teo')?.summary)).toContain('Bia')
  expect(report(h, 'Caio')?.state).toBe('blocked')
  expect(order(h)).toEqual(['bia']) // ninguém gastou turno
  const honest = thread(h).filter(line => !line.startsWith('ana:') && !/^lia: Dividi/u.test(line) && /arte/iu.test(line) && /posts?/iu.test(line) && /texto/iu.test(line))
  expect(honest).toHaveLength(1)
  expect(honest[0]).not.toMatch(/blocked|waiting|ticket|split|handoff|stopped/iu)
})
