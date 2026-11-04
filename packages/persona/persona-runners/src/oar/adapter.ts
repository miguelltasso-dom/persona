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
import { PRECISA_DE_VOCE, isPermissionAsk, type CliSessionPolicy } from '../resolve/cli-policy.ts'
import { classifyLoginOutput, mayBecomeLogin } from './login-output.ts'
import { withInfraRecovery, type InfraRecoveryOptions } from '../proactivity/recovery.ts'

const LOGIN_HOLD_CHARS = 240

export interface OarRunnerOptions {
  runtime: Runtime
  capabilities: RunnerCapabilities
  installation?: AvailableInstallation
  now?: () => Date
  /** Extra env for the session (e.g. isolated `CLAUDE_CONFIG_DIR`). */
  env?: Readonly<Record<string, string | null>>
  /** Vendor flags from `cliPolicyOf`. OpenCode/Cursor omit unsupported fields. */
  policy?: CliSessionPolicy
  /** Idle TTL for a reused CLI session. Default 10 min. */
  warmTtlMs?: number
  /** Max live CLI sessions on this runner. Default 4. */
  warmCap?: number
  /** Infra recovery. Tests inject a no-op waiter. */
  infra?: InfraRecoveryOptions
}

const BUNDLED: AvailableInstallation = { kind: 'available', via: 'bundled' }

async function openSession(
  options: OarRunnerOptions,
  sessionOptions: {
    cwd: string
    model?: string
    resume?: string
    env?: Readonly<Record<string, string | null>>
    launchArgs?: readonly string[]
    disallowedTools?: readonly string[]
  },
  policy: CliSessionPolicy | undefined,
): Promise<Session> {
  const sandbox = policy?.sandbox
  const pin = options.capabilities.cli === 'codex' && sandbox !== undefined
  const previous = pin ? process.env.OAR_CODEX_SANDBOX : undefined
  if (pin && sandbox !== undefined) process.env.OAR_CODEX_SANDBOX = sandbox
  try {
    return await options.runtime.session(options.installation ?? BUNDLED, sessionOptions)
  } finally {
    if (pin) {
      if (previous === undefined) delete process.env.OAR_CODEX_SANDBOX
      else process.env.OAR_CODEX_SANDBOX = previous
    }
  }
}

/**
 * CLI runners never open a session without an explicit permission mode.
 * @param input - start/resume payload.
 */
export function requireExplicitPermission(input: StartTurnInput, cli?: CliKind): void {
  if (input.permissionMode === undefined) {
    throw new Error('permission mode required')
  }
  if (cli !== undefined && input.permissionMode === 'prompt') {
    throw new Error(
      'CLI não aceita modo prompt — a aprovação interativa não existe. Use deny (resposta) ou allow-once (tarefa no worktree).',
    )
  }
}

