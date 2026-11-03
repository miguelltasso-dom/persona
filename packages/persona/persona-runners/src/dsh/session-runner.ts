/**
 * DSH session Runner: one `ctx.agents` session + one directory per worker
 * ticket, and one long session for coordination. Host binds {@link DshSessionPort}.
 */

import type {
  DeliverMode,
  Runner,
  RunnerBackground,
  RunnerCapabilities,
  RunnerEvent,
  RunnerRole,
  RunnerStatus,
} from '../port.ts'
import { toolsForRole } from '../port.ts'
import type { RunnerUsage } from '../contract.ts'

const CAPABILITIES: RunnerCapabilities = {
  steer: true,
  removeQueued: true,
  reportsInputTaken: true,
  background: true,
  tools: 'native',
  resume: true,
}

/** Bound agent the host maps from `ctx.agents.create` / `resume`. */
export interface DshBoundSession {
  id: string
  status(): 'idle' | 'running'
  followup(requestId: string, text: string): void
  steer(requestId: string, text: string): void
  inject(requestId: string, text: string): void
  cancel(options: { keepInbox: boolean }): Promise<void>
  whenIdle(): Promise<void>
  onEvent(listener: (event: { type: string; requestId?: string; error?: string; elapsedMs?: number; tool?: string }) => void): () => void
  usage(): RunnerUsage
  runningJobs(): string[]
  untilQuiet(untilMs: number): Promise<void>
  killJob(reason: string): Promise<void>
  stopSubagents(keepInbox: boolean): Promise<void>
}

/** Host-supplied `ctx.agents` surface (tests inject a scripted port). */
export interface DshSessionPort {
  create(input: { id: string; cwd: string; title: string; tools: readonly string[] }): Promise<DshBoundSession>
  resume?(input: { id: string; cwd: string }): Promise<DshBoundSession>
}

export interface DshSessionRunnerOptions {
  agent: DshSessionPort
  now?: () => Date
  tools?: readonly string[]
  /** Shell tool runtime after which a job is tracked without blocking deliver (D-041). */
  backgroundShellAfterMs?: number
}

export interface DshSessionRunner extends Runner {
  usage(sessionId: string): Promise<RunnerUsage>
}

/**
 * Session-oriented DSH adapter over {@link DshSessionPort}.
 * @param options - agent port, tool allowlist, and the 5 s background threshold.
 */
export function createDshSessionRunner(options: DshSessionRunnerOptions): DshSessionRunner {
  const now = options.now ?? (() => new Date())
  const backgroundShellAfterMs = options.backgroundShellAfterMs ?? 5_000
  const offered = options.tools ?? ['bash', 'read', 'write', 'persona_report', 'persona_route', 'persona_ask', 'persona_recall']
  const bound = new Map<string, DshBoundSession>()
  const seen = new Map<string, Set<string>>()
  const listeners = new Set<(event: RunnerEvent) => void>()
  const unsubs = new Map<string, () => void>()

  const emit = (type: RunnerEvent['type'], sessionId: string, requestId?: string, error?: string): void => {
    const event: RunnerEvent = { type, sessionId, at: now().toISOString() }
    if (requestId !== undefined) event.requestId = requestId
    if (error !== undefined) event.error = error
    for (const listener of listeners) listener(event)
  }

  const attach = (session: DshBoundSession): void => {
    unsubs.get(session.id)?.()
    const stop = session.onEvent((raw) => {
      if (raw.tool !== undefined && (raw.elapsedMs ?? 0) > backgroundShellAfterMs) {
        emit('running', session.id, raw.requestId)
        return
      }
      if (raw.type === 'error') {
        emit('error', session.id, raw.requestId, raw.error)
        return
      }
      if (raw.type === 'idle' || raw.type === 'running' || raw.type === 'inputTaken' || raw.type === 'userTurnStarted') {
        emit(raw.type, session.id, raw.requestId)
      }
    })
    unsubs.set(session.id, stop)
  }

  const requireSession = (sessionId: string): DshBoundSession => {
    const session = bound.get(sessionId)
    if (session === undefined) throw new Error(`missing session ${sessionId}`)
    return session
  }

  const background: RunnerBackground = {
    running: (sessionId: string) => bound.get(sessionId)?.runningJobs() ?? [],
    untilQuiet: async (sessionId: string, untilMs: number) => {
      await bound.get(sessionId)?.untilQuiet(untilMs)
    },
    kill: async (sessionId: string, reason: string) => {
      await bound.get(sessionId)?.killJob(reason)
    },
    stopSubagents: async (sessionId: string, keepInbox: boolean) => {
      await bound.get(sessionId)?.stopSubagents(keepInbox)
    },
  }

  return {
    ensureSession: async (id: string, cwd: string, title: string, role: RunnerRole) => {
      const existing = bound.get(id)
      if (existing !== undefined) return
      const tools = toolsForRole(role, offered)
      // TODO(Rivet): resume the native session instead of creating a new one when options.agent.resume is available.
      const session = await options.agent.create({ id, cwd, title, tools })
      bound.set(id, session)
      seen.set(id, new Set())
      attach(session)
    },
    deliver: async (sessionId: string, requestId: string, text: string, mode: DeliverMode) => {
      const session = requireSession(sessionId)
      const taken = seen.get(sessionId) ?? new Set<string>()
      if (taken.has(requestId)) return
      taken.add(requestId)
      seen.set(sessionId, taken)
      if (mode === 'steer') session.steer(requestId, text)
      else if (mode === 'inject') session.inject(requestId, text)
      else session.followup(requestId, text)
    },
    cancel: async (sessionId: string, cancelOptions: { keepInbox: boolean }) => {
      await requireSession(sessionId).cancel(cancelOptions)
    },
    status: (sessionId: string): RunnerStatus => {
      const session = bound.get(sessionId)
      return session === undefined ? 'missing' : session.status()
    },
    whenIdle: async (sessionId: string) => {
      await requireSession(sessionId).whenIdle()
    },
    onEvent: (listener: (event: RunnerEvent) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    capabilities: () => CAPABILITIES,
    background,
    usage: async (sessionId: string) => requireSession(sessionId).usage(),
  }
}
