import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunEvent, RunHandle, StartTurnInput } from '@deepseek-ai/dsh-persona-runners'
import type { LinkAnswer } from '../src/computers/computer-link.ts'
import { RemoteRunner, RemoteTurnError, RemoteTurns, type RemoteHome } from '../src/computers/remote-turns.ts'
import { cleanOp, type ExecutorOp, type ExecutorSpec } from '../src/computers/executor-protocol.ts'
import { TurnExecutor, type ExecutorRunner, type TurnExecutorDeps } from '../src/computers/turn-executor.ts'

/**
 * D-116 executor, A and B talking through an in-memory wire that goes through the real validation: the turn runs on B with B's runner, the tools run on A, and a turn that loses its home ends instead of hanging.
 */
const A = 'comp-a'
const B = 'comp-b'
const C = 'comp-c'
const at = (): string => new Date().toISOString()

class FakeRunner implements ExecutorRunner {
  readonly started: StartTurnInput[] = []
  readonly cancelled: string[] = []
  readonly steered: string[] = []
  private readonly gates = new Map<string, { push(event: RunEvent): void; end(): void; fail(error: Error): void }>()
  script: ((input: StartTurnInput, emit: (event: RunEvent) => void) => Promise<void>) | undefined
  steerTakes = true

  readonly hints: (ExecutorSpec | undefined)[] = []

  startTurn(input: StartTurnInput, hint?: ExecutorSpec): Promise<RunHandle> {
    this.started.push(input)
    this.hints.push(hint)
    const handle: RunHandle = { runId: `b-${String(this.started.length)}`, sessionId: 'sessao-da-B', ticketId: input.ticketId, assignmentId: input.assignmentId, personaId: input.personaId, cwd: input.cwd, model: input.model }
    return Promise.resolve(handle)
  }

  async *stream(handle: RunHandle): AsyncGenerator<RunEvent> {
    const queue: (RunEvent | Error | 'end')[] = []
    let wake: (() => void) | undefined
    const put = (item: RunEvent | Error | 'end'): void => { queue.push(item); wake?.() }
    this.gates.set(handle.runId, { push: (event) => { put(event) }, end: () => { put('end') }, fail: (error) => { put(error) } })
    const input = this.started.find(item => item.ticketId === handle.ticketId)
    queue.push({ type: 'started', at: at(), handle })
    if (this.script !== undefined && input !== undefined) void this.script(input, (event) => { put(event) })
    for (;;) {
      const next = queue.shift()
      if (next === undefined) { await new Promise<void>((resolve) => { wake = resolve }); wake = undefined; continue }
      if (next === 'end') return
      if (next instanceof Error) throw next
      yield next
    }
  }

  cancel(handle: RunHandle): Promise<void> {
    this.cancelled.push(handle.runId)
    this.gates.get(handle.runId)?.push({ type: 'ended', at: at(), report: { state: 'dropped', summary: 'cancelado' } })
    return Promise.resolve()
  }

  steer(_handle: RunHandle, requestId: string): Promise<boolean> {
    this.steered.push(requestId)
    return Promise.resolve(this.steerTakes)
  }

  failStream(error: Error): void { for (const gate of this.gates.values()) gate.fail(error) }
}

interface World {
  readonly turns: RemoteTurns
  readonly executor: TurnExecutor
  readonly runner: FakeRunner
  readonly homes: Map<string, RemoteHome>
  readonly bHomes: Map<string, { computerId: string; epoch: number; state: 'active' | 'moving' }>
  readonly online: Set<string>
  readonly wire: { aToB: ExecutorOp[]; bToA: ExecutorOp[]; cut: boolean; bCannotReachA: boolean }
  readonly asA: { from: string }
}

