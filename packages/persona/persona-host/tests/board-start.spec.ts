import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Runner, Ticket } from '@deepseek-ai/dsh-persona-engine'
import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { doneEventId } from '../src/ticket-done.ts'
import { bindHostFile, HOST_GIT_TIMEOUT_MS, it } from './host-harness.ts'

/**
 * HT-3 (contracts/harness-tools.md): when the PERSON moves a card to a "Fazendo" column, the persona that owns it starts working
 * now and the thread says so. Moving a card only marked the Task as running; nobody worked. A persona moving a card (its own tools
 * call the board directly) never triggers this, so it cannot loop.
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', ...scope, name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
  h.orchestration.startOnBoardMove = true // the feature under test (it is OFF by default until accepted)
}

/** A card nobody is working on: a pending Assignment (what "Aguardando" is). */
function parked(over: Partial<Ticket> = {}): Ticket {
  const at = '2026-11-03T14:00:00.000Z'
  return {
    id: 't1', title: 'Implementar faixa Agora', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 'a1', state: 'pending', createdAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Implemente a faixa Agora' },
    ...over,
  }
}

const column = (h: PersonaHost, category: string): string => {
  const found = h.getProjectBoard(scope).workflow.columns.find(item => item.category === category)
  if (found === undefined) throw new Error(`no ${category} column`)
  return found.id
}

const save = (h: PersonaHost, ticket: Ticket): void => { h.orchestration.runtime('pp').repo.tickets.save(ticket) }
const lines = (h: PersonaHost) =>
  h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const boardLines = (h: PersonaHost) => lines(h).filter(item => item.id.startsWith('coord-board-t1-'))
const worked = (h: PersonaHost): boolean => lines(h).some(item => item.id === 'exec-t1-progress')

function openTurn(log: string[]): Runner {
  return {
    ensureSession: () => Promise.resolve(),
    deliver: (sessionId, _requestId, text, mode) => { log.push(`${sessionId}|${mode}|${text}`); return Promise.resolve() },
    cancel: () => Promise.resolve(),
    status: () => 'running',
    whenIdle: () => Promise.resolve(),
    onEvent: () => () => undefined,
    capabilities: () => ({ steer: true, removeQueued: true, reportsInputTaken: true, background: false, tools: 'native', resume: true }),
  }
}

it('moving a parked card to Fazendo makes the owner persona start, and the thread says so', async () => {
  const h = host()
  seed(h)
  save(h, parked())
  expect(worked(h)).toBe(false)
  h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'doing') })
  await h.orchestration.flush('pp')
  const [line] = boardLines(h)
  expect(boardLines(h)).toHaveLength(1)
  expect(line?.actorId).toBe('p1')
  expect(line?.body).toBe('Bento começou “Implementar faixa Agora” porque você moveu para Fazendo.')
  expect(line?.harness).toEqual({
    verb: 'board_card_move', outcome: 'started', ticketId: 't1', title: 'Implementar faixa Agora', persona: { personaId: 'p1', name: 'Bento' },
  })
  expect(worked(h)).toBe(true) // the persona really ran the Task
})

it('with the flag OFF (the default) the old path is intact: moving a card announces nothing and starts nothing at once', async () => {
  const h = host()
  seed(h)
  h.orchestration.startOnBoardMove = false
  save(h, parked())
  h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'doing') })
  await h.orchestration.flush('pp')
  expect(boardLines(h)).toEqual([]) // no line, no immediate start: the scheduler picks the card up later, as before
  expect(worked(h)).toBe(false)
  expect(h.getProjectBoard(scope).cards.find(card => card.ticketId === 't1')?.category).toBe('doing') // the move itself still works
})

it('a card moved to any other column starts nothing', async () => {
  const h = host()
  seed(h)
  save(h, parked())
  h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'todo') })
  await h.orchestration.flush('pp')
  expect(boardLines(h)).toEqual([])
  expect(worked(h)).toBe(false)
})

it('a card whose turn is already open is not started a second time', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  save(h, parked({ assignments: [{ id: 'a1', state: 'running', createdAt: '2026-11-03T14:00:00.000Z', startedAt: '2026-11-03T14:00:00.000Z' }] }))
  h.orchestration.warmRunners.set('pp:p1:task', openTurn(log))
  h.orchestration.budget.running.set('pp', 1)
  h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'doing') })
  await h.orchestration.flush('pp')
  expect(boardLines(h)).toEqual([]) // already being worked on: nothing to announce
  expect(log).toEqual([]) // and nothing was delivered to the open turn
  expect(h.orchestration.startFromBoard('pp', 't1')).toEqual({ started: false, reason: 'running' }) // the hook looked and saw the open turn
})

