/**
 * D-116 executor, the PROJECT's side (A, the owner's PC): a runner whose turns run on ANOTHER computer of the team. `RemoteRunner` has the shape of the orchestration's runner (`startTurn`, `stream`, `cancel`,
 * `steer`), so a persona whose home is not this computer is run through it with one hook where the runner is chosen. The project never leaves: the turn's prompt goes to the persona's home, her product tools stay HERE
 * (B only receives their names and schemas) and every call B makes comes back signed to {@link RemoteTurns.handle}, which runs the real handler bound to the turn's lease — the grants and the ACL are the ones of this PC.
 *
 * What A trusts from B: nothing it can check itself. A call is accepted only from the computer the turn was sent to; events are rebuilt from the allowed fields and carry B's word for what the persona did (as a
 * runner's output always does); a tool is callable only if THIS turn offered it. A turn B stops talking about is over: `ended` with `failed` after {@link EXECUTOR_SILENCE_MS}, and its tool lease is closed.
 */

import { randomBytes } from 'node:crypto'
import type { RunEvent, RunHandle, RunnerAuth, RunnerHealth, RunnerUsage, StartTurnInput, TurnCapabilities, TurnRunner, TurnToolSet } from '@deepseek-ai/dsh-persona-runners'
import type { LinkAnswer } from './computer-link.ts'
import {
  EXECUTOR_MAX_TOOL_RESULT, EXECUTOR_SILENCE_MS, EXECUTOR_TOOL_TIMEOUT_MS, startOf, type ExecutorOp, type ExecutorRefusal, type ExecutorSpec,
} from './executor-protocol.ts'
import type { ExecutorReply } from './turn-executor.ts'

/** Why a turn could not be started on the persona's home. */
export class RemoteTurnError extends Error {
  /** @param code - Stable reason (`executor-offline`, `not-here`, `images-not-supported`, … or what the home answered). */
  constructor(readonly code: ExecutorRefusal | 'not-remote') {
    super(`remote turn refused: ${code}`)
    this.name = 'RemoteTurnError'
  }
}

/** Where a persona lives, on A's book. */
export interface RemoteHome {
  readonly computerId: string
  readonly epoch: number
  readonly state: 'active' | 'moving'
}

/** What A needs. */
export interface RemoteTurnsDeps {
  /** This computer's id (a persona whose home is this computer is not remote). */
  readonly selfId: string
  readonly homeOf: (personaId: string) => RemoteHome | undefined
  readonly isOnline: (computerId: string) => boolean
  /** A signed call to another computer. May reject when it cannot connect. */
  readonly send: (to: string, op: ExecutorOp) => Promise<ExecutorReply>
  /**
   * Lumen (b): asked AT START (not only when the persona was taken there): is that computer still trusted to host this persona — its certificate in the FRESH roster with `mayHost`, and the creator's
   * grant to run on a team computer still standing? `false` refuses the turn (`home-not-trusted`) before anything is sent. Absent: no extra check.
   */
  readonly mayHost?: (computerId: string, personaId: string) => boolean
  readonly now?: () => number
  readonly silenceMs?: number
  readonly toolTimeoutMs?: number
}

interface Waiter { resolve(value: RunEvent | undefined): void }

interface RemoteTurn {
  readonly turnId: string
  readonly computerId: string
  readonly handle: RunHandle
  readonly tools: TurnToolSet | undefined
  readonly queue: RunEvent[]
  queueBytes: number
  readonly calls: Map<string, Promise<LinkAnswer>>
  waiter: Waiter | undefined
  usage: RunnerUsage | undefined
  expected: number
  lastSeen: number
  over: boolean
  closed: boolean
  toolsRunning: number
}

const MAX_TOOLS_AT_ONCE = 8
/** Handlers of one computer's turns running at once (4 turns x 8 each is not the budget). */
const MAX_TOOLS_PER_COMPUTER = 16
/** The most a computer's word on its own usage can say (a lying home cannot invent a bigger number). */
const MAX_REMOTE_TOKENS = 1_000_000_000
const MAX_QUEUE_BYTES = 8 * 1024 * 1024
const MAX_CALLS = 1024

