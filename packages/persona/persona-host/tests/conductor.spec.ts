import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'

const roots: Context[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => root.fiber.dispose()))
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function host(databasePath = '', clock = '2026-11-03T15:00:00.000Z'): PersonaHost {
  const ctx = new Context()
  roots.push(ctx)
  const created = new PersonaHost(ctx, { databasePath })
  created.orchestration.now = () => clock
  return created
}

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
  }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

function ask(h: PersonaHost, id: string, body: string, at = '2026-11-03T15:00:00.000Z'): void {
  h.postMessage({
    id,
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    body,
    actorId: 'ana',
    subjectId: 't1',
    occurredAt: at,
  })
}

function channel(h: PersonaHost) {
  return h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 50,
  })
}

it('replies on #geral without a ticket when the message is not work', async () => {
  const h = host()
  seed(h)
  ask(h, 'm-hi', 'oi, tudo bem?')
  await h.orchestration.flush('pp')
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })).toEqual([])
  const page = channel(h)
  expect(page.events.some(item => item.actorId === 'coord' && /ajudar/i.test(item.body))).toBe(true)
  expect(h.getOverview({ workspaceId: 'ws', projectId: 'pp' })).toEqual({ needsYou: [], inProgress: [] })
  expect(h.listTriageLog({ workspaceId: 'ws', projectId: 'pp' })[0]?.reason).toBe('answered')
})

it('walks a task doing → review → done and streams the coordination reply', async () => {
  const h = host()
  seed(h)
  ask(h, 'm-task', 'preciso de um README no projeto')
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]?.stage).toBe('doing')
  await h.orchestration.flush('pp')
  const reviewing = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })
  expect(reviewing[0]?.stage).toBe('review')
  expect(h.getOverview({ workspaceId: 'ws', projectId: 'pp' }).needsYou.length).toBeGreaterThan(0)
  const streamed = channel(h)
  expect(streamed.events.some(item => item.actorId === 'coord' && /Pronto/i.test(item.body))).toBe(true)
  expect(streamed.events.every(item => item.subjectId === 't1' || item.actorId === 'coord')).toBe(true)
  const ac = new AbortController()
  const follow = h.followMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 50,
  }, ac.signal)
  const baseline = await follow[Symbol.asyncIterator]().next()
  ac.abort()
  expect(baseline.value?.kind).toBe('baseline')
  expect(baseline.value?.events.some((item: { actorId: string }) => item.actorId === 'coord')).toBe(true)
  h.runTicketCommand({
    workspaceId: 'ws', projectId: 'pp', ticketId: reviewing[0]!.id, command: 'complete', reason: '',
  })
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]?.stage).toBe('done')
})

it('blocks with Precisa de você on the overview and kanban', async () => {
  const h = host()
  seed(h)
  ask(h, 'm-ask', 'aprovar o deploy em staging?')
  await h.orchestration.flush('pp')
  const tasks = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })
  expect(tasks[0]?.stage).toBe('blocked')
  expect(h.getOverview({ workspaceId: 'ws', projectId: 'pp' }).needsYou[0]?.title).toMatch(/deploy/i)
  expect(channel(h).events.some(item => /Precisa de você/i.test(item.body))).toBe(true)
})

it('resumes an interrupted assignment after host restart without duplicating the reply', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-conductor-'))
  dirs.push(dir)
  const path = join(dir, 'persona.db')
  const first = host(path)
  seed(first)
  ask(first, 'm1', 'preciso de um README no projeto')
  expect(first.listTasks({ workspaceId: 'ws', projectId: 'pp' })).toHaveLength(1)
  first.store.close()
  const second = host(path)
  expect(second.orchestration.runtime('pp').recoveryNotes.length).toBeGreaterThan(0)
  await second.orchestration.flush('pp')
  expect(second.listTasks({ workspaceId: 'ws', projectId: 'pp' })).toHaveLength(1)
  const replies = second.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 50,
  }).events.filter(item => item.actorId === 'coord' && /Pronto/i.test(item.body))
  expect(replies).toHaveLength(1)
  await second.orchestration.flush('pp')
  const again = second.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 50,
  }).events.filter(item => item.actorId === 'coord' && /Pronto/i.test(item.body))
  expect(again).toHaveLength(1)
})

