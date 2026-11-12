import type { Runner, Ticket } from '@deepseek-ai/dsh-persona-engine'
import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { postTeamRequest } from '../src/proactivity-wire.ts'
import { doneEventId } from '../src/ticket-done.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * D-079 / CONV-1 — INVARIANT: every message of the person gets a reply, a reaction or a visible status line; never silence.
 * A message only continues a task when the task is RUNNING in that conversation on the same subject, or when it answers the
 * question the persona asked there. Ready, in-review, blocked, failed, finished or other-subject tasks never absorb it.
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let counter = 0

function seed(h: PersonaHost): void {
  counter = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
}

function stream(h: PersonaHost, kind: 'channel' | 'dm' = 'channel', owner = 'geral') {
  return h.listMessages({ ...scope, streamKind: kind, ownerId: owner, actorId: 'ana', afterSeq: 0, limit: 200 }).events
}

/** Post as the person; return what anyone else said back in that conversation after it. */
async function say(h: PersonaHost, body: string, options: { topicId?: string; kind?: 'channel' | 'dm'; owner?: string } = {}) {
  counter += 1
  const id = `u${String(counter)}`
  const kind = options.kind ?? 'channel'
  const owner = options.owner ?? 'geral'
  h.postMessage({
    id, ...scope, streamKind: kind, ownerId: owner, body, actorId: 'ana', subjectId: '',
    ...(options.topicId === undefined ? {} : { topicId: options.topicId }),
  })
  await h.orchestration.flush('pp')
  const events = stream(h, kind, owner)
  const mine = events.findIndex(item => item.id === id)
  const back = events.slice(mine + 1).filter(item => item.actorId !== 'ana')
  return { id, back, lines: back.map(item => item.body) }
}

function runningRunner(log: string[]): Runner {
  return {
    ensureSession: () => Promise.resolve(),
    deliver: (sessionId, _requestId, text, mode) => { log.push(`deliver:${sessionId}:${mode}:${text}`); return Promise.resolve() },
    cancel: () => Promise.resolve(),
    status: () => 'running',
    whenIdle: () => Promise.resolve(),
    onEvent: () => () => undefined,
    capabilities: () => ({ steer: true, removeQueued: true, reportsInputTaken: true, background: false, tools: 'native', resume: true }),
  }
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  const at = '2026-11-03T14:30:00.000Z'
  return {
    id: 't1', title: 'Relatório do dia', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 't1-a1', state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
    ...overrides,
  }
}

/** A task that is running right now on the persona (turn open, runner reachable). */
function openTurn(h: PersonaHost, log: string[], subject = ''): void {
  h.orchestration.runtime('pp').repo.tickets.save(ticket())
  h.orchestration.warmRunners.set('pp:p1:task', runningRunner(log))
  if (subject !== '') h.screens.screens.put('pp', 'ticket_subject', 't1', { subjectId: subject })
  h.orchestration.budget.running.set('pp', 1)
}

const CHAT = 'Como você está hoje?'
const WORK = 'Faça a lista de preços novos'

function expectAnswered(back: readonly { body: string }[], label: string): void {
  expect(back.length, `${label}: silence`).toBeGreaterThan(0)
}

function otherTickets(h: PersonaHost, besides: string): Ticket[] {
  return h.orchestration.runtime('pp').repo.tickets.list().filter(item => item.id !== besides)
}

it('(1) same subject while the task RUNS = a visible continuation delivered to the open turn', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  openTurn(h, log)
  const result = await say(h, 'e use a cor azul também')
  expect(result.lines).toContain('Passei para Bento: lê assim que terminar o passo atual.')
  expect(log).toEqual(['deliver:worker-t1:queue:e use a cor azul também'])
  expect(otherTickets(h, 't1')).toHaveLength(0) // it is the same task, not a new one
})

