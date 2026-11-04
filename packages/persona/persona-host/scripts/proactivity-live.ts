/**
 * IV-1 proof in a REAL host process: real PersonaHost on a temp SQLite home, real timers, the scheduler the host
 * starts by itself (no VITEST), the scripted runner (PERSONA_SCRIPTED=1 — no model is ever called).
 *
 *   PERSONA_SCRIPTED=1 node --import tsx/esm packages/persona/persona-host/scripts/proactivity-live.ts
 *
 * Phases, each printed with the elapsed seconds:
 *   1. rest: no goal, nothing due ⇒ cycles run, ZERO runner resolves;
 *   2. stranded: a ticket whose first run died is resumed by the team on its own and finishes in #geral;
 *   3. routine: a custom routine on an hourly rule becomes a Ticket the minute it is due;
 *   4. plan: an open goal and an empty queue make Coordenação plan;
 *   5. pause: "Pausar equipe" ⇒ nothing more happens until "Retomar".
 */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ticketGoal, type Runner } from '@deepseek-ai/dsh-persona-engine'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import PersonaHost from '../src/index.ts'
import { emitRunnerPartial } from '../src/runner.ts'

if (process.env.PERSONA_SCRIPTED !== '1') throw new Error('refusing to run: set PERSONA_SCRIPTED=1 (no real model in this proof)')

const home = mkdtempSync(join(tmpdir(), 'persona-proactivity-live-'))
mkdirSync(join(home, 'db'), { recursive: true })
process.env.PERSONA_HOME = home
const started = Date.now()
const stamp = (): string => `${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s`
const say = (line: string): void => { console.log(`[${stamp()}] ${line}`) }
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

