import { afterEach, expect, it } from 'vitest'
import {
  AccountRepos,
  EventRepos,
  ProductRepos,
  TeachRepos,
  TopicRepos,
  openTempStore,
  type TempStore,
} from '../src/index.ts'

const temps: TempStore[] = []
let tick = 0
const now = (): string => {
  tick += 1
  return `2026-11-03T18:00:${String(tick).padStart(2, '0')}.000Z`
}

afterEach(async () => {
  tick = 0
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function setup(): Promise<{
  topics: TopicRepos
  accounts: AccountRepos
  teach: TeachRepos
  events: EventRepos
}> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  product.createMember({ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
  product.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  return {
    topics: new TopicRepos(handle.store, now),
    accounts: new AccountRepos(handle.store, now),
    teach: new TeachRepos(handle.store, now),
    events: new EventRepos(handle.store, now),
  }
}

it('ensures seven topics, renames, archives, and counts unread', async () => {
  const { topics, events } = await setup()
  const list = topics.ensureDefaults({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
  })
  expect(list).toHaveLength(7)
  expect(list[0]?.name).toBe('Geral')
  expect(topics.ensureDefaults({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
  })).toHaveLength(7)
  const ui = list[1]!
  expect(topics.rename(ui.id, 'Interface').name).toBe('Interface')
  const again = topics.archive(ui.id, true)
  expect(again.archived).toBe(true)
  expect(topics.list('pp', 'channel', 'geral').map(item => item.id)).not.toContain(ui.id)

  const geral = list[0]!
  events.append({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    type: 'message', body: 'oi no geral', actorId: 'ana', subjectId: 's', occurredAt: now(),
    topicId: geral.id,
  })
  events.append({
    id: 'm2', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    type: 'message', body: 'ainda nao lida', actorId: 'ana', subjectId: 's', occurredAt: now(),
    topicId: geral.id,
  })
  expect(topics.unreadCount(geral.id, 'ana')).toBe(2)
  topics.markRead(geral.id, 'ana', 1)
  expect(topics.unreadCount(geral.id, 'ana')).toBe(1)
})

it('moves a message between topics and searches inside one topic', async () => {
  const { topics, events } = await setup()
  const [geral, ui] = topics.ensureDefaults({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
  })
  events.append({
    id: 'm-ui', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    type: 'message', body: 'botao lilas', actorId: 'ana', subjectId: 's', occurredAt: now(),
    topicId: geral!.id,
  })
  topics.moveEvent('m-ui', ui!.id)
  expect(events.get('m-ui')?.topicId).toBe(ui!.id)
  expect(events.listTopic('channel:geral', { id: 'ana' }, ui!.id).events.map(item => item.id)).toEqual(['m-ui'])
  expect(events.search('pp', { id: 'ana' }, 'lilas', 10, ui!.id).map(item => item.id)).toEqual(['m-ui'])
  expect(events.search('pp', { id: 'ana' }, 'lilas', 10, geral!.id)).toEqual([])
})

it('stores provider accounts, explicit policy, and usage by account', async () => {
  const { accounts } = await setup()
  const pessoal = accounts.create({
    id: 'acc-1', workspaceId: 'ws', provider: 'claude', label: 'Pessoal', homeDir: 'C:/claude-p',
  })
  const trabalho = accounts.create({
    id: 'acc-2', workspaceId: 'ws', provider: 'claude', label: 'Trabalho',
  })
  expect(accounts.list('ws', 'claude').map(item => item.id)).toEqual(['acc-1', 'acc-2'])
  expect(accounts.update('acc-1', { status: 'limit' }).status).toBe('limit')
  const policy = accounts.putPolicy({
    workspaceId: 'ws', scope: 'persona', scopeId: 'nina', provider: 'claude',
    mode: 'next', accountIds: [pessoal.id, trabalho.id],
  })
  expect(policy.mode).toBe('next')
  expect(accounts.getPolicy('ws', 'claude', 'nina')?.scope).toBe('persona')
  expect(accounts.getPolicy('ws', 'claude')?.scope).toBeUndefined()
  accounts.putPolicy({
    workspaceId: 'ws', scope: 'workspace', scopeId: 'ws', provider: 'claude',
    mode: 'ask', accountIds: [pessoal.id],
  })
  expect(accounts.getPolicy('ws', 'claude')?.mode).toBe('ask')
  expect(accounts.getPolicy('ws', 'claude', 'nina')?.mode).toBe('next')
  accounts.delete('acc-2')
  expect(accounts.get('acc-2')).toBeUndefined()
})

it('keeps a private teach recording and a skill draft that never auto-activates', async () => {
  const { teach } = await setup()
  const rec = teach.create({
    id: 'rec-1', workspaceId: 'ws', projectId: 'pp', personaId: 'nina',
    filename: 'ensinar-nina.webm', hash: 'abc', bytes: 12,
  })
  expect(rec.status).toBe('recording')
  const draft = teach.putDraft('rec-1', 'Clique em Conexões.', '1. Abrir Conexões\n2. Conferir status')
  expect(draft.status).toBe('draft')
  expect(draft.skillDraft).toMatch(/Abrir Conexões/)
  expect(teach.list('pp', 'nina')).toHaveLength(1)
  expect(teach.discard('rec-1').status).toBe('discarded')
  expect(teach.list('pp', 'nina')).toEqual([])
})

it('purges teach recordings older than the retention window', async () => {
  const { teach } = await setup()
  teach.create({
    id: 'rec-old', workspaceId: 'ws', projectId: 'pp', personaId: 'nina',
    filename: 'velha.webm',
  })
  expect(teach.purgeExpired('2026-12-10T00:00:00.000Z', 30).map(item => item.id)).toEqual(['rec-old'])
  expect(teach.get('rec-old')).toBeUndefined()
  teach.create({
    id: 'rec-new', workspaceId: 'ws', projectId: 'pp', personaId: 'nina',
    filename: 'nova.webm',
  })
  expect(teach.purgeExpired('2026-11-03T18:00:10.000Z', 30)).toEqual([])
  expect(teach.get('rec-new')?.filename).toBe('nova.webm')
})