it('(1b) same subject with colored subjects: only the matching subject continues', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  openTurn(h, log, 'assunto-a')
  const same = await say(h, 'mais um detalhe', { topicId: 'assunto-a' })
  expect(same.lines).toContain('Passei para Bento: lê assim que terminar o passo atual.')
  const other = await say(h, WORK, { topicId: 'assunto-b' })
  expect(other.lines.join('|')).not.toMatch(/Passei para Bento/)
  expectAnswered(other.back, 'other subject')
  expect(log.filter(line => line.includes('worker-t1') && line.includes('mais um detalhe'))).toHaveLength(1)
  expect(log.some(line => line.includes('worker-t1') && line.includes('lista de preços'))).toBe(false) // the other subject never reached the running turn
  expect(otherTickets(h, 't1')).toHaveLength(1) // it became its own task
})

it('(3)+(4) other subject with a task running = reply or task, plus the honest "Estou terminando" line', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  openTurn(h, log, 'assunto-a')
  const chat = await say(h, CHAT, { topicId: 'assunto-b' })
  expect(chat.lines).toContain('Estou terminando “Relatório do dia”; respondo em seguida.')
  expect(chat.back.some(item => item.id === `coord-${chat.id}-reply`)).toBe(true) // and the reply does come
  const work = await say(h, WORK, { topicId: 'assunto-b' })
  expect(work.lines).toContain('Estou terminando “Relatório do dia”; respondo em seguida.')
  expect(otherTickets(h, 't1').length).toBeGreaterThan(0)
  expect(log.some(line => line.includes('worker-t1') && (line.includes('lista de preços') || line.includes('Como você')))).toBe(false) // none of it was pushed into the other subject's running turn
})

it('(2) a plain-words answer to the persona\'s question continues the task: a second turn runs and finishes', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveQuestion = 'Qual cor usamos no relatório?'
  const asked = await say(h, '@Bento Faça o relatório do dia')
  const first = h.orchestration.runtime('pp').repo.tickets.list()[0]
  if (first === undefined) throw new Error('no ticket')
  expect(first.attention?.question).toBe('Qual cor usamos no relatório?')
  expect(asked.lines.join('|')).toMatch(/Precisa de você: Qual cor usamos no relatório\?/)
  h.orchestration.liveQuestion = undefined
  const answer = await say(h, 'Azul')
  await h.orchestration.flush('pp')
  expect(answer.lines).toContain('Resposta enviada para Bento: continua “@Bento Faça o relatório do dia”.')
  const after = h.orchestration.runtime('pp').repo.tickets.get(first.id)
  if (after === undefined) throw new Error('lost ticket')
  expect(after.attention).toBeUndefined()
  expect(after.assignments).toHaveLength(2) // a new Assignment read the answer
  expect(latestAssignment(after)?.report?.state).toBe('ready')
  expect(h.events.has(doneEventId(after))).toBe(true) // and its own done line was posted
  expect(otherTickets(h, first.id)).toHaveLength(0) // not a new task
})

it('an answer written as a command still counts when it is a reply to the line where the persona asked', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveQuestion = 'Qual o preço novo do pão?'
  await say(h, '@Bento Faça o cardápio')
  const first = h.orchestration.runtime('pp').repo.tickets.list()[0]
  if (first === undefined) throw new Error('no ticket')
  h.orchestration.liveQuestion = undefined
  counter += 1
  h.postMessage({
    id: 'u-reply', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'Atualize o pão para R$ 1,10',
    actorId: 'ana', subjectId: '', replyToId: doneEventId(first),
  })
  await h.orchestration.flush('pp')
  const after = h.orchestration.runtime('pp').repo.tickets.get(first.id)
  expect(after?.assignments).toHaveLength(2) // the same task went on with the answer
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1) // not a new one
})

it('the answerAttention Remote wakes the worker too (before, nothing resumed it)', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveQuestion = 'Qual cor usamos?'
  await say(h, '@Bento Faça o relatório do dia')
  const first = h.orchestration.runtime('pp').repo.tickets.list()[0]
  if (first === undefined) throw new Error('no ticket')
  h.orchestration.liveQuestion = undefined
  expect(h.answerAttention({ ...scope, ticketId: first.id, text: 'Azul' })).toBe(true)
  await h.orchestration.flush('pp')
  const after = h.orchestration.runtime('pp').repo.tickets.get(first.id)
  expect(after?.assignments).toHaveLength(2)
  expect(after === undefined ? undefined : latestAssignment(after)?.report?.state).toBe('ready')
})

