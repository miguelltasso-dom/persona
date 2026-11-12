import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { ProactivityRepos, RoutineRepos } from '@deepseek-ai/dsh-persona-store'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { ProactivityHost } from '../src/proactivity.ts'
import { createProactivityScheduler } from '../src/proactivity-wire.ts'
import { TeamStateBook } from '../src/team-state.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
const queueKey = { ...scope, personaId: 'p1', subjectId: 'geral' }
let clock = Date.parse('2026-11-03T15:00:00.000Z')

function seed(h: PersonaHost): void {
  clock = Date.parse('2026-11-03T15:00:00.000Z')
  h.orchestration.now = () => new Date(clock).toISOString()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
}

function tick(ms: number): void {
  clock += ms
}

/** A worker turn that is open right now. */
function runningRunner(log: string[]): Runner {
  return {
    ensureSession: () => Promise.resolve(),
    deliver: (sessionId, _requestId, text, mode) => { log.push(`deliver:${sessionId}:${mode}:${text}`); return Promise.resolve() },
    cancel: (sessionId, options) => { log.push(`cancel:${sessionId}:${String(options.keepInbox)}`); return Promise.resolve() },
    status: () => 'running',
    whenIdle: () => Promise.resolve(),
    onEvent: () => () => undefined,
    capabilities: () => ({ steer: true, removeQueued: true, reportsInputTaken: true, background: false, tools: 'native', resume: true }),
  }
}

function openTurn(h: PersonaHost, log: string[], id = 't1'): Ticket {
  const at = new Date(clock - 60_000).toISOString()
  const ticket: Ticket = {
    id, title: 'Relatório do dia', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `${id}-a1`, state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
  }
  h.orchestration.runtime('pp').repo.tickets.save(ticket)
  h.orchestration.warmRunners.set('pp:p1:task', runningRunner(log))
  return ticket
}

function geral(h: PersonaHost) {
  return h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
}

it('IV-5 remotes are on the host', () => {
  const names = new Set(remoteMethods(host()).map(item => item.method))
  for (const name of ['steerWorkingTurn', 'stopTurn', 'restoreQueuedMessage', 'flushWorkingQueue', 'enqueueWorkingMessage', 'listWorkingQueue', 'dropQueuedMessage']) {
    expect(names.has(name), name).toBe(true)
  }
})

it('the queue survives a reload and says where each bubble goes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-queue-'))
  const first = host(join(dir, 'persona.db'))
  seed(first)
  const row = first.enqueueWorkingMessage({ ...queueKey, text: 'depois, mande o PDF', streamKind: 'channel', ownerId: 'geral' })
  expect(row).toMatchObject({ text: 'depois, mande o PDF', streamKind: 'channel', ownerId: 'geral' })
  const reopened = host(join(dir, 'persona.db'))
  reopened.sessionMemberId = 'ana'
  expect(reopened.listWorkingQueue(queueKey)).toEqual([row])
})

it('a blank bubble is refused with a typed error', () => {
  const h = host()
  seed(h)
  expect(() => h.enqueueWorkingMessage({ ...queueKey, text: '   ' })).toThrow(/Escreva a mensagem/)
})

it('Mandar agora sends only that bubble; Enviar tudo sends the rest in order; a gone bubble answers not-found', () => {
  const h = host()
  seed(h)
  const a = h.enqueueWorkingMessage({ ...queueKey, text: 'primeira' })
  tick(1_000)
  const b = h.enqueueWorkingMessage({ ...queueKey, text: 'segunda' })
  tick(1_000)
  h.enqueueWorkingMessage({ ...queueKey, text: 'terceira' })
  expect(h.flushWorkingQueue({ ...queueKey, queueItemId: b.id }).map(row => row.text)).toEqual(['segunda'])
  expect(h.listWorkingQueue(queueKey).map(row => row.text)).toEqual(['primeira', 'terceira'])
  expect(() => h.flushWorkingQueue({ ...queueKey, queueItemId: b.id })).toThrow(/já saiu da fila/)
  expect(h.flushWorkingQueue(queueKey).map(row => row.text)).toEqual(['primeira', 'terceira'])
  expect(h.listWorkingQueue(queueKey)).toEqual([])
  const sent = geral(h).filter(message => message.actorId === 'ana').map(message => message.body)
  expect(sent).toEqual(['segunda', 'primeira', 'terceira'])
  expect(a.id).not.toBe(b.id)
})

