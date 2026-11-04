import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { confineWorktreeWrite } from '@deepseek-ai/dsh-persona-engine'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, it as vitestIt } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, HOST_GIT_TIMEOUT_MS, it } from './host-harness.ts'

const exec = promisify(execFile)
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  if (previousHome === undefined) delete process.env.PERSONA_HOME
  else process.env.PERSONA_HOME = previousHome
})

const { host } = bindHostFile()

const previousHome = process.env.PERSONA_HOME

async function gitRepo(): Promise<string> {
  const home = mkdtempSync(join(tmpdir(), 'persona-home-'))
  dirs.push(home)
  process.env.PERSONA_HOME = home
  const root = mkdtempSync(join(tmpdir(), 'persona-rv-host-'))
  dirs.push(root)
  await exec('git', ['init', '-b', 'main', root])
  await exec('git', ['-C', root, 'config', 'user.email', 'anvil@persona.test'])
  await exec('git', ['-C', root, 'config', 'user.name', 'Anvil'])
  writeFileSync(join(root, 'README'), 'base\n')
  await exec('git', ['-C', root, 'add', '.'])
  await exec('git', ['-C', root, 'commit', '-m', 'init'])
  return root
}

function seed(h: PersonaHost, root: string): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
  }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.createChannel({ id: 'docs', workspaceId: 'ws', projectId: 'pp', name: 'docs', topic: '' })
  h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: root })
}

it('prepare/summary/accept/requestChanges/discard on a real git repo with a file-editing fake runner', async () => {
  const root = await gitRepo()
  const h = host()
  seed(h, root)
  h.orchestration.runnerFactory = async () => {
    const inner = createFakeRunner()
    return {
      ...inner,
      deliver: async (sessionId, requestId, text, mode) => {
        await inner.deliver(sessionId, requestId, text, mode)
        const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]
        const cwd = ticket?.execution?.directory
        if (cwd === undefined || cwd === '.') return
        const dest = confineWorktreeWrite(cwd, 'note.txt')
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, 'feito\n')
        await exec('git', ['-C', cwd, 'add', 'note.txt'])
        await exec('git', ['-C', cwd, 'commit', '-m', 'edit'])
      },
    }
  }
  h.postMessage({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't1',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const ticketId = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]!.id
  const summary = await h.reviewSummary({
    workspaceId: 'ws', projectId: 'pp', ticketId, command: 'complete', reason: '',
  })
  expect(summary.hasWorktree).toBe(true)
  expect(summary.files.some(file => file.path === 'note.txt')).toBe(true)
  const before = h.orchestration.runtime('pp').repo.tickets.get(ticketId)!
  const boardScope = { workspaceId: 'ws', projectId: 'pp' }
  const done = h.getProjectBoard(boardScope).workflow.columns.find(column => column.category === 'done')
  if (done === undefined) throw new Error('missing-done-column')
  expect(h.getProjectBoard(boardScope).cards.find(card => card.ticketId === ticketId)?.deliveryPending).toBe(true)
  const seatsBefore = h.boards.board.list('pp')
  expect(() => h.moveTicket({ ...boardScope, ticketId, columnId: done.id }))
    .toThrow(expect.objectContaining({ code: 'delivery_pending', isDSHRemoteError: true }))
  expect(h.orchestration.runtime('pp').repo.tickets.get(ticketId)).toEqual(before)
  expect(h.boards.board.list('pp')).toEqual(seatsBefore)
  expect((await h.reviewSummary({ ...boardScope, ticketId })).files).toEqual(summary.files)
  expect(readFileSync(join(before.execution!.directory, 'note.txt'), 'utf8')).toBe('feito\n')
  await h.requestChanges({
    workspaceId: 'ws', projectId: 'pp', ticketId, feedback: 'Ajusta o título.',
  })
  const after = h.orchestration.runtime('pp').repo.tickets.get(ticketId)!
  expect(after.mandate.scope).toBe(before.mandate.scope)
  expect(after.assignments.length).toBeGreaterThan(before.assignments.length)
  await h.orchestration.flush('pp')
  const accepted = await h.acceptReview({
    workspaceId: 'ws', projectId: 'pp', ticketId, mode: 'ff',
  })
  expect(accepted.kind).toBe('merged')
  expect(h.getProjectBoard(boardScope).cards.find(card => card.ticketId === ticketId)?.deliveryPending).toBeUndefined()

  h.postMessage({
    id: 'm2', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'docs',
    body: 'preciso escrever docs', actorId: 'ana', subjectId: 't2',
    occurredAt: '2026-11-03T15:01:00.000Z',
  })
  await h.orchestration.flush('pp')
  const second = h.listTasks({ workspaceId: 'ws', projectId: 'pp' }).find(item => item.id !== ticketId && item.stage !== 'done')
  expect(second).toBeDefined()
  await h.discardReview({
    workspaceId: 'ws', projectId: 'pp', ticketId: second!.id, command: 'complete', reason: '',
  })
  // That Task was blocked (nothing waiting for review): Descartar removes the draft but does not end it.
  expect(h.orchestration.runtime('pp').repo.tickets.get(second!.id)?.ended).toBeUndefined()
}, HOST_GIT_TIMEOUT_MS)