it('a work request while the persona is waiting for an answer is NEW work, not the answer', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveQuestion = 'Qual cor usamos?'
  await say(h, '@Bento Faça o relatório do dia')
  const first = h.orchestration.runtime('pp').repo.tickets.list()[0]
  if (first === undefined) throw new Error('no ticket')
  h.orchestration.liveQuestion = undefined
  const work = await say(h, WORK)
  expectAnswered(work.back, 'work while waiting')
  expect(otherTickets(h, first.id)).toHaveLength(1)
  expect(h.orchestration.runtime('pp').repo.tickets.get(first.id)?.attention).toBeDefined() // the question still waits
})

/** Every state of the task the person may find open when they write again. */
const STATES = ['ready-in-review', 'blocked', 'failed', 'finished', 'stopped-by-person'] as const

async function arrange(h: PersonaHost, state: (typeof STATES)[number]): Promise<string> {
  const rt = h.orchestration.runtime('pp')
  const at = '2026-11-03T14:30:00.000Z'
  if (state === 'ready-in-review') {
    await say(h, '@Bento Faça o relatório do dia')
    const made = rt.repo.tickets.list()[0]
    if (made === undefined) throw new Error('no ticket')
    expect(made.ended).toBeUndefined() // open, waiting for review
    expect(latestAssignment(made)?.report?.state).toBe('ready')
    return made.id
  }
  if (state === 'finished') {
    await say(h, '@Bento Faça o relatório do dia')
    const made = rt.repo.tickets.list()[0]
    if (made === undefined) throw new Error('no ticket')
    h.orchestration.completeReview('pp', made.id)
    expect(rt.repo.tickets.get(made.id)?.ended).toBeDefined()
    return made.id
  }
  if (state === 'stopped-by-person') {
    rt.repo.tickets.save(ticket())
    rt.engine.stopTicket('t1', 'Parado por você')
    return 't1'
  }
  rt.repo.tickets.save(ticket({
    assignments: [{ id: 't1-a1', state: 'running', createdAt: at, startedAt: at, report: { state, summary: 'caiu', at } }],
    ...(state === 'blocked' ? { attention: { id: 'att', question: 'Sem acesso ao motor.' } } : {}),
  }))
  return 't1'
}

for (const state of STATES) {
  it(`task ${state}: neither a chat line nor a work request is absorbed, swallowed or silent`, async () => {
    const h = host()
    seed(h)
    const id = await arrange(h, state)
    const before = h.orchestration.runtime('pp').repo.tickets.get(id)
    const chat = await say(h, CHAT)
    expectAnswered(chat.back, `${state} / chat`)
    expect(chat.back.some(item => item.id === `coord-${chat.id}-reply`)).toBe(true)
    expect(chat.lines.join('|')).not.toMatch(/Passei para|Resposta enviada/)
    const work = await say(h, WORK)
    expectAnswered(work.back, `${state} / work`)
    expect(work.lines.join('|')).not.toMatch(/Passei para|Resposta enviada/)
    const created = otherTickets(h, id).filter(item => item.title.includes('lista de preços'))
    expect(created, `${state}: the work request must become its own task`).toHaveLength(1)
    const after = h.orchestration.runtime('pp').repo.tickets.get(id)
    expect(after?.ended).toEqual(before?.ended) // a finished or stopped task is never woken by a later message
    expect(after?.assignments).toHaveLength(before?.assignments.length ?? 0)
  })
}

it('in a DM it is the same: a task of another subject running, the message still gets its answer', async () => {
  const h = host()
  seed(h)
  h.createDm({ id: 'dm-ana-p1', ...scope, participantA: 'ana', participantB: 'p1' })
  const log: string[] = []
  openTurn(h, log, 'assunto-a')
  const reply = await say(h, CHAT, { kind: 'dm', owner: 'dm-ana-p1', topicId: 'assunto-b' })
  expectAnswered(reply.back, 'dm')
  expect(log.filter(line => line.includes('worker-t1'))).toEqual([])
})

