/**
 * DSH-direct runner: one Agent session + one worktree per Assignment.
 * Host wiring supplies {@link DshAgentPort}; tests use a scripted port.
 */

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
} from '../contract.ts'
import { withInfraRecovery, type InfraRecoveryOptions } from '../proactivity/recovery.ts'

/** Minimal Agent surface the host will bind to `ctx.agents`. */
export interface DshAgentPort {
  start(input: { cwd: string; model: string; prompt: string; history: readonly HistoryTurn[] }): Promise<{
    sessionId: string
    events: AsyncIterable<DshAgentEvent>
  }>
  resume(input: { sessionId: string; cwd: string; model: string; prompt: string; history: readonly HistoryTurn[] }): Promise<{
    sessionId: string
    events: AsyncIterable<DshAgentEvent>
  }>
  cancel(sessionId: string): Promise<void>
  usage(sessionId: string): Promise<RunnerUsage>
}

export type DshAgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; elapsedMs?: number }
  | { type: 'ended'; text?: string }
  | { type: 'error'; message: string }

export interface DshRunnerOptions {
  agent: DshAgentPort
  now?: () => Date
  /** Shell tool runtime after which the runner emits a background-job report. */
  backgroundShellAfterMs?: number
  /** Idle budget after a turn ends before the runner marks the run waiting. */
  postTurnLimitMs?: number
  /** Extra concurrency slot reserved for a person's follow-up. */
  reservedPersonSlots?: number
  maxConcurrent?: number
  /** Infra recovery (context full / connection / dead process / trust prompt). */
  infra?: InfraRecoveryOptions
}

interface LiveRun {
  handle: RunHandle
  history: HistoryTurn[]
  events: AsyncIterable<DshAgentEvent>
  cancelled: boolean
  usage: RunnerUsage
  partialText: string
}

const CAPABILITIES: RunnerCapabilities = {
  kind: 'dsh',
  stream: true,
  cancel: true,
  resume: true,
  usage: true,
  mcpTools: 'available',
  permission: 'none',
}

/**
 * DSH runner over an injected agent port.
 * @param options - agent port and executor tunables (5 s shell / 30 min post-turn).
 */
export function createDshRunner(options: DshRunnerOptions): Runner {
  const now = options.now ?? (() => new Date())
  const backgroundShellAfterMs = options.backgroundShellAfterMs ?? 5_000
  const postTurnLimitMs = options.postTurnLimitMs ?? 30 * 60_000
  const reservedPersonSlots = options.reservedPersonSlots ?? 1
  const maxConcurrent = options.maxConcurrent ?? 2
  const runs = new Map<string, LiveRun>()
  let seq = 0
  let active = 0

  const occupy = (): void => {
    const budget = Math.max(1, maxConcurrent - reservedPersonSlots)
    if (active >= budget) throw new Error('runner concurrency exhausted')
    active += 1
  }

  const begin = async (input: StartTurnInput, recovery: boolean): Promise<RunHandle> => {
    occupy()
    const history = [...(input.history ?? [])]
    if (recovery) history.push({ role: 'user', text: RECOVERY_NOTE })
    history.push({ role: 'user', text: input.prompt })
    const launched = input.resumeSessionId === undefined
      ? await options.agent.start({ cwd: input.cwd, model: input.model, prompt: input.prompt, history })
      : await options.agent.resume({
        sessionId: input.resumeSessionId,
        cwd: input.cwd,
        model: input.model,
        prompt: input.prompt,
        history,
      })
    const handle: RunHandle = {
      runId: `dsh-run-${String(++seq)}`,
      sessionId: launched.sessionId,
      ticketId: input.ticketId,
      assignmentId: input.assignmentId,
      personaId: input.personaId,
      cwd: input.cwd,
      model: input.model,
    }
    runs.set(handle.runId, {
      handle,
      history,
      events: launched.events,
      cancelled: false,
      usage: { inputTokens: 0, outputTokens: 0 },
      partialText: '',
    })
    return handle
  }

  async function *play(handle: RunHandle): AsyncIterable<RunEvent> {
    const live = runs.get(handle.runId)
    if (live === undefined) throw new Error(`unknown run ${handle.runId}`)
    yield { type: 'started', at: eventTime(now), handle }
    try {
      for await (const event of live.events) {
        if (live.cancelled) {
          yield { type: 'ended', at: eventTime(now), report: { state: 'dropped', summary: 'cancelled' } }
          return
        }
        if (event.type === 'text') {
          const at = eventTime(now)
          live.partialText += event.text
          yield { type: 'delta', at, text: event.text }
          yield { type: 'partial', at, text: live.partialText }
          yield { type: 'report', at, report: { state: 'progress', summary: event.text } }
        } else if (event.type === 'tool') {
          yield { type: 'report', at: eventTime(now), report: { state: 'progress', summary: `tool:${event.name}` } }
          const elapsed = event.elapsedMs ?? 0
          if (elapsed > backgroundShellAfterMs) {
            yield {
              type: 'report',
              at: eventTime(now),
              report: { state: 'progress', summary: `background job after ${String(elapsed)}ms (${event.name})` },
            }
          }
        } else if (event.type === 'error') {
          yield { type: 'ended', at: eventTime(now), report: { state: 'failed', summary: event.message } }
          return
        } else if (event.type === 'ended') {
          if (event.text !== undefined) live.history.push({ role: 'assistant', text: event.text })
          yield {
            type: 'ended',
            at: eventTime(now),
            report: { state: 'ready', summary: event.text ?? 'turn ended' },
          }
          return
        }
      }
      yield { type: 'ended', at: eventTime(now), report: { state: 'waiting', summary: `idle under ${String(postTurnLimitMs)}ms budget` } }
    } finally {
      active = Math.max(0, active - 1)
    }
  }

  const runner: Runner = {
    capabilities: () => CAPABILITIES,
    health: async () => ({ ok: true, detail: 'dsh' }),
    authenticate: async (): Promise<RunnerAuth> => ({ ok: true, detail: 'dsh' }),
    start: async input => begin(input, input.recovery === true),
    startTurn: async input => runner.start(input),
    stream: play,
    events: play,
    cancel: async (handle) => {
      const live = runs.get(handle.runId)
      if (live === undefined) throw new Error(`unknown run ${handle.runId}`)
      live.cancelled = true
      await options.agent.cancel(live.handle.sessionId)
    },
    resume: async (input) => {
      const next: StartTurnInput = {
        ticketId: input.ticketId,
        assignmentId: input.assignmentId,
        personaId: input.personaId,
        cwd: input.cwd,
        prompt: input.prompt,
        model: input.model,
      }
      if (input.history !== undefined) next.history = input.history
      if (input.resumeSessionId !== undefined) next.resumeSessionId = input.resumeSessionId
      if (input.permissionMode !== undefined) next.permissionMode = input.permissionMode
      return begin(next, true)
    },
    usage: async (handle) => {
      if (handle === undefined) return { inputTokens: 0, outputTokens: 0 }
      const live = runs.get(handle.runId)
      if (live === undefined) return { inputTokens: 0, outputTokens: 0 }
      live.usage = await options.agent.usage(live.handle.sessionId)
      return live.usage
    },
  }
  return withInfraRecovery(runner, options.infra ?? {})
}

/** Health helper used when the host is not yet bound. */
export function unboundDshHealth(): RunnerHealth {
  return { ok: false, detail: 'dsh agent port unbound' }
}
