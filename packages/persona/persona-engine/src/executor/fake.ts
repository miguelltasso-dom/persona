/**
 * Scripted in-memory Runner for executor tests. A fake clock drives events.
 */

import type {
  DeliverMode, Runner, RunnerCapabilities, RunnerEvent, RunnerRole, RunnerStatus,
} from '../ports/runner.ts'
import { toolsForRole } from '../ports/runner.ts'

export type FakeScript = 'ok' | 'transient' | 'prepare-fail' | 'hold'

interface FakeSession {
  id: string
  cwd: string
  title: string
  role: RunnerRole
  status: Exclude<RunnerStatus, 'missing'>
  inbox: string[]
  delivered: string[]
  tools: string[]
}

/**
 * @param startMs - Initial clock reading.
 */
export class FakeClock {
  constructor(private ms: number = 0) {}
  now(): number { return this.ms }
  iso(): string { return new Date(this.ms).toISOString() }
  /**
   * @param byMs - Milliseconds to add.
   */
  advance(byMs: number): void { this.ms += byMs }
  /**
   * Absolute jump (laptop sleep, DST, user-changed zone).
   * @param ms - New clock reading.
   */
  jumpTo(ms: number): void { this.ms = ms }
}

export class FakeRunner implements Runner {
  readonly sessions = new Map<string, FakeSession>()
  readonly deliveries: Array<{ sessionId: string; requestId: string; text: string; mode: DeliverMode }> = []
  readonly events: RunnerEvent[] = []
  readonly cancelled: Array<{ sessionId: string; keepInbox: boolean }> = []
  script: FakeScript = 'ok'
  hold: Promise<void> | undefined
  private readonly listeners = new Set<(event: RunnerEvent) => void>()
  readonly capabilitiesValue: RunnerCapabilities = {
    steer: true,
    removeQueued: true,
    reportsInputTaken: true,
    background: true,
    tools: 'native',
    resume: true,
  }

  constructor(
    private readonly clock: FakeClock = new FakeClock(),
    private readonly defaultTools: readonly string[] = ['files', 'bash'],
  ) {}

  capabilities(): RunnerCapabilities { return this.capabilitiesValue }

  async ensureSession(id: string, cwd: string, title: string, role: RunnerRole): Promise<void> {
    if (this.script === 'prepare-fail') throw new Error('prepare failed')
    if (this.script === 'hold' && this.hold) await this.hold
    const existing = this.sessions.get(id)
    if (existing !== undefined) {
      existing.cwd = cwd
      existing.title = title
      return
    }
    this.sessions.set(id, {
      id,
      cwd,
      title,
      role,
      status: 'idle',
      inbox: [],
      delivered: [],
      tools: toolsForRole(role, this.defaultTools),
    })
  }

  async deliver(sessionId: string, requestId: string, text: string, mode: DeliverMode): Promise<void> {
    if (this.script === 'transient') throw new Error('ECONNRESET provider overloaded')
    if (this.script === 'hold' && this.hold) await this.hold
    const session = this.require(sessionId)
    if (session.delivered.includes(requestId)) return
    session.delivered.push(requestId)
    this.deliveries.push({ sessionId, requestId, text, mode })
    if (mode === 'queue') session.inbox.push(text)
    session.status = 'running'
    this.emit({ type: 'running', sessionId, at: this.clock.iso(), requestId })
    this.emit({ type: 'inputTaken', sessionId, at: this.clock.iso(), requestId })
  }

  async cancel(sessionId: string, options: { keepInbox: boolean }): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session === undefined) return
    this.cancelled.push({ sessionId, keepInbox: options.keepInbox })
    if (!options.keepInbox) session.inbox = []
    session.status = 'idle'
    this.emit({ type: 'idle', sessionId, at: this.clock.iso() })
  }

  status(sessionId: string): RunnerStatus {
    return this.sessions.get(sessionId)?.status ?? 'missing'
  }

  async whenIdle(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) session.status = 'idle'
  }

  onEvent(listener: (event: RunnerEvent) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * @param sessionId - Session that a person typed into.
   */
  userTyped(sessionId: string): void {
    this.emit({ type: 'userTurnStarted', sessionId, at: this.clock.iso() })
  }

  /**
   * @param sessionId - Session that failed.
   * @param error - Error text.
   */
  fail(sessionId: string, error: string): void {
    this.emit({ type: 'error', sessionId, at: this.clock.iso(), error })
  }

  background = {
    running: (sessionId: string): string[] => this.sessions.has(sessionId) ? ['job-1'] : [],
    untilQuiet: async (_sessionId: string, _untilMs: number): Promise<void> => {},
    kill: async (sessionId: string, _reason: string): Promise<void> => {
      const session = this.sessions.get(sessionId)
      if (session) session.status = 'idle'
    },
    stopSubagents: async (sessionId: string, keepInbox: boolean): Promise<void> => {
      await this.cancel(sessionId, { keepInbox })
    },
  }

  private require(sessionId: string): FakeSession {
    const session = this.sessions.get(sessionId)
    if (session === undefined) throw new Error(`missing session ${sessionId}`)
    return session
  }

  private emit(event: RunnerEvent): void {
    this.events.push(event)
    for (const listener of this.listeners) listener(event)
  }
}
