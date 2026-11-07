import { expect } from 'vitest'
import { PERSONA_PROTOCOL } from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

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
  // D-079: a channel with NOBODY on the team still answers the person once, honestly (this test has no persona on purpose).
  expect(page.events.map(item => item.id)).toEqual(['m1', 'coord-m1-ignored'])
  h.sessionMemberId = 'cia'
  expect(h.search({
    workspaceId: 'ws', projectId: 'pp', actorId: 'cia', query: 'token-xyz', limit: 50,
  }).map(item => item.id)).toEqual([])
  h.sessionMemberId = undefined
  expect(h.search({
    workspaceId: 'ws', projectId: 'pp', actorId: 'ana', query: 'token-xyz', limit: 50,
  }).map(item => item.id).sort()).toEqual(['m1', 'm2'])
})

it('followMessages re-sends a message as an upsert when a persona reacts to it on its own', async () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.postMessage({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'obrigado', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T12:00:00.000Z',
  })
  const abort = new AbortController()
  const stream = h.followMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50,
  }, abort.signal)[Symbol.asyncIterator]()
  const baseline = await stream.next()
  // D-079: a channel with NOBODY on the team still answers the person once, honestly (this test has no persona on purpose).
  expect(baseline.value).toMatchObject({ kind: 'baseline', order: ['m1', 'coord-m1-ignored'] })
  // Not a request: the host's own code (the persona's courtesy reaction) writes straight to the log.
  h.events.addReaction({ eventId: 'm1', actorId: 'p1', stickerId: 'heart', projectId: 'pp' })
  const upsert = await stream.next()
  expect(upsert.value).toMatchObject({ kind: 'upsert', order: ['m1'] })
  const view = (upsert.value as { events: Array<{ id: string; reactions: Array<{ stickerId: string }> }> }).events[0]
  expect(view?.reactions.map(item => item.stickerId)).toEqual(['heart'])
  abort.abort()
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
  // D-079: a channel with NOBODY on the team still answers the person once, honestly (this test has no persona on purpose).
  expect(baseline.value).toMatchObject({ kind: 'baseline', order: ['m1', 'coord-m1-ignored'] })
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