const worlds: World[] = []
function world(over: { maxTurns?: number; silenceMs?: number; orphanMs?: number; ownerOfB?: string; toolTimeoutMs?: number; hasRunner?: boolean; admit?: TurnExecutorDeps['admit'] } = {}): World {
  const runner = new FakeRunner()
  const homes = new Map<string, RemoteHome>([['nina', { computerId: B, epoch: 4, state: 'active' }]])
  const bHomes = new Map<string, { computerId: string; epoch: number; state: 'active' | 'moving' }>([['nina', { computerId: B, epoch: 4, state: 'active' }]])
  const online = new Set<string>([B])
  const wire = { aToB: [] as ExecutorOp[], bToA: [] as ExecutorOp[], cut: false, bCannotReachA: false }
  const asA = { from: A }
  // the wire runs every body through the real validation, as the door does
  const deliver = async (handler: (op: ExecutorOp) => Promise<LinkAnswer>, op: ExecutorOp): Promise<{ status: number; json: unknown }> => {
    const cleaned = cleanOp(JSON.parse(JSON.stringify(op)))
    if (typeof cleaned === 'string') return { status: 400, json: { ok: false, reason: cleaned } }
    const answer = await handler(cleaned)
    return { status: answer.status, json: answer.body }
  }
  const turns: RemoteTurns = new RemoteTurns({
    selfId: A, homeOf: id => homes.get(id), isOnline: id => online.has(id), silenceMs: over.silenceMs ?? 400, ...(over.toolTimeoutMs === undefined ? {} : { toolTimeoutMs: over.toolTimeoutMs }),
    send: (to, op) => {
      if (wire.cut) return Promise.reject(new Error('cut'))
      wire.aToB.push(op)
      return to === B ? deliver(clean => executor.handle(asA.from, clean), op) : Promise.reject(new Error('no such computer'))
    },
  })
  const executorDeps: TurnExecutorDeps = {
    ownerComputerId: () => over.ownerOfB ?? A, runner: () => (over.hasRunner === false ? undefined : runner),
    homeCheck: (personaId, epoch) => { const here = bHomes.get(personaId); if (here === undefined || here.computerId !== B || here.state !== 'active') return 'not-here'; return here.epoch >= epoch ? 'ok' : 'epoch' },
    scratchDir: personaId => `C:\\dados-da-B\\executor\\${personaId}`,
    send: (_to, op) => {
      if (wire.cut || wire.bCannotReachA) return Promise.reject(new Error('cut'))
      wire.bToA.push(op)
      return deliver(clean => turns.handle(B, clean), op)
    },
    heartbeatMs: 20, batchMs: 5, ...(over.orphanMs === undefined ? {} : { orphanMs: over.orphanMs }), ...(over.maxTurns === undefined ? {} : { maxTurns: over.maxTurns }), ...(over.admit === undefined ? {} : { admit: over.admit }),
  }
  const executor: TurnExecutor = new TurnExecutor(executorDeps)
  const made: World = { turns, executor, runner, homes, bHomes, online, wire, asA }
  worlds.push(made)
  return made
}
afterEach(async () => { for (const made of worlds.splice(0)) await made.executor.stopAll() })

const tools = (handler: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>, close = vi.fn()): NonNullable<StartTurnInput['mcpTools']> => ({
  server: 'persona', tools: [{ name: 'post_message', description: 'Fala no canal.', inputSchema: { type: 'object' }, handler }], close,
})
const turnInput = (over: Partial<StartTurnInput> = {}): StartTurnInput => ({ ticketId: 'tk1', assignmentId: 'as1', personaId: 'nina', cwd: 'C:\\dados-da-A\\projeto', prompt: 'Resuma o dia.', model: 'sonnet', ...over })
const drain = async (turns: RemoteTurns, handle: RunHandle): Promise<RunEvent[]> => { const seen: RunEvent[] = []; for await (const event of turns.stream(handle)) seen.push(event); return seen }
const refusal = async (run: () => Promise<unknown>): Promise<string> => { try { await run(); return 'none' } catch (error) { return error instanceof RemoteTurnError ? error.code : String(error) } }

