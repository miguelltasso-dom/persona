import { createFakeRunner, RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { SCRIPTED_HELLO } from '../src/orchestration.ts'
import {
  allowsScriptedReplies,
  resolveHostRunner,
  runnerHomeOf,
  type PersonaRunnersSlice,
} from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

afterEach(() => {
  delete process.env.PERSONA_REAL_CLI
})

const { host } = bindHostFile()

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
  }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

function ask(h: PersonaHost, id: string, body: string): void {
  h.postMessage({
    id,
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    body,
    actorId: 'ana',
    subjectId: 't1',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
}

function bodies(h: PersonaHost): string {
  return h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 50,
  }).events.map(item => item.body).join('\n')
}

it('calls resolveRunner without an isolated home by default', async () => {
  const seen: Array<{ home?: string }> = []
  const runners: PersonaRunnersSlice = {
    resolveRunner: async (options) => {
      seen.push({ ...(options.home === undefined ? {} : { home: options.home }) })
      throw new RunnerResolveError('cli_not_found', 'claude')
    },
    createFakeRunner,
  }
  process.env.PERSONA_REAL_CLI = '1'
  expect(runnerHomeOf('pp')).toBe('')
  await expect(resolveHostRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
    permissionMode: 'deny',
    autonomy: 'on_request',
    home: runnerHomeOf('pp'),
    personId: 'coord',
  }, runners)).rejects.toBeInstanceOf(RunnerResolveError)
  expect(seen).toHaveLength(1)
  expect(seen[0]?.home).toBeUndefined()
})

it('never posts fixture strings on the real path', async () => {
  expect(allowsScriptedReplies()).toBe(true)
  const h = host()
  seed(h)
  h.orchestration.scripted = false
  h.orchestration.liveText = ''
  h.orchestration.runnerFactory = async () => createFakeRunner()
  ask(h, 'm-hi', 'oi, tudo bem?')
  await h.orchestration.flush('pp')
  const text = bodies(h)
  expect(text).not.toContain(SCRIPTED_HELLO)
  expect(text).toMatch(/não consegui responder/i)
})

it('turns a streamed OAR login line into Precisa de você, never the raw English', async () => {
  const h = host()
  seed(h)
  h.orchestration.scripted = false
  h.orchestration.liveText = 'Not logged in · Please run /login'
  h.orchestration.runnerFactory = async () => createFakeRunner()
  ask(h, 'm-login', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const text = bodies(h)
  expect(text).not.toMatch(/Not logged in|Please run \/login/u)
  expect(text).toMatch(/\[\[run-error:/u)
  expect(text).toMatch(/"code":"not_logged_in"/u)
  expect(text).toMatch(/"provider":"Claude"/u)
  expect(text).toMatch(/"persona":"Guia"/u)
  expect(h.getOverview({ workspaceId: 'ws', projectId: 'pp' }).needsYou.length).toBeGreaterThan(0)
  expect(h.getOverview({ workspaceId: 'ws', projectId: 'pp' }).needsYou[0]?.title).toMatch(/não está logada|README/i)
})
