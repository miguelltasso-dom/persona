import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { BoardPorts, SPRINTS_CREATED_PER_DAY, type BoardResult } from '../src/harness-boards.ts'
import type { HarnessIdentity } from '../src/harness-routines.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * HT-2 (contracts/harness-tools.md §2-A/§2-B): the persona moves cards and runs sprints through internal ports with her identity;
 * the person's request authorizes the verb, her own initiative follows her autonomy, and the board's own rules still apply.
 */

function card(id: string, title: string, owner: string | undefined): Ticket {
  const at = '2026-11-03T14:00:00.000Z'
  return {
    id, title, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'owner' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'pending', createdAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: `m-${id}`, triggerIds: [`m-${id}`] },
    ...(owner === undefined ? {} : { execution: { name: owner, directory: '.', assignment: title } }),
  }
}

function setup(): { h: PersonaHost; ports: BoardPorts; columns: Record<string, string> } {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  const rt = h.orchestration.runtime('pp')
  rt.repo.tickets.save(card('tk-nina', 'Pesquisa de mercado', 'Nina'))
  rt.repo.tickets.save(card('tk-bento', 'Faixa Agora', 'Bento'))
  rt.repo.tickets.save(card('tk-free', 'Ideia solta', undefined))
  let counter = 0
  const ports = new BoardPorts({
    product: h.product, boards: h.boards, ticketOf: (projectId, id) => h.orchestration.runtime(projectId).repo.tickets.get(id),
    screens: h.screens.screens, now: () => h.orchestration.now(), newId: () => `sp-${String((counter += 1))}`,
  })
  const columns = Object.fromEntries(h.getProjectBoard(SCOPE).workflow.columns.map(column => [column.category, column.id]))
  return { h, ports, columns }
}

let call = 0
const as = (personaId: string, extra: Partial<HarnessIdentity> = {}): HarnessIdentity => ({
  ...SCOPE, personaId, initiator: 'person-request', requestId: 'm1', autonomy: 'propose', callId: `c${String((call += 1))}`, ...extra,
})
const own = (personaId: string, autonomy: HarnessIdentity['autonomy'] = 'act'): HarnessIdentity => as(personaId, { initiator: 'persona-initiative', autonomy })
const columnOf = (h: PersonaHost, ticketId: string): string | undefined => h.getProjectBoard(SCOPE).cards.find(item => item.ticketId === ticketId)?.columnId

