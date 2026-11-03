import { Context } from '@deepseek-ai/cordis'
import { looksLikeCredential } from '@deepseek-ai/dsh-persona-core'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'
import { readZipTexts } from '../src/export-md.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

it('export excludes DMs by default and redacts credentials', () => {
  const ctx = new Context()
  roots.push(ctx)
  const h = new PersonaHost(ctx)
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.createDm({ id: 'secret-dm', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'coord' })
  h.postMessage({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'token sk-ant-api03-ABCDEFGHIJKLMNOP', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  h.postMessage({
    id: 'm2', workspaceId: 'ws', projectId: 'pp', streamKind: 'dm', ownerId: 'secret-dm',
    body: 'segredo do dm privado', actorId: 'ana', subjectId: 'd',
    occurredAt: '2026-11-03T15:01:00.000Z',
  })
  const closed = h.exportProject({ workspaceId: 'ws', projectId: 'pp', includeDmIds: [] })
  const closedFiles = readZipTexts(Buffer.from(closed.base64, 'base64'))
  const closedText = [...closedFiles.values()].join('\n')
  expect([...closedFiles.keys()].some(name => name.includes('/dms/'))).toBe(false)
  expect(closedText).not.toMatch(/segredo do dm privado/)
  expect(closedText).not.toMatch(/sk-ant/)
  expect(looksLikeCredential(closedText)).toBe(false)
  const open = h.exportProject({ workspaceId: 'ws', projectId: 'pp', includeDmIds: ['secret-dm'] })
  const openFiles = readZipTexts(Buffer.from(open.base64, 'base64'))
  expect([...openFiles.keys()].some(name => name.includes('/dms/'))).toBe(true)
  expect([...openFiles.values()].join('\n')).toMatch(/secret-dm/)
})