it('Descartar ends the Task whose result was waiting, so its card leaves Revisar (FLOW-1)', async () => {
  const root = await gitRepo()
  const h = host()
  seed(h, root)
  h.postMessage({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't1',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const ticketId = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]!.id
  const scope = { workspaceId: 'ws', projectId: 'pp' }
  const tree = await h.orchestration.prepareReview('pp', ticketId, h.orchestration.runtime('pp').repo.tickets.get(ticketId)!.assignments.at(-1)!.id)
  expect(tree).toBeDefined()
  const cardOf = () => h.getProjectBoard(scope).cards.find(row => row.ticketId === ticketId)
  expect(cardOf()?.deliveryPending).toBe(true)
  // Another Task with its own draft waiting: Descartar of the first must not touch it.
  h.postMessage({
    id: 'm2', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'docs',
    body: 'preciso escrever docs', actorId: 'ana', subjectId: 't2',
    occurredAt: '2026-11-03T15:01:00.000Z',
  })
  await h.orchestration.flush('pp')
  const otherId = h.listTasks(scope).find(item => item.id !== ticketId)!.id
  const otherTicket = h.orchestration.runtime('pp').repo.tickets.get(otherId)!
  const otherTree = await h.orchestration.prepareReview('pp', otherId, otherTicket.assignments.at(-1)!.id)
  expect(otherTree).toBeDefined()
  const request = { ...scope, ticketId, command: 'dismiss' as const, reason: 'Rascunho descartado na revisão' }
  await h.discardReview(request)
  expect(h.orchestration.runtime('pp').repo.tickets.get(otherId)?.ended).toBeUndefined()
  expect(existsSync(otherTree!.path)).toBe(true)
  // The draft is gone and the Task the person turned down is over: the card is not stuck behind the FLOW-1 refusal.
  expect(h.orchestration.runtime('pp').repo.tickets.get(ticketId)?.ended).toMatchObject({ by: 'human', outcome: 'stopped', reason: 'discarded' })
  expect(cardOf()?.category).toBe('done')
  expect(cardOf()?.deliveryPending).toBeUndefined()
  expect(() => readFileSync(join(tree!.path, 'README'), 'utf8')).toThrow()
  const ended = h.orchestration.runtime('pp').repo.tickets.get(ticketId)?.ended
  await h.discardReview(request) // a second Descartar is harmless
  expect(h.orchestration.runtime('pp').repo.tickets.get(ticketId)?.ended).toEqual(ended)
}, HOST_GIT_TIMEOUT_MS)

/** A ready draft whose accept conflicts with the project base: the engine records report=blocked + a question. */
async function conflictedTicket() {
  const root = await gitRepo()
  const h = host()
  seed(h, root)
  h.postMessage({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't1',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const ticketId = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]!.id
  const ticket = h.orchestration.runtime('pp').repo.tickets.get(ticketId)!
  const latest = ticket.assignments.at(-1)!
  const tree = await h.orchestration.prepareReview('pp', ticketId, latest.id)
  expect(tree).toBeDefined()
  writeFileSync(join(tree!.path, 'README'), 'branch\n')
  await exec('git', ['-C', tree!.path, 'add', 'README'])
  await exec('git', ['-C', tree!.path, 'commit', '-m', 'branch'])
  writeFileSync(join(root, 'README'), 'main\n')
  await exec('git', ['-C', root, 'add', 'README'])
  await exec('git', ['-C', root, 'commit', '-m', 'main'])
  const blocked = await h.acceptReview({
    workspaceId: 'ws', projectId: 'pp', ticketId, mode: 'ff',
  })
  return { h, root, ticketId, tree: tree!, blocked }
}

it('conflict on accept blocks with Precisa de você and no half-merge', async () => {
  const { h, blocked } = await conflictedTicket()
  expect(blocked.kind).toBe('blocked')
  expect(blocked.explanation.length).toBeGreaterThan(0)
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]?.stage).toBe('blocked')
}, HOST_GIT_TIMEOUT_MS)

// FLOW-1b: o conflito no Aplicar grava report=blocked com a pergunta REVIEW_CONFLICT_QUESTION; o critério do engine
// (hasPendingDelivery) cobre esse cartão, porque o rascunho segue vivo na worktree e encerrar a Tarefa o apagaria.
vitestIt('FLOW-1b: a conflicted draft cannot be dragged to Concluído', async () => {
  const { h, root, ticketId, tree } = await conflictedTicket()
  const boardScope = { workspaceId: 'ws', projectId: 'pp' }
  const done = h.getProjectBoard(boardScope).workflow.columns.find(column => column.category === 'done')
  if (done === undefined) throw new Error('missing-done-column')
  const pending = h.orchestration.runtime('pp').repo.tickets.get(ticketId)!
  expect(h.getProjectBoard(boardScope).cards.find(card => card.ticketId === ticketId)?.deliveryPending).toBe(true)
  expect(pending.attention).toBeDefined()
  const seatsBefore = h.boards.board.list('pp')
  expect(() => h.moveTicket({ ...boardScope, ticketId, columnId: done.id }))
    .toThrow(expect.objectContaining({ code: 'delivery_pending', isDSHRemoteError: true }))
  expect(h.orchestration.runtime('pp').repo.tickets.get(ticketId)).toEqual(pending)
  expect(h.boards.board.list('pp')).toEqual(seatsBefore)
  expect(readFileSync(join(tree.path, 'README'), 'utf8')).toBe('branch\n')
  expect(readFileSync(join(root, 'README'), 'utf8')).toBe('main\n')
}, HOST_GIT_TIMEOUT_MS)