describe('the turn runs on B, the tools run on A', () => {
  it('B\'s runner runs in B\'s scratch folder; its tool call comes back to A, whose handler runs ONCE with the arguments; A reads the events and the lease closes', async () => {
    const w = world()
    const handler = vi.fn((args: Record<string, unknown>) => Promise.resolve({ content: `postou ${String(args.text)}` }))
    const close = vi.fn()
    let toolResult = ''
    w.runner.script = async (input, emit) => {
      emit({ type: 'delta', at: at(), text: 'Pensando…' })
      toolResult = (await input.mcpTools?.tools[0]?.handler({ text: 'bom dia' }))?.content ?? 'sem ferramenta'
      emit({ type: 'ended', at: at(), report: { state: 'ready', summary: `feito: ${toolResult}` } })
    }
    const handle = await w.turns.startTurn(turnInput({ mcpTools: tools(handler, close) }))
    const events = await drain(w.turns, handle)
    expect(events.map(event => event.type)).toEqual(['started', 'delta', 'ended'])
    expect(events[2]).toMatchObject({ report: { state: 'ready', summary: 'feito: postou bom dia' } })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ text: 'bom dia' })
    expect(close).toHaveBeenCalledTimes(1)
    expect(w.runner.started[0]?.cwd).toBe('C:\\dados-da-B\\executor\\nina') // never A's working directory
    expect(JSON.stringify(w.wire.aToB)).not.toContain('dados-da-A')
  })

  it('the `started` event carries A\'s OWN handle: B\'s paths and session ids never reach the orchestration', async () => {
    const w = world()
    w.runner.script = (_input, emit) => { emit({ type: 'ended', at: at(), report: { state: 'ready', summary: 'ok' } }); return Promise.resolve() }
    const handle = await w.turns.startTurn(turnInput())
    const [started] = await drain(w.turns, handle)
    expect(started).toMatchObject({ type: 'started', handle: { runId: handle.runId, cwd: 'C:\\dados-da-A\\projeto', sessionId: 'tk1' } })
    expect(JSON.stringify(started)).not.toContain('dados-da-B')
    expect(JSON.stringify(started)).not.toContain('sessao-da-B')
  })

  it('the same shape as a runner: a RemoteRunner starts, streams, cancels and steers', async () => {
    const w = world()
    const runner: RemoteRunner = w.turns.runner
    w.runner.script = async () => new Promise<void>(() => undefined) // a turn that never ends on its own
    const handle = await runner.startTurn(turnInput())
    expect(await runner.steer(handle, 'r1', 'mais curto')).toBe(true)
    w.runner.steerTakes = false
    expect(await runner.steer(handle, 'r2', 'de novo')).toBe(false)
    await runner.cancel(handle)
    const events = await drain(w.turns, handle)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'dropped' } })
    expect(w.runner.cancelled).toHaveLength(1)
    expect(w.runner.steered).toEqual(['r1', 'r2'])
  })
})

