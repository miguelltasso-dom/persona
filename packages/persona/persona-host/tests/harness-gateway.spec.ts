import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { createMcpGateway, type McpGateway, type PersonaToolHooks } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { harnessMcpPorts, type AnyActivity } from '../src/harness-dispatch.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * HT-0, proof in process (no CLI): the product tools of a persona go gateway → host dispatch → port → board / sprints / routines,
 * with the identity of the RUN, the ACL by who started the Ticket and the persona's autonomy, and the activity of every change.
 * The CLI transport (Rivet) is a separate proof; this one shows the host side does what the tool says.
 */

const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }

function ticket(id: string, trigger: string, owner = 'Nina'): Ticket {
  const at = '2026-11-03T14:00:00.000Z'
  return {
    id, title: `Tarefa ${id}`, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: trigger, triggerIds: [trigger] },
    execution: { name: owner, directory: '.', assignment: `Tarefa ${id}` },
  }
}

interface Rig { h: PersonaHost; gw: McpGateway; activity: AnyActivity[]; columns: Record<string, string> }

function rig(): Rig {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  h.orchestration.events.append({ id: 'm-person', ...SCOPE, streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'pedido', actorId: 'ana', subjectId: '', occurredAt: '2026-11-03T13:00:00.000Z' })
  const rt = h.orchestration.runtime('pp')
  rt.repo.tickets.save(ticket('t-person', 'm-person', 'Nina')) // started by Ana's message
  rt.repo.tickets.save(ticket('t-system', 'initiative:run-9', 'Nina')) // started by the scheduler
  rt.repo.tickets.save(ticket('t-bento', 'initiative:run-8', 'Bento'))
  h.store.db.exec('DELETE FROM routine_run')
  h.store.db.exec('DELETE FROM routine')
  const activity: AnyActivity[] = []
  const gw = createMcpGateway({ hooks, harness: harnessMcpPorts(h.harness, { onActivity: (_who, row) => { activity.push(row) } }), onlyWired: true })
  const columns = Object.fromEntries(h.getProjectBoard(SCOPE).workflow.columns.map(column => [column.category, column.id]))
  return { h, gw, activity, columns }
}

