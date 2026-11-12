import { createFakeRunner, type RunEvent, type TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { ReplyStream } from '../src/reply-stream.ts'
import { emitRunnerPartial, lastRunnerText, resolveHostRunner, setRunnerPartialSink, tapTurn, type TextCapture } from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }

// ---- ReplyStream (throttle, trailing write, stop) ------------------------------------------------------------

it('ReplyStream opens at once, throttles the middle at 50 ms, flushes the last text, and ignores late pieces after stop', () => {
  let now = 0
  const log: string[] = []
  const stream = new ReplyStream({ open: text => log.push(`open:${text}`), update: text => log.push(`update:${text}`) }, 50, () => now)
  stream.push('')
  stream.push('   ')
  expect(log).toEqual([]) // nothing to show yet
  stream.push('Olá')
  expect(log).toEqual(['open:Olá'])
  now = 20
  stream.push('Olá, tudo')
  now = 40
  stream.push('Olá, tudo bem')
  expect(log).toEqual(['open:Olá']) // inside the window: held
  now = 50
  stream.push('Olá, tudo bem?')
  expect(log).toEqual(['open:Olá', 'update:Olá, tudo bem?'])
  now = 60
  stream.push('Olá, tudo bem? Aqui')
  stream.flush() // end of the turn: the last text is never left behind
  expect(log.at(-1)).toBe('update:Olá, tudo bem? Aqui')
  stream.flush()
  expect(log).toHaveLength(3) // nothing new to write
  stream.stop()
  stream.push('tarde demais')
  expect(log).toHaveLength(3)
  expect(stream.text).toBe('Olá, tudo bem? Aqui')
})

it('ReplyStream with throttle 0 writes every piece; a trailing timer writes the last text after a pause', async () => {
  const log: string[] = []
  const every = new ReplyStream({ open: t => log.push(`o:${t}`), update: t => log.push(`u:${t}`) }, 0)
  every.push('a')
  every.push('ab')
  every.push('abc')
  expect(log).toEqual(['o:a', 'u:ab', 'u:abc'])
  const trailing: string[] = []
  const lazy = new ReplyStream({ open: t => trailing.push(`o:${t}`), update: t => trailing.push(`u:${t}`) }, 30)
  lazy.push('x')
  lazy.push('xy') // inside the window, no further push comes
  expect(trailing).toEqual(['o:x'])
  await new Promise(resolve => setTimeout(resolve, 80))
  expect(trailing).toEqual(['o:x', 'u:xy'])
})

// ---- the OAR tap hands every cumulative piece to the sink of the current turn ------------------------------

it('tapTurn: deltas and cumulative partials reach the sink of the turn, so a live CLI streams (no model)', async () => {
  const handle = { runId: 'r', sessionId: 's', ticketId: 't', assignmentId: 'a', personaId: 'p', cwd: '.', model: 'm' }
  const report = { state: 'ready' as const, summary: 'Olá, tudo bem?' }
  const script: RunEvent[] = [
    { type: 'started', at: 'x', handle },
    { type: 'delta', at: 'x', text: 'Olá' },
    { type: 'delta', at: 'x', text: ', tudo' },
    { type: 'partial', at: 'x', text: 'Olá, tudo bem' },
    { type: 'ended', at: 'x', report },
  ]
  const play = async function* (): AsyncGenerator<RunEvent> { for (const event of script) yield event }
  const base = createFakeRunnerTurn(play)
  const heard: string[] = []
  const capture: TextCapture = { last: '', onPartial: text => heard.push(text) }
  const tapped = tapTurn(base, capture)
  for await (const event of tapped.stream(handle)) void event
  expect(heard).toEqual(['Olá', 'Olá, tudo', 'Olá, tudo bem'])
  expect(capture.last).toBe('Olá, tudo bem')
})

function createFakeRunnerTurn(play: () => AsyncGenerator<RunEvent>): TurnRunner {
  return {
    capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: false, mcpTools: 'unavailable', permission: 'explicit' }),
    health: () => Promise.resolve({ ok: true, detail: '' }),
    authenticate: () => Promise.resolve({ ok: true, detail: '' }),
    start: () => Promise.reject(new Error('not used')),
    startTurn: () => Promise.reject(new Error('not used')),
    stream: () => play(),
    events: () => play(),
    cancel: () => Promise.resolve(),
    resume: () => Promise.reject(new Error('not used')),
    usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
  }
}

// ---- the reply as ONE message that grows, through the real orchestration ----------------------------------

interface Gate {
  open: boolean
  started: boolean
  cancelled: boolean
  release: () => void
  wait: Promise<void>
}