describe('A refuses to start what cannot run', () => {
  it('a persona that lives HERE is not remote; one that is on her way is `not-here`; a home that is off is `executor-offline`; an image is `images-not-supported`', async () => {
    const w = world()
    expect(w.turns.isRemote('nina')).toBe(true)
    w.homes.set('local', { computerId: A, epoch: 1, state: 'active' })
    expect(w.turns.isRemote('local')).toBe(false)
    expect(w.turns.isRemote('ninguem')).toBe(false)
    expect(await refusal(() => w.turns.startTurn(turnInput({ personaId: 'local' })))).toBe('not-remote')
    expect(await refusal(() => w.turns.startTurn(turnInput({ personaId: 'ninguem' })))).toBe('not-remote')
    w.homes.set('nina', { computerId: B, epoch: 4, state: 'moving' })
    expect(await refusal(() => w.turns.startTurn(turnInput()))).toBe('not-here')
    w.homes.set('nina', { computerId: B, epoch: 4, state: 'active' })
    w.online.delete(B)
    expect(await refusal(() => w.turns.startTurn(turnInput()))).toBe('executor-offline')
    w.online.add(B)
    expect(await refusal(() => w.turns.startTurn(turnInput({ images: [{ path: 'C:\\anexo.png' }] })))).toBe('images-not-supported')
    expect(w.runner.started).toEqual([])
  })

  it('a wire that is cut at the start is `executor-offline`, and the tool lease of the turn is closed (nothing left open)', async () => {
    const w = world()
    w.wire.cut = true
    const close = vi.fn()
    expect(await refusal(() => w.turns.startTurn(turnInput({ mcpTools: tools(() => Promise.resolve({ content: '' }), close) })))).toBe('executor-offline')
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('B refuses to run what it should not', () => {
  it('a start that does not come from the owner\'s PC, one past its deadline, with no runner, for a persona that does not live here or at an older epoch, and one too many at once', async () => {
    const stranger = world({ ownerOfB: C })
    expect(await refusal(() => stranger.turns.startTurn(turnInput()))).toBe('not-owner')

    const none = world({ hasRunner: false })
    expect(await refusal(() => none.turns.startTurn(turnInput()))).toBe('no-runner')

    const away = world()
    away.bHomes.set('nina', { computerId: C, epoch: 5, state: 'active' })
    expect(await refusal(() => away.turns.startTurn(turnInput()))).toBe('not-here')
    away.bHomes.set('nina', { computerId: B, epoch: 3, state: 'active' })
    expect(await refusal(() => away.turns.startTurn(turnInput()))).toBe('epoch')
    away.bHomes.set('nina', { computerId: B, epoch: 4, state: 'moving' })
    expect(await refusal(() => away.turns.startTurn(turnInput()))).toBe('not-here')
    expect(away.runner.started).toEqual([])

    const full = world({ maxTurns: 1 })
    full.runner.script = () => new Promise<void>(() => undefined)
    await full.turns.startTurn(turnInput())
    expect(await refusal(() => full.turns.startTurn(turnInput({ ticketId: 'tk2' })))).toBe('busy')
    expect(full.runner.started).toHaveLength(1)
  })

  it('an expired start is refused, and the same turn asked twice is the same turn (the runner starts once)', async () => {
    const w = world()
    const expired = await w.executor.handle(A, { op: 'start', turnId: 'old', personaId: 'nina', epoch: 4, sessionId: 's', ticketId: 'tk9', assignmentId: 'as', prompt: 'x', model: 'm', notAfter: Date.now() - 1_000, tools: [] })
    expect(expired).toEqual({ status: 410, body: { ok: false, reason: 'expired' } })
    const fresh = { op: 'start', turnId: 'twice', personaId: 'nina', epoch: 4, sessionId: 's', ticketId: 'tk8', assignmentId: 'as', prompt: 'x', model: 'm', notAfter: Date.now() + 60_000, tools: [] } as const
    w.runner.script = () => new Promise<void>(() => undefined)
    expect((await w.executor.handle(A, fresh)).status).toBe(202)
    expect((await w.executor.handle(A, fresh)).status).toBe(202)
    expect(w.runner.started).toHaveLength(1)
    expect((await w.executor.handle(C, fresh)).status).toBe(403) // another computer cannot take over a turn
  })

  it('a turn takes a slot of the host of B like a local turn: no slot is `busy` (the runner never starts) and the slot goes back ONCE when the turn is over', async () => {
    const taken: string[] = []
    const given = vi.fn()
    let free = false
    const w = world({ admit: (personaId) => { if (!free) return undefined; taken.push(personaId); return given } })
    expect(await refusal(() => w.turns.startTurn(turnInput()))).toBe('busy')
    expect(w.runner.started).toEqual([])
    free = true
    w.runner.script = (_input, emit) => { emit({ type: 'ended', at: at(), report: { state: 'ready', summary: 'ok' } }); return Promise.resolve() }
    const handle = await w.turns.startTurn(turnInput())
    await drain(w.turns, handle)
    await vi.waitFor(() => { expect(given).toHaveBeenCalledTimes(1) })
    expect(taken).toEqual(['nina'])
    await w.executor.stopAll() // stopping after the end gives nothing back twice
    expect(given).toHaveBeenCalledTimes(1)
  })

  it('a runner that cannot start gives the slot back at once', async () => {
    const given = vi.fn()
    const w = world({ admit: () => given })
    w.runner.startTurn = () => Promise.reject(new Error('sem login'))
    expect(await refusal(() => w.turns.startTurn(turnInput()))).toBe('no-runner')
    expect(given).toHaveBeenCalledTimes(1)
  })

  it('the engine the persona asked for travels as a HINT to B\'s runner (B decides with the account it has)', async () => {
    const w = world()
    w.runner.script = (_input, emit) => { emit({ type: 'ended', at: at(), report: { state: 'ready', summary: 'ok' } }); return Promise.resolve() }
    const handle = await w.turns.runnerFor('nina', { kind: 'cli', cli: 'claude' }).startTurn(turnInput())
    await drain(w.turns, handle)
    const plain = await w.turns.runnerFor('nina').startTurn(turnInput({ ticketId: 'tk2' }))
    await drain(w.turns, plain)
    expect(w.runner.hints).toEqual([{ kind: 'cli', cli: 'claude' }, undefined])
  })

  it('a RemoteRunner says what A knows of it: it serves the tools and cancels, it cannot resume A\'s sessions, and its health is whether the persona\'s computer is on', async () => {
    const w = world()
    const runner = w.turns.runnerFor('nina')
    expect(runner.capabilities()).toMatchObject({ stream: true, cancel: true, resume: false, mcpTools: 'available', permission: 'explicit' })
    expect(await runner.health()).toEqual({ ok: true, detail: 'ok' })
    expect(await runner.authenticate()).toEqual({ ok: true, detail: 'ok' })
    w.online.delete(B)
    expect(await runner.health()).toEqual({ ok: false, detail: 'executor-offline' })
    expect(await w.turns.runnerFor('ninguem').health()).toEqual({ ok: false, detail: 'executor-offline' })
    expect(await runner.usage()).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('`event` and `tool` flow the other way: B does not answer them', async () => {
    const w = world()
    expect((await w.executor.handle(A, { op: 'event', turnId: 't', seq: 0, events: [] })).status).toBe(400)
    expect((await w.executor.handle(A, { op: 'tool', turnId: 't', callId: 'c', name: 'x', args: {} })).status).toBe(400)
  })

  it('`info` is for the owner\'s PC only and says whether B has a runner', async () => {
    const w = world()
    expect(await w.executor.handle(A, { op: 'info' })).toMatchObject({ status: 200, body: { ok: true, runner: true } })
    expect(await w.executor.handle(C, { op: 'info' })).toEqual({ status: 403, body: { ok: false, reason: 'not-owner' } })
    expect(await world({ hasRunner: false }).executor.handle(A, { op: 'info' })).toMatchObject({ body: { runner: false } })
  })
})

describe('what A trusts from B: nothing it cannot check', () => {
  async function running(over: Parameters<typeof world>[0] = {}): Promise<{ w: World; handle: RunHandle; turnId: string; handler: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> {
    const w = world(over)
    const handler = vi.fn((args: Record<string, unknown>) => Promise.resolve({ content: `ok ${JSON.stringify(args)}` }))
    const close = vi.fn()
    w.runner.script = () => new Promise<void>(() => undefined)
    const handle = await w.turns.startTurn(turnInput({ mcpTools: tools(handler, close) }))
    return { w, handle, turnId: handle.runId, handler, close }
  }

  it('a tool the turn did not offer is `unknown-tool`; a call from another computer is `wrong-computer`; a call for a turn A never sent is `unknown-turn`', async () => {
    const { w, turnId, handler } = await running()
    expect(await w.turns.handle(B, { op: 'tool', turnId, callId: 'c1', name: 'delete_everything', args: {} })).toEqual({ status: 404, body: { ok: false, reason: 'unknown-tool' } })
    expect(await w.turns.handle(C, { op: 'tool', turnId, callId: 'c2', name: 'post_message', args: {} })).toEqual({ status: 403, body: { ok: false, reason: 'wrong-computer' } })
    expect(await w.turns.handle(B, { op: 'tool', turnId: 'nao-existe', callId: 'c3', name: 'post_message', args: {} })).toEqual({ status: 404, body: { ok: false, reason: 'unknown-turn' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('a tool that throws, or hangs, is an error RESULT the model reads (no detail of this PC leaves, nothing hangs)', async () => {
    const w = world({ toolTimeoutMs: 40 })
    w.runner.script = () => new Promise<void>(() => undefined)
    let mode: 'throw' | 'hang' = 'throw'
    const handle = await w.turns.startTurn(turnInput({ mcpTools: tools(() => (mode === 'throw' ? Promise.reject(new Error('C:\\segredo\\da\\A.txt não existe')) : new Promise(() => undefined))) }))
    const failed = await w.turns.handle(B, { op: 'tool', turnId: handle.runId, callId: 'c1', name: 'post_message', args: {} })
    expect(failed).toEqual({ status: 200, body: { ok: true, content: 'A ferramenta falhou.', isError: true } })
    expect(JSON.stringify(failed)).not.toContain('segredo')
    mode = 'hang'
    expect(await w.turns.handle(B, { op: 'tool', turnId: handle.runId, callId: 'c2', name: 'post_message', args: {} })).toEqual({ status: 200, body: { ok: true, content: 'A ferramenta falhou.', isError: true } })
  })

  it('no more than eight tool calls of one turn at once', async () => {
    const w = world()
    w.runner.script = () => new Promise<void>(() => undefined)
    const release: (() => void)[] = []
    const handle = await w.turns.startTurn(turnInput({ mcpTools: tools(() => new Promise((resolve) => { release.push(() => { resolve({ content: 'ok' }) }) })) }))
    const calls = Array.from({ length: 8 }, (_, index) => w.turns.handle(B, { op: 'tool', turnId: handle.runId, callId: `c${String(index)}`, name: 'post_message', args: {} }))
    expect(await w.turns.handle(B, { op: 'tool', turnId: handle.runId, callId: 'c9', name: 'post_message', args: {} })).toMatchObject({ status: 429, body: { reason: 'busy' } })
    for (const done of release) done()
    expect((await Promise.all(calls)).every(answer => answer.status === 200)).toBe(true)
  })

  it('a batch of events is taken once: a repeat (its answer was lost) is acknowledged and not duplicated, a gap is refused, another computer is refused', async () => {
    // a home that only acknowledges the start and never sends anything by itself: the test plays the part of B's batches by hand
    const turns = new RemoteTurns({ selfId: A, homeOf: () => ({ computerId: B, epoch: 4, state: 'active' }), isOnline: () => true, send: () => Promise.resolve({ status: 202, json: { ok: true } }), silenceMs: 5_000 })
    const handle = await turns.startTurn(turnInput())
    const turnId = handle.runId
    const delta = (text: string): RunEvent => ({ type: 'delta', at: at(), text })
    expect((await turns.handle(B, { op: 'event', turnId, seq: 0, events: [delta('a')] })).status).toBe(200)
    expect((await turns.handle(B, { op: 'event', turnId, seq: 0, events: [delta('a')] })).status).toBe(200) // the repeat
    expect((await turns.handle(B, { op: 'event', turnId, seq: 5, events: [delta('z')] })).status).toBe(409)
    expect((await turns.handle(C, { op: 'event', turnId, seq: 1, events: [delta('x')] })).status).toBe(403)
    expect((await turns.handle(B, { op: 'event', turnId, seq: 1, events: [{ type: 'ended', at: at(), report: { state: 'ready', summary: 'fim' } }] })).status).toBe(200)
    const seen = await drain(turns, handle)
    expect(seen.map(event => event.type)).toEqual(['delta', 'ended']) // the repeat and the gap are not there
    expect(seen[0]).toMatchObject({ text: 'a' })
  })
})

describe('a home that stops talking, and a project that stops listening', () => {
  it('A ends a turn B went silent on with `failed`, and closes the lease', async () => {
    const w = world({ silenceMs: 120 })
    const close = vi.fn()
    w.runner.script = () => new Promise<void>(() => undefined) // the runner emits nothing more; B's heartbeat is what keeps the turn alive
    const handle = await w.turns.startTurn(turnInput({ mcpTools: tools(() => Promise.resolve({ content: '' }), close) }))
    w.wire.bCannotReachA = true // B can no longer say "still here"
    const events = await drain(w.turns, handle)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'failed', summary: 'O computador onde ela roda parou de responder.' } })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('B that cannot reach A for a while stops the local turn: nobody is listening and it would only burn the quota', async () => {
    const w = world({ orphanMs: 80 })
    w.runner.script = () => new Promise<void>(() => undefined)
    await w.turns.startTurn(turnInput())
    w.wire.bCannotReachA = true
    await vi.waitFor(() => { expect(w.runner.cancelled).toHaveLength(1) }, { timeout: 2_000 })
  })

  it('a runner whose stream throws, or ends without an `ended`, becomes a `failed` end A can read', async () => {
    const thrown = world()
    thrown.runner.script = () => new Promise<void>(() => undefined)
    const handle = await thrown.turns.startTurn(turnInput())
    thrown.runner.failStream(new Error('C:\\B\\segredo quebrou'))
    const events = await drain(thrown.turns, handle)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'failed', summary: 'O motor do computador dela falhou.' } })
    expect(JSON.stringify(events)).not.toContain('segredo')
  })
})