it('the first delivery stays untouched: its ask is still its own Ticket', async () => {
  const h = host()
  counter = 0
  await h.completeOnboarding({
    workspaceId: 'ws', personalProjectId: 'pp', displayName: 'Ana',
    team: [{
      name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
      avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true,
      systemRoles: ['coordination'],
    }],
    templateIds: [], runnerChoices: [], cofreSeed: 'Padaria da Maria — pães e bolos.',
  })
  await h.orchestration.flush('pp')
  const tickets = h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets.some(item => item.origin.triggerId === 'first-delivery')).toBe(true)
  expect(h.getFirstDelivery(scope).status).toMatch(/working|ready/)
})

// ---- BUG-RT-1 (D-079, integrity): only a PERSON answers a question or continues a turn; the team never answers for her ----

/** Bento asked a question in #geral and waits; a second persona exists to be @-mentioned. */
async function waitingOnAnswer(h: PersonaHost): Promise<Ticket> {
  seed(h)
  h.createPersona({
    id: 'p2', workspaceId: 'ws', projectId: 'pp', name: 'Lia', title: 'Texto', description: 'Escreve.', personality: 'Calma.', instructions: 'Escreva.',
    avatarKind: 'gallery', avatarRef: 'lia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.orchestration.liveQuestion = 'Qual a paleta da marca?'
  await say(h, '@Bento Faça a arte dos 3 posts')
  h.orchestration.liveQuestion = undefined
  const asking = h.orchestration.runtime('pp').repo.tickets.list().find(item => item.attention !== undefined)
  if (asking === undefined) throw new Error('the question never opened')
  return asking
}

/**
 * Carbon P0-13: the scheduler writes INSIDE the host, not through the Remote (a bound session cannot speak as `routine:` or `team:`): for the call, the session is unbound, which is what a
 * host-internal writer is.
 */
function asHost<T>(h: PersonaHost, write: () => T): T {
  const bound = h.sessionMemberId
  h.sessionMemberId = undefined
  try {
    return write()
  } finally {
    h.sessionMemberId = bound
  }
}

/** A message written by the HOST for the team (a routine, the team's initiative or plan), as the scheduler writes it. */
async function systemSays(h: PersonaHost, actorId: string, id: string, body: string): Promise<string[]> {
  asHost(h, () => h.postMessage({ id, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId, subjectId: '' }))
  await h.orchestration.flush('pp')
  const events = stream(h)
  return events.slice(events.findIndex(item => item.id === id) + 1).filter(item => item.actorId !== actorId).map(item => item.body)
}

it('BUG-RT-1: the morning routine (@Lia …) with a question pending is NOT the answer: the question stays open and it is new work', async () => {
  const h = host()
  const asking = await waitingOnAnswer(h)
  const said = await systemSays(h, 'routine:manha', 'routine-run:manha:1', '@Lia Faça um resumo curto da equipe')
  expect(said.join('|')).not.toContain('Resposta enviada')
  expect(h.orchestration.runtime('pp').repo.tickets.get(asking.id)?.attention?.question).toBe('Qual a paleta da marca?') // still waiting on the PERSON
  expect(otherTickets(h, asking.id).some(item => item.execution?.name === 'Lia')).toBe(true) // the routine became Lia's own task
})

it('BUG-RT-1: even plain words from the team (no work verb) are never the answer: routine:, team: and the scheduler\'s own ids', async () => {
  const h = host()
  const asking = await waitingOnAnswer(h)
  for (const [actorId, id] of [['routine:manha', 'x1'], ['team:initiative', 'initiative:run-1'], ['team:plan', 'plan:g1:now'], ['someone-else', 'x4']] as const) {
    const said = await systemSays(h, actorId, id, 'Azul e verde')
    expect(said.join('|'), `${actorId}`).not.toContain('Resposta enviada')
  }
  expect(h.orchestration.runtime('pp').repo.tickets.get(asking.id)?.attention).toBeDefined()
  expect(h.orchestration.runtime('pp').repo.tickets.get(asking.id)?.assignments).toHaveLength(1) // no second turn was ever started for her
})

it('BUG-RT-1: a message of the team never continues a RUNNING turn either: it is its own task, the open turn gets nothing (the continuation by the person is test (1))', async () => {
  const h = host()
  seed(h)
  const log: string[] = []
  openTurn(h, log)
  await systemSays(h, 'routine:manha', 'routine-run:manha:2', '@Bento resuma a semana')
  expect(log.filter(line => line.includes(':worker-t1:') && line.includes('resuma a semana'))).toEqual([]) // nothing went into the open turn
  expect(h.orchestration.runtime('pp').repo.tickets.get('t1')?.inputs).toEqual([]) // and it was not recorded as the person's input
  expect(otherTickets(h, 't1').length).toBeGreaterThan(0) // the routine became new work
})

it('a message of the PERSON still answers: plain words to the asker', async () => {
  const h = host()
  const asking = await waitingOnAnswer(h)
  const toBento = await say(h, '@Bento Azul e verde')
  expect(toBento.lines.join('|')).toContain('Resposta enviada para Bento')
  expect(h.orchestration.runtime('pp').repo.tickets.get(asking.id)?.attention).toBeUndefined()
})

it('a reply written ON the question line answers even when the words name someone else', async () => {
  const h = host()
  const asking = await waitingOnAnswer(h)
  h.postMessage({ id: 'r1', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'Pergunte à @Lia: é azul', actorId: 'ana', subjectId: '', replyToId: doneEventId(asking) })
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.get(asking.id)?.attention).toBeUndefined()
})

it('a message from the person addressed to ANOTHER persona is not the answer to this one: it goes to her', async () => {
  const h = host()
  const asking = await waitingOnAnswer(h)
  const toLia = await say(h, '@Lia como está o texto da campanha?')
  expect(toLia.lines.join('|')).not.toContain('Resposta enviada para Bento')
  expect(h.orchestration.runtime('pp').repo.tickets.get(asking.id)?.attention?.question).toBe('Qual a paleta da marca?')
  expectAnswered(toLia.back, 'a message to Lia')
})

// ---- D-079 · a channel where NOBODY is on the team yet (the installed H2 #4: "Monte sua equipe") ----

function emptyTeam(h: PersonaHost): void {
  counter = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
}
const NOBODY = 'Ainda não há ninguém na equipe para responder. Chame o primeiro colega em “Montar equipe” e escreva de novo.'

it('a thank-you in a channel with NO persona is not silence: one honest line says why, and what to do', async () => {
  const h = host()
  emptyTeam(h)
  const result = await say(h, 'obrigado')
  expect(result.lines).toEqual([NOBODY])
  expect(result.back[0]?.id).toBe(`coord-${result.id}-ignored`)
  await h.orchestration.flush('pp')
  expect(stream(h).filter(item => item.body === NOBODY)).toHaveLength(1) // once, however many times the host looks again
})

it('the team\'s own lines and a DM between two people are not waiting for that answer', async () => {
  const h = host()
  emptyTeam(h)
  h.createMember({ id: 'beto', workspaceId: 'ws', projectId: 'pp', displayName: 'Beto', handle: 'beto', role: 'member' })
  h.createDm({ id: 'dm-ab', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'beto' })
  const dm = await say(h, 'oi, tudo bem?', { kind: 'dm', owner: 'dm-ab' })
  expect(dm.lines).toEqual([])
  asHost(h, () => h.postMessage({ id: 'routine-run:x:1', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'Resumo da manhã', actorId: 'routine:manha', subjectId: '' }))
  await h.orchestration.flush('pp')
  expect(stream(h).filter(item => item.body === NOBODY)).toHaveLength(0)
})

it('as soon as someone is on the team the normal path is back: the same thank-you gets her reaction', async () => {
  const h = host()
  emptyTeam(h)
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  const result = await say(h, 'obrigado')
  expect(result.lines).not.toContain(NOBODY)
  expect(result.back.length + h.events.listReactions(result.id).length).toBeGreaterThan(0)
})

// ---- TEAM-R5: a routine the team writes for a persona is a REQUEST to her, however it is worded ----

it('a routine without a work verb ("@Bento Resumo curto da equipe") is Bento\'s Task, never a chat: no "Olá — em que posso ajudar?"', async () => {
  const h = host()
  seed(h)
  const result = postTeamRequest(h, { id: 'routine-run:manha:9', workspaceId: 'ws', projectId: 'pp', actorId: 'routine:manha', personaId: 'p1', body: '@Bento Resumo curto da equipe', kind: 'routine' })
  await h.orchestration.flush('pp')
  expect(result.ok).toBe(true)
  expect(h.orchestration.runtime('pp').repo.tickets.list().map(item => item.execution?.name)).toEqual(['Bento'])
  expect(stream(h).map(item => item.body).join('|')).not.toContain('Olá — em que posso ajudar?')
})

it('a PERSON\'s words are still read by what they say: "obrigado" is a thank-you, not a Task, even right after a routine', async () => {
  const h = host()
  seed(h)
  postTeamRequest(h, { id: 'routine-run:manha:10', workspaceId: 'ws', projectId: 'pp', actorId: 'routine:manha', personaId: 'p1', body: '@Bento Resumo curto da equipe', kind: 'routine' })
  await h.orchestration.flush('pp')
  const before = h.orchestration.runtime('pp').repo.tickets.list().length
  await say(h, 'obrigado')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(before)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// (restart) Bolt, 07/11: the person's ANSWER (and a colleague's delivery) must reach the worker's prompt even when THIS runtime never launched
// the Task, which is every Task after the app is closed and opened again. The Executor of the host queues only the FIRST start of a Task per
// runtime; for any other the new Assignment's launch was queued and `advanceAssignments` marked the note/answer as delivered before the prompt
// was built, so the worker woke up without it (and asked again, or guessed).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The words each Assignment's launch carried to a runner (what the worker was actually told). */
function launchTexts(h: PersonaHost): string[] {
  const texts: string[] = []
  const original = h.orchestration.runnerFactory
  h.orchestration.runnerFactory = async (request) => {
    const runner: Runner = await original(request)
    const deliver = runner.deliver.bind(runner)
    Object.assign(runner, {
      deliver: (...args: Parameters<Runner['deliver']>): ReturnType<Runner['deliver']> => {
        if (args[1].startsWith('launch:')) texts.push(args[2])
        return deliver(...args)
      },
    })
    return runner
  }
  return texts
}

it('(restart) the person\'s ANSWER reaches the worker even when this runtime never launched the Task (the app was closed and opened again)', async () => {
  const h = host()
  seed(h)
  const texts = launchTexts(h)
  const at = '2026-11-03T14:30:00.000Z'
  // The Task as the database holds it after a restart: it asked and waits; nothing in THIS runtime launched it.
  h.orchestration.runtime('pp').repo.tickets.save(ticket({
    assignments: [{ id: 't1-a1', state: 'running', createdAt: at, startedAt: at, report: { state: 'waiting', summary: 'Qual cor?', at } }],
    attention: { id: 'att-t1', question: 'Qual cor?' },
  }))
  h.orchestration.deliverAttentionAnswer('pp', 't1', 'Use a cor azul', 'msg-answer')
  await h.orchestration.flush('pp')
  expect(texts).toHaveLength(1) // the Task was woken: a new Assignment ran
  expect(texts[0]).toContain('Use a cor azul') // and it was TOLD the answer (before: the prompt was only “Faça o relatório do dia”)
})

it('(restart) a colleague\'s delivery that wakes a waiting Task reaches the worker even when this runtime never launched it', async () => {
  const h = host()
  seed(h)
  const texts = launchTexts(h)
  const at = '2026-11-03T14:30:00.000Z'
  h.orchestration.runtime('pp').repo.tickets.save(ticket({
    assignments: [{ id: 't1-a1', state: 'running', createdAt: at, startedAt: at, report: { state: 'waiting', summary: 'Esperando a Lia', at } }],
  }))
  expect(h.orchestration.wakeTicket('pp', 't1', 'Lia entregou: o texto do cartaz.')).toBe(true)
  await h.orchestration.flush('pp')
  expect(texts).toHaveLength(1)
  expect(texts[0]).toContain('Lia entregou: o texto do cartaz.')
})