function usageOf(session: Session): RunnerUsage {
  const total = session.usage().value.total
  const extra = total === undefined || total === null ? {} : cacheFromVendor(total)
  return { inputTokens: total?.input ?? 0, outputTokens: total?.output ?? 0, ...extra }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function vendorNumber(row: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/**
 * OPT-3: copy vendor cache counters when the CLI published them.
 * @param total - OAR usage total.
 */
function cacheFromVendor(total: object): Pick<RunnerUsage, 'cacheReadTokens' | 'cacheWriteTokens'> {
  if (!isRecord(total)) return {}
  const read = vendorNumber(total, ['cacheRead', 'cacheReadTokens', 'cached', 'cache_read'])
  const write = vendorNumber(total, ['cacheWrite', 'cacheWriteTokens', 'cacheCreation', 'cache_write'])
  return {
    ...(read === undefined ? {} : { cacheReadTokens: read }),
    ...(write === undefined ? {} : { cacheWriteTokens: write }),
  }
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
  if (isPermissionAsk(event as { kind: string; type?: string })) {
    const record = event as Event & { type?: string }
    const asked = typeof record.type === 'string' && record.type.length > 0 ? record.type : kind
    return {
      type: 'ended',
      at,
      report: {
        state: 'blocked',
        summary: `Pedido de permissão recusado (${asked}).`,
        question: PRECISA_DE_VOCE,
      },
    }
  }
  if (kind === 'tool' || kind.includes('tool')) {
    const record = event as Event & { name?: string; tool?: string }
    const name = typeof record.name === 'string' && record.name.length > 0
      ? record.name
      : typeof record.tool === 'string' && record.tool.length > 0 ? record.tool : 'tool'
    return { type: 'report', at, report: { state: 'progress', summary: `tool:${name}` } }
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
  partialText: string
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
  if (cli !== undefined && !mayBecomeLogin(cli, live.heldText)) {
    flushHeld(live, now)
    return
  }
  if (live.heldText.length < LOGIN_HOLD_CHARS) return
  flushHeld(live, now)
}

function flushHeld(live: Live, now: () => Date): void {
  if (live.heldText === '' || live.loginError !== undefined) return
  const text = live.heldText
  live.heldText = ''
  live.partialText += text
  const at = eventTime(now)
  live.pending.push({ type: 'delta', at, text })
  live.pending.push({ type: 'partial', at, text: live.partialText })
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
interface WarmSlot {
  session: Session
  model: string
  cwd: string
  personaId: string
  lastUsed: number
}

function warmKey(input: { personaId: string; cwd: string; model: string }): string {
  return `${input.personaId}|${input.cwd}|${input.model}`
}

export function createOarRunner(options: OarRunnerOptions): Runner {
  const now = options.now ?? (() => new Date())
  const sessions = new Map<string, Live>()
  const warm = new Map<string, WarmSlot>()
  const ttlMs = options.warmTtlMs ?? 10 * 60_000
  const cap = options.warmCap ?? 4
  let seq = 0

  const dropWarm = async (key: string): Promise<void> => {
    const slot = warm.get(key)
    if (slot === undefined) return
    warm.delete(key)
    try {
      await slot.session.dispose()
    } catch (error) {
      void error
    }
  }

  const evictWarm = async (): Promise<void> => {
    let oldest: { key: string; at: number } | undefined
    for (const [key, slot] of warm) {
      if (oldest === undefined || slot.lastUsed < oldest.at) oldest = { key, at: slot.lastUsed }
    }
    if (oldest !== undefined) await dropWarm(oldest.key)
  }

  const remember = (input: StartTurnInput, session: Session): void => {
    const key = warmKey(input)
    const existing = warm.get(key)
    if (existing !== undefined && existing.session !== session) void dropWarm(key)
    if (warm.size >= cap && !warm.has(key)) void evictWarm()
    warm.set(key, {
      session, model: input.model, cwd: input.cwd, personaId: input.personaId, lastUsed: Date.now(),
    })
  }

  const reuse = (input: StartTurnInput): Session | undefined => {
    const key = warmKey(input)
    const slot = warm.get(key)
    if (slot === undefined) return undefined
    if (Date.now() - slot.lastUsed >= ttlMs) {
      void dropWarm(key)
      return undefined
    }
    slot.lastUsed = Date.now()
    return slot.session
  }

  const attach = (
    input: StartTurnInput,
    session: Session,
    prompt: string | undefined,
  ): RunHandle => {
    const cli = options.capabilities.cli
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
      handle, session, cancelled: false, finished: false, accepted: prompt === undefined,
      pending, heldText: '', partialText: '', unsub: () => {},
    }
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
    remember(input, session)
    if (prompt === undefined) {
      live.finished = true
      live.pending.push({ type: 'ended', at: eventTime(now), report: { state: 'ready', summary: 'warmed' } })
      return handle
    }
    void session.prompt(prompt).then((outcome) => {
      if (outcome.kind === 'rejected') {
        const reason = outcome.reason
        const login = cli === undefined ? undefined : classifyLoginOutput(cli, reason)
        if (login !== undefined) {
          live.loginError = new RunnerResolveError('not_logged_in', login.cli)
          live.finished = true
        } else live.rejected = reason
      } else {
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

  const spawn = async (input: StartTurnInput): Promise<Session> => {
    const policy = options.policy
    const sessionOptions: {
      cwd: string
      model?: string
      resume?: string
      env?: Readonly<Record<string, string | null>>
      launchArgs?: readonly string[]
      disallowedTools?: readonly string[]
    } = { cwd: input.cwd }
    if (input.model !== 'default') sessionOptions.model = input.model
    if (input.resumeSessionId !== undefined) sessionOptions.resume = input.resumeSessionId
    if (options.env !== undefined) sessionOptions.env = options.env
    if (policy !== undefined && policy.launchArgs.length > 0) sessionOptions.launchArgs = policy.launchArgs
    if (policy !== undefined && policy.disallowedTools.length > 0) sessionOptions.disallowedTools = policy.disallowedTools
    return openSession(options, sessionOptions, policy)
  }

  const open = async (input: StartTurnInput, recovery: boolean): Promise<RunHandle> => {
    const cli = options.capabilities.cli
    requireExplicitPermission(input, cli)
    const prompt = recovery ? `${RECOVERY_NOTE}\n\n${input.prompt}` : input.prompt
    const existing = reuse(input)
    const session = existing ?? await spawn(input)
    return attach(input, session, prompt)
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
      requireExplicitPermission(input, options.capabilities.cli)
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
      const hit = reuse(next)
      if (hit === undefined) await releaseLive(sessions, input.resumeSessionId)
      return open(next, true)
    },
    usage: async (handle) => {
      if (handle === undefined) return { inputTokens: 0, outputTokens: 0 }
      const live = sessions.get(handle.runId)
      return live === undefined ? { inputTokens: 0, outputTokens: 0 } : usageOf(live.session)
    },
    prime: async (input) => {
      requireExplicitPermission(input, options.capabilities.cli)
      const existing = reuse(input)
      const session = existing ?? await spawn(input)
      return attach(input, session, undefined)
    },
    dispose: async () => {
      for (const key of [...warm.keys()]) await dropWarm(key)
    },
  }
  return withInfraRecovery(runner, options.infra ?? {})
}
