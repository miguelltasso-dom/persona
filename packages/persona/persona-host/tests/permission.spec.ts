import { expect } from 'vitest'
import {
  assertCliPermission,
  cliPermissionOf,
  permissionFor,
  permissionModeOf,
} from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

const cli = { kind: 'cli' as const, cli: 'claude' as const, model: 'haiku' }
const dsh = { kind: 'dsh' as const, model: 'default' }
const { host } = bindHostFile()

it('CLI talk denies every tool; task allow-once only when files write or safe shell', () => {
  expect(cliPermissionOf('talk', { files: 'write', shell: 'safe' })).toBe('deny')
  expect(cliPermissionOf('task', { files: 'write' })).toBe('allow-once')
  expect(cliPermissionOf('task', { shell: 'safe' })).toBe('allow-once')
  expect(cliPermissionOf('task', { files: 'read' })).toBe('deny')
  expect(cliPermissionOf('task', {})).toBe('deny')
})

it('CLI never resolves prompt — invalid config fails early in pt-BR', () => {
  expect(() => assertCliPermission(cli, 'prompt')).toThrow(/CLI não aceita modo prompt/u)
  expect(() => assertCliPermission(cli, 'deny')).not.toThrow()
  expect(() => assertCliPermission(dsh, 'prompt')).not.toThrow()
})

it('permissionFor uses CLI policy, not autonomy prompt, for CLI specs', () => {
  expect(permissionModeOf('asked')).toBe('prompt')
  expect(permissionFor(cli, 'talk', {}, 'asked')).toBe('deny')
  expect(permissionFor(cli, 'task', { files: 'write' }, 'asked')).toBe('allow-once')
  expect(permissionFor(dsh, 'talk', {}, 'asked')).toBe('prompt')
})

it('ended.report.question becomes Precisa de você and talk never sends prompt', async () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
    tools: { files: 'write' },
  }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  const seen: Array<{ permissionMode?: string; tools?: unknown }> = []
  h.orchestration.runnerFactory = async (request) => {
    seen.push({
      ...(request === undefined ? {} : { permissionMode: request.permissionMode, tools: request.tools }),
    })
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    return createFakeRunner()
  }
  h.orchestration.liveQuestion = 'Qual branch?'
  h.postMessage({
    id: 'm-q', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  expect(seen.some(item => item.permissionMode === 'prompt')).toBe(false)
  expect(seen.some(item => item.tools !== undefined)).toBe(true)
  const page = h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 40,
  })
  expect(page.events.some(item => /Precisa de você: Qual branch/i.test(item.body))).toBe(true)
  expect(h.getOverview({ workspaceId: 'ws', projectId: 'pp' }).needsYou.length).toBeGreaterThan(0)
})
