/** Ordinary folders and existing SQLite projects use private history without a model call. */
import { Context } from '@deepseek-ai/cordis'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, it, vi } from 'vitest'
import PersonaHost from '../src/index.ts'

const contexts: Context[] = []
const homes: string[] = []
const scope = { workspaceId: 'ws', projectId: 'pp' }
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

function profile(path: string): PersonaHost {
  const ctx = new Context()
  contexts.push(ctx)
  const h = new PersonaHost(ctx, { databasePath: path, engineRetryPollMs: 0, remoteTeamPollMs: 0 })
  h.orchestration.now = () => '2026-11-04T12:00:00.000Z'
  return h
}

it('an existing project applies, lists, reopens and undoes a binary file without creating .git in the user folder', async () => {
  const home = mkdtempSync(join(tmpdir(), 'persona-history-host-'))
  homes.push(home)
  vi.stubEnv('PERSONA_HOME', home)
  const root = join(home, 'documents')
  mkdirSync(root)
  const before = Buffer.from([0, 255, 13, 10, 20])
  const after = Buffer.from([3, 99, 0, 250, 50])
  writeFileSync(join(root, 'menu.bin'), before)
  const database = join(home, 'persona.db')
  const h = profile(database)
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ ...scope, id: 'ana', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({ ...scope, id: 'worker', name: 'Bia', title: 'Documentos', description: '', personality: '', instructions: '',
    avatarKind: 'gallery', avatarRef: 'bia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false, createdBy: 'ana' })
  h.product.updatePersona({ ...h.product.getPersona('worker')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ ...scope, id: 'geral', name: 'geral', topic: '' })
  h.setProjectRoot({ ...scope, rootPath: root })
  expect((await h.getProjectStorageUsage(scope)).totalBytes).toBe(0)
  expect(existsSync(join(home, 'history'))).toBe(false)
  h.orchestration.runnerFactory = async () => {
    const runner = createFakeRunner()
    return { ...runner, deliver: async (sessionId, requestId, text, mode) => {
      await runner.deliver(sessionId, requestId, text, mode)
      if (!sessionId.startsWith('worker-')) return
      const directory = h.orchestration.runtime('pp').repo.tickets.list()[0]?.execution?.directory
      if (directory === undefined) throw new Error('draft missing')
      writeFileSync(join(directory, 'menu.bin'), after)
    } }
  }
  h.postMessage({ ...scope, id: 'edit', streamKind: 'channel', ownerId: 'geral', actorId: 'ana',
    body: 'preciso de um README no projeto', subjectId: 'menu', occurredAt: '2026-11-04T12:00:00.000Z' })
  await h.orchestration.flush('pp')
  const ticketId = h.listTasks(scope)[0]!.id
  expect((await h.acceptReview({ ...scope, ticketId, mode: 'ff' })).kind).toBe('merged')
  expect(readFileSync(join(root, 'menu.bin'))).toEqual(after)
  const points = await h.listRestorePoints(scope)
  expect(points.status).toBe('available')
  expect(points.points).toHaveLength(1)
  const point = points.points[0]!
  expect(point).toMatchObject({ ticketId, state: 'available' })
  expect((await h.getProjectStorageUsage(scope)).totalBytes).toBeGreaterThan(0)
  await contexts.shift()!.fiber.dispose()
  const reopened = profile(database)
  expect(reopened.product.getProject('pp')?.rootPath).toBe(root)
  expect(reopened.events.has('edit')).toBe(true)
  expect((await reopened.listRestorePoints(scope)).points).toEqual(points.points)
  expect(await reopened.undoApply({ ...scope, restorePointId: point.id })).toMatchObject({ kind: 'restored' })
  expect(readFileSync(join(root, 'menu.bin'))).toEqual(before)
  expect(existsSync(join(root, '.git'))).toBe(false)
  reopened.createProject({ id: 'other', workspaceId: 'ws', name: 'Outro', description: '' })
  const otherRoot = join(home, 'other-documents')
  mkdirSync(otherRoot)
  reopened.setProjectRoot({ workspaceId: 'ws', projectId: 'other', rootPath: otherRoot })
  await expect(reopened.undoApply({ workspaceId: 'ws', projectId: 'other', restorePointId: point.id }))
    .rejects.toMatchObject({ code: 'not-found' })
}, 90_000)
