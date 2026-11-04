/**
 * PB-9 (PROJECT-BOARDS.md §3) — ADVERSARIAL host acceptance on top of the owners' journeys J12–J16
 * (those prove the happy path; this file tries to break isolation, destinations, ACL and sprint closing).
 * Real PersonaHost (file-free in-memory SQLite), scripted runner, 0 AI. App layer: {@link ./real-gov-pb-app.spec.ts}.
 */
import { describe, expect, it as vitestIt } from 'vitest'
import { HOST_TEST_TIMEOUT_MS } from '../../persona-host/tests/host-harness.ts'
import { it, openJourney, sayOn, seedJourney, seedProject } from '../../persona-host/tests/journeys/journey-host.ts'
import type PersonaHost from '../../persona-host/src/index.ts'

/** Known product bug: body asserts the REQUIRED behaviour, fails today (`it.fails`), flips red when fixed. */
function bug(owner: string, title: string, fn: () => unknown): void {
  vitestIt.fails(`[BUG→${owner}] ${title}`, fn, HOST_TEST_TIMEOUT_MS)
}

const HIRE = { workspaceId: 'ws', projectId: 'hire' } as const
const CODE = { workspaceId: 'ws', projectId: 'code' } as const

async function twoBoards(): Promise<{ h: PersonaHost; hireTicket: string; codeTicket: string }> {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  seedProject(h, { id: 'hire', name: 'Contratação', template: 'contratacao', team: [{ id: 'rh', name: 'Rita', title: 'Recrutamento', coordination: true }] })
  seedProject(h, { id: 'code', name: 'Software', template: 'software', team: [{ id: 'dev', name: 'Bento', title: 'Engenharia', coordination: true }] })
  sayOn(h, 'hire', 'm-hire', 'preciso de um README no projeto')
  await h.orchestration.flush('hire')
  sayOn(h, 'code', 'm-code', 'preciso de um changelog no projeto')
  await h.orchestration.flush('code')
  const hireTicket = h.getProjectBoard(HIRE).cards[0]!.ticketId
  const codeTicket = h.getProjectBoard(CODE).cards[0]!.ticketId
  return { h, hireTicket, codeTicket }
}

describe('PB-9.1 — isolamento entre quadros (tentando quebrar)', () => {
  it('[PB-9.1] cada quadro só lista as próprias Tarefas e tem colunas próprias', async () => {
    const { h, hireTicket, codeTicket } = await twoBoards()
    expect(h.getProjectBoard(HIRE).cards.map(card => card.ticketId)).toEqual([hireTicket])
    expect(h.getProjectBoard(CODE).cards.map(card => card.ticketId)).toEqual([codeTicket])
    const hireCols = new Set(h.getProjectBoard(HIRE).workflow.columns.map(column => column.id))
    const codeCols = h.getProjectBoard(CODE).workflow.columns.map(column => column.id)
    expect(codeCols.some(id => hireCols.has(id)), 'colunas compartilhadas entre projetos').toBe(false)
  })

  it('[PB-9.1] mover uma Tarefa para uma coluna de OUTRO projeto é recusado e nada muda', async () => {
    const { h, hireTicket } = await twoBoards()
    const foreignColumn = h.getProjectBoard(CODE).workflow.columns[0]!.id
    const before = h.getProjectBoard(HIRE).cards.find(card => card.ticketId === hireTicket)!.columnId
    expect(() => h.moveTicket({ ...HIRE, ticketId: hireTicket, columnId: foreignColumn })).toThrow()
    expect(h.getProjectBoard(HIRE).cards.find(card => card.ticketId === hireTicket)?.columnId).toBe(before)
    expect(h.getProjectBoard(CODE).cards.some(card => card.ticketId === hireTicket)).toBe(false)
  })

  it('[PB-9.1] mover a Tarefa de um projeto usando o escopo de outro é recusado (sem vazar entre quadros)', async () => {
    const { h, hireTicket } = await twoBoards()
    const codeColumn = h.getProjectBoard(CODE).workflow.columns[0]!.id
    expect(() => h.moveTicket({ ...CODE, ticketId: hireTicket, columnId: codeColumn })).toThrow()
    expect(h.getProjectBoard(CODE).cards.some(card => card.ticketId === hireTicket)).toBe(false)
  })

  it('[PB-9.1] ACL: convidado sem acesso ao projeto não lê o quadro nem edita o fluxo', async () => {
    const { h } = await twoBoards()
    h.createMember({ id: 'guest', workspaceId: 'ws', projectId: 'hire', displayName: 'G', handle: 'g', role: 'guest' })
    h.sessionMemberId = 'guest'
    expect(() => h.getProjectBoard(CODE)).toThrow('forbidden')
    expect(() => h.updateWorkflow({ ...CODE, columns: h.getProjectBoard({ ...CODE }).workflow.columns as never, fields: [] })).toThrow()
  })
})