/** The turns this PC has sent away. */
export class RemoteTurns {
  private readonly turns = new Map<string, RemoteTurn>()
  private readonly toolsByComputer = new Map<string, number>()
  private readonly now: () => number

  /** @param deps - See {@link RemoteTurnsDeps}. */
  constructor(private readonly deps: RemoteTurnsDeps) {
    this.now = deps.now ?? Date.now
  }

  /**
   * @param personaId - A persona.
   * @returns Whether her home is another computer (the orchestration then runs her through {@link RemoteTurns.runner}).
   */
  isRemote(personaId: string): boolean {
    const home = this.deps.homeOf(personaId)
    return home !== undefined && home.computerId !== this.deps.selfId
  }

  /** @returns How many turns are away and not over. */
  active(): number {
    return [...this.turns.values()].filter(turn => !turn.over).length
  }

  /** @returns The runner that sends the turn to the persona's home. The same contract as any runner of persona-runners (`TurnRunner`). */
  get runner(): RemoteRunner {
    return new RemoteRunner(this)
  }

  /**
   * @param personaId - A persona whose home is another computer.
   * @param spec - The engine she asked for on this PC (a hint to her computer, which runs on the engine of ITS own account when it does not have that one).
   * @returns The runner for HER: like {@link RemoteTurns.runner}, and its health says whether her computer is on.
   */
  runnerFor(personaId: string, spec?: ExecutorSpec): RemoteRunner {
    return new RemoteRunner(this, this.deps.homeOf(personaId)?.computerId, spec)
  }

  /** @param computerId - A computer. @returns Whether it is on (the beat of the link). */
  online(computerId: string): boolean {
    return this.deps.isOnline(computerId)
  }

