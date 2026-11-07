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
import { createFakeRunner, createMcpGateway } from '@deepseek-ai/dsh-persona-runners'
import PersonaHost from '../src/index.ts'
import { emitRunnerPartial } from '../src/runner.ts'
import { harnessMcpPorts } from '../src/harness-dispatch.ts'
import { productToolsOpener } from '../src/harness-turn.ts'
import { ASK_TOOL, createAskTool } from '../src/persona-ask-tool.ts'

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

// This proof is about the scheduler, the conversation and the tools — not about the review step (it has its own proof): with the review on, its Tasks
// run beside these phases, take the one-shot `liveText` hook before the reply that waits for it, and add a Task the counts below do not expect.
h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })

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

// 9. IV-6 (/lado, /resumo) and CONV-2 (the recovery sweep never adds a second answer): nothing lands in the conversation.
{
  const geral = (): string[] => h.events.listProject('pp').filter(item => item.streamId === 'channel:geral').map(item => item.id)
  const key = { ...scope, personaId: 'p1', subjectId: 'geral' }
  h.orchestration.warmRunners.clear()
  h.orchestration.runnerFactory = () => Promise.resolve(createFakeRunner())
  const before = geral()
  const asked = h.openAsideAsk({ ...key, question: 'quanto falta para terminar?' })
  const askedAtOnce = asked.status === 'asking' && !asked.onThread
  await h.asides.whenIdle()
  const answered = h.getAsideAsk({ ...scope, id: asked.id })
  const summary = h.summarizeConversation({ ...key, streamKind: 'channel', ownerId: 'geral' })
  await h.asides.whenIdle()
  const summarised = h.getAsideAsk({ ...scope, id: summary.id })
  await (h.orchestration as unknown as { recoverTalks(rt: unknown, projectId: string): Promise<void> }).recoverTalks(h.orchestration.runtime('pp'), 'pp')
  await h.orchestration.flush('pp')
  const after = geral()
  say(`phase 9 IV-6/CONV-2: /lado ${answered.status} "${(answered.answer ?? '').slice(0, 40)}" · /resumo ${summarised.status} · #geral lines before=${String(before.length)} after=${String(after.length)}${after.length === before.length ? '' : ` NEW=${after.filter(id => !before.includes(id)).join(',')}`}`)
  results.asideAnswered = askedAtOnce && answered.status === 'answered' && (answered.answer ?? '') !== ''
  results.summaryAnswered = summarised.status === 'answered' && (summarised.answer ?? '') !== ''
  results.asideOffThread = after.length === before.length // /lado, /resumo and the recovery sweep wrote nothing in the conversation
}

// 10. CV-8 (flag on): ONE message to the whole team is answered by a block of typed lines, one per persona, and the recovery sweep adds nothing.
{
  h.orchestration.fanoutEnabled = true
  h.orchestration.warmRunners.clear()
  h.orchestration.runnerFactory = () => Promise.resolve(createFakeRunner())
  const team = h.product.listPersonas('pp').length
  h.postMessage({ id: 'm-fan', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'Como a equipe está hoje?', actorId: 'ana', subjectId: '', fanout: 'everyone' })
  await h.orchestration.flush('pp')
  await (h.orchestration as unknown as { recoverTalks(rt: unknown, projectId: string): Promise<void> }).recoverTalks(h.orchestration.runtime('pp'), 'pp')
  await h.orchestration.flush('pp')
  const block = h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
    .filter(item => item.id.startsWith('coord-m-fan-fan-'))
  const single = h.events.has('coord-m-fan-reply')
  h.orchestration.fanoutEnabled = false
  say(`phase 10 CV-8: ${String(team)} personas · block lines=${String(block.length)} kinds=${block.map(item => item.fanout?.kind ?? '?').join(',')} · one-persona reply=${String(single)}`)
  results.fanoutBlock = team > 1 && block.length === team && block.every(item => item.fanout?.kind === 'reply' && item.fanout.total === team)
  results.fanoutNotSingle = !single
}