it('a paused persona does not start; the thread says why, and the card stays in Fazendo', async () => {
  const h = host()
  seed(h)
  save(h, parked())
  h.orchestration.setPersonaPaused('pp', 'p1', true)
  try {
    h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'doing') })
    await h.orchestration.flush('pp')
    const [line] = boardLines(h)
    expect(line?.harness).toMatchObject({ outcome: 'held', reason: 'paused', persona: { name: 'Bento' } })
    expect(line?.body).toBe('Bento está em pausa. “Implementar faixa Agora” fica em Fazendo e começa quando Bento voltar.')
    expect(worked(h)).toBe(false)
    expect(h.getProjectBoard(scope).cards.find(card => card.ticketId === 't1')?.category).toBe('doing')
  } finally {
    h.orchestration.setPersonaPaused('pp', 'p1', false)
  }
})

it('out of hours the persona does not start either, and says so', async () => {
  const h = host()
  seed(h)
  save(h, parked())
  h.setAutonomy({ ...scope, personaId: 'p1', mode: 'propose', proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '00:00', silenceEnd: '23:59' })
  h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'doing') })
  await h.orchestration.flush('pp')
  expect(boardLines(h)[0]?.harness).toMatchObject({ outcome: 'held', reason: 'silence', until: '23:59' })
  expect(boardLines(h)[0]?.body).toBe('“Implementar faixa Agora” fica em Fazendo e começa quando acabar o silêncio de Bento (às 23:59).')
  expect(worked(h)).toBe(false)
})

it('a card nobody owns is announced by the Coordenação instead of being silently "running"', async () => {
  const h = host()
  seed(h)
  const { execution, ...bare } = parked()
  void execution
  save(h, bare)
  h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'doing') })
  await h.orchestration.flush('pp')
  const [line] = boardLines(h)
  expect(line?.actorId).toBe('p1') // the Coordenação (here Bento holds the role)
  expect(line?.harness).toMatchObject({ outcome: 'held', reason: 'no_owner' })
  expect(worked(h)).toBe(false)
})

it('a result that still waits for Aplicar/Descartar is not restarted (FLOW-1): it says so', async () => {
  const h = host()
  seed(h)
  save(h, parked())
  expect(h.orchestration.startFromBoard('pp', 't1', { deliveryPending: true })).toEqual({ started: false, reason: 'delivery_pending' })
  await h.orchestration.flush('pp')
  expect(boardLines(h)[0]?.harness).toMatchObject({ outcome: 'held', reason: 'delivery_pending' })
  expect(worked(h)).toBe(false)
})

