/** Shared OAR session adapter: maps a vendor or scripted Runtime onto Runner. */

import type { AvailableInstallation, Event, Runtime, Session } from '@botiverse/oar'
import {
  eventTime,
  RECOVERY_NOTE,
  type CliKind,
  type RunEvent,
  type RunHandle,
  type Runner,
  type RunnerCapabilities,
  type RunnerUsage,
  type StartTurnInput,
} from '../contract.ts'
import { RunnerResolveError } from '../resolve/errors.ts'
import { classifyLoginOutput } from './login-output.ts'
import { withInfraRecovery, type InfraRecoveryOptions } from '../proactivity/recovery.ts'

const LOGIN_HOLD_CHARS = 240

export interface OarRunnerOptions {
  runtime: Runtime
  capabilities: RunnerCapabilities
  installation?: AvailableInstallation
  now?: () => Date
  /** Extra env for the session (e.g. isolated `CLAUDE_CONFIG_DIR`). */
  env?: Readonly<Record<string, string | null>>
  /** Infra recovery. Tests inject a no-op waiter. */
  infra?: InfraRecoveryOptions
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

function eventText(event: Event): string | undefined {
  if (event.kind === 'text_delta') return event.text
  const record = event as Event & { text?: string; delta?: string; content?: string }
  if (typeof record.text === 'string' && record.text.length > 0) return record.text
  if (typeof record.delta === 'string' && record.delta.length > 0) return record.delta
  if (typeof record.content === 'string' && record.content.length > 0) return record.content
  return undefined
}

function isTurnEnd(kind: string): boolean {
  return kind === 'turn_ended' || kind === 'turn_complete' || kind === 'completed' || kind === 'done'
}

/**
 * Map OAR session events onto Runner events.
 * Codex (OAR 0.67) often settles `prompt()` without `turn_ended` and may emit
 * `item` / `agent_message` instead of `text_delta` — treat those as stream text
 * and treat prompt settlement as the turn end (workaround; see runner.md).
 * @param event - Vendor or scripted event.
 * @param now - Clock.
 */
function mapEvent(event: Event, now: () => Date): RunEvent | undefined {
  const at = eventTime(now)
  const kind: string = event.kind
  if (isTurnEnd(kind)) {
    const outcome = 'outcome' in event ? event.outcome : undefined
    if (outcome !== undefined) {
      if (typeof outcome === 'string') {
        if (outcome === 'aborted') {
          return { type: 'ended', at, report: { state: 'dropped', summary: 'cancelled' } }
        }
        if (outcome === 'failed') {
          const reason = 'reason' in event && typeof event.reason === 'string' ? event.reason : outcome
          return { type: 'ended', at, report: { state: 'failed', summary: reason } }
        }
      } else if (outcome.kind === 'aborted') {
        return { type: 'ended', at, report: { state: 'dropped', summary: 'cancelled' } }
      } else if (outcome.kind === 'failed') {
        return { type: 'ended', at, report: { state: 'failed', summary: outcome.reason } }
      }
    }
    return { type: 'ended', at, report: { state: 'ready', summary: 'turn ended' } }
  }
  const text = eventText(event)
  if (text !== undefined && (kind === 'text_delta' || kind.includes('text') || kind.includes('delta')
    || kind === 'item' || kind === 'agent_message' || kind === 'message' || kind === 'output_item')) {
    return { type: 'delta', at, text }
  }
  return undefined
}

interface Live {
  handle: RunHandle
  session: Session
  cancelled: boolean
  finished: boolean
  accepted: boolean
  pending: RunEvent[]
  heldText: string
  loginError?: RunnerResolveError
  unsub: () => void
  rejected?: string
  wake?: () => void
}

/**
 * `prompt()` resolving `accepted` only means the turn started. Codex (OAR 0.67)
 * often goes idle without `turn_ended` — treat idle-after-accept as the end.
 * @param live - In-flight run.
 * @param now - Clock.
 */
function takeDelta(live: Live, mapped: Extract<RunEvent, { type: 'delta' }>, cli: CliKind | undefined, now: () => Date): void {
  live.heldText += mapped.text
  if (cli !== undefined && (
    classifyLoginOutput(cli, mapped.text) !== undefined
    || classifyLoginOutput(cli, live.heldText) !== undefined
  )) {
    live.loginError = new RunnerResolveError('not_logged_in', cli)
    live.heldText = ''
    live.finished = true
    return
  }
  if (live.heldText.length < LOGIN_HOLD_CHARS) return
  flushHeld(live, now)
}

function flushHeld(live: Live, now: () => Date): void {
  if (live.heldText === '' || live.loginError !== undefined) return
  const text = live.heldText
  live.heldText = ''
  const at = eventTime(now)
  live.pending.push({ type: 'delta', at, text })
  live.pending.push({ type: 'report', at, report: { state: 'progress', summary: text } })
}

function settleIfIdle(live: Live, now: () => Date): void {
  if (live.finished || !live.accepted) return
  const status = typeof live.session.status === 'function' ? live.session.status().value : undefined
  if (status === undefined || status.kind !== 'idle') return
  flushHeld(live, now)
  if (live.loginError !== undefined) {
    live.finished = true
    return
  }
  live.pending.push({ type: 'ended', at: eventTime(now), report: { state: 'ready', summary: 'turn ended' } })
  live.finished = true
}

/**
 * Codex holds an exclusive writer on the thread until dispose.
 * @param sessions - live runs keyed by run id.
 * @param sessionId - native session to release, if any.
 */
async function releaseLive(sessions: Map<string, Live>, sessionId: string | undefined): Promise<void> {
  if (sessionId === undefined) return
  const victims = [...sessions.entries()].filter(([, live]) => live.handle.sessionId === sessionId)
  for (const [runId, live] of victims) {
    live.unsub()
    live.finished = true
    live.wake?.()
    try {
      await live.session.dispose()
    } catch (error) {
      void error
    }
    sessions.delete(runId)
  }
}

/**
 * Wrap an OAR runtime as a Persona Runner.
 * @param options - runtime, advertised capabilities, optional installation.
 */
export function createOarRunner(options: OarRunnerOptions): Runner {
  const now = options.now ?? (() => new Date())
  const sessions = new Map<string, Live>()
  let seq = 0

  const open = async (input: StartTurnInput, recovery: boolean): Promise<RunHandle> => {
    requireExplicitPermission(input)
    const prompt = recovery ? `${RECOVERY_NOTE}\n\n${input.prompt}` : input.prompt
    const sessionOptions: {
      cwd: string
      model?: string
      resume?: string
      env?: Readonly<Record<string, string | null>>
    } = { cwd: input.cwd }
    if (input.model !== 'default') sessionOptions.model = input.model
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
    const pending: RunEvent[] = []
    const live: Live = {
      handle, session, cancelled: false, finished: false, accepted: false, pending,
      heldText: '', unsub: () => {},
    }
    const cli = options.capabilities.cli
    live.unsub = session.events((event) => {
      const mapped = mapEvent(event, now)
      if (mapped !== undefined) {
        if (mapped.type === 'delta') {
          takeDelta(live, mapped, cli, now)
        } else {
          flushHeld(live, now)
          if (live.loginError !== undefined) {
            live.wake?.()
            return
          }
          pending.push(mapped)
          if (mapped.type === 'ended') live.finished = true
        }
      }
      settleIfIdle(live, now)
      live.wake?.()
    })
    sessions.set(handle.runId, live)
    void session.prompt(prompt).then((outcome) => {
      if (outcome.kind === 'rejected') {
        const reason = outcome.reason
        const login = cli === undefined ? undefined : classifyLoginOutput(cli, reason)
        if (login !== undefined) {
          live.loginError = new RunnerResolveError('not_logged_in', login.cli)
          live.finished = true
        } else live.rejected = reason
      } else {
        // `accepted` is "prompt started", not "turn ended".
        live.accepted = true
        settleIfIdle(live, now)
      }
      live.wake?.()
    }).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error)
      const login = cli === undefined ? undefined : classifyLoginOutput(cli, reason)
      if (login !== undefined) {
        live.loginError = new RunnerResolveError('not_logged_in', login.cli)
        live.finished = true
      } else live.rejected = reason
      live.wake?.()
    })
    return handle
  }

  async function *play(handle: RunHandle): AsyncIterable<RunEvent> {
    const live = sessions.get(handle.runId)
    if (live === undefined) throw new Error(`unknown run ${handle.runId}`)
    yield { type: 'started', at: eventTime(now), handle }
    try {
      while (!live.finished || live.pending.length > 0) {
        if (live.loginError !== undefined) throw live.loginError
        if (live.rejected !== undefined && !live.finished) {
          live.pending.push({ type: 'ended', at: eventTime(now), report: { state: 'failed', summary: live.rejected } })
          live.finished = true
        }
        if (live.cancelled && !live.finished) {
          live.pending.push({ type: 'ended', at: eventTime(now), report: { state: 'dropped', summary: 'cancelled' } })
          live.finished = true
        }
        if (live.pending.length === 0) {
          await new Promise<void>((resolve) => { live.wake = resolve })
          delete live.wake
          continue
        }
        const next = live.pending.shift()
        if (next !== undefined) yield next
      }
      if (live.loginError !== undefined) throw live.loginError
    } finally {
      live.unsub()
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
      await releaseLive(sessions, input.resumeSessionId)
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
  return withInfraRecovery(runner, options.infra ?? {})
}