it('Tirar then Desfazer puts the bubble back in its old place', () => {
  const h = host()
  seed(h)
  const a = h.enqueueWorkingMessage({ ...queueKey, text: 'um' })
  tick(1_000)
  h.enqueueWorkingMessage({ ...queueKey, text: 'dois' })
  const after = h.dropQueuedMessage({ ...queueKey, id: a.id })
  expect(after.map(row => row.text)).toEqual(['dois'])
  expect(() => h.dropQueuedMessage({ ...queueKey, id: a.id })).toThrow(/já saiu da fila/)
  expect(h.restoreQueuedMessage({ ...queueKey, item: a }).map(row => row.text)).toEqual(['um', 'dois'])
  expect(h.restoreQueuedMessage({ ...queueKey, item: a })).toHaveLength(2) // idempotent
})

it('Direcionar agora with no open turn is just a send', async () => {
  const h = host()
  seed(h)
  const view = await h.steerWorkingTurn({ ...queueKey, text: 'mude a cor para azul' })
  expect(view.mode).toBe('sent')
  expect(geral(h).some(message => message.id === view.messageId && message.body === 'mude a cor para azul')).toBe(true)
  expect(geral(h).find(message => message.id === view.messageId)?.steeredPersonaId).toBeUndefined()
})

it('Direcionar agora with an open turn goes into that turn, and the chip survives a reload', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  openTurn(h, log)
  const view = await h.steerWorkingTurn({ ...queueKey, text: 'use a cor azul' })
  expect(view).toMatchObject({ mode: 'steer', ticketId: 't1' })
  expect(log).toEqual(['deliver:worker-t1:steer:use a cor azul'])
  expect(geral(h).find(message => message.id === view.messageId)).toMatchObject({ body: 'use a cor azul', steeredPersonaId: 'p1' })
  await expect(h.steerWorkingTurn({ ...queueKey, text: '  ' })).rejects.toThrow(/Escreva o que quer direcionar/)
})

it('Direcionar agora uses the runner steer and answers without waiting for the turn to end', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  openTurn(h, log)
  const runner: Runner = {
    ...runningRunner(log),
    steer: (sessionId, requestId, text) => { log.push(`steer:${sessionId}:${requestId}:${text}`); return Promise.resolve(true) },
  }
  h.orchestration.warmRunners.set('pp:p1:task', runner)
  const view = await h.steerWorkingTurn({ ...queueKey, text: 'use a cor azul' })
  expect(view).toMatchObject({ mode: 'steer', ticketId: 't1' })
  expect(log).toHaveLength(1)
  expect(log[0]).toMatch(/^steer:worker-t1:steer:p1:/)
  expect(log[0]?.endsWith(':use a cor azul')).toBe(true)
})

it('Direcionar agora falls back to a normal send when the open turn refuses the steer', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  openTurn(h, log)
  const runner: Runner = {
    ...runningRunner(log),
    steer: () => Promise.resolve(false),
  }
  h.orchestration.warmRunners.set('pp:p1:task', runner)
  const view = await h.steerWorkingTurn({ ...queueKey, text: 'use a cor azul' })
  expect(view.mode).toBe('sent')
  expect(geral(h).find(message => message.id === view.messageId)?.steeredPersonaId).toBeUndefined()
})