it('only the PERSON\'s move starts work: a persona moving a card (the board called directly) never triggers it, so it cannot loop', async () => {
  const h = host()
  seed(h)
  save(h, parked())
  h.boards.moveTicket('pp', 't1', column(h, 'doing'))
  await h.orchestration.flush('pp')
  expect(boardLines(h)).toEqual([])
  expect(worked(h)).toBe(false)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// HT-3 honesty (Bolt, 07/11): the line “começou … porque você moveu para Fazendo” must be TRUE. A card whose Assignment already took its
// turn used to get that line while nothing ran (and the scheduler skipped it too); a result waiting for Aplicar/Descartar was rewritten
// into “working”. These go through the REAL path (`moveTicket` Remote → board → `startFromBoard`).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const roots: string[] = []
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A project WITH a folder: the only kind that can hold a draft waiting for Aplicar/Descartar (FLOW-1). */
function withFolder(h: PersonaHost): void {
  const root = mkdtempSync(join(tmpdir(), 'persona-bs-'))
  roots.push(root)
  expect(h.setProjectRoot({ ...scope, rootPath: root }).status).toBe('ok')
}

/** What really reached a runner: the launch of each Assignment (`launch:<assignment>`) and the words the worker was given. */
function countLaunches(h: PersonaHost): { requestId: string; text: string }[] {
  const launches: { requestId: string; text: string }[] = []
  const original = h.orchestration.runnerFactory
  h.orchestration.runnerFactory = async (request) => {
    const runner: Runner = await original(request)
    const deliver = runner.deliver.bind(runner)
    Object.assign(runner, {
      deliver: (...args: Parameters<Runner['deliver']>): ReturnType<Runner['deliver']> => {
        if (args[1].startsWith('launch:')) launches.push({ requestId: args[1], text: args[2] })
        return deliver(...args)
      },
    })
    return runner
  }
  return launches
}

const AT = '2026-11-03T14:00:00.000Z'

/** A card whose Assignment already took its turn: it ended with `state` and the host wrote its “done” line, as a real run leaves it. */
function tookItsTurn(h: PersonaHost, state: 'failed' | 'waiting'): Ticket {
  const ticket = parked({ assignments: [{ id: 'a1', state: 'running', createdAt: AT, startedAt: AT, report: { state, summary: 'O motor caiu.', at: AT } }] })
  save(h, ticket)
  h.orchestration.events.append({
    id: doneEventId(ticket), workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: 'O motor caiu.', actorId: 'p1', subjectId: '', occurredAt: AT,
  })
  return ticket
}

it('a card that was DELIVERED (nothing waits for Aplicar/Descartar) dragged back to Fazendo is worked on again for real, and the line is true', async () => {
  const h = host()
  seed(h)
  const launches = countLaunches(h)
  h.postMessage({ id: 'u1', ...scope, streamKind: 'channel', ownerId: 'geral', body: '@Bento Faça o relatório do dia', actorId: 'ana', subjectId: '' })
  await h.orchestration.flush('pp')
  const rt = h.orchestration.runtime('pp')
  const made = rt.repo.tickets.list()[0]
  if (made === undefined) throw new Error('no ticket')
  expect(latestAssignment(made)?.report?.state).toBe('ready') // delivered, waiting for review
  expect(h.orchestration.events.has(doneEventId(made))).toBe(true) // and the host marked that turn as done
  expect(launches).toHaveLength(1)
  h.moveTicket({ ...scope, ticketId: made.id, columnId: column(h, 'doing') })
  await h.orchestration.flush('pp')
  const after = rt.repo.tickets.get(made.id)
  if (after === undefined) throw new Error('ticket gone')
  expect(after.assignments).toHaveLength(2) // a FRESH Assignment: the first one already took its turn
  expect(launches).toHaveLength(2) // and the worker really ran again (before: 0 new turns, with a line saying it started)
  expect(launches[1]?.requestId).toBe(`launch:${latestAssignment(after)?.id}`)
  expect(launches[1]?.text).toContain('Movi este cartão para Fazendo') // the worker is told why it runs again
  expect(latestAssignment(after)?.report?.state).toBe('ready') // and it delivered again
  const [line] = lines(h).filter(item => item.id.startsWith(`coord-board-${made.id}-`))
  expect(line?.harness).toMatchObject({ verb: 'board_card_move', outcome: 'started', persona: { name: 'Bento' } })
})

it('a result that WAITS for Aplicar/Descartar (project with a folder) dragged to Fazendo is not a move: nothing is rewritten or restarted, and the thread says why', async () => {
  const h = host()
  seed(h)
  withFolder(h)
  const launches = countLaunches(h)
  const waiting = parked({ assignments: [{ id: 'a1', state: 'running', createdAt: AT, startedAt: AT, report: { state: 'ready', summary: 'Pronto para revisar', at: AT } }] })
  save(h, waiting)
  const doing = column(h, 'doing') // (reading the board also seats the card)
  const seatBefore = h.boards.board.list('pp').find(seat => seat.ticketId === 't1')
  const moved = h.moveTicket({ ...scope, ticketId: 't1', columnId: doing })
  await h.orchestration.flush('pp')
  const kept = h.orchestration.runtime('pp').repo.tickets.get('t1')
  expect(kept?.assignments).toEqual(waiting.assignments) // the SAME Assignment, still reporting `ready`: it was not turned into “working”
  expect(kept?.updatedAt).toBe(waiting.updatedAt)
  expect(h.boards.board.list('pp').find(seat => seat.ticketId === 't1')).toEqual(seatBefore) // and the card did not move: it stays where its delivery waits
  expect(moved.card.category).toBe('review')
  expect(moved.card.deliveryPending).toBe(true) // its delivery still waits for the decision
  expect(moved.wipWarning).toBe(false)
  expect(h.getProjectBoard(scope).cards.find(card => card.ticketId === 't1')?.deliveryPending).toBe(true)
  expect(boardLines(h)).toHaveLength(1)
  expect(boardLines(h)[0]?.harness).toMatchObject({ verb: 'board_card_move', outcome: 'held', reason: 'delivery_pending', persona: { name: 'Bento' } })
  expect(launches).toEqual([]) // nobody was started
  expect(worked(h)).toBe(false)
}, HOST_GIT_TIMEOUT_MS)

it('a persona\'s own tool is refused like Concluído when it would push a waiting result back into “working” (FLOW-1): nothing changes, nobody starts', async () => {
  const h = host()
  seed(h)
  withFolder(h)
  const launches = countLaunches(h)
  const waiting = parked({ assignments: [{ id: 'a1', state: 'running', createdAt: AT, startedAt: AT, report: { state: 'ready', summary: 'Pronto para revisar', at: AT } }] })
  save(h, waiting)
  expect(() => h.boards.moveTicket('pp', 't1', column(h, 'doing'))) // what a persona's tool calls: no person, no start
    .toThrow(expect.objectContaining({ code: 'delivery_pending', isDSHRemoteError: true }))
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.get('t1')?.assignments).toEqual(waiting.assignments)
  expect(boardLines(h)).toEqual([])
  expect(launches).toEqual([])
}, HOST_GIT_TIMEOUT_MS)

it('a card whose turn FAILED, dragged back to Fazendo, is tried again for real: a fresh Assignment, a real turn, a true line', async () => {
  const h = host()
  seed(h)
  const launches = countLaunches(h)
  tookItsTurn(h, 'failed')
  expect(worked(h)).toBe(false)
  h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'doing') })
  await h.orchestration.flush('pp')
  const after = h.orchestration.runtime('pp').repo.tickets.get('t1')
  if (after === undefined) throw new Error('ticket gone')
  expect(after.assignments).toHaveLength(2) // the failed Assignment ended; a new one carries the retry
  expect(launches.map(item => item.requestId)).toEqual([`launch:${latestAssignment(after)?.id}`])
  expect(launches[0]?.text).toContain('Movi este cartão para Fazendo')
  expect(worked(h)).toBe(true) // the persona really ran the Task
  expect(boardLines(h)[0]?.harness).toMatchObject({ outcome: 'started' })
})