it('blocks with Precisa de você when resolveRunner fails login', async () => {
  const h = host()
  seed(h)
  h.orchestration.runnerFactory = async () => {
    throw new RunnerResolveError('not_logged_in', 'claude')
  }
  ask(h, 'm-login', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const overview = h.getOverview({ workspaceId: 'ws', projectId: 'pp' })
  expect(overview.needsYou.length).toBeGreaterThan(0)
  expect(channel(h).events.some(item => /não está logada|claude login/i.test(item.body))).toBe(true)
  expect(JSON.stringify(channel(h).events)).not.toMatch(/stack|sk-|token/i)
})

it('blocks with Precisa de você when resolveRunner reports quota exhausted', async () => {
  const h = host()
  seed(h)
  h.orchestration.runnerFactory = async () => {
    throw new RunnerResolveError('quota_exhausted', 'claude')
  }
  ask(h, 'm-quota', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  expect(h.getOverview({ workspaceId: 'ws', projectId: 'pp' }).needsYou.length).toBeGreaterThan(0)
  expect(channel(h).events.some(item => /Cota de claude esgotada/i.test(item.body))).toBe(true)
})

it('DMs and @mentions reply without a ticket; selector and thread are respected', async () => {
  const h = host()
  seed(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.createDm({ id: 'dm-bento', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'bento' })
  h.postMessage({
    id: 'm-dm', workspaceId: 'ws', projectId: 'pp', streamKind: 'dm', ownerId: 'dm-bento',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 'dm-thread', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })).toEqual([])
  const dm = h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'dm', ownerId: 'dm-bento',
    actorId: 'ana', afterSeq: 0, limit: 20,
  })
  expect(dm.events.some(item => item.actorId === 'bento' && item.subjectId === 'dm-thread')).toBe(true)

  ask(h, 'm-at', 'oi @Bento, tudo bem?')
  await h.orchestration.flush('pp')
  expect(channel(h).events.some(item => item.actorId === 'bento' && item.subjectId === 't1')).toBe(true)

  h.postMessage({
    id: 'm-sel', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 'pick', occurredAt: '2026-11-03T15:01:00.000Z',
    responderId: 'bento',
  })
  await h.orchestration.flush('pp')
  expect(channel(h).events.some(item => item.actorId === 'bento' && item.subjectId === 'pick')).toBe(true)
})

it('handoff posts progress as the executor; streaming goes partial then final; cancel and error do not hang', async () => {
  const h = host()
  seed(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  ask(h, 'm-hand', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const page = channel(h)
  expect(page.events.some(item => item.actorId === 'coord' && /Encaminhei para Bento/i.test(item.body))).toBe(true)
  expect(page.events.some(item => item.actorId === 'bento' && /Pronto|Em andamento/i.test(item.body))).toBe(true)
  expect(page.events.some(item => item.type === 'partial' || item.body === '…')).toBe(false)

  const talk = host()
  seed(talk)
  talk.postMessage({
    id: 'm-stream', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  expect(channel(talk).events.some(item => item.type === 'partial')).toBe(true)
  await talk.orchestration.flush('pp')
  expect(channel(talk).events.some(item => item.id === 'coord-m-stream-reply' && item.type === 'message')).toBe(true)

  const cancel = host()
  seed(cancel)
  cancel.postMessage({
    id: 'm-cancel', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  cancel.cancelReply({ workspaceId: 'ws', projectId: 'pp', eventId: 'm-cancel' })
  await cancel.orchestration.flush('pp')
  expect(channel(cancel).events.some(item => /cancelada/i.test(item.body))).toBe(true)

  const fail = host()
  seed(fail)
  fail.orchestration.runnerFactory = async () => {
    throw new Error('boom')
  }
  fail.postMessage({
    id: 'm-fail', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await fail.orchestration.flush('pp')
  expect(channel(fail).events.some(item => /não consegui responder/i.test(item.body))).toBe(true)
  expect(JSON.stringify(channel(fail).events)).not.toMatch(/stack|sk-/i)
})

it('resumes a partial stream after restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-stream-'))
  dirs.push(dir)
  const path = join(dir, 'persona.db')
  const first = host(path)
  seed(first)
  first.postMessage({
    id: 'm-mid', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  expect(first.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 20,
  }).events.some(item => item.type === 'partial')).toBe(true)
  first.store.close()
  const second = host(path)
  await second.orchestration.flush('pp')
  const page = second.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 20,
  })
  expect(page.events.some(item => item.id === 'coord-m-mid-reply')).toBe(true)
})