it('Parar cancels the open turn keeping the queue, ends the task as stopped, and leaves a flagged line', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  openTurn(h, log)
  h.enqueueWorkingMessage({ ...queueKey, text: 'depois mande o PDF' })
  tick(1_000)
  const view = await h.stopTurn({ ...scope, personaId: 'p1', subjectId: 'geral' })
  expect(view.stopped).toBe('ticket')
  expect(view.ticketId).toBe('t1')
  expect(view.line).toBe('Parado. “Relatório do dia” ficou parada; a fila ficou guardada. É só pedir de novo.')
  expect(log).toEqual(['cancel:worker-t1:true'])
  const ticket = h.orchestration.runtime('pp').repo.tickets.get('t1')
  expect(ticket?.ended).toMatchObject({ by: 'human', outcome: 'stopped' })
  expect(h.orchestration.stopped.has('t1')).toBe(true) // the run loop will not report it afterwards
  const line = geral(h).find(message => message.body === view.line)
  expect(line).toMatchObject({ actorId: 'p1', stopped: true, stoppedTicketId: 't1' })
  expect(h.listWorkingQueue(queueKey)).toHaveLength(1) // kept
  const again = await h.stopTurn({ ...scope, personaId: 'p1', subjectId: 'geral' })
  expect(again).toEqual({ stopped: 'none', ticketId: '', line: '' }) // nothing running is not an error
})

it('Parar also cancels a reply in flight (no ticket)', async () => {
  const h = host()
  seed(h)
  const view = await h.stopTurn({ ...scope, personaId: 'p1', eventId: 'm-reply' })
  expect(view.stopped).toBe('reply')
  expect(h.orchestration.cancelled.has('m-reply')).toBe(true)
  expect(view.line).toBe('') // the stopped reply keeps its own bubble; no extra line
})

function liveScheduler(h: PersonaHost) {
  const nowIso = (): string => new Date(clock).toISOString()
  const routines = new RoutineRepos(h.store, nowIso)
  const proactivity = new ProactivityHost(h.product, routines, new ProactivityRepos(h.store, nowIso), h.orchestration, nowIso)
  return createProactivityScheduler({
    product: h.product, events: h.events, routines, proactivity, screens: h.screens.screens, orchestration: h.orchestration,
    boards: h.boards, teamState: new TeamStateBook(h.screens.screens, routines, nowIso), governance: h.governance,
    draftFiles: h.draftFiles, workingControl: h.workingControl,
  }, { nowMs: () => clock, cycleMs: 0 })
}

it('the scheduler sends the queue by itself when the persona is idle, and says so', async () => {
  const h = host()
  seed(h)
  h.enqueueWorkingMessage({ ...queueKey, text: 'quando acabar, mande o PDF' })
  const scheduler = liveScheduler(h)
  await scheduler.cycle()
  expect(h.listWorkingQueue(queueKey)).toEqual([])
  expect(geral(h).some(message => message.actorId === 'ana' && message.body === 'quando acabar, mande o PDF')).toBe(true)
  const audits = h.proactivity.repos.auditsSince('pp', '1970-01-01T00:00:00.000Z').map(row => row.detail)
  expect(audits.some(line => line.startsWith('Enviei 1 mensagem(ns) que estavam na fila'))).toBe(true)
})

it('while the turn is open the queue waits; after Parar it still waits until “Enviar agora” or a new message', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  openTurn(h, log)
  h.enqueueWorkingMessage({ ...queueKey, text: 'depois mande o PDF' })
  const scheduler = liveScheduler(h)
  tick(40_000)
  await scheduler.cycle()
  expect(h.listWorkingQueue(queueKey)).toHaveLength(1) // turn still open: waits
  tick(1_000)
  await h.stopTurn({ ...scope, personaId: 'p1', subjectId: 'geral' })
  tick(60_000)
  await scheduler.cycle()
  expect(h.listWorkingQueue(queueKey)).toHaveLength(1) // queued before Parar: kept
  tick(1_000)
  h.enqueueWorkingMessage({ ...queueKey, text: 'e depois disso, o resumo' })
  const sentBefore = geral(h).filter(message => message.actorId === 'ana').length
  await scheduler.cycle()
  // the older bubble still waits (it was queued before Parar), so the whole queue keeps its order and nothing jumps ahead
  expect(h.listWorkingQueue(queueKey).map(row => row.text)).toEqual(['depois mande o PDF', 'e depois disso, o resumo'])
  expect(geral(h).filter(message => message.actorId === 'ana')).toHaveLength(sentBefore)
  expect(h.flushWorkingQueue(queueKey).map(row => row.text)).toEqual(['depois mande o PDF', 'e depois disso, o resumo'])
})

