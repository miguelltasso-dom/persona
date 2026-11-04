/** Host persistence and replay of messages waiting for an engine; every runner is injected. */
import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, it, vi } from 'vitest'
import PersonaHost from '../src/index.ts'
import { cachedEngineReadiness } from '../src/engine-readiness.ts'

const scope = { workspaceId: 'ws', projectId: 'pp' }
const contexts: Context[] = []
const homes: string[] = []
const at = '2026-11-04T10:00:00.000Z'
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function open(databasePath: string = ''): PersonaHost {
  const ctx = new Context()
  contexts.push(ctx)
  const h = new PersonaHost(ctx, { databasePath, engineRetryPollMs: 0, remoteTeamPollMs: 0 })
  h.orchestration.now = () => at
  h.orchestration.runnerFactory = vi.fn(async () => createFakeRunner())
  h.orchestration.engineReadinessOf = () => ({ state: 'unavailable', reason: 'none_connected' })
  return h
}

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Equipe', personalProjectId: 'pp' })
  h.createMember({ ...scope, id: 'ana', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({ ...scope, id: 'coord', name: 'Guia', title: 'Coordenação', description: 'Triagem.',
    personality: 'Calma.', instructions: 'Responda.', avatarKind: 'gallery', avatarRef: 'guia',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true, createdBy: 'ana' })
  h.product.updatePersona({ ...h.product.getPersona('coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ ...scope, id: 'geral', name: 'geral', topic: '' })
}

function post(h: PersonaHost, id: string, subjectId: string = 'thread'): void {
  h.postMessage({ ...scope, id, streamKind: 'channel', ownerId: 'geral', actorId: 'ana',
    body: 'preciso de um README no projeto', subjectId, occurredAt: at })
}

it('persists an immediate notice and original message before resolving a runner or creating a Ticket', async () => {
  const h = open()
  seed(h)
  post(h, 'waiting')
  expect(h.events.get('waiting')?.body).toContain('README')
  expect(h.events.get('engine-status:no_engine_ready:waiting')?.type).toBe('no_engine_ready')
  const messages = h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 40 })
  expect(messages.events.find(event => event.type === 'no_engine_ready')?.runError)
    .toMatchObject({ code: 'engine_unavailable', reason: 'none_connected', triggerId: 'waiting' })
  await h.orchestration.flush('pp')
  expect(h.listTasks(scope)).toEqual([])
  expect(h.orchestration.runnerFactory).not.toHaveBeenCalled()
  expect(h.getEngineStatus(scope)).toEqual({ state: 'unavailable', reason: 'none_connected', pending: 1 })
  h.orchestration.runtime('pp').engine.engineUnavailable('waiting', 'none_connected')
  expect(messages.events.filter(event => event.type === 'no_engine_ready')).toHaveLength(1)
}, 60_000)

it('a successful forced connection check releases each retained message once without receive duplication', async () => {
  const h = open()
  seed(h)
  post(h, 'one', 'one')
  post(h, 'two', 'two')
  vi.stubEnv('PERSONA_REAL_CLI', '1')
  h.orchestration.engineReadinessOf = () => cachedEngineReadiness(h.connections.list())
  vi.spyOn(h.connections, 'detect').mockResolvedValue([{ id: 'claude', kind: 'cli', installed: true, loggedIn: true, models: [] }])
  expect((await h.retryEngine(scope)).pending).toBe(0)
  await h.orchestration.flush('pp')
  const tickets = h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets).toHaveLength(1)
  const repo = h.orchestration.runtime('pp').repo
  expect(['one', 'two'].map(id => repo.triggers.disposition(id)?.engineWait?.state)).toEqual(['released', 'released'])
  await h.retryEngine(scope)
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(tickets.length)
  expect(h.orchestration.runtime('pp').engine.pendingEngineTriggers()).toEqual([])
}, 60_000)

it('a cold checking cache also defers routing immediately instead of entering runner resolution', () => {
  const h = open()
  seed(h)
  h.orchestration.engineReadinessOf = () => ({ state: 'checking', reason: null })
  post(h, 'cold-cache')
  expect(h.events.get('engine-status:no_engine_ready:cold-cache')).toBeDefined()
  expect(h.getEngineStatus(scope)).toEqual({ state: 'checking', reason: null, pending: 1 })
  expect(h.listTasks(scope)).toEqual([])
  expect(h.orchestration.runnerFactory).not.toHaveBeenCalled()
}, 60_000)

it('restores deferred messages after restart and requires personal confirmation for an expired head', async () => {
  const home = mkdtempSync(join(tmpdir(), 'persona-engine-wait-'))
  homes.push(home)
  const path = join(home, 'persona.db')
  const first = open(path)
  seed(first)
  post(first, 'expired')
  await contexts.shift()!.fiber.dispose()
  const h = open(path)
  h.orchestration.now = () => '2026-11-06T10:00:00.000Z'
  expect(h.getEngineStatus(scope).pending).toBe(1)
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  expect(h.orchestration.resumeEngineTriggers('pp')).toBe(0)
  expect(h.events.get('engine-status:engine_confirmation_required:expired')).toBeDefined()
  expect(h.listTasks(scope)).toEqual([])
  expect((await h.confirmEngineTrigger({ ...scope, triggerId: 'expired' })).pending).toBe(0)
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1)
  expect(h.orchestration.resumeEngineTriggers('pp', 'expired')).toBe(0)
}, 60_000)