function newGate(): Gate {
  const gate: Gate = { open: true, started: false, cancelled: false, release: () => undefined, wait: Promise.resolve() }
  gate.wait = new Promise<void>((resolve) => { gate.release = () => { gate.open = false; resolve() } })
  return gate
}

/** A talk turn that stays open until released or cancelled. */
function talkRunner(gate: Gate): Runner {
  const inner = createFakeRunner()
  return {
    ensureSession: (id, cwd, title, role) => inner.ensureSession(id, cwd, title, role),
    deliver: async (sessionId, requestId, text, mode) => { gate.started = true; await inner.deliver(sessionId, requestId, text, mode) },
    cancel: async (sessionId, options) => { gate.cancelled = true; gate.release(); await inner.cancel(sessionId, options) },
    status: sessionId => (gate.open ? 'running' : inner.status(sessionId)),
    whenIdle: async (sessionId) => { await gate.wait; await inner.whenIdle(sessionId) },
    onEvent: listener => inner.onEvent(listener),
    capabilities: () => inner.capabilities(),
  }
}

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
  h.orchestration.streamThrottleMs = 0
}

async function until(label: string, check: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timeout: ${label}`)
    await new Promise(resolve => setTimeout(resolve, 15))
  }
}

function replyOf(h: PersonaHost, id: string) {
  return h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events.find(item => item.id === id)
}

function startTalk(h: PersonaHost, gate: Gate): { runner: Runner } {
  const runner = talkRunner(gate)
  h.orchestration.runnerFactory = () => Promise.resolve(runner)
  h.postMessage({ id: 'm1', ...scope, streamKind: 'channel', ownerId: 'geral', body: '@Bento Oi, tudo bem?', actorId: 'ana', subjectId: '' })
  return { runner }
}

it('the reply is ONE message that grows (partial → final under the same id), and followers get every state as an upsert', async () => {
  const h = host()
  seed(h)
  const gate = newGate()
  const { runner } = startTalk(h, gate)
  await until('talk turn open', () => gate.started)

  const frames: Array<{ kind: string; ids: string[]; bodies: string[]; streaming: boolean[] }> = []
  const abort = new AbortController()
  const follow = (async () => {
    for await (const frame of h.followMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50 }, abort.signal)) {
      frames.push({
        kind: frame.kind, ids: frame.events.map(item => item.id), bodies: frame.events.map(item => item.body),
        streaming: frame.events.map(item => item.streaming === true),
      })
    }
  })()
  await until('baseline', () => frames.length > 0)

  emitRunnerPartial(runner, 'Olá')
  await until('first piece visible', () => replyOf(h, 'coord-m1-reply')?.body === 'Olá')
  expect(replyOf(h, 'coord-m1-reply')).toMatchObject({ type: 'partial', streaming: true, editedAt: '', actorId: 'p1' })
  emitRunnerPartial(runner, 'Olá, tudo')
  emitRunnerPartial(runner, 'Olá, tudo bem por aqui?')
  await until('text grew', () => replyOf(h, 'coord-m1-reply')?.body === 'Olá, tudo bem por aqui?')
  await until('followers heard it', () => frames.some(frame => frame.bodies.includes('Olá, tudo bem por aqui?')))
  expect(h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events.filter(item => item.id === 'coord-m1-reply')).toHaveLength(1)

  h.orchestration.liveText = 'Tudo bem por aqui. Em que posso ajudar?'
  gate.release()
  await h.orchestration.flush('pp')
  await until('settled', () => replyOf(h, 'coord-m1-reply')?.streaming !== true && replyOf(h, 'coord-m1-reply')?.type !== 'partial')
  const final = replyOf(h, 'coord-m1-reply')
  expect(final?.body).toMatch(/Tudo bem por aqui/)
  expect(final?.streaming).toBeUndefined()
  expect(final?.editedAt).toBe('')
  await until('final frame', () => frames.some(frame => frame.ids.includes('coord-m1-reply') && frame.streaming.includes(false) && frame.bodies.some(body => /Em que posso ajudar/.test(body))))
  abort.abort()
  await follow
  const mine = frames.filter(frame => frame.kind === 'upsert' && frame.ids[0] === 'coord-m1-reply')
  expect(mine.length).toBeGreaterThanOrEqual(3) // opened, grew, settled — all upserts of the same id
  expect(mine[0]?.streaming[0]).toBe(true)
  expect(mine.at(-1)?.streaming[0]).toBe(false)
  expect(h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events.some(item => item.id === 'coord-m1-token')).toBe(false) // no legacy first-token duplicate
})

it('Parar in the middle of a reply cancels the turn and keeps what was written, flagged as stopped', async () => {
  const h = host()
  seed(h)
  const gate = newGate()
  const { runner } = startTalk(h, gate)
  await until('talk turn open', () => gate.started)
  emitRunnerPartial(runner, 'Vou explicar em três passos: primeiro')
  await until('text visible', () => replyOf(h, 'coord-m1-reply')?.streaming === true)
  const view = await h.stopTurn({ ...scope, personaId: 'p1', eventId: 'm1' })
  expect(view).toEqual({ stopped: 'reply', ticketId: '', line: '' }) // the bubble itself carries the stop
  expect(gate.cancelled).toBe(true)
  await h.orchestration.flush('pp')
  await until('stopped bubble settled', () => replyOf(h, 'coord-m1-reply')?.stopped === true)
  expect(replyOf(h, 'coord-m1-reply')).toMatchObject({
    body: 'Vou explicar em três passos: primeiro', stopped: true, type: 'runner',
  })
  expect(replyOf(h, 'coord-m1-reply')?.streaming).toBeUndefined()
})

it('Parar before a single word was written says the reply was cancelled', async () => {
  const h = host()
  seed(h)
  const gate = newGate()
  startTalk(h, gate)
  await until('talk turn open', () => gate.started)
  await h.stopTurn({ ...scope, personaId: 'p1', eventId: 'm1' })
  await h.orchestration.flush('pp')
  await until('cancel line', () => replyOf(h, 'coord-m1-reply') !== undefined)
  expect(replyOf(h, 'coord-m1-reply')).toMatchObject({ body: 'Resposta cancelada.' })
  expect(replyOf(h, 'coord-m1-reply')?.streaming).toBeUndefined()
})

it('a settled reply is idempotent: a late piece or a second settle does not reopen it', async () => {
  const h = host()
  seed(h)
  const gate = newGate()
  const { runner } = startTalk(h, gate)
  await until('talk turn open', () => gate.started)
  emitRunnerPartial(runner, 'Olá')
  h.orchestration.liveText = 'Olá, tudo certo.'
  gate.release()
  await h.orchestration.flush('pp')
  await until('settled', () => replyOf(h, 'coord-m1-reply')?.type === 'runner')
  const before = replyOf(h, 'coord-m1-reply')?.body
  emitRunnerPartial(runner, 'ruído tardio') // the sink was cleared at the end of the turn
  setRunnerPartialSink(runner, undefined)
  expect(h.events.settlePartial('coord-m1-reply', 'outro final', 'runner')).toBe(false)
  expect(replyOf(h, 'coord-m1-reply')?.body).toBe(before)
})

// ---- the REAL host runner path (OAR session adapter + tap + per-turn sink), with a scripted turn runner ----------

it('resolveHostRunner → OAR session → tap: every cumulative piece of a live-style turn reaches the per-turn sink', async () => {
  const handle = { runId: 'r1', sessionId: 'talk-m1', ticketId: 'talk-m1', assignmentId: 'a', personaId: 'p1', cwd: '.', model: 'm' }
  const report = { state: 'ready' as const, summary: 'Olá, tudo bem?' }
  const script: RunEvent[] = [
    { type: 'started', at: 'x', handle },
    { type: 'delta', at: 'x', text: 'Olá' },
    { type: 'delta', at: 'x', text: ', tudo' },
    { type: 'delta', at: 'x', text: ' bem?' },
    { type: 'ended', at: 'x', report },
  ]
  const play = async function* (): AsyncGenerator<RunEvent> {
    for (const event of script) {
      await new Promise(resolve => setTimeout(resolve, 5))
      yield event
    }
  }
  const turn: TurnRunner = {
    ...createFakeRunnerTurn(play),
    start: () => Promise.resolve(handle),
    startTurn: () => Promise.resolve(handle),
  }
  const previous = process.env.PERSONA_REAL_CLI
  process.env.PERSONA_REAL_CLI = '1' // the live path; the runner itself is the scripted turn above, so no model is reached
  try {
    const session = await resolveHostRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'deny', autonomy: 'on_request',
      personId: 'p1', purpose: 'talk', projectId: 'pp', personaName: 'Bento',
    }, { resolveRunner: () => Promise.resolve(turn), createFakeRunner })
    const heard: string[] = []
    setRunnerPartialSink(session, (text) => { heard.push(text) })
    await session.ensureSession('talk-m1', '.', 'Bento', 'coordinator')
    await session.deliver('talk-m1', 'talk:m1', 'Oi, tudo bem?', 'queue')
    await session.whenIdle('talk-m1')
    setRunnerPartialSink(session, undefined)
    expect(heard).toEqual(['Olá', 'Olá, tudo', 'Olá, tudo bem?'])
    expect(lastRunnerText(session)).toBe('Olá, tudo bem?')
  } finally {
    if (previous === undefined) delete process.env.PERSONA_REAL_CLI
    else process.env.PERSONA_REAL_CLI = previous
  }
})
