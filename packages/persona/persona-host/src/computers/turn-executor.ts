/**
 * D-116 executor, the persona's HOME side (B): runs the turn A asked for with B's own runner and account, in a scratch folder of its own, and sends back what the runner emits. The product tools of the turn are served
 * to the runner by a PROXY: each call goes back to A, signed, and A runs the real handler bound to the turn's lease — so grants and ACL stay on A and B only carries. See `executor-protocol.ts` for the wire.
 *
 * What B checks before it runs anything: the call comes from the OWNER's PC (the only computer that holds the project and may ask), the start is not past its deadline, B has a runner, and B's own home book says the
 * persona lives HERE at that epoch or higher (a persona moved away, or fenced, never runs on a stale order). It runs at most {@link EXECUTOR_MAX_TURNS} turns for the team at once; a repeated start of the same turn is
 * the same turn. B that cannot reach A for {@link EXECUTOR_ORPHAN_MS} stops the local turn: nobody is listening and it would only burn the person's quota.
 */

import type { RunEvent, RunHandle, StartTurnInput } from '@deepseek-ai/dsh-persona-runners'
import type { LinkAnswer } from './computer-link.ts'
import {
  EXECUTOR_HEARTBEAT_MS, EXECUTOR_MAX_TOOL_RESULT, EXECUTOR_MAX_TURNS, EXECUTOR_ORPHAN_MS, inputOf, type ExecutorOp, type ExecutorRefusal, type ExecutorSpec, type ExecutorStart,
} from './executor-protocol.ts'

/** What B needs of its runner: the real `Runner` of persona-runners satisfies it. */
export interface ExecutorRunner {
  /** `hint` is the engine the persona asked for on the owner's PC (A): honor it when this computer has that engine, else run on the engine of THIS computer's own account. */
  startTurn(input: StartTurnInput, hint?: ExecutorSpec): Promise<RunHandle>
  stream(handle: RunHandle): AsyncIterable<RunEvent>
  cancel(handle: RunHandle): Promise<void>
  steer?(handle: RunHandle, requestId: string, text: string): Promise<boolean>
  /** What the runner can do and whether it is healthy (for `info`); absent = not reported. */
  capabilities?(): unknown
  health?(): Promise<{ readonly ok: boolean; readonly detail: string }>
}

/** What a call to A answered. */
export interface ExecutorReply {
  readonly status: number
  readonly json?: unknown
}

/** What B needs. */
export interface TurnExecutorDeps {
  /** The only computer that may ask B to run a turn: the owner's PC (`undefined` = not a member yet: nobody). */
  readonly ownerComputerId: () => string | undefined
  /** B's own runner (the account of THIS computer), or `undefined` when there is none. */
  readonly runner: () => ExecutorRunner | undefined
  /** B's home book: does the persona live HERE, active, at this epoch or higher? */
  readonly homeCheck: (personaId: string, epoch: number) => 'ok' | 'not-here' | 'epoch'
  /** A scratch folder for the persona (created if missing): the turn never gets a path of A. */
  readonly scratchDir: (personaId: string) => string
  /**
   * Takes a slot of THIS host's own capacity for the turn (the same one a local turn takes, so the ceiling of resident runners and the budget of the machine count it). Returns what gives the slot back when the turn
   * is over, or `undefined` when there is no slot (the start is then `busy`). Absent = the executor's own cap alone.
   */
  readonly admit?: (personaId: string) => (() => void) | undefined
  /** A signed call to another computer. May reject when it cannot connect. */
  readonly send: (to: string, op: ExecutorOp) => Promise<ExecutorReply>
  readonly now?: () => number
  readonly heartbeatMs?: number
  readonly orphanMs?: number
  readonly maxTurns?: number
  /** Events wait this long to be batched (tests make it small). */
  readonly batchMs?: number
}

interface Turn {
  readonly turnId: string
  readonly from: string
  readonly runner: ExecutorRunner
  /** Gives back the slot taken at the start (once). */
  release: (() => void) | undefined
  handle: RunHandle | undefined
  seq: number
  pending: RunEvent[]
  lastOk: number
  done: boolean
  readonly stop: () => void
}

const ended = (summary: string, now: number): RunEvent => ({ type: 'ended', at: new Date(now).toISOString(), report: { state: 'failed', summary } })

/** The persona's home. */
export class TurnExecutor {
  private readonly turns = new Map<string, Turn>()
  private nextCall = 0
  private readonly now: () => number