it('dismisses the retained message without losing the human message or running a task', () => {
  const h = open()
  seed(h)
  post(h, 'dismiss')
  expect(h.dismissEngineTrigger({ ...scope, triggerId: 'dismiss' })).toBe(true)
  expect(h.dismissEngineTrigger({ ...scope, triggerId: 'dismiss' })).toBe(false)
  expect(h.events.get('dismiss')).toBeDefined()
  expect(h.getEngineStatus(scope).pending).toBe(0)
  expect(h.orchestration.resumeEngineTriggers('pp')).toBe(0)
  expect(h.listTasks(scope)).toEqual([])
}, 60_000)

it('rechecks while a message waits and stops polling after dismissal', async () => {
  const ctx = new Context()
  contexts.push(ctx)
  const h = new PersonaHost(ctx, { databasePath: '', engineRetryPollMs: 10, remoteTeamPollMs: 0 })
  seed(h)
  h.orchestration.engineReadinessOf = () => ({ state: 'unavailable', reason: 'none_connected' })
  const probe = vi.spyOn(h.connections, 'ready').mockResolvedValue([])
  post(h, 'poll-wait')
  await expect.poll(() => probe.mock.calls.length, { timeout: 2000 }).toBeGreaterThanOrEqual(2)
  h.dismissEngineTrigger({ ...scope, triggerId: 'poll-wait' })
  const count = probe.mock.calls.length
  await new Promise(done => setTimeout(done, 40))
  expect(probe).toHaveBeenCalledTimes(count)
}, 60_000)

it('another member cannot dismiss or confirm the original author’s retained message', async () => {
  const h = open()
  seed(h)
  post(h, 'private-action')
  h.createMember({ ...scope, id: 'bob', displayName: 'Bob', handle: 'bob', role: 'member' })
  h.sessionMemberId = 'bob'
  expect(() => h.dismissEngineTrigger({ ...scope, triggerId: 'private-action' })).toThrow('forbidden')
  // Confirming goes through the same guard (the static ACL check in remote-acl.spec relies on it).
  await expect(h.confirmEngineTrigger({ ...scope, triggerId: 'private-action' })).rejects.toThrow('forbidden')
  h.sessionMemberId = 'ana'
  expect(h.getEngineStatus(scope).pending).toBe(1)
}, 60_000)

it('rejects remote connection and invite before network access when Cofre is unavailable', async () => {
  const h = open()
  seed(h)
  vi.stubEnv('PERSONA_REAL_CLI', '1')
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not access edge'))
  expect(h.getRemoteTeamAvailability(scope)).toEqual({ vault: 'unavailable' })
  await expect(h.connectRemoteTeam({ ...scope, edgeUrl: 'http://127.0.0.1:8791', channelIds: ['geral'] }))
    .rejects.toMatchObject({ code: 'vault-unavailable', isDSHRemoteError: true })
  await expect(h.issueInvite({ ...scope, inviteId: 'no-vault', token: '', role: 'member' }))
    .rejects.toMatchObject({ code: 'vault-unavailable' })
  expect(network).not.toHaveBeenCalled()
  expect(h.getRemoteTeamState(scope)).toBeNull()
}, 60_000)

it('preserves a restored connection and its cursor while the Cofre is unavailable', async () => {
  const h = open()
  seed(h)
  const provider = vi.spyOn(h.remoteTeam.options, 'vault').mockReturnValue({
    availability: 'test', sealInviteToken: async () => undefined, dropInviteToken: async () => undefined,
  })
  const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ member: { actor: { workspaceRole: 'owner' } } }))
  const initial = await h.connectRemoteTeam({ ...scope, edgeUrl: 'http://127.0.0.1:8791', channelIds: ['geral'] })
  provider.mockReturnValue({ availability: 'unavailable', sealInviteToken: async () => undefined, dropInviteToken: async () => undefined })
  const paused = await h.syncRemoteTeam(scope)
  expect(paused).toMatchObject({ status: 'vault_unavailable', errorCode: 'vault-unavailable', cursors: initial.cursors })
  expect(network).toHaveBeenCalledTimes(1)
}, 60_000)