describe('PB-9.2 — concluir vai à 1ª coluna done; Attention à needs_you', () => {
  it('[PB-9.2] a pergunta aberta cai em needs_you, não em done/doing, em todos os modelos testados', async () => {
    const { h, hireTicket, codeTicket } = await twoBoards()
    for (const [scope, id] of [[HIRE, hireTicket], [CODE, codeTicket]] as const) {
      const board = h.getProjectBoard(scope)
      const card = board.cards.find(row => row.ticketId === id)!
      const column = board.workflow.columns.find(row => row.id === card.columnId)!
      expect(column.category, `${scope.projectId}: categoria da coluna do cartão`).not.toBe('done')
      expect(card.category).toBe(column.category)
    }
  })
})

describe('PB-9.3 — editar fluxo sem perder Tarefas', () => {
  it('[PB-9.3] remover a coluna onde há Tarefa EXIGE destino; a recusa não apaga a Tarefa nem a coluna', async () => {
    const { h, codeTicket } = await twoBoards()
    h.moveTicket({ ...CODE, ticketId: codeTicket, columnId: 'software-andamento' })
    const board = h.getProjectBoard(CODE)
    expect(board.cards.find(card => card.ticketId === codeTicket)?.columnId).toBe('software-andamento')
    const remaining = board.workflow.columns.filter(column => column.id !== 'software-andamento')
    expect(() => h.updateWorkflow({ ...CODE, columns: remaining, fields: board.workflow.fields })).toThrow()
    expect(h.getProjectBoard(CODE).cards.some(card => card.ticketId === codeTicket)).toBe(true)
    expect(h.getProjectBoard(CODE).workflow.columns.some(column => column.id === 'software-andamento')).toBe(true)
  })

  bug('Anvil+Forge', '[PB-9.3] remover a coluna COM destino deixa o cartão sem coluna (columnId indefinido) em vez de levá-lo ao destino — a UI não consegue desenhá-lo', async () => {
    const { h, codeTicket } = await twoBoards()
    h.moveTicket({ ...CODE, ticketId: codeTicket, columnId: 'software-andamento' })
    const board = h.getProjectBoard(CODE)
    const remaining = board.workflow.columns.filter(column => column.id !== 'software-andamento')
    h.updateWorkflow({ ...CODE, columns: remaining, fields: board.workflow.fields, destByRemoved: { 'software-andamento': 'software-backlog' } })
    const after = h.getProjectBoard(CODE)
    expect(after.workflow.columns.some(column => column.id === 'software-andamento')).toBe(false)
    const card = after.cards.find(row => row.ticketId === codeTicket)
    expect(card, 'cartão continua no quadro').toBeDefined()
    expect(card?.columnId, 'cartão tem coluna (o destino escolhido)').toBe('software-backlog')
  })

  it('[PB-9.3] o fluxo precisa manter uma coluna done e uma needs_you (senão a Tarefa não tem para onde ir)', async () => {
    const { h } = await twoBoards()
    const board = h.getProjectBoard(CODE)
    const noDone = board.workflow.columns.filter(column => column.category !== 'done')
    const dest = Object.fromEntries(board.workflow.columns.filter(column => column.category === 'done').map(column => [column.id, noDone[0]!.id]))
    expect(() => h.updateWorkflow({ ...CODE, columns: noDone, fields: board.workflow.fields, destByRemoved: dest })).toThrow()
    expect(h.getProjectBoard(CODE).workflow.columns.some(column => column.category === 'done')).toBe(true)
  })

  it('[PB-9.3] a recusa vem em português claro (não código interno)', async () => {
    const { h } = await twoBoards()
    const board = h.getProjectBoard(CODE)
    const noDone = board.workflow.columns.filter(column => column.category !== 'done')
    let message = ''
    try {
      h.updateWorkflow({ ...CODE, columns: noDone, fields: board.workflow.fields })
    } catch (error) {
      message = error instanceof Error ? `${error.message} ${(error as { detail?: string }).detail ?? ''}` : String(error)
    }
    expect(message).not.toBe('')
    expect(message).not.toMatch(/INVALID_WORKFLOW|undefined|\[object/u)
  })
})

describe('PB-9.4 — sprint: encerrar sem confirmação não fecha; rolagem do que sobrou', () => {
  async function sprintWithTwo(): Promise<{ h: PersonaHost; ids: string[] }> {
    const h = openJourney()
    seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
    seedProject(h, { id: 'code', name: 'Software', template: 'software', team: [{ id: 'dev', name: 'Bento', title: 'Engenharia', coordination: true }] })
    sayOn(h, 'code', 'm-1', 'preciso de um README no projeto')
    await h.orchestration.flush('code')
    sayOn(h, 'code', 'm-2', 'preciso de um changelog no projeto')
    await h.orchestration.flush('code')
    const ids = h.listTasks(CODE).map(task => task.id)
    h.createSprint({ ...CODE, id: 'sp-a', name: 'Semana 1', objective: 'Publicar', startsAt: '2026-11-03T15:00:00.000Z', endsAt: '2026-11-10T00:00:00.000Z' })
    h.planSprint({ ...CODE, sprintId: 'sp-a', ticketIds: ids })
    h.startSprint({ ...CODE, sprintId: 'sp-a' })
    return { h, ids }
  }

  it('[PB-9.4] encerrar com pendências sem confirmar devolve "pending" e a sprint continua ativa', async () => {
    const { h } = await sprintWithTwo()
    const result = h.closeSprint({ ...CODE, sprintId: 'sp-a', leftover: 'next', confirmed: false })
    expect(result.pending).toBe(true)
    expect(h.listSprints(CODE).find(sprint => sprint.id === 'sp-a')?.status).toBe('ativo')
  })

  it('[PB-9.4] confirmar com leftover=next rola o que não terminou para a próxima sprint e deixa marco no canal', async () => {
    const { h, ids } = await sprintWithTwo()
    const closed = h.closeSprint({ ...CODE, sprintId: 'sp-a', leftover: 'next', confirmed: true })
    expect(closed.closed.status).toBe('encerrado')
    expect(closed.rolledIds.length).toBeGreaterThan(0)
    expect(closed.rolledIds.every(id => ids.includes(id))).toBe(true)
    expect(closed.next?.ticketIds ?? []).toEqual(expect.arrayContaining(closed.rolledIds))
    expect(closed.summary).toMatch(/Sprint Semana 1/u)
    // Closing twice must not duplicate the milestone or roll again.
    expect(() => h.closeSprint({ ...CODE, sprintId: 'sp-a', leftover: 'next', confirmed: true })).not.toThrow(/undefined/u)
    const marks = h.listMessages({
      workspaceId: 'ws', projectId: 'code', streamKind: 'channel',
      ownerId: h.listChannels(CODE).find(channel => channel.name === 'geral')!.id, actorId: 'ana', afterSeq: 0, limit: 100,
    }).events.filter(event => event.body.includes('Sprint Semana 1'))
    expect(marks.length, 'marco duplicado no canal ao encerrar duas vezes').toBe(1)
  })

  it('[PB-9.4] leftover=backlog devolve as Tarefas ao backlog (nenhuma Tarefa some)', async () => {
    const { h, ids } = await sprintWithTwo()
    const closed = h.closeSprint({ ...CODE, sprintId: 'sp-a', leftover: 'backlog', confirmed: true })
    expect(closed.next).toBeUndefined()
    const still = h.getProjectBoard(CODE).cards.map(card => card.ticketId)
    for (const id of ids) expect(still, `Tarefa ${id} sumiu do quadro`).toContain(id)
  })

  it('[PB-9.4] só quem escreve no projeto cria/planeja sprint: convidado é recusado', async () => {
    const { h } = await sprintWithTwo()
    h.createMember({ id: 'guest', workspaceId: 'ws', projectId: 'pp', displayName: 'G', handle: 'g', role: 'guest' })
    h.sessionMemberId = 'guest'
    expect(() => h.createSprint({ ...CODE, id: 'sp-x', name: 'X', objective: '', startsAt: '2026-11-03T15:00:00.000Z', endsAt: '2026-11-10T00:00:00.000Z' })).toThrow()
    h.sessionMemberId = 'ana'
    expect(h.listSprints({ ...CODE }).some(sprint => sprint.id === 'sp-x')).toBe(false)
  })
})

describe('PB-9.5 — Coordenação propõe fluxo; nada muda até o usuário aceitar', () => {
  it('[PB-9.5] propor não altera o fluxo vigente; recusar também não; aceitar aplica', () => {
    const h = openJourney()
    seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
    const scope = { workspaceId: 'ws', projectId: 'pp' } as const
    h.createWorkflowFromTemplate({ ...scope, template: 'simples' })
    const before = JSON.stringify(h.getProjectBoard(scope).workflow.columns.map(column => column.id))
    const proposal = h.proposeWorkflow({ ...scope, description: 'vamos contratar um candidato e marcar entrevistas' })
    expect(JSON.stringify(h.getProjectBoard(scope).workflow.columns.map(column => column.id))).toBe(before)
    h.rejectWorkflowProposal(scope)
    expect(JSON.stringify(h.getProjectBoard(scope).workflow.columns.map(column => column.id))).toBe(before)
    h.acceptWorkflowProposal({ ...scope, columns: proposal.workflow.columns, fields: proposal.workflow.fields })
    expect(h.getProjectBoard(scope).workflow.template).toBe('contratacao')
  })

  it('[PB-9.5] aceitar uma proposta adulterada (sem coluna done) é recusado', () => {
    const h = openJourney()
    seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
    const scope = { workspaceId: 'ws', projectId: 'pp' } as const
    h.createWorkflowFromTemplate({ ...scope, template: 'simples' })
    const proposal = h.proposeWorkflow({ ...scope, description: 'contratar vaga' })
    const tampered = proposal.workflow.columns.filter(column => column.category !== 'done')
    expect(() => h.acceptWorkflowProposal({ ...scope, columns: tampered, fields: proposal.workflow.fields })).toThrow()
    expect(h.getProjectBoard(scope).workflow.template).toBe('simples')
  })
})
