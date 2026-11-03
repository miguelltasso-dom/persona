import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import PersonaHost, { PERSONA_PROTOCOL } from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

function host(): PersonaHost {
  const ctx = new Context()
  roots.push(ctx)
  return new PersonaHost(ctx)
}

it('answers the liveness probe', () => {
  expect(host().ping()).toEqual({ ok: true, product: 'persona', protocol: PERSONA_PROTOCOL })
})

it('lists real team, projects, channels and DMs from the store', () => {
  const h = host()
  h.product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.product.createMember({ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.product.createPersona({
    id: 'p1', workspaceId: 'ws', name: 'Bento',
    avatar: { kind: 'gallery', ref: 'bento' },
    title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', runner: { kind: 'dsh', model: 'm' },
    tools: {}, skills: [], limits: {}, systemRoles: ['coordination'], canRecruit: true,
    createdAt: '2026-11-03T12:00:00Z', updatedAt: '2026-11-03T12:00:00Z', createdBy: 'ana',
  }, 'pp')
  h.product.createChannel({ id: 'c1', workspaceId: 'ws', projectId: 'pp', name: 'geral' })
  h.product.createDm({ id: 'dm1', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'p1' })
  const scope = { workspaceId: 'ws', projectId: 'pp' }
  expect(h.listProjects(scope).some(item => item.kind === 'personal')).toBe(true)
  expect(h.listTeam(scope).members[0]?.handle).toBe('ana')
  expect(h.listPersonas(scope)[0]?.name).toBe('Bento')
  expect(h.listPersonas(scope)[0]?.systemRoles).toEqual(['coordination'])
  expect(h.listChannels(scope)[0]?.name).toBe('geral')
  expect(h.listDms(scope)[0]?.id).toBe('dm1')
  expect(h.listTasks(scope)).toEqual([])
  expect(h.getOverview(scope)).toEqual({ needsYou: [], inProgress: [] })
})

it('refuses a project that is not in the workspace', () => {
  const h = host()
  h.product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  expect(() => {
    h.listTeam({ workspaceId: 'ws', projectId: 'missing' })
  }).toThrow('project-not-found')
})

it('creates workspace, project, member, persona, channel and participation', () => {
  const h = host()
  const pessoal = h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  expect(pessoal.kind).toBe('personal')
  const shared = h.createProject({ id: 'pr', workspaceId: 'ws', name: 'Alpha', description: 'app' })
  expect(shared.kind).toBe('shared')
  const member = h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  expect(member.handle).toBe('ana')
  const persona = h.createPersona({
    workspaceId: 'ws',
    projectId: 'pp',
    id: 'p1',
    name: 'Bento',
    title: 'Engenharia',
    description: 'Implementa.',
    personality: 'Direto.',
    instructions: 'Prove.',
    avatarKind: 'gallery',
    avatarRef: 'bento',
    runnerKind: 'dsh',
    runnerCli: '',
    runnerModel: 'm',
    canRecruit: true,
    createdBy: 'ana',
  })
  expect(persona.name).toBe('Bento')
  expect(h.addParticipation({
    workspaceId: 'ws', projectId: 'pp', personaId: 'p1', kind: 'project', targetId: 'pp',
  })).toBe(true)
  const channel = h.createChannel({
    id: 'c1', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '',
  })
  expect(channel.name).toBe('geral')
  expect(h.addParticipation({
    workspaceId: 'ws', projectId: 'pp', personaId: 'p1', kind: 'channel', targetId: 'c1',
  })).toBe(true)
  expect(h.removeParticipation({
    workspaceId: 'ws', projectId: 'pp', personaId: 'p1', kind: 'channel', targetId: 'c1',
  })).toBe(true)
})

it('posts, pages and searches messages with DM ACL', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createMember({
    id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member',
  })
  h.createMember({
    id: 'cia', workspaceId: 'ws', projectId: 'pp', displayName: 'Cia', handle: 'cia', role: 'guest',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.createDm({
    id: 'dm-ab', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'bia',
  })
  const channelMsg = h.postMessage({
    id: 'm1',
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    body: 'deploy token-xyz',
    actorId: 'ana',
    subjectId: 't1',
    occurredAt: '2026-11-03T12:00:00.000Z',
  })
  expect(channelMsg.seq).toBe(1)
  h.postMessage({
    id: 'm2',
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'dm',
    ownerId: 'dm-ab',
    body: 'dm token-xyz',
    actorId: 'ana',
    subjectId: 't2',
    occurredAt: '2026-11-03T12:01:00.000Z',
  })
  const page = h.listMessages({
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    actorId: 'ana',
    afterSeq: 0,
    limit: 50,
  })
  expect(page.events.map(item => item.id)).toEqual(['m1'])
  expect(h.search({
    workspaceId: 'ws', projectId: 'pp', actorId: 'cia', query: 'token-xyz', limit: 50,
  }).map(item => item.id)).toEqual(['m1'])
  expect(h.search({
    workspaceId: 'ws', projectId: 'pp', actorId: 'ana', query: 'token-xyz', limit: 50,
  }).map(item => item.id).sort()).toEqual(['m1', 'm2'])
})

it('followMessages yields a baseline then an upsert', async () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.postMessage({
    id: 'm1',
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    body: 'primeiro',
    actorId: 'ana',
    subjectId: 't1',
    occurredAt: '2026-11-03T12:00:00.000Z',
  })
  const abort = new AbortController()
  const stream = h.followMessages({
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    actorId: 'ana',
    afterSeq: 0,
    limit: 50,
  }, abort.signal)[Symbol.asyncIterator]()
  const baseline = await stream.next()
  expect(baseline.value).toMatchObject({ kind: 'baseline', order: ['m1'] })
  h.postMessage({
    id: 'm2',
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    body: 'segundo',
    actorId: 'ana',
    subjectId: 't1',
    occurredAt: '2026-11-03T12:01:00.000Z',
  })
  const upsert = await stream.next()
  expect(upsert.value).toMatchObject({ kind: 'upsert', order: ['m2'] })
  abort.abort()
  await stream.next()
})
