/**
 * CONV-1 / D-079 cross-check (Anvil, written independently of conversation-d079.spec.ts): the edges of the invariant "every
 * message of the person gets a reply, a reaction or a visible status line — never silence — and a message only continues a task
 * when that task RUNS in that conversation on the same subject, or the message answers the question the persona asked there".
 * Edges: a burst while a task runs · a DM and a channel at the same moment · a request sent while paused then repeated after
 * /retomar · two tasks asking in the same conversation.
 */
import type { Runner, Ticket } from '@deepseek-ai/dsh-persona-engine'
import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { doneEventId } from '../src/ticket-done.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let serial = 0

function seed(h: PersonaHost): void {
  serial = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', ...scope, name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm',
    canRecruit: false, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.createDm({ id: 'dm-bento', ...scope, participantA: 'ana', participantB: 'p1' })
  h.sessionMemberId = 'ana'
}

type Where = { kind: 'channel' | 'dm'; owner: string }
const CHANNEL: Where = { kind: 'channel', owner: 'geral' }
const DM: Where = { kind: 'dm', owner: 'dm-bento' }

/** Post as the person WITHOUT waiting: bursts and simultaneous sends need to overlap. */
function send(h: PersonaHost, body: string, where: Where = CHANNEL, extra: { replyToId?: string; topicId?: string } = {}): string {
  serial += 1
  const id = `u${String(serial)}`
  h.postMessage({ id, ...scope, streamKind: where.kind, ownerId: where.owner, body, actorId: 'ana', subjectId: '', ...extra })
  return id
}

const eventsOf = (h: PersonaHost, where: Where = CHANNEL) =>
  h.listMessages({ ...scope, streamKind: where.kind, ownerId: where.owner, actorId: 'ana', afterSeq: 0, limit: 200 }).events // 200 is the most the Remote allows

/** What anyone else said ABOUT this message: a line whose id carries it, or a reaction on it. */
function answersTo(h: PersonaHost, id: string, where: Where = CHANNEL): { lines: string[]; reacted: boolean } {
  const events = eventsOf(h, where)
  return {
    lines: events.filter(item => item.actorId !== 'ana' && item.id.includes(id)).map(item => item.body),
    reacted: (events.find(item => item.id === id)?.reactions.length ?? 0) > 0,
  }
}

/** The "Passei para …" lines of one message (it must have exactly one when a running task took it). */
function absorbedLines(h: PersonaHost, id: string, where: Where = CHANNEL): string[] {
  return eventsOf(h, where).filter(item => item.id === `coord-${id}-absorbed`).map(item => item.body)
}

function expectNotSilent(h: PersonaHost, id: string, where: Where = CHANNEL): void {
  const { lines, reacted } = answersTo(h, id, where)
  expect(lines.length > 0 || reacted, `message ${id} met with silence`).toBe(true)
}

function runningRunner(log: string[]): Runner {
  return {
    ensureSession: () => Promise.resolve(),
    deliver: (sessionId, _requestId, text, mode) => { log.push(`${sessionId}|${mode}|${text}`); return Promise.resolve() },
    cancel: () => Promise.resolve(),
    status: () => 'running',
    whenIdle: () => Promise.resolve(),
    onEvent: () => () => undefined,
    capabilities: () => ({ steer: true, removeQueued: true, reportsInputTaken: true, background: false, tools: 'native', resume: true }),
  }
}

/** A task that is running right now on Bento in the channel (turn open, runner reachable). */
function runningTask(h: PersonaHost, log: string[]): void {
  const at = '2026-11-03T14:30:00.000Z'
  const task: Ticket = {
    id: 't-run', title: 'Relatório do dia', decisionId: 'd-run',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 't-run-a1', state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
  }
  h.orchestration.runtime('pp').repo.tickets.save(task)
  h.orchestration.warmRunners.set('pp:p1:task', runningRunner(log))
  h.orchestration.budget.running.set('pp', 1)
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()

it('a burst of three messages while the task runs: each reaches the open turn, in order, with its own visible line', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  runningTask(h, log)
  const ids = [send(h, 'use a cor azul'), send(h, 'e o logotipo no topo'), send(h, 'termine até as cinco')]
  await h.orchestration.flush('pp')
  expect(log).toEqual([
    'worker-t-run|queue|use a cor azul',
    'worker-t-run|queue|e o logotipo no topo',
    'worker-t-run|queue|termine até as cinco',
  ])
  for (const id of ids) {
    expectNotSilent(h, id)
    expect(absorbedLines(h, id)).toEqual(['Passei para Bento: lê assim que terminar o passo atual.']) // one status line each, not zero, not two
  }
  expect(tickets(h)).toHaveLength(1) // all three went into the same task; none became a new one
  expect(new Set(eventsOf(h).map(item => item.id)).size).toBe(eventsOf(h).length) // no id is reused
})