  /** @param handle - A turn. @returns The last usage its home reported (zeros before the first), clamped: it is the home's word, shown apart and never booked on this PC's account. */
  usageOf(handle: RunHandle): RunnerUsage {
    const said = this.turns.get(handle.runId)?.usage
    if (said === undefined) return { inputTokens: 0, outputTokens: 0 }
    const clamp = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), MAX_REMOTE_TOKENS) : 0)
    return { inputTokens: clamp(said.inputTokens), outputTokens: clamp(said.outputTokens) }
  }

  /**
   * Send a turn to the persona's home.
   * @param input - The turn as the orchestration built it.
   * @returns The handle of the turn (built here: B's paths and ids never reach the orchestration).
   * @throws {RemoteTurnError} Why it could not start.
   */
  async startTurn(input: StartTurnInput, spec?: ExecutorSpec): Promise<RunHandle> {
    const home = this.deps.homeOf(input.personaId)
    if (home === undefined || home.computerId === this.deps.selfId) throw new RemoteTurnError('not-remote')
    if (home.state !== 'active') throw new RemoteTurnError('not-here')
    if (this.deps.mayHost?.(home.computerId, input.personaId) === false) throw new RemoteTurnError('home-not-trusted')
    if (!this.deps.isOnline(home.computerId)) throw new RemoteTurnError('executor-offline')
    const turnId = `rt-${randomBytes(8).toString('hex')}`
    const start = startOf(input, { turnId, epoch: home.epoch, now: this.now(), ...(spec === undefined ? {} : { spec }) })
    if (start === 'images-not-supported' || start === 'too-big') throw new RemoteTurnError(start)
    const handle: RunHandle = { runId: turnId, sessionId: input.ticketId, ticketId: input.ticketId, assignmentId: input.assignmentId, personaId: input.personaId, cwd: input.cwd, model: input.model }
    const turn: RemoteTurn = { turnId, computerId: home.computerId, handle, tools: input.mcpTools, queue: [], queueBytes: 0, calls: new Map(), waiter: undefined, usage: undefined, expected: 0, lastSeen: this.now(), over: false, closed: false, toolsRunning: 0 }
    this.turns.set(turnId, turn)
    let reply: ExecutorReply
    try {
      reply = await this.deps.send(home.computerId, start)
    } catch (error) {
      void error
      await this.finish(turn)
      throw new RemoteTurnError('executor-offline')
    }
    if (reply.status !== 202) {
      await this.finish(turn)
      const reason = typeof reply.json === 'object' && reply.json !== null ? (reply.json as { reason?: unknown }).reason : undefined
      throw new RemoteTurnError(typeof reason === 'string' ? reason as ExecutorRefusal : 'executor-offline')
    }
    return handle
  }

  /**
   * What the turn emits, as the orchestration reads it. Ends after `ended`; a home that goes silent ends it as failed.
   * @param handle - What {@link RemoteTurns.startTurn} returned.
   * @yields The events, with B's `started` replaced by this PC's own handle.
   */
  async *stream(handle: RunHandle): AsyncGenerator<RunEvent> {
    const turn = this.turns.get(handle.runId)
    if (turn === undefined) return
    const silenceMs = this.deps.silenceMs ?? EXECUTOR_SILENCE_MS
    try {
      for (;;) {
        const event = await this.next(turn, silenceMs)
        if (event === undefined) {
          yield { type: 'ended', at: new Date(this.now()).toISOString(), report: { state: 'failed', summary: 'O computador onde ela roda parou de responder.' } }
          return
        }
        yield event.type === 'started' ? { type: 'started', at: event.at, handle } : event
        if (event.type === 'ended') return
      }
    } finally {
      await this.finish(turn)
    }
  }

  /**
   * Stop the turn (best effort on the other side; here it ends at once if the home does not answer).
   * @param handle - The turn.
   */
  async cancel(handle: RunHandle): Promise<void> {
    const turn = this.turns.get(handle.runId)
    if (turn === undefined || turn.over) return
    await this.deps.send(turn.computerId, { op: 'cancel', turnId: turn.turnId }).catch(() => undefined)
    setTimeout(() => { this.push(turn, { type: 'ended', at: new Date(this.now()).toISOString(), report: { state: 'dropped', summary: 'Cancelado.' } }) }, 10_000).unref() // the home may never say: the turn still ends
  }

  /**
   * Put text into the open turn.
   * @param handle - The turn.
   * @param requestId - The input id.
   * @param text - What to say.
   * @returns Whether the home's runner took it.
   */
  async steer(handle: RunHandle, requestId: string, text: string): Promise<boolean> {
    const turn = this.turns.get(handle.runId)
    if (turn === undefined || turn.over) return false
    try {
      const reply = await this.deps.send(turn.computerId, { op: 'steer', turnId: turn.turnId, requestId, text })
      return reply.status === 200 && typeof reply.json === 'object' && reply.json !== null && (reply.json as { taken?: unknown }).taken === true
    } catch (error) {
      void error
      return false
    }
  }

  /**
   * A call from the persona's home (already verified by the door): a batch of events or a tool call.
   * @param from - Who signed it.
   * @param op - `event` or `tool`.
   * @returns The answer.
   */
  async handle(from: string, op: ExecutorOp): Promise<LinkAnswer> {
    if (op.op !== 'event' && op.op !== 'tool') return { status: 400, body: { ok: false, reason: 'malformed' satisfies ExecutorRefusal } }
    const turn = this.turns.get(op.turnId)
    if (turn === undefined || turn.over) return { status: 404, body: { ok: false, reason: 'unknown-turn' satisfies ExecutorRefusal } }
    if (turn.computerId !== from) return { status: 403, body: { ok: false, reason: 'wrong-computer' satisfies ExecutorRefusal } }
    turn.lastSeen = this.now()
    if (op.op === 'event') {
      if (op.seq < turn.expected) return { status: 200, body: { ok: true } } // a batch we already took (its answer was lost)
      if (op.seq > turn.expected) return { status: 409, body: { ok: false, reason: 'malformed' satisfies ExecutorRefusal } }
      let bytes = turn.queueBytes
      for (const event of op.events) {
        bytes += Buffer.byteLength(JSON.stringify(event), 'utf8')
        if (bytes > MAX_QUEUE_BYTES) {
          turn.queue.length = 0
          turn.queueBytes = 0
          this.push(turn, { type: 'ended', at: new Date(this.now()).toISOString(), report: { state: 'failed', summary: 'O computador remoto enviou eventos demais.' } })
          await this.finish(turn)
          return { status: 413, body: { ok: false, reason: 'too-big' satisfies ExecutorRefusal } }
        }
      }
      turn.expected += 1
      for (const event of op.events) this.push(turn, event)
      return { status: 200, body: { ok: true } }
    }
    const existing = turn.calls.get(op.callId)
    if (existing !== undefined) return existing
    if (turn.calls.size >= MAX_CALLS) return { status: 429, body: { ok: false, reason: 'busy' satisfies ExecutorRefusal } }
    const pending = this.runTool(turn, op.name, op.args)
    turn.calls.set(op.callId, pending)
    return pending
  }

  private async runTool(turn: RemoteTurn, name: string, args: Record<string, unknown>): Promise<LinkAnswer> {
    const tool = turn.tools?.tools.find(item => item.name === name)
    if (tool === undefined) return { status: 404, body: { ok: false, reason: 'unknown-tool' satisfies ExecutorRefusal } }
    if (turn.toolsRunning >= MAX_TOOLS_AT_ONCE || (this.toolsByComputer.get(turn.computerId) ?? 0) >= MAX_TOOLS_PER_COMPUTER) return { status: 429, body: { ok: false, reason: 'busy' satisfies ExecutorRefusal } }
    // Lumen R4: the slot is held until the HANDLER ends, not until the model is answered: a call that timed out is still running underneath and still counts.
    turn.toolsRunning += 1
    this.toolsByComputer.set(turn.computerId, (this.toolsByComputer.get(turn.computerId) ?? 0) + 1)
    const running = Promise.resolve().then(() => tool.handler(args))
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      turn.toolsRunning -= 1
      const left = (this.toolsByComputer.get(turn.computerId) ?? 1) - 1
      if (left <= 0) this.toolsByComputer.delete(turn.computerId); else this.toolsByComputer.set(turn.computerId, left)
    }
    void running.then(release, release)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new Error('timeout')) }, this.deps.toolTimeoutMs ?? EXECUTOR_TOOL_TIMEOUT_MS) })
      const result = await Promise.race([running, timeout])
      return { status: 200, body: { ok: true, content: result.content.slice(0, EXECUTOR_MAX_TOOL_RESULT), ...(result.isError === true ? { isError: true } : {}) } }
    } catch (error) {
      void error // the handler failed or ran out of time: the model reads an error result, no detail of this PC leaves
      return { status: 200, body: { ok: true, content: 'A ferramenta falhou.', isError: true } }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  private push(turn: RemoteTurn, event: RunEvent): void {
    if (turn.over) return
    if (event.type === 'usage') turn.usage = event.usage
    if (turn.waiter !== undefined) { const waiter = turn.waiter; turn.waiter = undefined; waiter.resolve(event) } else { turn.queue.push(event); turn.queueBytes += Buffer.byteLength(JSON.stringify(event), 'utf8') }
  }

  private next(turn: RemoteTurn, silenceMs: number): Promise<RunEvent | undefined> {
    const queued = turn.queue.shift()
    if (queued !== undefined) { turn.queueBytes -= Buffer.byteLength(JSON.stringify(queued), 'utf8'); return Promise.resolve(queued) }
    return new Promise((resolve) => {
      const check = (): void => {
        if (turn.waiter === undefined) return // answered meanwhile
        if (this.now() - turn.lastSeen >= silenceMs) { turn.waiter = undefined; resolve(undefined); return }
        setTimeout(check, Math.min(1_000, Math.max(10, silenceMs / 4))).unref()
      }
      turn.waiter = { resolve }
      setTimeout(check, Math.min(1_000, Math.max(10, silenceMs / 4))).unref()
    })
  }

  /** The turn is over: its tool lease closes (once) and what is left is forgotten. */
  private async finish(turn: RemoteTurn): Promise<void> {
    if (turn.closed) return
    turn.closed = true
    turn.over = true
    turn.waiter?.resolve(undefined)
    turn.waiter = undefined
    await Promise.resolve(turn.tools?.close?.()).catch(() => undefined)
    setTimeout(() => { this.turns.delete(turn.turnId) }, 60_000).unref()
  }
}

