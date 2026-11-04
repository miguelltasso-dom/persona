import { looksLikeCredential } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import { readZipTexts } from '../src/export-md.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

it('export of a new project with empty channels does not fail', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.createWorkflowFromTemplate({ workspaceId: 'ws', projectId: 'pp', template: 'site' })
  const closed = h.exportProject({ workspaceId: 'ws', projectId: 'pp', includeDmIds: [] })
  const files = readZipTexts(Buffer.from(closed.base64, 'base64'))
  expect([...files.keys()].some(name => name.endsWith('fluxo.md'))).toBe(true)
  expect([...files.keys()].some(name => name.includes('/canais/'))).toBe(true)
})

it('export excludes DMs by default and redacts credentials', () => {
  const h = host()
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

it('export lists channel subjects and never packs a teach recording', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'nina', name: 'Nina', title: 'Executora',
    description: 'Idle.', personality: 'Calma.', instructions: 'Espere.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.listConversationSubjects({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral' })
  h.startTeachSession({
    workspaceId: 'ws', projectId: 'pp', personaId: 'nina', consentVersion: 'teach-v1',
  })
  const closed = h.exportProject({ workspaceId: 'ws', projectId: 'pp', includeDmIds: [] })
  const files = readZipTexts(Buffer.from(closed.base64, 'base64'))
  const names = [...files.keys()].join('\n')
  const text = [...files.values()].join('\n')
  expect(names).toMatch(/assuntos/)
  expect(text).toMatch(/Geral/)
  expect(names).not.toMatch(/teach|ensinar/i)
  expect(text).not.toMatch(/teach\/nina|\.webm/)
})
