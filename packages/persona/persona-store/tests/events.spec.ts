import { afterEach, expect, it } from 'vitest'
import {
  EventRepos,
  ProductRepos,
  StoreError,
  openPersonaStore,
  openTempStore,
  zonedUtcMs,
  type TempStore,
} from '../src/index.ts'

const temps: TempStore[] = []
let tick = 0
const now = (): string => {
  tick += 1
  return `2026-11-03T15:00:${String(tick).padStart(2, '0')}.000Z`
}

afterEach(async () => {
  tick = 0
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function setup(): Promise<{
  events: EventRepos
  product: ProductRepos
  path: string
}> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  product.createMember({ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
  product.createMember({ id: 'bia', workspaceId: 'ws', displayName: 'Bia', handle: 'bia', role: 'member' })
  product.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral' })
  product.createDm({ id: 'dm-ab', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'bia' })
  return { events: new EventRepos(handle.store, now), product, path: handle.path }
}

function msg(
  events: EventRepos,
  overrides: Partial<Parameters<EventRepos['append']>[0]> = {},
) {
  return events.append({
    id: `e-${tick + 1}`,
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    type: 'message',
    body: 'olá equipe',
    actorId: 'ana',
    subjectId: 'thread-1',
    occurredAt: '2026-11-03T12:00:00.000Z',
    ...overrides,
  })
}

it('assigns monotonic seq per stream', async () => {
  const { events } = await setup()
  expect(msg(events, { id: 'e1' }).seq).toBe(1)
  expect(msg(events, { id: 'e2', body: 'segundo' }).seq).toBe(2)
  expect(msg(events, { id: 'e3', streamKind: 'dm', ownerId: 'dm-ab', body: 'privado' }).seq).toBe(1)
})

it('reopen preserves seq and bodies', async () => {
  const { events, path } = await setup()
  msg(events, { id: 'e1', body: 'keep' })
  events.store.close()
  const again = openPersonaStore({ path })
  temps.push({ store: again, dir: '', path, dispose: async () => { again.close() } })
  const listed = new EventRepos(again, now).list('channel:geral', { id: 'ana' })
  expect(listed.events).toHaveLength(1)
  expect(listed.events[0]?.body).toBe('keep')
  expect(listed.events[0]?.seq).toBe(1)
})

it('pages with an exclusive afterSeq cursor', async () => {
  const { events } = await setup()
  msg(events, { id: 'e1' })
  msg(events, { id: 'e2', body: 'dois' })
  msg(events, { id: 'e3', body: 'três' })
  const page = events.list('channel:geral', { id: 'ana' }, 1, 1)
  expect(page.events.map(item => item.id)).toEqual(['e2'])
  expect(page.nextSeq).toBe(2)
  const rest = events.list('channel:geral', { id: 'ana' }, page.nextSeq, 10)
  expect(rest.events.map(item => item.id)).toEqual(['e3'])
})

it('lists a channel or DM with no stream as empty, not forbidden', async () => {
  const { events } = await setup()
  expect(events.list('channel:geral', { id: 'ana' }).events).toEqual([])
  expect(events.list('dm:dm-ab', { id: 'ana' }).events).toEqual([])
  expect(events.recall({
    streamId: 'channel:geral', actor: { id: 'ana' }, subjectId: 's1', timeZone: 'UTC',
  }).events).toEqual([])
})

it('lets a workspace member read a channel and refuses a stranger', async () => {
  const { events } = await setup()
  msg(events, { id: 'e1' })
  expect(events.list('channel:geral', { id: 'ana' }).events).toHaveLength(1)
  expect(() => {
    events.list('channel:geral', { id: 'eve' })
  }).toThrow(StoreError)
})

it('lets only DM participants read that stream', async () => {
  const { events, product } = await setup()
  product.createMember({ id: 'cia', workspaceId: 'ws', displayName: 'Cia', handle: 'cia', role: 'guest' })
  msg(events, { id: 'e1', streamKind: 'dm', ownerId: 'dm-ab', body: 'segredo' })
  expect(events.list('dm:dm-ab', { id: 'bia' }).events[0]?.body).toBe('segredo')
  expect(() => {
    events.list('dm:dm-ab', { id: 'cia' })
  }).toThrow(StoreError)
})

it('search finds channel text for a member', async () => {
  const { events } = await setup()
  msg(events, { id: 'e1', body: 'deploy na sexta' })
  const hits = events.search('pp', { id: 'ana' }, 'deploy')
  expect(hits.map(item => item.id)).toEqual(['e1'])
})

it('search does not leak a DM to a non-participant', async () => {
  const { events, product } = await setup()
  product.createMember({ id: 'cia', workspaceId: 'ws', displayName: 'Cia', handle: 'cia', role: 'guest' })
  msg(events, { id: 'e1', body: 'canal público token-xyz' })
  msg(events, { id: 'e2', streamKind: 'dm', ownerId: 'dm-ab', body: 'dm token-xyz' })
  const asCia = events.search('pp', { id: 'cia' }, 'token-xyz')
  expect(asCia.map(item => item.id)).toEqual(['e1'])
  const asAna = events.search('pp', { id: 'ana' }, 'token-xyz')
  expect(asAna.map(item => item.id).sort()).toEqual(['e1', 'e2'])
})

it('search returns empty for a blank query or no hits', async () => {
  const { events } = await setup()
  msg(events, { id: 'e1' })
  expect(events.search('pp', { id: 'ana' }, '   ')).toEqual([])
  expect(events.search('pp', { id: 'ana' }, 'zzzz-nope')).toEqual([])
})

it('recall includes an event whose UTC day differs from the local day', async () => {
  const { events } = await setup()
  msg(events, { id: 'e1', occurredAt: '2026-11-03T02:30:00.000Z', subjectId: 's1' })
  const inSp = events.recall({
    streamId: 'channel:geral', actor: { id: 'ana' }, subjectId: 's1',
    timeZone: 'America/Sao_Paulo', since: '2026-11-02', until: '2026-11-02',
  })
  expect(inSp.events.map(item => item.id)).toEqual(['e1'])
  const nextSpDay = events.recall({
    streamId: 'channel:geral', actor: { id: 'ana' }, subjectId: 's1',
    timeZone: 'America/Sao_Paulo', since: '2026-11-03', until: '2026-11-03',
  })
  expect(nextSpDay.events).toEqual([])
  const inUtc = events.recall({
    streamId: 'channel:geral', actor: { id: 'ana' }, subjectId: 's1',
    timeZone: 'UTC', since: '2026-11-03', until: '2026-11-03',
  })
  expect(inUtc.events.map(item => item.id)).toEqual(['e1'])
})

it('recall excludes another subject and respects afterSeq', async () => {
  const { events } = await setup()
  msg(events, { id: 'e1', subjectId: 's1', occurredAt: '2026-11-03T12:00:00.000Z' })
  msg(events, { id: 'e2', subjectId: 's2', occurredAt: '2026-11-03T13:00:00.000Z' })
  msg(events, { id: 'e3', subjectId: 's1', occurredAt: '2026-11-03T14:00:00.000Z' })
  const page = events.recall({
    streamId: 'channel:geral', actor: { id: 'ana' }, subjectId: 's1',
    timeZone: 'UTC', since: '2026-11-03', until: '2026-11-03', afterSeq: 1,
  })
  expect(page.events.map(item => item.id)).toEqual(['e3'])
})

it('tombstone hides the event from list and search', async () => {
  const { events } = await setup()
  msg(events, { id: 'e1', body: 'apagar isto' })
  events.tombstone('e1')
  expect(events.list('channel:geral', { id: 'ana' }).events).toEqual([])
  expect(events.search('pp', { id: 'ana' }, 'apagar')).toEqual([])
})

it('refuses an occurredAt without an explicit offset', async () => {
  const { events } = await setup()
  expect(() => {
    msg(events, { id: 'e1', occurredAt: '2026-11-03T12:00:00' })
  }).toThrow(StoreError)
})

it('two connections assign distinct seq values', async () => {
  const { path } = await setup()
  const a = openPersonaStore({ path })
  const b = openPersonaStore({ path })
  temps.push(
    { store: a, dir: '', path, dispose: async () => { a.close() } },
    { store: b, dir: '', path, dispose: async () => { b.close() } },
  )
  const first = new EventRepos(a, now).append({
    id: 'ea', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    type: 'message', body: 'a', actorId: 'ana', subjectId: 's', occurredAt: '2026-11-03T12:00:00.000Z',
  })
  const second = new EventRepos(b, now).append({
    id: 'eb', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    type: 'message', body: 'b', actorId: 'ana', subjectId: 's', occurredAt: '2026-11-03T12:00:01.000Z',
  })
  expect([first.seq, second.seq].sort()).toEqual([1, 2])
})

it('ensureStream is idempotent', async () => {
  const { events } = await setup()
  const one = events.ensureStream({ workspaceId: 'ws', projectId: 'pp', kind: 'channel', ownerId: 'geral' })
  const two = events.ensureStream({ workspaceId: 'ws', projectId: 'pp', kind: 'channel', ownerId: 'geral' })
  expect(one.id).toBe(two.id)
})

it('channel participation grants read without a member row', async () => {
  const { events, product } = await setup()
  product.createPersona({
    id: 'p1', workspaceId: 'ws', name: 'Bento',
    avatar: { kind: 'gallery', ref: 'bento' },
    title: 'Dev', description: 'd', personality: 'p', instructions: 'i',
    runner: { kind: 'dsh', model: 'm' }, tools: {}, skills: [], limits: {},
    systemRoles: [], canRecruit: false,
    createdAt: '2026-11-03T12:00:00.000Z', updatedAt: '2026-11-03T12:00:00.000Z', createdBy: 'ana',
  }, 'pp')
  product.addParticipation({ personaId: 'p1', projectId: 'pp', kind: 'channel', targetId: 'geral' })
  msg(events, { id: 'e1' })
  expect(events.list('channel:geral', { id: 'p1' }).events).toHaveLength(1)
})

it('zonedUtcMs maps a São Paulo date-only bound', () => {
  const start = zonedUtcMs('2026-11-02', 'America/Sao_Paulo', 'start')
  const end = zonedUtcMs('2026-11-02', 'America/Sao_Paulo', 'end')
  expect(start).toBe(Date.parse('2026-11-02T03:00:00.000Z'))
  expect(end).toBe(Date.parse('2026-11-03T02:59:59.000Z'))
})

it('recall refuses an inverted range', async () => {
  const { events } = await setup()
  msg(events, { id: 'e1' })
  expect(() => {
    events.recall({
      streamId: 'channel:geral', actor: { id: 'ana' }, subjectId: 'thread-1',
      timeZone: 'UTC', since: '2026-11-04', until: '2026-11-03',
    })
  }).toThrow(StoreError)
})

it('refuses an invalid limit', async () => {
  const { events } = await setup()
  expect(() => {
    events.list('channel:geral', { id: 'ana' }, 0, 0)
  }).toThrow(StoreError)
})

it('search ignores events in another project', async () => {
  const { events, product } = await setup()
  const shared = product.createProject({ id: 'app', workspaceId: 'ws', name: 'App' })
  product.createChannel({ id: 'app-geral', workspaceId: 'ws', projectId: shared.id, name: 'geral' })
  msg(events, { id: 'e1', body: 'alpha-only' })
  msg(events, {
    id: 'e2', projectId: shared.id, ownerId: 'app-geral', body: 'alpha-only',
  })
  expect(events.search('pp', { id: 'ana' }, 'alpha-only').map(item => item.id)).toEqual(['e1'])
})

it('list ACL still applies after reopen', async () => {
  const { events, path } = await setup()
  msg(events, { id: 'e1', streamKind: 'dm', ownerId: 'dm-ab', body: 'x' })
  events.store.close()
  const again = openPersonaStore({ path })
  temps.push({ store: again, dir: '', path, dispose: async () => { again.close() } })
  const ev = new EventRepos(again, now)
  expect(() => {
    ev.list('dm:dm-ab', { id: 'eve' })
  }).toThrow(StoreError)
})

it('subscribe receives events after they commit', async () => {
  const { events } = await setup()
  const seen: string[] = []
  const dispose = events.subscribe((event) => {
    seen.push(event.id)
  })
  msg(events, { id: 'e1' })
  expect(seen).toEqual(['e1'])
  dispose()
  msg(events, { id: 'e2', body: 'depois' })
  expect(seen).toEqual(['e1'])
})