it('a card the person STOPPED, dragged back to Fazendo, starts again with a fresh Assignment (an old request id is never reused)', async () => {
  const h = host()
  seed(h)
  const launches = countLaunches(h)
  save(h, parked({ assignments: [{ id: 'a1', state: 'running', createdAt: AT, startedAt: AT }] }))
  await h.orchestration.stopTicketRun('pp', 't1', 'Parado por você')
  expect(h.orchestration.runtime('pp').repo.tickets.get('t1')?.ended?.outcome).toBe('stopped')
  h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'doing') })
  await h.orchestration.flush('pp')
  const after = h.orchestration.runtime('pp').repo.tickets.get('t1')
  if (after === undefined) throw new Error('ticket gone')
  expect(after.ended).toBeUndefined() // reopened by the move
  expect(after.assignments).toHaveLength(2)
  expect(launches.map(item => item.requestId)).toEqual([`launch:${latestAssignment(after)?.id}`])
  expect(worked(h)).toBe(true)
  expect(boardLines(h)[0]?.harness).toMatchObject({ outcome: 'started' })
})

it('a finished card moved to Fazendo while its persona is paused is held, and is not a ghost: it has a fresh Assignment the scheduler can start later', async () => {
  const h = host()
  seed(h)
  const launches = countLaunches(h)
  tookItsTurn(h, 'failed')
  h.orchestration.setPersonaPaused('pp', 'p1', true)
  try {
    h.moveTicket({ ...scope, ticketId: 't1', columnId: column(h, 'doing') })
    await h.orchestration.flush('pp')
    expect(boardLines(h)[0]?.harness).toMatchObject({ outcome: 'held', reason: 'paused' })
    const after = h.orchestration.runtime('pp').repo.tickets.get('t1')
    if (after === undefined) throw new Error('ticket gone')
    expect(after.assignments).toHaveLength(2)
    expect(latestAssignment(after)?.state).not.toBe('ended') // waiting for its turn…
    expect(h.orchestration.events.has(doneEventId(after))).toBe(false) // …and with no “done” mark, so the scheduler's stranded sweep picks it up when she is back
    expect(launches).toEqual([])
    expect(worked(h)).toBe(false)
  } finally {
    h.orchestration.setPersonaPaused('pp', 'p1', false)
  }
})
