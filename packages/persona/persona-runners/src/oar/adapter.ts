/** Shared OAR session adapter: maps a vendor or scripted Runtime onto Runner. */

import type { AvailableInstallation, Event, Runtime, Session } from '@botiverse/oar'
import {
  eventTime,
  RECOVERY_NOTE,
  type RunEvent,
  type RunHandle,
  type Runner,
  type RunnerCapabilities,
  type RunnerUsage,
  type StartTurnInput,
} from '../contract.ts'

export interface OarRunnerOptions {
  runtime: Runtime
  capabilities: RunnerCapabilities
  installation?: AvailableInstallation
  now?: () => Date
  /** Extra env for the session (e.g. isolated `CLAUDE_CONFIG_DIR`). */
  env?: Readonly<Record<string, string | null>>
}

const BUNDLED: AvailableInstallation = { kind: 'available', via: 'bundled' }

/**
 * CLI runners never open a session without an explicit permission mode.
 * @param input - start/resume payload.
 */
export function requireExplicitPermission(input: StartTurnInput): void {
  if (input.permissionMode === undefined) {
    throw new Error('permission mode required')
  }
}

function usageOf(session: Session): RunnerUsage {
  const total = session.usage().value.total
  return { inputTokens: total?.input ?? 0, outputTokens: total?.output ?? 0 }
}

function mapEvent(event: Event, now: () => Date): RunEvent | undefined {
  const at = eventTime(now)
  if (event.kind === 'text_delta') {
    return { type: 'delta', at, text: event.text }
  }
  if (event.kind === 'turn_ended') {
    if (event.outcome.kind === 'aborted') {
      return { type: 'ended', at, report: { state: 'dropped', summary: 'cancelled' } }
    }
    if (event.outcome.kind === 'failed') {
      return { type: 'ended', at, report: { state: 'failed', summary: event.outcome.reason } }
    }
    return { type: 'ended', at, report: { state: 'ready', summary: 'turn ended' } }
  }
  return undefined
}

/**
 * Wrap an OAR runtime as a Persona Runner.
 * @param options - runtime, advertised capabilities, optional installation.
 */
export function createOarRunner(options: OarRunnerOptions): Runner {
  const now = options.now ?? (() => new Date())
  const sessions = new Map<string, { handle: RunHandle; session: Session; cancelled: boolean; wake?: () => void }>()
  let seq = 0

  const open = async (input: StartTurnInput, recovery: boolean): Promise<RunHandle> => {
    requireExplicitPermission(input)
    const prompt = recovery ? `${RECOVERY_NOTE}\n\n${input.prompt}` : input.prompt
    const sessionOptions: {
      cwd: string
      model: string
      resume?: string
      env?: Readonly<Record<string, string | null>>
    } = { cwd: input.cwd, model: input.model }
    if (input.resumeSessionId !== undefined) sessionOptions.resume = input.resumeSessionId
    if (options.env !== undefined) sessionOptions.env = options.env
    const session = await options.runtime.session(options.installation ?? BUNDLED, sessionOptions)
    const handle: RunHandle = {
      runId: `oar-run-${String(++seq)}`,
      sessionId: session.id,
      ticketId: input.ticketId,
      assignmentId: input.assignmentId,
      personaId: input.personaId,
      cwd: input.cwd,
      model: input.model,
    }
    sessions.set(handle.runId, { handle, session, cancelled: false })
    const outcome = await session.prompt(prompt)
    if (outcome.kind === 'rejected') {
      await session.dispose()
      sessions.delete(handle.runId)
      throw new Error(outcome.reason)
    }
    return handle
  }

  async function *play(handle: RunHandle): AsyncIterable<RunEvent> {
    const live = sessions.get(handle.runId)
    if (live === undefined) throw new Error(`unknown run ${handle.runId}`)
    yield { type: 'started', at: eventTime(now), handle }
    const pending: RunEvent[] = []
    let notify: (() => void) | undefined
    let finished = false
    const unsub = live.session.events((event) => {
      const mapped = mapEvent(event, now)
      if (mapped === undefined) return
      if (mapped.type === 'delta') {
        pending.push(mapped)
        pending.push({ type: 'report', at: mapped.at, report: { state: 'progress', summary: mapped.text } })
      } else {
        pending.push(mapped)
        if (mapped.type === 'ended') finished = true
      }
      notify?.()
    })
    try {
      while (!finished || pending.length > 0) {
        if (live.cancelled && !finished) {
          pending.push({ type: 'ended', at: eventTime(now), report: { state: 'dropped', summary: 'cancelled' } })
          finished = true
        }
        if (pending.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve
            live.wake = resolve
          })
          notify = () => {}
          delete live.wake
          continue
        }
        const next = pending.shift()
        if (next !== undefined) yield next
      }
    } finally {
      unsub()
    }
  }

  const runner: Runner = {
    capabilities: () => options.capabilities,
    health: async () => {
      const snap = options.runtime.installation === undefined
        ? { kind: 'available' as const }
        : await options.runtime.installation()
      return { ok: snap.kind === 'available', detail: snap.kind }
    },
    authenticate: async () => ({ ok: true, detail: 'explicit permission only' }),
    start: async input => open(input, input.recovery === true),
    startTurn: async input => runner.start(input),
    stream: play,
    events: play,
    cancel: async (handle) => {
      const live = sessions.get(handle.runId)
      if (live === undefined) throw new Error(`unknown run ${handle.runId}`)
      live.cancelled = true
      live.wake?.()
      await live.session.abort()
    },
    resume: async (input) => {
      requireExplicitPermission(input)
      const next: StartTurnInput = {
        ticketId: input.ticketId,
        assignmentId: input.assignmentId,
        personaId: input.personaId,
        cwd: input.cwd,
        prompt: input.prompt,
        model: input.model,
      }
      if (input.permissionMode !== undefined) next.permissionMode = input.permissionMode
      if (input.history !== undefined) next.history = input.history
      if (input.resumeSessionId !== undefined) next.resumeSessionId = input.resumeSessionId
      return open(next, true)
    },
    usage: async (handle) => {
      if (handle === undefined) return { inputTokens: 0, outputTokens: 0 }
      const live = sessions.get(handle.runId)
      return live === undefined ? { inputTokens: 0, outputTokens: 0 } : usageOf(live.session)
    },
  }
  return runner
}