it('a DM and a channel message sent at the same moment never cross, and both are answered', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  runningTask(h, log)
  const inChannel = send(h, 'mais um detalhe do relatório')
  const inDm = send(h, 'Como você está hoje?', DM)
  await h.orchestration.flush('pp')
  expect(log).toEqual(['worker-t-run|queue|mais um detalhe do relatório']) // the DM text never reached the channel's running turn
  expect(absorbedLines(h, inChannel)).toEqual(['Passei para Bento: lê assim que terminar o passo atual.'])
  expectNotSilent(h, inDm, DM)
  expect(eventsOf(h).some(item => item.body.includes('Como você está hoje?'))).toBe(false) // and the DM did not leak into the channel
  expect(tickets(h)).toHaveLength(1)
})

it('a request sent while paused is held, starts exactly once after /retomar, and repeating it is told, not swallowed', async () => {
  const h = host()
  seed(h)
  const WORK = 'Faça a lista de preços novos'
  const pause = send(h, '/pausar')
  await h.orchestration.flush('pp')
  expectNotSilent(h, pause)
  const held = send(h, WORK)
  await h.orchestration.flush('pp')
  expect(answersTo(h, held).lines.join('|')).toMatch(/pausada/i) // said so at once
  expect(tickets(h)).toHaveLength(0) // and nothing started while paused

  const resume = send(h, '/retomar')
  await h.orchestration.flush('pp')
  expectNotSilent(h, resume)
  expect(tickets(h)).toHaveLength(1) // the held request started, once
  expect(tickets(h)[0]?.title ?? '').not.toBe('')

  const again = send(h, WORK)
  await h.orchestration.flush('pp')
  expectNotSilent(h, again) // a repeat is not met with silence...
  expect(tickets(h)).toHaveLength(1) // ...and does not start the same work a second time
})

// D-079 / CONV-2 (corrigido): uma mensagem que o Task em andamento ABSORVEU (`coord-<id>-absorbed`) não recebe também uma resposta de
// CONVERSA. A causa era `recoverTalks` (varredura de recuperação) tratar toda mensagem sem `coord-<id>-reply` como resposta perdida.
it('an absorbed message is not ALSO answered as a chat message (one answer, not two)', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  runningTask(h, log)
  const ids = [send(h, 'use a cor azul'), send(h, 'e o logotipo no topo'), send(h, 'termine até as cinco')]
  await h.orchestration.flush('pp')
  for (const id of ids) {
    expect(answersTo(h, id).lines).toEqual(['Passei para Bento: lê assim que terminar o passo atual.'])
  }
}, 60_000)

/** Two tasks that both asked something in the same channel; returns their ids, the older first. */
async function twoAsking(h: PersonaHost): Promise<{ first: Ticket; second: Ticket }> {
  h.orchestration.liveQuestion = 'Qual cor usamos?'
  send(h, '@Bento Faça o relatório do dia')
  await h.orchestration.flush('pp')
  h.orchestration.liveQuestion = 'Qual o preço do pão?'
  send(h, '@Bento Faça o cardápio')
  await h.orchestration.flush('pp')
  h.orchestration.liveQuestion = undefined
  // The store lists the newest first: tell the two apart by the message that started each, never by position.
  const first = tickets(h).find(row => row.origin.triggerId === 'u1')
  const second = tickets(h).find(row => row.origin.triggerId === 'u2')
  if (first === undefined || second === undefined) throw new Error('two asking tasks expected')
  expect(first.attention?.question).toBe('Qual cor usamos?')
  expect(second.attention?.question).toBe('Qual o preço do pão?')
  return { first, second }
}

it('two tasks asking in the same channel: a reply written ON the second one\'s line answers the second, not the first', async () => {
  const h = host()
  seed(h)
  const { first, second } = await twoAsking(h)
  const answer = send(h, 'R$ 1,10', CHANNEL, { replyToId: doneEventId(second) })
  await h.orchestration.flush('pp')
  expectNotSilent(h, answer)
  const after = (id: string) => h.orchestration.runtime('pp').repo.tickets.get(id)!
  expect(after(second.id).attention).toBeUndefined() // the price went to the task that asked for it
  expect(latestAssignment(after(second.id))?.report?.state).toBe('ready')
  expect(after(first.id).attention?.question).toBe('Qual cor usamos?') // the other one still waits for its own answer
  expect(answersTo(h, answer).lines.join('|')).toContain(second.title)
})

it('two tasks asking, plain words with no reply-to: exactly one is answered, the line names which, the other keeps waiting', async () => {
  const h = host()
  seed(h)
  const { first, second } = await twoAsking(h)
  const answer = send(h, 'Azul')
  await h.orchestration.flush('pp')
  expectNotSilent(h, answer)
  const after = (id: string) => h.orchestration.runtime('pp').repo.tickets.get(id)!
  const answered = [first, second].filter(row => after(row.id).attention === undefined)
  const waiting = [first, second].filter(row => after(row.id).attention !== undefined)
  expect(answered).toHaveLength(1) // never both, never none
  expect(waiting).toHaveLength(1)
  // The person can SEE which task took the answer (its title is in the line), so a wrong guess is visible and fixable.
  expect(answersTo(h, answer).lines.join('|')).toContain(answered[0]?.title ?? '#')
  expect(tickets(h)).toHaveLength(2) // and no third task was invented from it
})
