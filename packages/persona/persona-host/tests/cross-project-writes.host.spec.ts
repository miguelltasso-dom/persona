import { createHash } from 'node:crypto'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * M3 (cerca) do lado da ESCRITA (Gauge, 12/11; marco dogfood): a verificação de `cross-project-reads` não cobre quem ESCREVE com id alheio.
 * O membro Bob tem escrita em 'sa' e manda `projectId: 'sa'` com o id de um cartão do projeto PESSOAL do dono ('pp'): mover e os comandos de cartão.
 * Vermelho = o cartão de 'pp' mudou (achado real). Controle positivo: o dono move o cartão de 'pp' e o hash muda (senão "não mudou" não prova nada).
 */
const PP = SCOPE
const SA = { workspaceId: 'ws', projectId: 'sa' } as const
const TEAM = [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }]

function script(h: PersonaHost, steps: readonly string[]): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift() ?? 'Ok.', set: () => undefined })
}
async function settle(h: PersonaHost): Promise<void> { for (let pass = 0; pass < 10; pass += 1) { await h.orchestration.flush('pp'); await h.orchestration.flush('sa') } }

/** Fingerprint of a board (card ids, columns and titles; the order of the cards does not matter). */
function boardHash(h: PersonaHost, scope: { workspaceId: string; projectId: string }): string {
  const lines = h.getProjectBoard(scope).cards.map(card => `${card.ticketId}|${card.category}|${card.title}`).sort()
  return createHash('sha256').update(`${scope.projectId}\n${lines.join('\n')}`).digest('hex').slice(0, 16)
}

async function world(): Promise<{ h: PersonaHost; ticketPpId: string; doneColumnPp: string; otherColumnPp: string }> {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, TEAM)
  seedProject(h, { id: 'sa', name: 'Equipe', team: [{ id: 'lia2', name: 'Lia', title: 'Coordenação', coordination: true }] })
  h.sessionMemberId = 'ana'
  h.createMember({ id: 'bob', ...SA, displayName: 'Bob', handle: 'bob', role: 'member' })
  script(h, ['Anotado.', 'Pronto.', 'Feito.', 'Ok.'])
  say(h, 'tk1', '@Bia escreva o texto da home')
  await settle(h)
  const board = h.getProjectBoard(PP)
  const card = board.cards[0]
  if (card === undefined) throw new Error('o mundo não criou o cartão de pp')
  const done = board.workflow.columns.find(column => column.category === 'done')
  const other = board.workflow.columns.find(column => column.category !== card.category && column.category !== 'done')
  if (done === undefined || other === undefined) throw new Error('o fluxo de pp não tem colunas esperadas')
  return { h, ticketPpId: card.ticketId, doneColumnPp: done.id, otherColumnPp: other.id }
}

it('CONTROLE POSITIVO: o dono move o cartão de pp e o hash do quadro muda (o detector funciona)', async () => {
  const { h, ticketPpId, doneColumnPp } = await world()
  h.sessionMemberId = 'ana'
  const before = boardHash(h, PP)
  h.moveTicket({ ...PP, ticketId: ticketPpId, columnId: doneColumnPp })
  expect(boardHash(h, PP), 'o quadro de pp deveria ter mudado').not.toBe(before)
})

it('M3 cerca de ESCRITA: o membro de sa manda o id de um cartão de pp em moveTicket e em cada comando de cartão: o quadro de pp não muda', async () => {
  const { h, ticketPpId, doneColumnPp, otherColumnPp } = await world()
  const before = boardHash(h, PP)
  const outcomes: string[] = []
  h.sessionMemberId = 'bob'
  const attempts: Array<[string, () => unknown]> = [
    ['moveTicket para feito', () => h.moveTicket({ ...SA, ticketId: ticketPpId, columnId: doneColumnPp })],
    ['moveTicket para outra coluna', () => h.moveTicket({ ...SA, ticketId: ticketPpId, columnId: otherColumnPp })],
    ...(['stop', 'retry', 'reevaluate', 'dismiss', 'complete'] as const).map((command): [string, () => unknown] => [`runTicketCommand ${command}`, () => h.runTicketCommand({ ...SA, ticketId: ticketPpId, command, reason: 'ataque' })]),
  ]
  for (const [name, run] of attempts) {
    try { await run(); outcomes.push(`${name}: aceitou`) } catch (error) { outcomes.push(`${name}: recusou (${error instanceof Error ? error.message.slice(0, 60) : 'erro'})`) }
  }
  await settle(h)
  h.sessionMemberId = 'ana'
  expect(boardHash(h, PP), `o quadro de pp mudou por ação do membro de sa com id alheio:\n${outcomes.join('\n')}`).toBe(before)
  // o mesmo ataque com projectId 'pp' (a recusa óbvia): o membro não escreve no projeto pessoal do dono
  h.sessionMemberId = 'bob'
  expect(() => h.moveTicket({ ...PP, ticketId: ticketPpId, columnId: doneColumnPp })).toThrow()
})