  /** @param deps - See {@link TurnExecutorDeps}. */
  constructor(private readonly deps: TurnExecutorDeps) {
    this.now = deps.now ?? Date.now
  }

  /** @returns How many turns are running here for the team. */
  active(): number {
    return [...this.turns.values()].filter(turn => !turn.done).length
  }

  /**
   * A call from another computer (already verified by the door).
   * @param from - Who signed it.
   * @param op - What it asks.
   * @returns The answer.
   */
  async handle(from: string, op: ExecutorOp): Promise<LinkAnswer> {
    switch (op.op) {
      case 'start': return this.start(from, op)
      case 'cancel': return this.cancel(from, op.turnId)
      case 'steer': return this.steer(from, op.turnId, op.requestId, op.text)
      case 'info': return this.info(from)
      default: return { status: 400, body: { ok: false, reason: 'malformed' satisfies ExecutorRefusal } } // `event` and `tool` flow the other way: they are A's to receive
    }
  }

  /** Stops every local turn (the host is closing). */
  async stopAll(): Promise<void> {
    for (const turn of [...this.turns.values()]) {
      turn.stop()
      if (turn.handle !== undefined) await turn.runner.cancel(turn.handle).catch(() => undefined)
      this.giveBack(turn)
    }
  }

  private refuse(status: number, reason: ExecutorRefusal): LinkAnswer {
    return { status, body: { ok: false, reason } }
  }