it('guest and persona sessions cannot steer or stop', async () => {
  const h = host()
  seed(h)
  h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  for (const member of ['gus', 'p1']) {
    h.sessionMemberId = member
    await expect(h.steerWorkingTurn({ ...queueKey, text: 'oi' }), `${member} steer`).rejects.toThrow(/forbidden/)
    await expect(h.stopTurn({ ...scope, personaId: 'p1' }), `${member} stop`).rejects.toThrow(/forbidden/)
  }
})

/** A real run loop whose turn stays open until it is released or cancelled. */
function slowRunner(log: string[], gate: { open: boolean; release: () => void; wait: Promise<void> }): Runner {
  const inner = createFakeRunner()
  return {
    ensureSession: (id, cwd, title, role) => inner.ensureSession(id, cwd, title, role),
    deliver: async (sessionId, requestId, text, mode) => { log.push(`deliver:${mode}:${text.slice(0, 40)}`); await inner.deliver(sessionId, requestId, text, mode) },
    cancel: async (sessionId, options) => { log.push('cancel'); gate.release(); await inner.cancel(sessionId, options) },
    status: sessionId => (gate.open ? 'running' : inner.status(sessionId)),
    whenIdle: async (sessionId) => { await gate.wait; await inner.whenIdle(sessionId) },
    onEvent: listener => inner.onEvent(listener),
    capabilities: () => inner.capabilities(),
  }
}

it('the REAL run loop: steer reaches the open turn, Parar cancels it, and the loop does not report the stopped ticket afterwards', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  let release = (): void => undefined
  const gate = { open: true, release: () => { gate.open = false; release() }, wait: new Promise<void>((resolve) => { release = resolve }) }
  h.orchestration.runnerFactory = () => Promise.resolve(slowRunner(log, gate))
  h.postMessage({ id: 'm1', ...scope, streamKind: 'channel', ownerId: 'geral', body: '@Bento Faça o relatório lento', actorId: 'ana', subjectId: '' })
  const deadline = Date.now() + 10_000
  while (h.orchestration.runningTicketOf('pp', 'p1') === undefined || !log.some(line => line.startsWith('deliver:queue')) ) {
    if (Date.now() > deadline) throw new Error('the turn never opened')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  const turn = h.orchestration.runningTicketOf('pp', 'p1')
  if (turn === undefined) throw new Error('no turn')

  const steered = await h.steerWorkingTurn({ ...queueKey, text: 'prefira tabelas' })
  expect(steered).toMatchObject({ mode: 'steer', ticketId: turn.id })
  expect(log).toContain('deliver:steer:prefira tabelas')

  const stopped = await h.stopTurn({ ...scope, personaId: 'p1', subjectId: 'geral' })
  expect(stopped).toMatchObject({ stopped: 'ticket', ticketId: turn.id })
  expect(log).toContain('cancel')
  await h.orchestration.flush('pp') // the run loop wakes up, sees the stop and leaves the ticket alone
  const ticket = h.orchestration.runtime('pp').repo.tickets.get(turn.id)
  expect(ticket?.ended).toMatchObject({ by: 'human', outcome: 'stopped' })
  expect(h.events.has(`coord-${turn.id}-done`)).toBe(false) // no “Pronto”, no run-error: it was stopped on purpose
  expect(geral(h).some(message => message.body.startsWith('[[run-error'))).toBe(false)
  expect(geral(h).some(message => message.stopped === true && message.stoppedTicketId === turn.id)).toBe(true)
})

it('a queued bubble held for the quota never leaves by itself, but flows with Enviar agora', async () => {
  const h = host()
  seed(h)
  const held = h.enqueueWorkingMessage({ ...queueKey, text: 'quando a cota voltar', reason: 'quota' })
  expect(held.reason).toBe('quota')
  expect(h.listWorkingQueue(queueKey)[0]?.reason).toBe('quota')
  const scheduler = liveScheduler(h)
  await scheduler.cycle()
  expect(h.listWorkingQueue(queueKey)).toHaveLength(1) // idle persona, but the quota is what it waits for
  expect(h.flushWorkingQueue(queueKey)).toHaveLength(1)
  expect(h.listWorkingQueue(queueKey)).toEqual([])
})
