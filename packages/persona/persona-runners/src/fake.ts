/**
 * Scripted in-process Runner for every Persona test that needs a session.
 * No quota, no CLI, no model. Plays recorded deliveries and background jobs.
 */

import type {
  DeliverMode,
  Runner,
  RunnerBackground,
  RunnerCapabilities,
  RunnerEvent,
  RunnerRole,
  RunnerStatus,
} from './port.ts'
import { toolsForRole } from './port.ts'

const CAPABILITIES: RunnerCapabilities = {
  steer: true,
  removeQueued: true,
  reportsInputTaken: true,
  background: true,
  tools: 'native',
  resume: true,
}

export interface FakeDelivery {
  sessionId: string
  requestId: string
  text: string
  mode: DeliverMode
}

export interface FakeSessionSnapshot {
  id: string
  cwd: string
  title: string
  role: RunnerRole
  tools: readonly string[]
  status: RunnerStatus
}

export interface FakeRunnerOptions {
  tools?: readonly string[]
  now?: () => Date
  /** Keep a session `running` after deliver until {@link Runner.whenIdle} runs. */
  holdUntilIdle?: boolean
  /**
   * When a delivered text mentions a shell lasting longer than this (ms),
   * record a background job and stay non-blocking (D-041).
   */
  backgroundAfterMs?: number
}

interface Live {
  id: string
  cwd: string
  title: string
  role: RunnerRole
  tools: string[]
  status: Exclude<RunnerStatus, 'missing'>
  inbox: FakeDelivery[]
  seen: Set<string>
  jobs: string[]
  idleWaiters: Array<() => void>
}

export interface FakeRunner extends Runner {
  delivered: readonly FakeDelivery[]
  session(id: string): FakeSessionSnapshot | undefined
  usage(sessionId: string): Promise<{ inputTokens: number; outputTokens: number }>
}

/**
 * Create the scripted Runner used by executor, coordination, and CLI tests.
 * @param options - advertised tools and idle/background behaviour.
 */
export function createFakeRunner(options: FakeRunnerOptions = {}): FakeRunner {
  const now = options.now ?? (() => new Date())
  const backgroundAfterMs = options.backgroundAfterMs ?? 5_000
  const offered = options.tools ?? ['bash', 'read', 'persona_report', 'persona_route', 'persona_ask']
  const sessions = new Map<string, Live>()
  const listeners = new Set<(event: RunnerEvent) => void>()
  const delivered: FakeDelivery[] = []

  const emit = (event: Omit<RunnerEvent, 'at'> & { at?: string }): void => {
    const full: RunnerEvent = { ...event, at: event.at ?? now().toISOString() }
    for (const listener of listeners) listener(full)
  }

  const requireLive = (sessionId: string): Live => {
    const live = sessions.get(sessionId)
    if (live === undefined) throw new Error(`missing session ${sessionId}`)
    return live
  }

  const settle = (live: Live): void => {
    live.status = 'idle'
    const waiters = live.idleWaiters.splice(0)
    for (const waiter of waiters) waiter()
    emit({ type: 'idle', sessionId: live.id })
  }

  const background: RunnerBackground = {
    running: (sessionId: string) => sessions.get(sessionId)?.jobs.slice() ?? [],
    untilQuiet: async (sessionId: string) => {
      const live = sessions.get(sessionId)
      if (live !== undefined) live.jobs = []
    },
    kill: async (sessionId: string) => {
      const live = sessions.get(sessionId)
      if (live !== undefined) live.jobs = []
    },
    stopSubagents: async (sessionId: string, keepInbox: boolean) => {
      const live = sessions.get(sessionId)
      if (live === undefined) return
      live.jobs = []
      if (!keepInbox) live.inbox = []
    },
  }

  const runner: FakeRunner = {
    delivered,
    session: (id: string) => {
      const live = sessions.get(id)
      if (live === undefined) return undefined
      return { id: live.id, cwd: live.cwd, title: live.title, role: live.role, tools: live.tools, status: live.status }
    },
    usage: async () => ({ inputTokens: 1, outputTokens: 1 }),
    ensureSession: async (id: string, cwd: string, title: string, role: RunnerRole) => {
      const existing = sessions.get(id)
      if (existing !== undefined) {
        existing.cwd = cwd
        existing.title = title
        existing.role = role
        existing.tools = toolsForRole(role, offered)
        return
      }
      sessions.set(id, {
        id, cwd, title, role,
        tools: toolsForRole(role, offered),
        status: 'idle',
        inbox: [],
        seen: new Set(),
        jobs: [],
        idleWaiters: [],
      })
    },
    deliver: async (sessionId: string, requestId: string, text: string, mode: DeliverMode) => {
      const live = requireLive(sessionId)
      if (live.seen.has(requestId)) return
      live.seen.add(requestId)
      const item: FakeDelivery = { sessionId, requestId, text, mode }
      delivered.push(item)
      if (mode !== 'inject') live.inbox.push(item)
      live.status = 'running'
      emit({ type: 'running', sessionId, requestId })
      emit({ type: 'inputTaken', sessionId, requestId })
      if (mode === 'steer') emit({ type: 'userTurnStarted', sessionId, requestId })
      const duration = /(?:after|elapsed) (\d+)/u.exec(text)
      const elapsed = duration === null ? 0 : Number(duration[1])
      if (elapsed > backgroundAfterMs) {
        live.jobs.push(requestId)
      }
      if (options.holdUntilIdle !== true) settle(live)
    },
    cancel: async (sessionId: string, optionsCancel: { keepInbox: boolean }) => {
      const live = requireLive(sessionId)
      if (!optionsCancel.keepInbox) live.inbox = []
      live.jobs = []
      settle(live)
    },
    status: (sessionId: string) => sessions.get(sessionId)?.status ?? 'missing',
    whenIdle: async (sessionId: string) => {
      const live = requireLive(sessionId)
      if (live.status === 'idle') return
      await new Promise<void>((resolve) => { live.idleWaiters.push(resolve) })
    },
    onEvent: (listener: (event: RunnerEvent) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    capabilities: () => CAPABILITIES,
    background,
  }
  return runner
}
