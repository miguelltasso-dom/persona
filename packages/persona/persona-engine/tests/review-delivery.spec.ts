import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import {
  Engine,
  GitReviewDelivery,
  MemoryRepositories,
  PathEscapeError,
  confineWorktreeWrite,
  latestAssignment,
  testsClaimedOf,
} from '../src/index.ts'
import type { Assessor, Candidate, EngineOptions, Executor, Policy, Ticket, Trigger } from '../src/index.ts'

const exec = promisify(execFile)

async function tempRepo(): Promise<{ root: string; trees: string }> {
  const root = await mkdtemp(join(tmpdir(), 'persona-rv-'))
  const trees = join(root, 'worktrees')
  await mkdir(trees, { recursive: true })
  await exec('git', ['init', '-b', 'main', root])
  await exec('git', ['-C', root, 'config', 'user.email', 'forge@persona.test'])
  await exec('git', ['-C', root, 'config', 'user.name', 'Forge'])
  await exec('git', ['-C', root, 'config', 'core.longpaths', 'true'])
  await writeFile(join(root, 'README'), 'base\n')
  await exec('git', ['-C', root, 'add', '.'])
  await exec('git', ['-C', root, 'commit', '-m', 'init'])
  return { root, trees }
}

function trigger(id: string): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: { source: 'chat', id: 'alice' },
    human: true, at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {},
  }
}

function harness() {
  const repo = new MemoryRepositories()
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (c) => { requests.push(c) }, release: () => {} }
  const launches: Array<{ ticketId: string; assignmentId: string }> = []
  const executor: Executor = {
    start: (ticket, assignment) => { launches.push({ ticketId: ticket.id, assignmentId: assignment.id }) },
    deliver: () => {},
    stop: () => {},
  }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const queued: EngineOptions['outbox'] = {
    send: () => {}, status: () => undefined, withdraw: () => {},
  }
  const engine = new Engine({
    repo, assessor, executor, outbox: queued, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => '2026-09-23T00:00:00.000Z',
  })
  return { repo, engine, requests, launches }
}

function accepted(h: ReturnType<typeof harness>): Ticket {
  h.engine.receive(trigger('1'))
  h.engine.evaluateDue()
  const decision = h.engine.decide(h.requests[0]!.triggers[0]!.id, {
    kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested',
  })
  const launched = h.launches.shift()
  if (launched) h.engine.assignmentStarted(launched.ticketId, launched.assignmentId)
  return h.repo.tickets.get(decision.ticketId!)!
}

async function edit(worktree: string, relative: string, body: string): Promise<void> {
  const dest = confineWorktreeWrite(worktree, relative)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, body)
  await exec('git', ['-C', worktree, 'add', relative])
  await exec('git', ['-C', worktree, 'commit', '-m', `edit ${relative}`])
}

it('prepare cria worktree+branch a partir da base e o runner só escreve dentro', async () => {
  const { root, trees } = await tempRepo()
  const delivery = new GitReviewDelivery({ projectRoot: root, worktreesRoot: trees })
  const wt = await delivery.prepare({ id: 'a1', ticketId: 'tick1' })
  expect(wt.branch).toBe('persona/tick1')
  expect(wt.path.startsWith(trees)).toBe(true)
  await edit(wt.path, 'src/app.ts', 'export const ok = 1\n')
  expect(() => confineWorktreeWrite(wt.path, '../escape.ts')).toThrow(PathEscapeError)
  const again = await delivery.prepare({ id: 'a1', ticketId: 'tick1' })
  expect(again.path).toBe(wt.path)
})

it('summary lista arquivos, +/−, patch limitado e redige segredo; testes do relato', async () => {
  const { root, trees } = await tempRepo()
  const delivery = new GitReviewDelivery({
    projectRoot: root, worktreesRoot: trees, patchLimitBytes: 80,
  })
  const wt = await delivery.prepare({ id: 'a1', ticketId: 'tick2' })
  await edit(wt.path, 'note.txt', 'linha\nsk-ant-api03-ABCDEFGHIJKLMNOPQRST\n')
  const ticket: Pick<Ticket, 'id' | 'assignments'> = {
    id: 'tick2',
    assignments: [{
      id: 'a1', state: 'running', createdAt: '2026-09-23T00:00:00.000Z',
      report: { state: 'ready', summary: 'pronto. testes: vitest, lint', at: '2026-09-23T00:00:01.000Z' },
    }],
  }
  const sum = await delivery.summary(ticket)
  expect(sum.files.some(file => file.path === 'note.txt')).toBe(true)
  expect(sum.added).toBeGreaterThan(0)
  expect(sum.patch).not.toContain('sk-ant-api03-ABCDEFGHIJKLMNOPQRST')
  expect(sum.secretsRedacted).toBe(true)
  expect(sum.patchTruncated).toBe(true)
  expect(sum.testsClaimed).toEqual(['vitest', 'lint'])
  expect(testsClaimedOf('testes: a; b')).toEqual(['a', 'b'])
})

