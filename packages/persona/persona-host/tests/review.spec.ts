import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { confineWorktreeWrite } from '@deepseek-ai/dsh-persona-engine'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
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
}, HOST_GIT_TIMEOUT_MS)

it('conflict on accept blocks with Precisa de você and no half-merge', async () => {
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
  expect(blocked.kind).toBe('blocked')
  expect(blocked.explanation.length).toBeGreaterThan(0)
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]?.stage).toBe('blocked')
}, HOST_GIT_TIMEOUT_MS)