function ok<T>(result: BoardResult<T>): { value: T; activity: Extract<BoardResult<T>, { ok: true }>['activity'] } {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`)
  return result
}
const refused = <T>(result: BoardResult<T>): string => (result.ok ? 'ok' : result.code)

it('the person asked: the persona moves a card, the activity names the columns and how to undo it, and the undo works', () => {
  const { h, ports, columns } = setup()
  const before = columnOf(h, 'tk-bento')
  const moved = ok(ports.moveCard(as('nina'), { ticketId: 'tk-bento', columnId: columns.doing! }))
  expect(moved.value.ticketId).toBe('tk-bento')
  expect(columnOf(h, 'tk-bento')).toBe(columns.doing)
  expect(moved.activity).toMatchObject({
    verb: 'board_card_move', target: { kind: 'card', id: 'tk-bento', title: 'Faixa Agora' }, initiator: 'person-request', requestId: 'm1', status: 'done', undoable: true,
    undo: { remote: 'moveTicket', request: { ...SCOPE, ticketId: 'tk-bento', columnId: before } },
  })
  expect(moved.activity.after).toBeDefined()
  // the undo the UI would run is the person's own Remote
  h.moveTicket({ ...SCOPE, ticketId: 'tk-bento', columnId: before! })
  expect(columnOf(h, 'tk-bento')).toBe(before)
})

it('a persona moving a card to Fazendo starts NOTHING by herself (HT-3 is the person\'s move only): no loop is possible', async () => {
  const { h, ports, columns } = setup()
  h.orchestration.startOnBoardMove = true
  ok(ports.moveCard(own('nina'), { ticketId: 'tk-nina', columnId: columns.doing! }))
  await h.orchestration.flush('pp')
  const lines = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 200 }).events
  expect(lines.some(item => item.id.startsWith('coord-board-'))).toBe(false) // the "Nina começou…" line is the person's move only
  expect(lines.some(item => item.id.startsWith('exec-'))).toBe(false)
})

it('her own initiative follows her autonomy: act moves HER cards; asked and propose refuse; another persona\'s card is refused', () => {
  const { ports, columns } = setup()
  const doing = columns.doing!
  expect(refused(ports.moveCard(own('nina', 'asked'), { ticketId: 'tk-nina', columnId: doing }))).toBe('forbidden')
  expect(refused(ports.moveCard(own('nina', 'propose'), { ticketId: 'tk-nina', columnId: doing }))).toBe('forbidden')
  expect(refused(ports.moveCard(own('nina'), { ticketId: 'tk-nina', columnId: doing }))).toBe('ok')
  expect(refused(ports.moveCard(own('nina'), { ticketId: 'tk-bento', columnId: doing }))).toBe('forbidden') // Bento's card
  expect(refused(ports.moveCard(own('nina'), { ticketId: 'tk-free', columnId: doing }))).toBe('forbidden') // nobody's: only the Coordenação
  expect(refused(ports.moveCard(own('guia'), { ticketId: 'tk-free', columnId: doing }))).toBe('ok')
  expect(refused(ports.moveCard(as('nina'), { ticketId: 'tk-bento', columnId: doing }))).toBe('ok') // but on the person's request, any
})

it('a card or a column that does not exist is told, and a persona outside the project is refused', () => {
  const { ports, columns } = setup()
  expect(refused(ports.moveCard(as('nina'), { ticketId: 'nope', columnId: columns.doing! }))).toBe('not-found')
  expect(refused(ports.moveCard(as('nina'), { ticketId: 'tk-nina', columnId: 'nope' }))).toBe('invalid')
  expect(refused(ports.moveCard(as('ghost'), { ticketId: 'tk-nina', columnId: columns.doing! }))).toBe('forbidden')
})

it('the same tool call twice does the action once', () => {
  const { h, ports, columns } = setup()
  const who = as('nina')
  const first = ports.moveCard(who, { ticketId: 'tk-bento', columnId: columns.doing! })
  h.moveTicket({ ...SCOPE, ticketId: 'tk-bento', columnId: columns.todo! }) // the person moves it back in between
  const second = ports.moveCard(who, { ticketId: 'tk-bento', columnId: columns.doing! })
  expect(second).toEqual(first)
  expect(columnOf(h, 'tk-bento')).toBe(columns.todo) // the repeat did NOT move it again
})

it('sprints: the person asks and any persona opens one (undo = delete); on her own only the Coordenação, with a daily cap', () => {
  const { h, ports } = setup()
  const made = ok(ports.createSprint(as('nina'), { name: 'Sprint 1', objective: 'Fechar a faixa Agora' }))
  expect(made.value).toMatchObject({ id: 'sp-1', name: 'Sprint 1', status: 'planejado' })
  expect(made.activity).toMatchObject({ verb: 'sprint_create', target: { kind: 'sprint', id: 'sp-1', title: 'Sprint 1' }, undoable: true, undo: { remote: 'deleteSprint' } })
  expect(h.deleteSprint({ ...SCOPE, sprintId: 'sp-1' })).toBe(true) // the undo the UI would run
  expect(h.listSprints(SCOPE)).toEqual([])

  expect(refused(ports.createSprint(own('nina'), { name: 'Sozinha', objective: '' }))).toBe('forbidden') // not hers to run
  expect(refused(ports.createSprint(own('guia', 'propose'), { name: 'Sozinha', objective: '' }))).toBe('forbidden')
  for (let index = 0; index < SPRINTS_CREATED_PER_DAY; index += 1) {
    expect(refused(ports.createSprint(own('guia'), { name: `Sprint ${String(index + 2)}`, objective: '' }))).toBe('ok')
  }
  expect(refused(ports.createSprint(own('guia'), { name: 'Demais', objective: '' }))).toBe('limit')
  expect(refused(ports.createSprint(as('nina'), { name: 'A pessoa pediu', objective: '' }))).toBe('ok') // the person's request is not capped
  expect(refused(ports.createSprint(as('nina'), { name: '   ', objective: '' }))).toBe('invalid')
})

it('plan, start and close a sprint: plan is undoable, start and close are not, and repeats are told', () => {
  const { h, ports } = setup()
  const sprint = ok(ports.createSprint(as('guia'), { name: 'Sprint 1', objective: 'Meta' })).value
  const planned = ok(ports.planSprint(as('guia'), { sprintId: sprint.id, ticketIds: ['tk-nina', 'tk-bento'] }))
  expect(planned.value.ticketIds).toEqual(['tk-nina', 'tk-bento'])
  expect(planned.activity).toMatchObject({ verb: 'sprint_plan', before: '0 cartões', after: '2 cartões', undoable: true, undo: { remote: 'planSprint', request: { sprintId: sprint.id, ticketIds: [] } } })
  expect(refused(ports.planSprint(as('guia'), { sprintId: sprint.id, ticketIds: ['nope'] }))).toBe('invalid')
  expect(refused(ports.planSprint(as('guia'), { sprintId: 'nope', ticketIds: [] }))).toBe('not-found')

  const started = ok(ports.startSprint(as('guia'), { sprintId: sprint.id }))
  expect(started.value.status).toBe('ativo')
  expect(started.activity).toMatchObject({ verb: 'sprint_start', before: 'Planejado', after: 'Ativo', undoable: false })
  expect(started.activity.undo).toBeUndefined()
  expect(refused(ports.startSprint(as('guia'), { sprintId: sprint.id }))).toBe('conflict') // already active

  const closed = ok(ports.closeSprint(as('guia'), { sprintId: sprint.id, leftover: 'backlog' }))
  expect(closed.value.closed.status).toBe('encerrado')
  expect(closed.activity).toMatchObject({ verb: 'sprint_close', undoable: false })
  expect(refused(ports.closeSprint(as('guia'), { sprintId: sprint.id, leftover: 'backlog' }))).toBe('conflict')
  expect(refused(ports.planSprint(as('guia'), { sprintId: sprint.id, ticketIds: [] }))).toBe('conflict') // a closed sprint takes no more cards
  expect(h.listSprints(SCOPE).find(item => item.id === sprint.id)?.status).toBe('encerrado')
})

it('reading the board and the sprints is free of side effects', () => {
  const { h, ports } = setup()
  const before = JSON.stringify(h.getProjectBoard(SCOPE))
  expect(ports.read(as('nina')).cards.map(item => item.ticketId).sort()).toEqual(['tk-bento', 'tk-free', 'tk-nina'])
  expect(ports.sprints(as('nina'))).toEqual([])
  expect(JSON.stringify(h.getProjectBoard(SCOPE))).toBe(before)
})