/**
 * The runner A gives the orchestration for a persona whose home is another computer: the whole `Runner` contract of persona-runners (`TurnRunner`), so the host can use it wherever it uses a runner. What it
 * says about itself is what A knows: the other computer's runner is a CLI that serves the product's tools and cancels, streams and reports usage; it cannot resume A's sessions (they are not on that computer).
 */
export class RemoteRunner implements TurnRunner {
  /**
   * @param turns - The turns this PC has sent away.
   * @param computerId - The persona's home, when known (the health says whether it is on).
   * @param spec - The engine hint that goes with every turn this runner sends.
   */
  constructor(private readonly turns: RemoteTurns, private readonly computerId?: string, private readonly spec?: ExecutorSpec) {}

  /** Lumen R5: where what this runner spends comes from. The other computer's tokens are on ITS account: they are never booked on this PC's official windows. */
  get origin(): string {
    return `remote:${this.computerId ?? 'unknown'}`
  }

  /** @param handle - A turn. @returns What the home SAID it spent (clamped), for a screen that shows "ran on another computer"; never the number the orchestration books. */
  remoteUsage(handle: RunHandle): RunnerUsage {
    return this.turns.usageOf(handle)
  }

  /** @returns What this runner can do, as A knows it. */
  capabilities(): TurnCapabilities {
    return { kind: 'cli', stream: true, cancel: true, resume: false, usage: true, mcpTools: 'available', permission: 'explicit' }
  }