// 11. TEAM-13 (flag on): a request that names nobody goes to the persona of its FUNCTION; a list of functions becomes one Task per persona.
const functionTeam = [['p-bia', 'Bia', 'Redação'], ['p-teo', 'Teo', 'Design'], ['p-caio', 'Caio', 'Mídia']] as const
for (const [id, name, title] of functionTeam) {
  h.createPersona({
    id, workspaceId: 'ws', projectId: 'pp', name, title, description: title,
    personality: 'Clara.', instructions: 'Ajude.', avatarKind: 'gallery', avatarRef: name.toLowerCase(),
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
}
let askerTicketId = ''
{
  h.teamworkEnabled = true
  h.orchestration.warmRunners.clear()
  h.orchestration.runnerFactory = () => Promise.resolve(createFakeRunner())
  const before = new Set(tickets().map(item => item.id))
  h.postMessage({ id: 'm-camp', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts', actorId: 'ana', subjectId: '' })
  await h.orchestration.flush('pp')
  const made = tickets().filter(item => !before.has(item.id) && !item.title.startsWith('Revisar:'))
  const executors = made.map(item => item.execution?.name ?? '?').sort()
  const splitLine = h.events.get('team-plan:split-m-camp')?.body ?? '' // the plan card is the ONE statement of the split (EQUIPE-REAL §0)
  askerTicketId = made.find(item => item.execution?.name === 'Bia')?.id ?? ''
  const beforeOne = new Set(tickets().map(item => item.id))
  h.postMessage({ id: 'm-arte', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'Preciso da arte do cartaz de domingo', actorId: 'ana', subjectId: '' })
  await h.orchestration.flush('pp')
  const one = tickets().filter(item => !beforeOne.has(item.id) && !item.title.startsWith('Revisar:'))
  say(`phase 11 TEAM-13: list → ${executors.join('+')} · line="${splitLine.slice(0, 80)}" · one function → ${one.map(item => item.execution?.name ?? '?').join(',')} · mandate=${made.map(item => item.mandate.actor.id).join(',')}`)
  results.splitByFunction = executors.join(',') === 'Bia,Caio,Teo' && splitLine.startsWith('Dividi assim') && !h.events.has('coord-m-camp-split')
  results.splitKeepsMandate = made.length === 3 && made.every(item => item.mandate.actor.id === 'ana')
  results.oneFunctionOneOwner = one.length === 1 && one[0]?.execution?.name === 'Teo'
}

// 12. TEAM-4 (flag on): Bia asks the team about a draft with an image: ONE request, one reply per colleague, ONE consolidation; a repeat of the call changes nothing.
{
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const image = h.attachFile({ ...scope, streamKind: 'channel', ownerId: 'geral', name: 'cartaz.png', bytesBase64: png }).id
  const input = {
    projectId: 'pp', ticketId: askerTicketId, requestId: 'live-opinion-1', askerId: 'p-bia', question: 'O que acham do cartaz?',
    draft: { text: 'Cartaz de domingo', attachmentIds: [image] }, readerIds: ['p-teo', 'p-caio'], round: 1, maxRounds: 2, audience: 'team' as const,
  }
  const first = await h.opinions.run(input)
  const linesAfterFirst = h.events.listProject('pp').filter(item => item.id.startsWith('opinion:live-opinion-1:')).length
  const imageTurns = h.orchestration.imageTurns.filter(turn => turn.session.startsWith('opinion-live-opinion-1-')).length
  const again = await h.opinions.run(input)
  const linesAfterAgain = h.events.listProject('pp').filter(item => item.id.startsWith('opinion:live-opinion-1:')).length
  const thread = h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
    .filter(item => item.id.startsWith('opinion:live-opinion-1:'))
  say(`phase 12 TEAM-4: state=${first.state} replies=${String(first.replies.length)} lines=${String(linesAfterFirst)} kinds=${thread.map(item => item.opinion?.kind ?? '?').join(',')} · image turns=${String(imageTurns)} · repeat lines=${String(linesAfterAgain)} state=${again.state}`)
  results.opinionRound = askerTicketId !== '' && first.state === 'done' && first.replies.length === 2 && linesAfterFirst === 4
    && thread.map(item => item.opinion?.kind).join(',').replace('reply,reply', 'reply') === 'request,reply,consolidated'
  results.opinionImage = imageTurns === 2 && first.ignoredAttachmentIds.length === 0
  results.opinionIdempotent = linesAfterAgain === linesAfterFirst && again.state === first.state
  h.teamworkEnabled = false
}

// 13. HT-6 (flag on): a persona the person allowed to hire leaves a CARD in Aprovações; nobody joins until she approves; "Contratar direto" (hers to turn on) hires at once.
{
  h.teamworkEnabled = true
  const run = { personaId: 'p-bia', ticketId: askerTicketId, assignmentId: 'live-a1' }
  const ports = harnessMcpPorts(h.harness)
  const hire = async (callId: string, name: string) => JSON.parse(await ports.call!({ tool: 'persona_hire', run, args: { name, title: 'Revisão', description: 'Revisa os textos.' }, callId })) as { ok: boolean; status?: string; code?: string; hire?: { id: string; name: string } }
  const before = h.product.listPersonas('pp').length
  const refused = await hire('hire-0', 'Sem Permissão')
  h.setPersonaCanRecruit({ ...scope, personaId: 'p-bia', canRecruit: true })
  const card = await hire('hire-1', 'Bolota')
  const cardListed = h.screens.listApprovals('pp').some(row => row.kind === 'hire' && row.id === card.hire?.id && row.status === 'pending' && row.personaId === 'p-bia')
  const stillBefore = h.product.listPersonas('pp').length
  h.screens.decide({ ...scope, id: card.hire?.id ?? '', kind: 'hire', accept: true })
  const approved = h.product.listPersonas('pp').find(item => item.createdBy === 'p-bia' && item.id.startsWith('hire:'))
  h.orchestration.setPersonaPaused('pp', 'p-bia', false)
  h.setPersonaHireDirect({ ...scope, personaId: 'p-bia', hireDirect: true })
  const direct = await hire('hire-2', 'Direta')
  say(`phase 13 HT-6: no permission → ${refused.code ?? '?'} · card → ${card.status ?? '?'} listed=${String(cardListed)} team ${String(before)}→${String(stillBefore)} · approved → ${approved?.name ?? '-'} (tools ${JSON.stringify(approved?.tools ?? {})}) · direct → ${direct.status ?? direct.code ?? '?'}`)
  results.hireNeedsPermission = refused.ok === false && refused.code === 'forbidden'
  results.hireIsACard = card.ok && card.status === 'pending' && cardListed && stillBefore === before
  results.hireApprovedNoMoreAccess = approved?.name === 'Bolota' && Object.keys(approved.tools).length === 0 && approved.canRecruit === false
  results.hireDirectOnlyWhenOn = direct.ok && direct.status === 'hired'
  h.teamworkEnabled = false
}

// 14. D-079 (b): a worker of a REAL CLI asks the person through the TOOL during its turn; the Task WAITS (no delivery), and the answer returns to the SAME Task and session.
{
  const gateway = createMcpGateway({
    hooks: {
      report: () => undefined, recall: () => '',
      ask: createAskTool({ product: h.product, screens: h.screens.screens, asks: h.personaAsks, ticketOf: (projectId, id) => h.orchestration.runtime(projectId).repo.tickets.get(id) }),
    },
    onlyWired: true,
  })
  const open = productToolsOpener({ gateway, toolLevel: 'write', taskTextOf: id => h.orchestration.runtime('pp').repo.tickets.get(id)?.execution?.assignment ?? '' })
  const prompts: string[] = []
  const sessions: string[] = []
  let toolSaid = ''
  let first = true
  const inner = createFakeRunner()
  const stub: Runner = {
    ensureSession: (...args) => inner.ensureSession(...args),
    deliver: async (session, request, text, mode) => {
      sessions.push(session)
      prompts.push(text)
      if (first) {
        first = false
        const set = open({ personaId: 'p2', ticketId: session.replace(/^worker-/u, ''), assignmentId: request, cwd: '.' })
        const ask = set?.tools.find(tool => tool.name === ASK_TOOL)
        toolSaid = ask === undefined ? 'NOT OFFERED' : (await ask.handler({ question: 'Qual cor usamos no relatório?' })).content
        await set?.close?.()
      }
      await inner.deliver(session, request, text, mode)
    },
    cancel: (...args) => inner.cancel(...args),
    status: id => inner.status(id),
    whenIdle: id => inner.whenIdle(id),
    onEvent: listener => inner.onEvent(listener),
    capabilities: () => inner.capabilities(),
  }
  h.orchestration.warmRunners.set('pp:p2:task', stub)
  h.postMessage({ id: 'm-ask', ...scope, streamKind: 'channel', ownerId: 'geral', body: '@Iris Faça o relatório do dia', actorId: 'ana', subjectId: '' })
  await h.orchestration.flush('pp')
  const task = tickets().find(item => item.origin.triggerId === 'm-ask')
  const waiting = task !== undefined && h.orchestration.runtime('pp').repo.tickets.get(task.id)?.attention?.question === 'Qual cor usamos no relatório?'
  const noDelivery = task !== undefined && !h.events.has(`coord-${task.id}-done`)
  const answered = task !== undefined && h.answerAttention({ ...scope, ticketId: task.id, text: 'Azul' })
  await h.orchestration.flush('pp')
  const after = task === undefined ? undefined : h.orchestration.runtime('pp').repo.tickets.get(task.id)
  say(`phase 14 persona_ask: tool→"${toolSaid.slice(0, 30)}" · waiting=${String(waiting)} · delivery before answer=${String(!noDelivery)} · sessions=${sessions.join(',')} · answer in 2nd prompt=${String(prompts[1]?.includes('Azul') === true)} · attention after=${String(after?.attention !== undefined)}`)
  results.askOpensQuestion = toolSaid.startsWith('Pergunta enviada') && waiting
  results.askIsNotDelivery = noDelivery
  results.askAnswerSameTask = answered && sessions.length === 2 && sessions[0] === sessions[1] && prompts[1]?.includes('Azul') === true && after?.attention === undefined && (after?.assignments.length ?? 0) === 2
  h.orchestration.warmRunners.delete('pp:p2:task')
}

// Phase 15 — TEAM-7 on demand: "Bom dia agora" at whatever hour the real clock says, from the real records, with no model.
{
  h.teamworkEnabled = true
  // This script talks in channel:geral without a channel row and has no Coordenação: the card needs both (a real team has them from its first day).
  if (!h.listChannels(scope).some(row => row.name === 'geral')) h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
  if (!h.product.listPersonas('pp').some(row => row.systemRoles.includes('coordination'))) {
    h.createPersona({
      id: 'guia15', ...scope, name: 'Guia', title: 'Coordenação', description: 'Coordena.', personality: 'Clara.', instructions: 'Ajude.',
      avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
    })
  }
  const before = resolves
  const tickets15 = h.orchestration.runtime('pp').repo.tickets
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()
  const stamp15 = new Date().toISOString()
  const make = (id: string, title: string, by: string, over: Record<string, unknown>) => tickets15.save({
    id, title, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: stamp15 }], inputs: [], undelivered: [],
    createdAt: stamp15, updatedAt: stamp15, origin: { triggerId: `t-${id}`, triggerIds: [`t-${id}`] },
    execution: { name: by, directory: '.', assignment: title }, ...over,
  } as Parameters<typeof tickets15.save>[0])
  make('live-brief-done', 'Relatório da semana', 'Bento', { ended: { at: yesterday, by: 'executor', outcome: 'completed' } })
  make('live-brief-busy', 'Revisão do roteiro', 'Iris', {})
  const first = h.postDailyBriefNow({ ...scope, requestId: 'live-1' })
  const second = h.postDailyBriefNow({ ...scope, requestId: 'live-1' })
  const geral15 = h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
  const card = geral15.find(item => item.id === first.messageId)
  say(`phase 15 Bom dia agora: ${first.outcome} → ${second.outcome} · card="${(card?.body ?? '').slice(0, 90)}" · by=${card?.actorId ?? '?'} · model calls=${String(resolves - before)}`)
  results.briefNowPosted = first.outcome === 'posted' && card?.dailyBrief !== undefined && card.body.startsWith('Bom dia.')
  results.briefNowIdempotent = second.outcome === 'already' && second.messageId === first.messageId && geral15.filter(item => item.id === first.messageId).length === 1
  results.briefNowNoModel = resolves === before && card?.actorId !== 'ana'
  h.teamworkEnabled = false
}

// Phase 16 — CV-6: the channels of the organogram, in a real host process (no model is called).
{
  h.teamworkEnabled = true
  h.governance.gov.putSector({ id: 's-eng', workspaceId: 'ws', name: 'Engenharia', policyJson: '{}' })
  h.setSector({ workspaceId: 'ws', personaId: 'p1', sectorId: 's-eng' })
  h.setSector({ workspaceId: 'ws', personaId: 'p2', sectorId: 's-eng' })
  const team = h.listChannels(scope).find(item => item.kind === 'team' && item.teamName === 'Engenharia')
  const members = team === undefined ? [] : h.listChannelMembers({ ...scope, channelId: team.id }).map(item => item.id).sort()
  // the person renames it, archives it and writes to it: refused with the stable reason
  let refused = ''
  let renamed = ''
  if (team !== undefined) {
    renamed = h.renameChannel({ ...scope, channelId: team.id, name: 'time-eng' }).name
    h.archiveChannel({ ...scope, channelId: team.id })
    try { h.postMessage({ id: 'm-arch', ...scope, streamKind: 'channel', ownerId: team.id, body: 'oi', actorId: 'ana', subjectId: 'm-arch' }) } catch (error) {
      refused = String((error as { details?: { reason?: string } }).details?.reason ?? '')
    }
    h.unarchiveChannel({ ...scope, channelId: team.id })
  }
  // the team empties: the channel is archived with ONE line, never deleted; it comes back with the team
  h.setSector({ workspaceId: 'ws', personaId: 'p1', sectorId: '' })
  h.setSector({ workspaceId: 'ws', personaId: 'p2', sectorId: '' })
  const gone = team === undefined ? undefined : h.listChannels(scope).find(item => item.id === team.id)
  const goneLines = team === undefined ? 0 : h.events.listProject('pp').filter(row => row.id === `team-gone:${team.id}`).length
  h.setSector({ workspaceId: 'ws', personaId: 'p1', sectorId: 's-eng' })
  h.setSector({ workspaceId: 'ws', personaId: 'p2', sectorId: 's-eng' })
  const back = team === undefined ? undefined : h.listChannels(scope).find(item => item.id === team.id)
  say(`phase 16 CV-6: team channel=${team?.name ?? '-'} members=${members.join(',')} renamed=${renamed} · post to archived → reason=${refused} · empty → archived=${String(gone?.archived)} (${gone?.archivedReason ?? '-'}) lines=${String(goneLines)} · back → archived=${String(back?.archived)}`)
  results.cv6TeamChannel = team !== undefined && members.join(',') === 'p1,p2'
  results.cv6RenameArchivePost = renamed === 'time-eng' && refused === 'channel-archived'
  results.cv6NeverDeleted = gone?.archived === true && gone.archivedReason === 'team-gone' && goneLines === 1 && back?.archived === false && back.id === team?.id
  h.teamworkEnabled = false
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
