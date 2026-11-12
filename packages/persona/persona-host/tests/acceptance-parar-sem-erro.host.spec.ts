// RED (Gauge → Zinc, 12/11 01:03). Fora da suíte (extensão .red.ts não é coletada). Quando consertar: git mv para acceptance-parar-sem-erro.host.spec.ts.
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * PARAR DE PROPÓSITO NÃO É ERRO. O dono clica em Parar numa persona que está trabalhando. Hoje (medido 00:50 e confirmado pelo Forge 00:59): `runTicketCommand('stop')` chama
 * `engine.stopTicket` direto (não marca `stopped` do lado da execução nem cancela o turno vivo) e o turno que termina depois posta no fio "Não consegui responder." + o cartão de erro
 * `engine_unavailable`: o dono apertou Parar e lê que o motor "não está disponível". `stopTicketRun` (Zinc) faz certo, mas `index.ts` não o chama.
 * Esperado: depois de parar, o fio NÃO ganha cartão de erro nem "Não consegui responder", e a Tarefa termina `stopped` (por humano), uma vez.
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
]

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

it('RED: o dono para a Bia no meio do turno → sem "Não consegui responder", sem cartão de erro, e a Tarefa termina "stopped" por humano', async () => {
  const h = rig()
  const tickets = () => h.orchestration.runtime('pp').repo.tickets.list().filter(item => !item.title.startsWith('Revisar:'))
  Object.defineProperty(h.orchestration, 'liveText', {
    configurable: true,
    get: () => { h.runTicketCommand({ ...SCOPE, ticketId: tickets().find(item => item.execution?.name === 'Bia')!.id, command: 'stop', reason: '' } as never); return 'Texto parcial da Bia...' },
    set: () => undefined,
  })
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia escreva o texto da página inicial da padaria', actorId: 'ana', subjectId: 'u1' })
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
  const lines = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(row => `${row.actorId}: ${String(row.body)}`)
  expect(lines.filter(line => /engine_unavailable|run-error|Não consegui responder/u.test(line))).toEqual([])
  const bia = tickets().find(item => item.execution?.name === 'Bia')!
  expect(h.orchestration.runtime('pp').repo.tickets.get(bia.id)?.ended).toMatchObject({ by: 'human', outcome: 'stopped' })
})