  /** @returns Whether the persona's computer is on (a persona with no known home is unknown: not healthy). */
  health(): Promise<RunnerHealth> {
    const on = this.computerId !== undefined && this.turns.online(this.computerId)
    return Promise.resolve({ ok: on, detail: on ? 'ok' : 'executor-offline' })
  }

  /** @returns The same answer as the health: the login lives on the other computer and A cannot see it. */
  authenticate(): Promise<RunnerAuth> {
    return this.health()
  }

  /** @param input - The turn. @returns Its handle. */
  resume(input: StartTurnInput): Promise<RunHandle> {
    return this.turns.startTurn(input, this.spec) // A's session is not on the other computer: a resumed turn is a new turn there (its history travels in the input)
  }

  /** @returns ALWAYS zeros: the orchestration books what this reads on this PC's own account and windows, and what B spends is B's (see {@link RemoteRunner.remoteUsage} for its word, apart). */
  usage(): Promise<RunnerUsage> {
    return Promise.resolve({ inputTokens: 0, outputTokens: 0 })
  }

  /** @param input - The turn. @returns Its handle. */
  startTurn(input: StartTurnInput): Promise<RunHandle> {
    return this.turns.startTurn(input, this.spec)
  }

  /** @param input - The turn. @returns Its handle. */
  start(input: StartTurnInput): Promise<RunHandle> {
    return this.turns.startTurn(input, this.spec)
  }

  /** @param handle - The turn. @returns Its events. */
  stream(handle: RunHandle): AsyncIterable<RunEvent> {
    return this.turns.stream(handle)
  }

  /** @param handle - The turn. @returns Its events. */
  events(handle: RunHandle): AsyncIterable<RunEvent> {
    return this.turns.stream(handle)
  }

  /** @param handle - The turn. */
  cancel(handle: RunHandle): Promise<void> {
    return this.turns.cancel(handle)
  }

  /** @param handle - The turn. @param requestId - The input id. @param text - What to say. @returns Whether the home's runner took it. */
  steer(handle: RunHandle, requestId: string, text: string): Promise<boolean> {
    return this.turns.steer(handle, requestId, text)
  }
}