/** One turn of a persona on a Ticket; returns a caller that parses the model-facing JSON answer. */
function turn(gw: McpGateway, personaId: string, ticketId: string, toolLevel: 'read' | 'write' = 'write') {
  const lease = gw.openTurn({ run: { personaId, ticketId, assignmentId: `a-${ticketId}` }, toolLevel, worktree: 'C:/tmp' })
  return {
    lease,
    names: gw.list(lease.token),
    call: async (name: string, args: Record<string, unknown> = {}) => JSON.parse((await gw.call(lease.token, name, args)).content) as Record<string, unknown> & { ok: boolean; code?: string },
  }
}
const setMode = (h: PersonaHost, personaId: string, mode: 'asked' | 'propose' | 'act'): void => {
  h.setAutonomy({ ...SCOPE, personaId, mode, proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
}
const columnOf = (h: PersonaHost, ticketId: string): string | undefined => h.getProjectBoard(SCOPE).cards.find(item => item.ticketId === ticketId)?.columnId

it('the model sees the board, sprint and routine tools on write, only the three reads on read', () => {
  const { gw } = rig()
  const write = turn(gw, 'nina', 't-person').names.filter(name => /^(board|sprint|routine)_/u.test(name))
  expect(write).toEqual(['board_list', 'board_card_move', 'sprint_list', 'sprint_create', 'sprint_plan', 'sprint_start', 'sprint_close', 'routine_list', 'routine_create', 'routine_update', 'routine_pause'])
  expect(turn(gw, 'nina', 't-person', 'read').names.filter(name => /^(board|sprint|routine)_/u.test(name))).toEqual(['board_list', 'sprint_list', 'routine_list'])
})

it('the person asked: the tool moves the card on the real board and the activity says how to undo it', async () => {
  const { h, gw, activity, columns } = rig()
  const t = turn(gw, 'nina', 't-person')
  const board = await t.call('board_list')
  expect(board.ok).toBe(true)
  expect((board.cards as Array<{ ticketId: string }>).map(card => card.ticketId).sort()).toEqual(['t-bento', 't-person', 't-system'])
  const before = columnOf(h, 't-bento')
  const moved = await t.call('board_card_move', { ticketId: 't-bento', columnId: columns.doing })
  expect(moved).toMatchObject({ ok: true, undoable: true, moved: { ticketId: 't-bento', title: 'Tarefa t-bento' } })
  expect(columnOf(h, 't-bento')).toBe(columns.doing)
  expect(activity).toHaveLength(1)
  expect(activity[0]).toMatchObject({ verb: 'board_card_move', initiator: 'person-request', requestId: 'm-person', undo: { remote: 'moveTicket', request: { ticketId: 't-bento', columnId: before } } })
  h.moveTicket({ ...SCOPE, ticketId: 't-bento', columnId: before! }) // the undo the UI runs
  expect(columnOf(h, 't-bento')).toBe(before)
})

it('her own initiative follows her autonomy: asked refuses with a typed answer and nothing moves; act moves only HER card', async () => {
  const { h, gw, columns } = rig()
  setMode(h, 'nina', 'asked')
  const asked = turn(gw, 'nina', 't-system')
  const before = columnOf(h, 't-system')
  expect(await asked.call('board_card_move', { ticketId: 't-system', columnId: columns.doing })).toMatchObject({ ok: false, code: 'forbidden' })
  expect(columnOf(h, 't-system')).toBe(before)
  setMode(h, 'nina', 'act')
  const act = turn(gw, 'nina', 't-system')
  expect(await act.call('board_card_move', { ticketId: 't-system', columnId: columns.doing })).toMatchObject({ ok: true })
  expect(await act.call('board_card_move', { ticketId: 't-bento', columnId: columns.doing })).toMatchObject({ ok: false, code: 'forbidden' }) // Bento's
})

it('the run owns the identity: a forged persona in the arguments changes nothing, and a run that is not real gets "não reconheço"', async () => {
  const { h, gw, columns } = rig()
  setMode(h, 'nina', 'act')
  const t = turn(gw, 'nina', 't-system')
  // she tries to act as Bento on Bento's card: the argument is stripped, she stays Nina → forbidden
  expect(await t.call('board_card_move', { ticketId: 't-bento', columnId: columns.doing, personaId: 'bento' })).toMatchObject({ ok: false, code: 'forbidden' })
  const ghost = turn(gw, 'ghost', 't-system')
  expect(ghost.names.filter(name => name.startsWith('board_'))).toEqual(['board_list', 'board_card_move']) // announced by the lease...
  expect(await ghost.call('board_card_move', { ticketId: 't-system', columnId: columns.doing })).toMatchObject({ ok: false, code: 'forbidden' }) // ...but no identity
})

it('wrong arguments are told and nothing happens', async () => {
  const { gw, activity } = rig()
  const t = turn(gw, 'nina', 't-person')
  expect(await t.call('board_card_move', { ticketId: 't-bento' })).toMatchObject({ ok: false, code: 'invalid' })
  expect(await t.call('sprint_create', { name: 'Sem objetivo' })).toMatchObject({ ok: false, code: 'invalid' })
  expect(await t.call('sprint_close', { sprintId: 'x', leftover: 'nunca' })).toMatchObject({ ok: false, code: 'invalid' })
  expect(await t.call('routine_create', { name: 'x', prompt: 'y', schedule: { frequency: 'sempre' } })).toMatchObject({ ok: false, code: 'invalid' })
  expect(activity).toEqual([])
})

it('a sprint through the tools: create, plan, start, close — the last two say they cannot be undone', async () => {
  const { h, gw, activity } = rig()
  const t = turn(gw, 'guia', 't-person')
  const created = await t.call('sprint_create', { name: 'Sprint 1', objective: 'Fechar a faixa' })
  expect(created).toMatchObject({ ok: true, undoable: true, sprint: { name: 'Sprint 1', status: 'planejado' } })
  const id = (created.sprint as { id: string }).id
  expect(await t.call('sprint_plan', { sprintId: id, ticketIds: ['t-person', 't-bento'] })).toMatchObject({ ok: true, undoable: true, sprint: { cards: ['t-person', 't-bento'] } })
  expect(await t.call('sprint_start', { sprintId: id })).toMatchObject({ ok: true, undoable: false, sprint: { status: 'ativo' } })
  expect(await t.call('sprint_start', { sprintId: id })).toMatchObject({ ok: false, code: 'conflict' })
  expect(await t.call('sprint_close', { sprintId: id, leftover: 'backlog' })).toMatchObject({ ok: true, undoable: false })
  expect(h.listSprints(SCOPE).find(item => item.id === id)?.status).toBe('encerrado')
  expect((await t.call('sprint_list')).sprints).toEqual([expect.objectContaining({ id, status: 'encerrado' })])
  expect(activity.map(row => row.verb)).toEqual(['sprint_create', 'sprint_plan', 'sprint_start', 'sprint_close'])
})

it('routines through the tools: the person asked, the persona owns it, the daily limit is told', async () => {
  const { h, gw, activity } = rig()
  const t = turn(gw, 'nina', 't-person')
  const schedule = { frequency: 'weekdays', time: '09:00' }
  const made = await t.call('routine_create', { name: 'Resumo do dia', prompt: 'Resuma o que a equipe entregou ontem.', schedule, timeZone: 'America/Sao_Paulo' })
  expect(made).toMatchObject({ ok: true, undoable: true, routine: { name: 'Resumo do dia', schedule: 'De segunda a sexta, às 9h' } })
  expect((await t.call('routine_list')).routines).toEqual([expect.objectContaining({ name: 'Resumo do dia', owner: 'nina', paused: false })])
  const id = (made.routine as { id: string }).id
  expect(await t.call('routine_pause', { id, paused: true })).toMatchObject({ ok: true, routine: { paused: true } })
  expect(h.listRoutines(SCOPE).find(row => row.id === id)?.paused).toBe(true)
  expect(activity.map(row => row.verb)).toEqual(['routine_create', 'routine_pause'])
  for (const name of ['Dois', 'Três']) await t.call('routine_create', { name, prompt: 'Faça.', schedule })
  expect(await t.call('routine_create', { name: 'Quatro', prompt: 'Faça.', schedule })).toMatchObject({ ok: false, code: 'limit' })
})
