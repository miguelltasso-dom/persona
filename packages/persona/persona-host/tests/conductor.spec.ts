import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { coordinationHandoff, summarizeWork } from '../src/orchestration.ts'
import { bindHostFile, resetHost, it } from './host-harness.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
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

it('Coordination handoff is useful and never echoes the person', async () => {
  expect(summarizeWork('preciso de um README no projeto')).toBe('o README')
  expect(summarizeWork('atualiza o changelog')).toBe('o changelog')
  expect(summarizeWork('escreve os docs')).toBe('a documentação')
  expect(summarizeWork('faz o deploy')).toBe('o deploy')
  expect(summarizeWork('roda os testes')).toBe('os testes')
  expect(summarizeWork('corrige o bug do login')).toBe('a correção')
  expect(summarizeWork('faz isso aí por favor')).toBe('este pedido')
  expect(coordinationHandoff({
    body: 'preciso de um README no projeto agora, com badges e CI',
    executorName: 'Bento',
    samePerson: false,
  })).toBe('Bento assume o README. Te chamo na revisão quando estiver pronto.')
  expect(coordinationHandoff({
    body: 'faz isso aí por favor',
    executorName: 'Guia',
    samePerson: true,
  })).toBe('Faço este pedido e te chamo na revisão.')
  expect(coordinationHandoff({
    body: 'preciso de um README no projeto agora, com badges e CI',
    executorName: 'Bento',
    samePerson: false,
  })).not.toContain('preciso de um README')

  const h = host()
  seed(h)
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  const body = 'preciso de um README no projeto'
  ask(h, 'm-nat', body)
  const page = channel(h)
  const coord = page.events.filter(item => item.actorId === 'coord')
  expect(coord.some(item => /Bento assume o README/i.test(item.body))).toBe(true)
  expect(coord.some(item => /revisão/i.test(item.body))).toBe(true)
  expect(coord.every(item => !/Recebido|Vou encaminhar|: recebido\.|digitando/iu.test(item.body))).toBe(true)
  expect(coord.every(item => !item.body.includes(body))).toBe(true)
  ask(h, 'm-hi2', 'oi, tudo bem?')
  await h.orchestration.flush('pp')
  expect(channel(h).events.every(item => item.body !== 'digitando')).toBe(true)
  const afterHi = channel(h).events.filter(item => item.actorId === 'coord')
  expect(afterHi.some(item => /ajudar|olá|oi/i.test(item.body))).toBe(true)
  expect(afterHi.every(item => !item.body.includes('oi, tudo bem?'))).toBe(true)
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
  expect(channel(h).events.some(item => /Claude Code não está conectada/i.test(item.body))).toBe(true)
  expect(JSON.stringify(channel(h).events)).not.toMatch(/Not logged in|Please run|stack|sk-|token/i)
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
  expect(page.events.some(item => item.actorId === 'coord' && /Bento assume o README/i.test(item.body))).toBe(true)
  expect(page.events.every(item => item.actorId !== 'coord' || !/Recebido\. Vou encaminhar|: recebido\.|digitando/iu.test(item.body))).toBe(true)
  expect(page.events.every(item => item.actorId !== 'coord' || !item.body.includes('preciso de um README'))).toBe(true)
  expect(page.events.some(item => item.actorId === 'bento' && /Pronto|Em andamento/i.test(item.body))).toBe(true)
  expect(page.events.some(item => item.type === 'partial' || item.body === '…')).toBe(false)

  resetHost(h)
  seed(h)
  h.postMessage({
    id: 'm-stream', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  expect(channel(h).events.some(item => item.id === 'coord-m-stream-reply' && item.type === 'message')).toBe(true)
  expect(channel(h).events.every(item => item.body !== 'digitando')).toBe(true)

  resetHost(h)
  seed(h)
  h.postMessage({
    id: 'm-cancel', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  h.cancelReply({ workspaceId: 'ws', projectId: 'pp', eventId: 'm-cancel' })
  await h.orchestration.flush('pp')
  expect(channel(h).events.some(item => /cancelada/i.test(item.body))).toBe(true)

  resetHost(h)
  seed(h)
  h.orchestration.runnerFactory = async () => {
    throw new Error('boom')
  }
  h.postMessage({
    id: 'm-fail', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  expect(channel(h).events.some(item => /não consegui responder/i.test(item.body))).toBe(true)
  expect(JSON.stringify(channel(h).events)).not.toMatch(/stack|sk-/i)
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
  }).events.every(item => item.body !== 'digitando')).toBe(true)
  first.store.close()
  const second = host(path)
  await second.orchestration.flush('pp')
  const page = second.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 20,
  })
  expect(page.events.some(item => item.id === 'coord-m-mid-reply')).toBe(true)
})