  private async start(from: string, start: ExecutorStart): Promise<LinkAnswer> {
    if (from !== this.deps.ownerComputerId()) return this.refuse(403, 'not-owner')
    const existing = this.turns.get(start.turnId)
    if (existing !== undefined) return existing.from === from ? { status: 202, body: { ok: true } } : this.refuse(403, 'not-owner') // the same turn asked twice is the same turn
    if (start.notAfter < this.now()) return this.refuse(410, 'expired')
    const runner = this.deps.runner()
    if (runner === undefined) return this.refuse(503, 'no-runner')
    const home = this.deps.homeCheck(start.personaId, start.epoch)
    if (home !== 'ok') return this.refuse(409, home)
    if (this.active() >= (this.deps.maxTurns ?? EXECUTOR_MAX_TURNS)) return this.refuse(429, 'busy')
    const release = this.deps.admit?.(start.personaId)
    if (this.deps.admit !== undefined && release === undefined) return this.refuse(429, 'busy') // this host has no slot for one more turn
    const call = (name: string, args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> => this.proxyTool(from, start.turnId, name, args)
    const turn: Turn = { turnId: start.turnId, from, runner, release, handle: undefined, seq: 0, pending: [], lastOk: this.now(), done: false, stop: () => { turn.done = true } }
    this.turns.set(start.turnId, turn)
    try {
      turn.handle = await runner.startTurn(inputOf(start, this.deps.scratchDir(start.personaId), call), start.spec)
    } catch (error) {
      void error
      this.turns.delete(start.turnId)
      this.giveBack(turn)
      return this.refuse(503, 'no-runner')
    }
    void this.pump(turn)
    return { status: 202, body: { ok: true } }
  }

  private async cancel(from: string, turnId: string): Promise<LinkAnswer> {
    const turn = this.turns.get(turnId)
    if (turn === undefined) return { status: 200, body: { ok: true } } // already over: idempotent
    if (turn.from !== from) return this.refuse(403, 'wrong-computer')
    if (turn.handle !== undefined) await turn.runner.cancel(turn.handle).catch(() => undefined)
    return { status: 200, body: { ok: true } }
  }

  private async steer(from: string, turnId: string, requestId: string, text: string): Promise<LinkAnswer> {
    const turn = this.turns.get(turnId)
    if (turn === undefined || turn.done || turn.handle === undefined) return this.refuse(404, 'unknown-turn')
    if (turn.from !== from) return this.refuse(403, 'wrong-computer')
    const taken = turn.runner.steer === undefined ? false : await turn.runner.steer(turn.handle, requestId, text).catch(() => false)
    return { status: 200, body: { ok: true, taken } }
  }

  private async info(from: string): Promise<LinkAnswer> {
    if (from !== this.deps.ownerComputerId()) return this.refuse(403, 'not-owner')
    const runner = this.deps.runner()
    if (runner === undefined) return { status: 200, body: { ok: true, runner: false } }
    const health = runner.health === undefined ? undefined : await runner.health().catch(() => ({ ok: false, detail: 'health-failed' }))
    return { status: 200, body: { ok: true, runner: true, capabilities: runner.capabilities?.(), ...(health === undefined ? {} : { health: { ok: health.ok, detail: health.detail } }) } }
  }

  /** One tool call of the turn goes to A; whatever goes wrong becomes an error RESULT the model can read, never a hang or a throw inside the CLI. */
  private async proxyTool(to: string, turnId: string, name: string, args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
    this.nextCall += 1
    try {
      const reply = await this.deps.send(to, { op: 'tool', turnId, callId: `${turnId}-${String(this.nextCall)}`, name, args })
      const json = reply.json
      if (reply.status !== 200 || typeof json !== 'object' || json === null || typeof (json as { content?: unknown }).content !== 'string') return { content: 'A ferramenta não respondeu.', isError: true }
      const body = json as { content: string; isError?: unknown }
      return { content: body.content.slice(0, EXECUTOR_MAX_TOOL_RESULT), ...(body.isError === true ? { isError: true } : {}) }
    } catch (error) {
      void error
      return { content: 'O computador do projeto não respondeu.', isError: true }
    }
  }

  /** Pull the runner's events and send them to A in batches; an empty batch every few seconds says "still here". */
  private async pump(turn: Turn): Promise<void> {
    const handle = turn.handle
    if (handle === undefined) return
    const heartbeatMs = this.deps.heartbeatMs ?? EXECUTOR_HEARTBEAT_MS
    const orphanMs = this.deps.orphanMs ?? EXECUTOR_ORPHAN_MS
    let flushing: Promise<void> = Promise.resolve()
    const flush = (): Promise<void> => {
      flushing = flushing.then(() => this.flush(turn))
      return flushing
    }
    const beat = setInterval(() => {
      if (this.now() - turn.lastOk > orphanMs) { // nobody on the other end: stop spending the person's quota
        turn.pending = []
        void turn.runner.cancel(handle).catch(() => undefined)
        return
      }
      void flush()
    }, heartbeatMs)
    beat.unref()
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = (): void => { if (timer === undefined) { timer = setTimeout(() => { timer = undefined; void flush() }, this.deps.batchMs ?? 150); timer.unref() } }
    let sawEnd = false
    try {
      for await (const event of turn.runner.stream(handle)) {
        turn.pending.push(event)
        if (event.type === 'ended') { sawEnd = true; break }
        if (turn.pending.length >= 50) void flush()
        else later()
      }
    } catch (error) {
      void error
      turn.pending.push(ended('O motor do computador dela falhou.', this.now()))
      sawEnd = true
    }
    if (!sawEnd) turn.pending.push(ended('O motor do computador dela terminou sem avisar.', this.now()))
    if (timer !== undefined) clearTimeout(timer)
    clearInterval(beat)
    // the last events matter: try for a while before giving up (A may be busy for a moment)
    for (let attempt = 0; attempt < 5 && turn.pending.length > 0; attempt += 1) await flush()
    turn.done = true
    this.giveBack(turn)
    setTimeout(() => { this.turns.delete(turn.turnId) }, 60_000).unref()
  }

  /** The turn is over: the slot it held goes back (once). */
  private giveBack(turn: Turn): void {
    const release = turn.release
    turn.release = undefined
    try {
      release?.()
    } catch (error) {
      void error // a release that fails must not break the turn's end
    }
  }

  /** Send what is pending (or an empty beat). A batch that did not arrive is kept and goes again with the SAME sequence number: A takes each once. */
  private async flush(turn: Turn): Promise<void> {
    const events = turn.pending.slice(0, 100)
    try {
      const reply = await this.deps.send(turn.from, { op: 'event', turnId: turn.turnId, seq: turn.seq, events })
      if (reply.status === 200 || reply.status === 202) {
        turn.pending = turn.pending.slice(events.length)
        turn.seq += 1
        turn.lastOk = this.now()
      } else if (reply.status === 404 || reply.status === 403) {
        turn.pending = [] // A does not know this turn any more: nothing to send it to
        if (turn.handle !== undefined) void turn.runner.cancel(turn.handle).catch(() => undefined)
      }
    } catch (error) {
      void error // A is unreachable right now: the batch stays, the orphan timer decides when to stop
    }
  }
}