const ctx = new Context()
const h = new PersonaHost(ctx, { databasePath: join(home, 'db', 'persona.db'), proactivityCycleMs: 500 })
const scope = { workspaceId: 'ws', projectId: 'pp' }
h.sessionMemberId = 'ana'
h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
for (const [id, name] of [['p1', 'Bento'], ['p2', 'Iris']] as const) {
  h.createPersona({
    id, workspaceId: 'ws', projectId: 'pp', name, title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
}

let resolves = 0
const original = h.orchestration.runnerFactory
h.orchestration.runnerFactory = (request) => {
  resolves += 1
  return original(request)
}

const lines = (): string[] => h.events.listProject('pp').filter(item => item.streamId === 'channel:geral').map(item => `${item.actorId.padEnd(18)} ${item.body}`)
const audits = (): string[] => h.proactivity.repos.auditsSince('pp', '1970-01-01T00:00:00.000Z').filter(row => row.kind.startsWith('sched:')).map(row => `${row.kind} ${row.detail}`)
const tickets = () => h.orchestration.runtime('pp').repo.tickets.list()
async function until(label: string, check: () => boolean, ms: number): Promise<boolean> {
  const limit = Date.now() + ms
  while (Date.now() < limit) {
    if (check()) return true
    await sleep(250)
  }
  say(`TIMEOUT waiting for: ${label}`)
  return false
}

const results: Record<string, boolean> = {}
say(`host up on ${home}; scheduler running=${String(h.getProactivityStatus(scope).running)} cycleMs=${String(h.getProactivityStatus(scope).cycleMs)}`)

// 1. rest — the scheduler arms its first cycle after 5 s; wait for 4 cycles with nothing to do.
await until('first cycles', () => h.getProactivityStatus(scope).lastCycleAt !== '', 15_000)
await sleep(2_500)
say(`phase 1 rest: state=${h.getProactivityStatus(scope).state} runnerResolves=${String(resolves)} tickets=${String(tickets().length)}`)
results.restZeroModelCalls = resolves === 0 && tickets().length === 0 && h.getProactivityStatus(scope).state === 'resting'

// 2. a ticket nobody executes (what a crash or a full slot leaves): open, running, no report, no done line
{
  const at = new Date(Date.now() - 120_000).toISOString()
  h.orchestration.runtime('pp').repo.tickets.save({
    id: 't-stranded', title: 'Relatório do dia', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 't-stranded-a1', state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
  })
}
say('phase 2 stranded: ticket t-stranded is running with nobody executing it; waiting for the team to notice…')
results.resumed = await until('ticket finished by the team', () => {
  const t = tickets().find(item => item.id === 't-stranded')
  return t !== undefined && t.assignments.at(-1)?.report?.state === 'ready'
}, 60_000)
say(`phase 2 done: ready=${String(results.resumed)} runnerResolves=${String(resolves)}`)
if (process.env.LIVE_STOP === '2') {
  for (const line of lines()) say(`  ${line.slice(0, 110)}`)
  await ctx.fiber.dispose()
  process.exit(0)
}

// 3. routine on an hourly rule due at the next minute
const minute = (new Date().getUTCMinutes() + 1) % 60
h.createRoutine({
  ...scope, id: 'r1', name: 'Resumo do dia', rrule: `FREQ=HOURLY;BYMINUTE=${String(minute)}`, timeZone: 'UTC', catchUp: 'run_once',
  silenceStart: '', silenceEnd: '',
})
h.screens.screens.put('pp', 'routine_spec', 'r1', { personaId: 'p2', prompt: 'Resuma o que a equipe entregou hoje.' })
say(`phase 3 routine: due at minute :${String(minute).padStart(2, '0')} UTC; waiting (≤ 75 s)…`)
results.routineRan = await until('routine ticket', () => tickets().some(item => item.execution?.name === 'Iris' && item.assignments.at(-1)?.report?.state === 'ready'), 75_000)
say(`phase 3 done: ran=${String(results.routineRan)} runs=${JSON.stringify(h.routines.listRuns('r1').map(run => run.status))}`)
await sleep(2_000)
results.routineOnce = tickets().filter(item => item.execution?.name === 'Iris').length === 1

// 4. goal + empty queue
h.boards.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
say('phase 4 plan: goal “Site no ar” open, queue empty…')
results.planned = await until('planning ticket', () => tickets().some(item => /Planeje o próximo passo/.test(item.title)), 20_000)
await h.orchestration.flush('pp')
say(`phase 4 done: planned=${String(results.planned)}`)

// 5. pause
h.pauseTeam(scope)
const before = tickets().length
h.boards.goals.save({ ...ticketGoal('sprint-2', 'pp', 'Outro objetivo'), id: 'goal-2' })
await sleep(3_000)
say(`phase 5 pause: paused=${String(h.getTeamState(scope).paused)} state=${h.getProactivityStatus(scope).state} newTickets=${String(tickets().length - before)}`)
results.pausedNothingNew = tickets().length === before && h.getProactivityStatus(scope).state === 'paused'
h.resumeTeam(scope)
results.resumedAfterPause = await until('ticket after Retomar', () => tickets().length > before, 20_000)
await h.orchestration.flush('pp')

// From here on the scheduler is off: phases 6-8 swap the runner by hand and must not race its drives.
h.proactivityScheduler.dispose()

// 6. IV-5: steer an open turn, queue a bubble, Parar, and "Enviar agora" — on a turn that really stays open
{
  const log: string[] = []
  let open = true
  let release = (): void => undefined
  const wait = new Promise<void>((resolve) => { release = resolve })
  const inner = createFakeRunner()
  const slow: Runner = {
    ensureSession: (id, cwd, title, role) => inner.ensureSession(id, cwd, title, role),
    deliver: async (sessionId, requestId, text, mode) => { log.push(`deliver:${mode}:${text.slice(0, 30)}`); await inner.deliver(sessionId, requestId, text, mode) },
    cancel: async (sessionId, options) => { log.push('cancel'); open = false; release(); await inner.cancel(sessionId, options) },
    status: sessionId => (open ? 'running' : inner.status(sessionId)),
    whenIdle: async (sessionId) => { await wait; await inner.whenIdle(sessionId) },
    onEvent: listener => inner.onEvent(listener),
    capabilities: () => inner.capabilities(),
  }
  h.orchestration.warmRunners.clear() // earlier phases left a fast runner warm; this turn must use the slow one
  h.orchestration.runnerFactory = () => Promise.resolve(slow)
  h.postMessage({ id: 'm-slow', ...scope, streamKind: 'channel', ownerId: 'geral', body: '@Bento Faça o relatório lento do mês', actorId: 'ana', subjectId: '' })
  const opened = await until('turn open', () => h.orchestration.runningTicketOf('pp', 'p1') !== undefined && log.some(line => line.startsWith('deliver:queue')), 15_000)
  const turn = h.orchestration.runningTicketOf('pp', 'p1')
  const queueKey = { ...scope, personaId: 'p1', subjectId: 'geral' }
  if (turn !== undefined) {
    const steered = await h.steerWorkingTurn({ ...queueKey, text: 'prefira tabelas' })
    results.steerReachedTurn = opened && steered.mode === 'steer' && log.includes('deliver:steer:prefira tabelas')
    h.enqueueWorkingMessage({ ...queueKey, text: 'depois, mande o PDF' })
    const stop = await h.stopTurn({ ...scope, personaId: 'p1', subjectId: 'geral' })
    await h.orchestration.flush('pp')
    const ended = h.orchestration.runtime('pp').repo.tickets.get(turn.id)?.ended
    results.parar = stop.stopped === 'ticket' && log.includes('cancel') && ended?.by === 'human' && ended.outcome === 'stopped'
    say(`phase 6 IV-5: steer=${String(results.steerReachedTurn)} parar=${String(results.parar)} line="${stop.line}"`)
    await sleep(3_000) // several scheduler cycles: the queue must stay put after Parar
    results.queueKeptAfterParar = h.listWorkingQueue(queueKey).length === 1
    results.enviarAgora = h.flushWorkingQueue(queueKey).length === 1 && h.listWorkingQueue(queueKey).length === 0
    await h.orchestration.flush('pp') // the bubble that just went out is a request of its own: let it run before the runner is swapped
  } else {
    say('TIMEOUT: no open turn for IV-5')
    results.steerReachedTurn = false
  }
}

// 7. streaming: the reply grows as ONE message that followers hear piece by piece, then settles; Parar keeps what was written
{
  h.createDm({ id: 'dm-ana-p1', ...scope, participantA: 'ana', participantB: 'p1' })
  const frames: Array<{ id: string; body: string; streaming: boolean }> = []
  const abort = new AbortController()
  const follow = (async () => {
    for await (const frame of h.followMessages({ ...scope, streamKind: 'dm', ownerId: 'dm-ana-p1', actorId: 'ana', afterSeq: 0, limit: 200 }, abort.signal)) {
      for (const item of frame.events) frames.push({ id: item.id, body: item.body, streaming: item.streaming === true })
    }
  })()
  const turn = (label: string): { runner: Runner; started: () => boolean; finish: () => void } => {
    let open = true
    let began = false
    let release = (): void => undefined
    const wait = new Promise<void>((resolve) => { release = resolve })
    const inner = createFakeRunner()
    const runner: Runner = {
      ensureSession: (id, cwd, title, role) => inner.ensureSession(id, cwd, `${title} (${label})`, role),
      deliver: async (sessionId, requestId, text, mode) => { began = true; await inner.deliver(sessionId, requestId, text, mode) },
      cancel: async (sessionId, options) => { open = false; release(); await inner.cancel(sessionId, options) },
      status: sessionId => (open ? 'running' : inner.status(sessionId)),
      whenIdle: async (sessionId) => { await wait; await inner.whenIdle(sessionId) },
      onEvent: listener => inner.onEvent(listener),
      capabilities: () => inner.capabilities(),
    }
    return { runner, started: () => began, finish: () => { open = false; release() } }
  }
  const first = turn('first')
  h.orchestration.warmRunners.clear()
  h.orchestration.runnerFactory = () => Promise.resolve(first.runner)
  h.postMessage({ id: 'm-talk', ...scope, streamKind: 'dm', ownerId: 'dm-ana-p1', body: 'Me explique o que é o plano da semana', actorId: 'ana', subjectId: '' })
  await until('talk turn open', first.started, 15_000)
  for (const piece of ['Olá', 'Olá, tudo', 'Olá, tudo bem por aqui', 'Olá, tudo bem por aqui. Em que posso ajudar?']) {
    emitRunnerPartial(first.runner, piece)
    await sleep(160) // slower than the 120 ms throttle, so each piece is written
  }
  h.orchestration.liveText = 'Tudo bem por aqui. Em que posso ajudar você hoje?'
  first.finish()
  await h.orchestration.flush('pp')
  await sleep(300)
  const mine = frames.filter(item => item.id === 'coord-m-talk-reply')
  const grew = mine.filter(item => item.streaming).map(item => item.body)
  say(`phase 7 streaming: ${String(mine.length)} upserts of one message; growing bodies=${JSON.stringify(grew)}`)
  results.streamGrew = grew.length >= 3 && grew.every((body, index) => index === 0 || body.length > (grew[index - 1] ?? '').length)
  results.streamSettled = mine.at(-1)?.streaming === false && /Em que posso ajudar você hoje/.test(mine.at(-1)?.body ?? '')
  results.streamOneMessage = frames.filter(item => item.id.startsWith('coord-m-talk-')).every(item => item.id === 'coord-m-talk-reply')

  const second = turn('second')
  h.orchestration.warmRunners.clear()
  h.orchestration.runnerFactory = () => Promise.resolve(second.runner)
  h.postMessage({ id: 'm-talk2', ...scope, streamKind: 'dm', ownerId: 'dm-ana-p1', body: 'Explique o plano em detalhes', actorId: 'ana', subjectId: '' })
  await until('second talk turn open', second.started, 15_000)
  emitRunnerPartial(second.runner, 'Vou explicar em três passos: primeiro')
  await sleep(200)
  const stop = await h.stopTurn({ ...scope, personaId: 'p1', eventId: 'm-talk2' })
  await h.orchestration.flush('pp')
  await sleep(300)
  const stopped = h.events.get('coord-m-talk2-reply')
  results.streamStopKept = stop.stopped === 'reply' && stopped?.body === 'Vou explicar em três passos: primeiro' && stopped.type === 'runner'
  say(`phase 7 Parar: stopped=${stop.stopped} body="${stopped?.body ?? ''}" type=${stopped?.type ?? ''}`)
  abort.abort()
  await follow
}

// 8. D-079: #geral has several tasks open (ready, in review, running...). Chat and work requests must never meet silence.
{
  const before = h.orchestration.runtime('pp').repo.tickets.list().length
  const openNow = h.orchestration.runtime('pp').repo.tickets.list().filter(item => item.ended === undefined).length
  h.orchestration.warmRunners.clear()
  h.orchestration.runnerFactory = () => Promise.resolve(createFakeRunner())
  h.postMessage({ id: 'm-chat', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'Como você está hoje?', actorId: 'ana', subjectId: '' })
  await h.orchestration.flush('pp')
  const chatBack = h.events.listProject('pp').filter(item => item.streamId === 'channel:geral' && item.actorId !== 'ana' && item.id.startsWith('coord-m-chat'))
  h.postMessage({ id: 'm-work', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'Faça a lista de preços novos', actorId: 'ana', subjectId: '' })
  await h.orchestration.flush('pp')
  const geralNow = h.events.listProject('pp').filter(item => item.streamId === 'channel:geral')
  const workAt = geralNow.findIndex(item => item.id === 'm-work')
  const workBack = geralNow.slice(workAt + 1).filter(item => item.actorId !== 'ana')
  const after = h.orchestration.runtime('pp').repo.tickets.list()
  say(`phase 8 D-079: open tasks=${String(openNow)} chat answered by ${chatBack.map(item => item.id).join(',')} · work lines=${workBack.map(item => item.id).join(',')} · new tickets=${String(after.length - before)}`)
  results.chatNeverSilent = chatBack.some(item => item.id === 'coord-m-chat-reply')
  results.workNeverSilent = workBack.length > 0 && after.length - before === 1
}

say('--- #geral ---')
for (const line of lines()) say(`  ${line.slice(0, 110)}`)
say('--- activity (watchdog_audit) ---')
for (const line of audits()) say(`  ${line.slice(0, 140)}`)
say(`--- result ${JSON.stringify(results)}`)
const ok = Object.values(results).every(Boolean)
await ctx.fiber.dispose()
say(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
