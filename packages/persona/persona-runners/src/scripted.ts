/** In-process scripted runner used by contract tests and CLI fakes (no quota). */

import {
  eventTime,
  RECOVERY_NOTE,
  type HistoryTurn,
  type RunEvent,
  type RunHandle,
  type Runner,
  type RunnerAuth,
  type RunnerCapabilities,
  type RunnerHealth,
  type RunnerUsage,
  type StartTurnInput,
} from './contract.ts'

export interface ScriptedTurn {
  events: readonly RunEvent[]
  usage?: RunnerUsage
}

export interface ScriptedRunnerOptions {
  capabilities?: Partial<RunnerCapabilities>
  health?: RunnerHealth
  auth?: RunnerAuth
  turns?: readonly ScriptedTurn[]
  now?: () => Date
}

interface LiveRun {
  handle: RunHandle
  events: RunEvent[]
  usage: RunnerUsage
  cancelled: boolean
  history: HistoryTurn[]
}

const EMPTY_USAGE: RunnerUsage = { inputTokens: 0, outputTokens: 0 }

/**
 * Create a runner that plays recorded events. Cancel stops the remaining
 * stream; resume keeps history and can prepend {@link RECOVERY_NOTE}.
 * @param options - recorded turns and advertised capabilities.
 */
export function createScriptedRunner(options: ScriptedRunnerOptions = {}): Runner {
  const capabilities: RunnerCapabilities = {
    kind: options.capabilities?.kind ?? 'dsh',
    stream: options.capabilities?.stream ?? true,
    cancel: options.capabilities?.cancel ?? true,
    resume: options.capabilities?.resume ?? true,
    usage: options.capabilities?.usage ?? true,
    mcpTools: options.capabilities?.mcpTools ?? 'available',
    permission: options.capabilities?.permission ?? 'none',
    ...(options.capabilities?.cli !== undefined ? { cli: options.capabilities.cli } : {}),
  }
  const health = options.health ?? { ok: true, detail: 'scripted' }
  const auth = options.auth ?? { ok: true, detail: 'scripted' }
  const now = options.now ?? (() => new Date())
  const queue = [...(options.turns ?? [])]
  const runs = new Map<string, LiveRun>()
  const stored = new Map<string, HistoryTurn[]>()
  let seq = 0

  const begin = (input: StartTurnInput, recovery: boolean): RunHandle => {
    const turn = queue.shift() ?? { events: [], usage: EMPTY_USAGE }
    const sessionId = input.resumeSessionId ?? `scripted-session-${String(++seq)}`
    const handle: RunHandle = {
      runId: `scripted-run-${String(seq)}`,
      sessionId,
      ticketId: input.ticketId,
      assignmentId: input.assignmentId,
      personaId: input.personaId,
      cwd: input.cwd,
      model: input.model,
    }
    const history = [...(input.history ?? [])]
    if (recovery) history.push({ role: 'user', text: RECOVERY_NOTE })
    history.push({ role: 'user', text: input.prompt })
    const events: RunEvent[] = [
      { type: 'started', at: eventTime(now), handle },
      ...turn.events.map(event => event.type === 'started' ? { ...event, handle } : event),
    ]
    runs.set(handle.runId, {
      handle,
      events,
      usage: turn.usage ?? EMPTY_USAGE,
      cancelled: false,
      history,
    })
    stored.set(handle.runId, history)
    return handle
  }

  async function *play(handle: RunHandle): AsyncIterable<RunEvent> {
    const live = runs.get(handle.runId)
    if (live === undefined) throw new Error(`unknown run ${handle.runId}`)
    for (const event of live.events) {
      if (live.cancelled) {
        yield {
          type: 'ended',
          at: eventTime(now),
          report: { state: 'dropped', summary: 'cancelled' },
        }
        return
      }
      yield event
    }
    if (!live.events.some(event => event.type === 'ended') && !live.cancelled) {
      yield { type: 'ended', at: eventTime(now), report: { state: 'ready', summary: 'scripted' } }
    }
  }

  const runner: Runner = {
    capabilities: () => capabilities,
    health: async () => health,
    authenticate: async () => auth,
    start: async input => begin(input, input.recovery === true),
    startTurn: async input => runner.start(input),
    stream: play,
    events: play,
    cancel: async (handle) => {
      const live = runs.get(handle.runId)
      if (live === undefined) throw new Error(`unknown run ${handle.runId}`)
      live.cancelled = true
    },
    resume: async (input) => {
      const prior = [...runs.values()].find(item => item.handle.sessionId === input.resumeSessionId)
        ?? [...runs.values()].at(-1)
      const next: StartTurnInput = {
        ticketId: input.ticketId,
        assignmentId: input.assignmentId,
        personaId: input.personaId,
        cwd: input.cwd,
        prompt: input.prompt,
        model: input.model,
        history: input.history ?? prior?.history ?? [],
      }
      const sessionId = input.resumeSessionId ?? prior?.handle.sessionId
      if (sessionId !== undefined) next.resumeSessionId = sessionId
      if (input.permissionMode !== undefined) next.permissionMode = input.permissionMode
      return begin(next, true)
    },
    usage: async (handle) => {
      if (handle === undefined) return EMPTY_USAGE
      return runs.get(handle.runId)?.usage ?? EMPTY_USAGE
    },
  }
  histories.set(runner, stored)
  return runner
}

const histories = new WeakMap<Runner, Map<string, HistoryTurn[]>>()

/**
 * History the scripted runner kept for a run (model swaps reuse this list).
 * @param runner - runner from {@link createScriptedRunner}.
 * @param handle - run whose history to read.
 */
export function scriptedHistory(runner: Runner, handle: RunHandle): readonly HistoryTurn[] {
  return histories.get(runner)?.get(handle.runId) ?? []
}
