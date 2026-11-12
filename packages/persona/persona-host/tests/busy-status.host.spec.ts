import type { Runner, Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { emitRunnerStep } from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Item 7 (colheita): when the owner only asks "como tá indo?", the HOST answers with the real time and the step the turn is on, in one
 * final line (`coord-<id>-status`), with NO model turn: nothing goes into the running turn, nothing is left owed to the recovery sweep.
 * A message that also asks for something, or a plain chat line, keeps its old flow and its old sentence.
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let serial = 0

function seed(h: PersonaHost): void {
  serial = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...scope, displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createPersona({
    id: 'p1', ...scope, name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm',
    canRecruit: false, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.createDm({ id: 'dm-ana', ...scope, participantA: 'ana', participantB: 'p1' })
  h.createDm({ id: 'dm-bia', ...scope, participantA: 'bia', participantB: 'p1' })
  h.sessionMemberId = 'ana'
}

type Where = { kind: 'channel' | 'dm'; owner: string }
const CHANNEL: Where = { kind: 'channel', owner: 'geral' }

function send(h: PersonaHost, body: string, where: Where = CHANNEL, as = 'ana'): string {
  serial += 1
  const id = `u${String(serial)}`
  h.sessionMemberId = as
  h.postMessage({ id, ...scope, streamKind: where.kind, ownerId: where.owner, body, actorId: as, subjectId: '' })
  return id
}

const eventsOf = (h: PersonaHost, where: Where = CHANNEL, as = 'ana') =>
  h.listMessages({ ...scope, streamKind: where.kind, ownerId: where.owner, actorId: as, afterSeq: 0, limit: 200 }).events

const linesAbout = (h: PersonaHost, id: string, where: Where = CHANNEL, as = 'ana'): Array<[string, string]> =>
  eventsOf(h, where, as).filter(item => item.actorId !== as && item.id.includes(id)).map(item => [item.id, item.body])

async function recover(h: PersonaHost): Promise<void> {
  const orchestration = h.orchestration as unknown as { recoverTalks(rt: unknown, projectId: string): Promise<void> }
  await orchestration.recoverTalks(h.orchestration.runtime('pp'), 'pp')
  await h.orchestration.flush('pp')
}

interface Spy {
  readonly runner: Runner
  readonly delivered: string[]
}

function runner(status: 'running' | 'idle' = 'running'): Spy {
  const delivered: string[] = []
  return {
    delivered,
    runner: {
      ensureSession: () => Promise.resolve(),
      deliver: (_session: string, _request: string, text: string) => { delivered.push(text); return Promise.resolve() },
      cancel: () => Promise.resolve(),
      status: () => status,
      whenIdle: () => Promise.resolve(),
      onEvent: () => () => undefined,
      capabilities: () => ({ steer: true, removeQueued: true, reportsInputTaken: true, background: false, tools: 'native', resume: true }),
    },
  }
}

const STARTED = '2026-11-03T14:30:00.000Z' // the rig's clock is 15:00: 30 minutes ago

/** A task running on Bento, asked by Ana in the channel, started 30 minutes ago. `waiting` = it asked Ana something and waits. */
function runningTask(h: PersonaHost, options: { waiting?: boolean; status?: 'running' | 'idle' } = {}): Spy {
  h.orchestration.events.append({
    id: 'm-old', ...scope, streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'faça o relatório do dia', actorId: 'ana',
    subjectId: '', occurredAt: STARTED,
  })
  const task: Ticket = {
    id: 't-run', title: 'Relatório do dia', decisionId: 'd-run',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [],
    assignments: [{
      id: 't-run-a1', state: 'running', createdAt: STARTED, startedAt: STARTED,
      ...(options.waiting === true ? { report: { state: 'waiting' as const, summary: 'Pergunta: qual a cor?', at: STARTED } } : {}),
    }],
    inputs: [], undelivered: [], createdAt: STARTED, updatedAt: STARTED, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
    ...(options.waiting === true ? { attention: { id: 'att-1', question: 'Qual a cor?' } } : {}),
  }
  h.orchestration.runtime('pp').repo.tickets.save(task)
  const spy = runner(options.status ?? 'running')
  h.orchestration.warmRunners.set('pp:p1:task', spy.runner)
  h.orchestration.budget.running.set('pp', 1)
  return spy
}

const ids = (lines: Array<[string, string]>): string[] => lines.map(([lineId]) => lineId)

it('"como tá indo?" is answered by the host with the time and the step, and nothing goes into the turn', async () => {
  const h = host()
  seed(h)
  const spy = runningTask(h)
  emitRunnerStep(spy.runner, 'Read', '2026-11-03T14:58:00.000Z')
  const id = send(h, 'como tá indo?')
  await h.orchestration.flush('pp')
  expect(linesAbout(h, id)).toEqual([[`coord-${id}-status`, 'Estou em “Relatório do dia” há 30 minutos, agora lendo os arquivos. Te aviso quando terminar.']])
  expect(spy.delivered).toEqual([]) // zero tokens: the question never reaches the running turn
  await recover(h)
  expect(ids(linesAbout(h, id))).toEqual([`coord-${id}-status`]) // a final line: the recovery sweep does not answer it again with a model
})

it('the step is not claimed when the turn is not live, and a tool this table cannot say is not named', async () => {
  const h = host()
  seed(h)
  const idle = runningTask(h, { status: 'idle' })
  emitRunnerStep(idle.runner, 'Read', '2026-11-03T14:58:00.000Z')
  const first = send(h, 'Já terminou?')
  await h.orchestration.flush('pp')
  expect(linesAbout(h, first)).toEqual([[`coord-${first}-status`, 'Estou em “Relatório do dia” há 30 minutos. Te aviso quando terminar.']])
  const live = h.orchestration.warmRunners.get('pp:p1:task')!
  h.orchestration.warmRunners.set('pp:p1:task', runner('running').runner)
  emitRunnerStep(h.orchestration.warmRunners.get('pp:p1:task')!, 'mcp__acme__reconcile_ledger', '2026-11-03T14:59:00.000Z')
  const second = send(h, 'status')
  await h.orchestration.flush('pp')
  expect(linesAbout(h, second)).toEqual([[`coord-${second}-status`, 'Estou em “Relatório do dia” há 30 minutos. Te aviso quando terminar.']])
  void live
})

it('a task that waits for the owner says so, and the status question is NOT taken as the answer to her question', async () => {
  const h = host()
  seed(h)
  runningTask(h, { waiting: true })
  const id = send(h, 'como tá indo?')
  await h.orchestration.flush('pp')
  expect(linesAbout(h, id)).toEqual([[`coord-${id}-status`, 'Estou esperando uma resposta em “Relatório do dia”. Te aviso quando terminar.']])
  expect(h.orchestration.runtime('pp').repo.tickets.get('t-run')?.attention?.id).toBe('att-1') // her question is still open
})

it('control: a plain answer to her question IS taken as the answer (the status guard does not break absorption)', async () => {
  const h = host()
  seed(h)
  runningTask(h, { waiting: true })
  const id = send(h, 'azul')
  await h.orchestration.flush('pp')
  expect(ids(linesAbout(h, id))).toEqual([`coord-${id}-absorbed`])
})

it('a message that also asks for something is not a status question: it keeps its old flow and the old sentence', async () => {
  const h = host()
  seed(h)
  const spy = runningTask(h)
  const id = send(h, 'já terminou? troca a cor para azul')
  await h.orchestration.flush('pp')
  expect(ids(linesAbout(h, id))).not.toContain(`coord-${id}-status`)
  expect(spy.delivered).toEqual(['já terminou? troca a cor para azul']) // read by the turn after this step, as before
})

it('a plain chat line keeps the sentence the product always had (and its model reply stays owed)', async () => {
  const h = host()
  seed(h)
  runningTask(h)
  const id = send(h, 'Como você está hoje?', { kind: 'dm', owner: 'dm-ana' })
  await h.orchestration.flush('pp')
  const lines = linesAbout(h, id, { kind: 'dm', owner: 'dm-ana' })
  expect(lines.find(([lineId]) => lineId === `coord-${id}-busy`)?.[1]).toBe('Estou terminando “Relatório do dia”; respondo em seguida.')
  expect(ids(lines)).not.toContain(`coord-${id}-status`)
})

it('the status line of a channel task does not tell another person\'s DM its title (the time still comes)', async () => {
  const h = host()
  seed(h)
  runningTask(h)
  // Bia's DM, stored as the host stores it, then the host's reaction to it (as the "busy" privacy spec does: Bia has no session in this rig).
  const stored = h.orchestration.events.append({
    id: 'bia-1', ...scope, streamKind: 'dm', ownerId: 'dm-bia', type: 'message', body: 'e aí, como tá indo?', actorId: 'bia',
    subjectId: '', occurredAt: '2026-11-03T14:59:00.000Z',
  })
  const answered = (h.orchestration as unknown as { noteBusy(rt: unknown, event: unknown, speaker: unknown): boolean })
    .noteBusy(h.orchestration.runtime('pp'), stored, h.product.getPersona('p1'))
  expect(answered).toBe(true) // the line IS the answer: the caller stops, no model turn
  expect(h.orchestration.events.get('coord-bia-1-status')?.body).toBe('Estou numa tarefa há 30 minutos. Te aviso quando terminar.')
  expect(h.orchestration.events.get('coord-bia-1-busy')).toBeUndefined()
})

it('with nothing running there is no status line: the question is a normal message for the model', async () => {
  const h = host()
  seed(h)
  const id = send(h, 'como tá indo?')
  await h.orchestration.flush('pp')
  expect(ids(linesAbout(h, id))).not.toContain(`coord-${id}-status`)
  expect(ids(linesAbout(h, id))).not.toContain(`coord-${id}-busy`)
})

it('PersonaNowView.sentence carries the step in plain words while she works (and never a tool name)', () => {
  const h = host()
  seed(h)
  const spy = runningTask(h)
  const nowOf = () => h.proactivity.overviewNow('pp').personas.find(item => item.personaId === 'p1')
  expect(nowOf()?.state).toBe('working')
  expect(nowOf()?.sentence).toBeUndefined() // the turn has not called a tool yet: the line stays "Trabalhando"
  emitRunnerStep(spy.runner, 'Read', '2026-11-03T14:58:00.000Z')
  expect(nowOf()?.sentence).toBe('lendo os arquivos')
  emitRunnerStep(spy.runner, 'mcp__acme__reconcile_ledger', '2026-11-03T14:59:00.000Z')
  expect(nowOf()?.sentence).toBeUndefined() // a tool the table cannot say is not named
  emitRunnerStep(spy.runner, 'Bash', '2026-11-03T14:59:30.000Z')
  expect(JSON.stringify(nowOf())).not.toMatch(/Bash|mcp__|reconcile/u)
})

it('PersonaNowView.sentence is absent when the persona waits for the owner or her turn is not live', () => {
  const h = host()
  seed(h)
  const waiting = runningTask(h, { waiting: true })
  emitRunnerStep(waiting.runner, 'Read', '2026-11-03T14:58:00.000Z')
  const nowOf = () => h.proactivity.overviewNow('pp').personas.find(item => item.personaId === 'p1')
  expect(nowOf()?.state).toBe('waiting')
  expect(nowOf()?.sentence).toBeUndefined()
})