it('accept ff integra; conflito aborta o merge e bloqueia com Precisa de você', async () => {
  const { root, trees } = await tempRepo()
  const h = harness()
  const ticket = accepted(h)
  const assignment = latestAssignment(ticket)!
  const delivery = new GitReviewDelivery({
    projectRoot: root, worktreesRoot: trees,
    engine: h.engine,
    ticketOf: id => h.repo.tickets.get(id),
    openTicketIds: () => h.repo.tickets.open().map(row => row.id),
  })
  const wt = await delivery.prepare({ id: assignment.id, ticketId: ticket.id })
  await edit(wt.path, 'README', 'worktree\n')
  const ok = await delivery.accept(ticket, 'ff')
  expect(ok).toEqual({ kind: 'merged', mode: 'ff' })

  const other = await delivery.prepare({ id: 'a2', ticketId: 'other' })
  await writeFile(join(root, 'README'), 'main-change\n')
  await exec('git', ['-C', root, 'add', 'README'])
  await exec('git', ['-C', root, 'commit', '-m', 'main'])
  await edit(other.path, 'README', 'branch-change\n')
  const blocked = await delivery.accept({ id: 'other' }, 'ff')
  expect(blocked.kind).toBe('blocked')
  if (blocked.kind === 'blocked') expect(blocked.explanation.length).toBeGreaterThan(0)
  const mergeHead = await exec('git', ['-C', root, 'rev-parse', '-q', '--verify', 'MERGE_HEAD']).catch(() => ({ stdout: '' }))
  expect(mergeHead.stdout.trim()).toBe('')
})

it('requestChanges reatribui com feedback e não muda o Mandate', async () => {
  const { root, trees } = await tempRepo()
  const h = harness()
  const ticket = accepted(h)
  const scope = ticket.mandate.scope
  const delivery = new GitReviewDelivery({
    projectRoot: root, worktreesRoot: trees,
    engine: h.engine,
    ticketOf: id => h.repo.tickets.get(id),
  })
  await delivery.requestChanges(ticket, 'Ajusta o título. Não abra a empresa inteira neste Mandate.')
  const after = h.repo.tickets.get(ticket.id)!
  expect(after.mandate.scope).toBe(scope)
  expect(after.inputs.some(input => input.kind === 'note' && input.text.includes('Ajusta o título'))).toBe(true)
  expect(after.assignments.length).toBeGreaterThan(1)
})

it('discard remove worktree+branch; sweepOrphans faxina na retomada', async () => {
  const { root, trees } = await tempRepo()
  const delivery = new GitReviewDelivery({
    projectRoot: root, worktreesRoot: trees, openTicketIds: () => [],
  })
  const wt = await delivery.prepare({ id: 'a1', ticketId: 'gone' })
  await delivery.discard({ id: 'gone' })
  const list = await exec('git', ['-C', root, 'worktree', 'list'])
  expect(list.stdout).not.toContain(wt.path)

  await delivery.prepare({ id: 'a2', ticketId: 'orphan' })
  const swept = await delivery.sweepOrphans()
  expect(swept).toContain('orphan')
})

it('aceita squash sem push e respeita caminho longo + CRLF no worktree', async () => {
  const { root, trees } = await tempRepo()
  const delivery = new GitReviewDelivery({ projectRoot: root, worktreesRoot: trees })
  const wt = await delivery.prepare({ id: 'a1', ticketId: 'long1' })
  const nested = join('docs', 'a'.repeat(40), 'b'.repeat(40), 'readme.txt')
  await edit(wt.path, nested, 'linha um\r\nlinha dois\r\n')
  const result = await delivery.accept({ id: 'long1' }, 'squash')
  expect(result.kind).toBe('merged')
})
