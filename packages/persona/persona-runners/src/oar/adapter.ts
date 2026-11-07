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
  type RunnerEnvironment,
  type RunnerUsage,
  type StartTurnInput,
} from '../contract.ts'
import { RunnerResolveError, resolveCaughtError } from '../resolve/errors.ts'
import { PRECISA_DE_VOCE, isPermissionAsk, type CliSessionPolicy } from '../resolve/cli-policy.ts'
import { classifyLoginOutput, mayBecomeLogin } from './login-output.ts'
import { environmentOf, mainLoopOf, usageSince } from './usage-detail.ts'
import { redactCliStderr } from './stderr-redact.ts'
import { checkTurnImages, ImagesRefusedError, type DeliverableImage } from './turn-images.ts'
import { withInfraRecovery, type InfraRecoveryOptions } from '../proactivity/recovery.ts'
import { bindTools, claudeAllowToolsArgs, serverNameOf, toolSignature, type ServeHostTools, type ToolBinding } from './tool-binding.ts'
import { ensureCodexToolsConfig, type CodexConfigIo } from './codex-tools-config.ts'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

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
  /** HT-0: how product tools are served to the CLI. Default: OAR `serveMcpTools`. Tests inject a double. */
  serveTools?: ServeHostTools
  /** HT-0 (Codex): the ISOLATED `CODEX_HOME` the product owns. Absent (the person's native home) ⇒ Codex is offered no product tools. */
  codexHome?: string
  /** Tests inject the filesystem used to write the Codex `config.toml` block. */
  codexConfigIo?: CodexConfigIo
}

const defaultCodexConfigIo: CodexConfigIo = {
  read: path => (existsSync(path) ? readFileSync(path, 'utf8') : undefined),
  write: (path, text) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  },
}

const BUNDLED: AvailableInstallation = { kind: 'available', via: 'bundled' }

/** HT-0: the served tool server behind a session (disposed with it). */
const bindingOf = new WeakMap<object, ToolBinding>()
const closedToolSets = new WeakSet<object>()

/** Close the host's lease of a turn's tool set, once. */
async function closeToolSet(set: { close?: () => void | Promise<void> } | undefined): Promise<void> {
  if (set === undefined || set.close === undefined || closedToolSets.has(set)) return
  closedToolSets.add(set)
  try {
    await set.close()
  } catch (error) {
    void error
  }
}

/** Dispose a CLI session and the tool server it carried. */
async function disposeSession(session: Session): Promise<void> {
  const binding = bindingOf.get(session)
  if (binding !== undefined) {
    const turn = binding.current
    binding.current = undefined
    await closeToolSet(turn)
  }
  try {
    await session.dispose()
  } finally {
    if (binding !== undefined) {
      try {
        await binding.close()
      } catch (error) {
        void error
      }
    }
  }
}

async function defaultServeTools(): Promise<ServeHostTools> {
  const oar = await import('@botiverse/oar')
  return oar.serveMcpTools as unknown as ServeHostTools
}

async function openSession(
  options: OarRunnerOptions,
  sessionOptions: {
    cwd: string
    model?: string
    resume?: string
    env?: Readonly<Record<string, string | null>>
    launchArgs?: readonly string[]
    disallowedTools?: readonly string[]
    mcpServers?: readonly ToolBinding['server'][]
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

/** EFF-1: the effort a session was asked to run at that its engine refused (the call then ran at the engine's default). */
const droppedEffort = new WeakMap<object, string>()

/** ISO-4: the start frame is read once per session (records only grow; the first root `system/init` never changes). */
const environmentCache = new WeakMap<object, RunnerEnvironment | null>()

function environmentOfSession(session: Session): RunnerEnvironment | undefined {
  const cached = environmentCache.get(session)
  if (cached !== undefined) return cached ?? undefined
  // Scripted and older sessions may not offer `records()`: then there is simply nothing to summarise.
  const records = typeof session.records === 'function' ? session.records() : undefined
  const found = records === undefined ? undefined : environmentOf(records)
  if (found !== undefined) environmentCache.set(session, found)
  return found
}

function usageOf(session: Session): RunnerUsage {
  const reading = session.usage().value
  const total = reading.total
  const extra = total === undefined || total === null ? {} : cacheFromVendor(total)
  // ISO-4: the main loop next to the total, only when the runtime told them apart; never an estimate.
  const main = mainLoopOf(reading)
  const environment = environmentOfSession(session)
  const dropped = droppedEffort.get(session)
  return {
    inputTokens: total?.input ?? 0,
    outputTokens: total?.output ?? 0,
    ...extra,
    ...(main === undefined ? {} : { mainLoopInputTokens: main.inputTokens, mainLoopOutputTokens: main.outputTokens }),
    ...(environment === undefined ? {} : { environment }),
    ...(dropped === undefined ? {} : { effortDropped: dropped }),
  }
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
function mapEvent(event: Event, now: () => Date, requestedAction?: string, toolName?: string): RunEvent | undefined {
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
  if (isPermissionAsk(event)) {
    const record = event as Event & { type?: string }
    const asked = requestedAction ?? (typeof record.type === 'string' && record.type.length > 0 ? record.type : kind)
    return {
      type: 'ended',
      at,
      report: {
        state: 'blocked',
        summary: `Pedido de permissão recusado (${asked}).`,
        question: `${PRECISA_DE_VOCE} Ação: ${asked}.`,
      },
    }
  }
  if (kind === 'tool' || kind.includes('tool')) {
    const record = event as Event & { name?: string; tool?: string }
    const named = toolName ?? (typeof record.name === 'string' && record.name.length > 0
      ? record.name
      : typeof record.tool === 'string' && record.tool.length > 0 ? record.tool : undefined)
    // `tool_call_input` / `_input_delta` / `_ended` / `_progress` only carry a callId: they are the SAME call as its `_started`, not a
    // tool called "tool" (which the tool-level guard would then refuse as an unknown write tool).
    if (named === undefined && kind !== 'tool') return undefined
    return { type: 'report', at, report: { state: 'progress', summary: `tool:${named ?? 'tool'}` } }
  }
  const text = eventText(event)
  if (text !== undefined && (kind === 'text_delta' || kind.includes('text') || kind.includes('delta')
    || kind === 'item' || kind === 'agent_message' || kind === 'message' || kind === 'output_item')) {
    return { type: 'delta', at, text }
  }
  return undefined
}

/**
 * The `mcp__<server>__<tool>` name of a Codex MCP call, read from the native `item/started` frame of that call (the same spelling
 * Claude uses, so the tool-level guard and the offered-tool exemption treat both CLIs the same). Absent when the frame is not there.
 * @param session - Live OAR session.
 * @param callId - `tool_call_started.callId` (the Codex item id).
 */
function mcpToolNameOf(session: Session, callId: unknown): string | undefined {
  if (typeof callId !== 'string' || typeof session.records !== 'function') return undefined
  const records = session.records()
  for (let index = records.length - 1; index >= 0 && index >= records.length - 60; index -= 1) {
    const record = records[index] as { kind?: unknown; body?: unknown } | undefined
    if (record?.kind !== 'frame' || !isRecord(record.body) || !isRecord(record.body.native)) continue
    const item = record.body.native.item
    if (!isRecord(item) || item.id !== callId || item.type !== 'mcpToolCall') continue
    const { server, tool } = item
    if (typeof server === 'string' && typeof tool === 'string' && /^[\w-]{1,64}$/u.test(server) && /^[\w-]{1,64}$/u.test(tool)) {
      return `mcp__${server}__${tool}`
    }
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
  /** HT-0: the tool set this turn offered (its lease is closed when the turn is over). */
  toolSet?: StartTurnInput['mcpTools']
  /** What the session had spent (cumulative) when this turn began: a turn's usage is the session's total now minus this (`usageSince`). */
  base?: RunnerUsage
  /** The turn's usage once it is over, fixed at the first reading after the end: a later turn of the same session must not move it. */
  final?: RunnerUsage
}

/** HT-0: the turn is over (ended, failed, cancelled): the CLI can no longer call its tools and the host's lease is released. */
async function endTurnTools(live: Live): Promise<void> {
  const set = live.toolSet
  if (set === undefined) return
  const binding = bindingOf.get(live.session)
  if (binding !== undefined && binding.current === set) binding.current = undefined
  await closeToolSet(set)
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
      await disposeSession(live.session)
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

function warmKey(input: { personaId: string; cwd: string; model: string; effort?: string; mcpTools?: StartTurnInput['mcpTools'] }): string {
  // The effort is part of the session: a persona that changes it must not be handed a warm session opened with the old one.
  // HT-0: so is the LIST of product tools (the CLI lists them once, at start); who calls them is the turn, not the session.
  const tools = toolSignature(input.mcpTools)
  return `${input.personaId}|${input.cwd}|${input.model}|${input.effort ?? ''}${tools === '' ? '' : `|tools:${tools}`}`
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
      await disposeSession(slot.session)
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
    images?: readonly DeliverableImage[],
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
    if (prompt !== undefined && bindingOf.has(session) && input.mcpTools !== undefined) live.toolSet = input.mcpTools
    // A warm session is reused across turns and OAR counts since it opened: remember where it stood when THIS turn began.
    if (prompt !== undefined) {
      try { live.base = usageOf(session) } catch (error) { void error }
    }
    live.unsub = session.events((event) => {
      let requestedAction: string | undefined
      if (event.kind === 'app_request') {
        const request = session.records().findLast(record => record.kind === 'request' && record.id === event.requestId)
        if (request?.kind === 'request' && 'native' in request.body && isRecord(request.body.native)) {
          const native = request.body.native
          const body = isRecord(native.request) ? native.request : native
          const name = body.tool_name ?? body.toolName
          if (typeof name === 'string' && /^[\w:./-]{1,120}$/u.test(name)) requestedAction = name
        }
      }
      // Codex reports an MCP call as the item TYPE (`mcpToolCall`), not as a tool name; the name is in the native frame (server + tool).
      const toolName = event.kind === 'tool_call_started' && (event as Event & { tool?: unknown }).tool === 'mcpToolCall'
        ? mcpToolNameOf(session, (event as Event & { callId?: unknown }).callId)
        : undefined
      const mapped = mapEvent(event, now, requestedAction, toolName)
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
    void session.prompt(prompt, images === undefined ? undefined : { images }).then((outcome) => {
      if (outcome.kind === 'rejected') {
        const reason = redactCliStderr(outcome.reason)
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
      const reason = redactCliStderr(error instanceof Error ? error.message : String(error))
      const login = cli === undefined ? undefined : classifyLoginOutput(cli, reason)
      if (login !== undefined) {
        live.loginError = new RunnerResolveError('not_logged_in', login.cli)
        live.finished = true
      } else {
        const failure = resolveCaughtError(error, cli ?? 'dsh')
        if (failure.code === 'provider_unreachable') {
          live.loginError = failure
          live.finished = true
        } else live.rejected = reason
      }
      live.wake?.()
    })
    return handle
  }

  /** HT-0: serve this turn's product tools, for CLIs that take MCP servers. Absent tools, or a CLI without MCP, ⇒ nothing. */
  const bindFor = async (input: StartTurnInput): Promise<ToolBinding | undefined> => {
    const set = input.mcpTools
    if (set === undefined || set.tools.length === 0 || options.capabilities.mcpTools !== 'available') return undefined
    if (options.capabilities.cli === 'codex') {
      // Codex declines an unapproved MCP tool under approvalPolicy "never": pre-approve only the server we serve (the gateway is the ACL).
      // That lives in the config.toml of an ISOLATED Codex home; the person's native ~/.codex is never written, so there Codex gets no tools.
      if (options.codexHome === undefined) return undefined
      ensureCodexToolsConfig(options.codexHome, serverNameOf(set), options.codexConfigIo ?? defaultCodexConfigIo)
    }
    return bindTools(set, options.serveTools ?? await defaultServeTools())
  }

  const spawn = async (input: StartTurnInput): Promise<Session> => {
    const binding = await bindFor(input)
    try {
      const session = await spawnWith(input, binding)
      if (binding !== undefined) bindingOf.set(session, binding)
      return session
    } catch (error) {
      if (binding !== undefined) {
        try {
          await binding.close()
        } catch (closeError) {
          void closeError
        }
      }
      throw error
    }
  }

  const spawnWith = async (input: StartTurnInput, binding: ToolBinding | undefined): Promise<Session> => {
    const policy = options.policy
    const sessionOptions: {
      cwd: string
      model?: string
      resume?: string
      env?: Readonly<Record<string, string | null>>
      launchArgs?: readonly string[]
      disallowedTools?: readonly string[]
      effort?: string
      mcpServers?: readonly ToolBinding['server'][]
    } = { cwd: input.cwd }
    if (input.model !== 'default') sessionOptions.model = input.model
    // EFF-1: Claude takes `--effort`, Codex takes `model_reasoning_effort` (OAR sets it from the same option); another CLI is not sent an option it may refuse (it keeps its own default).
    if ((options.capabilities.cli === 'claude' || options.capabilities.cli === 'codex') && input.effort !== undefined && input.effort !== '' && input.effort !== 'default') sessionOptions.effort = input.effort
    if (input.resumeSessionId !== undefined) sessionOptions.resume = input.resumeSessionId
    if (options.env !== undefined) sessionOptions.env = options.env
    if (policy !== undefined && policy.launchArgs.length > 0) sessionOptions.launchArgs = policy.launchArgs
    if (policy !== undefined && policy.disallowedTools.length > 0) sessionOptions.disallowedTools = policy.disallowedTools
    if (binding !== undefined) {
      sessionOptions.mcpServers = [binding.server]
      // Claude in `dontAsk` refuses what no rule allows: allow exactly the server we serve (each handler is behind the gateway's ACL).
      if (options.capabilities.cli === 'claude') sessionOptions.launchArgs = [...(sessionOptions.launchArgs ?? []), ...claudeAllowToolsArgs(binding.name)]
    }
    try {
      return await openSession(options, sessionOptions, policy)
    } catch (error) {
      // A model without an effort menu makes the runtime REFUSE the option (never ignore it). The persona's call must not fail for it
      // and must not hide it either: reopen without the effort, and say so in the usage.
      const message = error instanceof Error ? error.message : String(error)
      const asked = sessionOptions.effort
      if (asked === undefined || !/effort/iu.test(message)) throw error
      const retry = { ...sessionOptions }
      delete retry.effort
      const session = await openSession(options, retry, policy)
      droppedEffort.set(session, asked)
      return session
    }
  }

  const open = async (input: StartTurnInput, recovery: boolean): Promise<RunHandle> => {
    const cli = options.capabilities.cli
    requireExplicitPermission(input, cli)
    // HT-0: a turn that was offered product tools must not be told to use none; the native ones (files, shell) stay off.
    const offeredTools = input.mcpTools !== undefined && input.mcpTools.tools.length > 0 && options.capabilities.mcpTools === 'available'
    const inlineOnly = options.policy?.toolLevel === 'none'
      ? offeredTools
        ? 'Responda usando o contexto já fornecido e, se faltar algo, as ferramentas da Persona oferecidas neste turno. Não leia arquivos nem peça permissões. Se ainda faltar informação, diga qual.\n\n'
        : 'Responda somente em texto usando o contexto já fornecido. Não use ferramentas, não leia arquivos nem peça permissões. Se faltar informação, diga qual.\n\n'
      : ''
    const prompt = inlineOnly + (recovery ? `${RECOVERY_NOTE}\n\n${input.prompt}` : input.prompt)
    // TEAM-5: the images are checked BEFORE a session is opened; a turn that cannot carry them is refused, never sent without them.
    const images = input.images === undefined || input.images.length === 0 ? undefined : checkTurnImages(input.images, options.capabilities.images === 'available')
    const existing = reuse(input)
    const session = existing ?? await spawn(input)
    if (images !== undefined && session.capabilities.images !== true) throw new ImagesRefusedError('engine')
    // HT-0: from here on the tools of THIS turn answer the CLI's calls (a warm session never keeps a previous turn's).
    const binding = bindingOf.get(session)
    if (binding !== undefined) {
      const previous = binding.current
      binding.current = input.mcpTools
      if (previous !== undefined && previous !== input.mcpTools) await closeToolSet(previous)
    }
    return attach(input, session, prompt, images)
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
      await endTurnTools(live)
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
      // HT-0: a cancelled turn can no longer reach its tools, even if the CLI is slow to stop.
      await endTurnTools(live)
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
      // The session is reopened from `next`: whatever shapes the session (effort, product tools) has to travel with it, or a resumed
      // turn would silently lose it (and miss its own warm slot, keyed by both).
      if (input.effort !== undefined) next.effort = input.effort
      if (input.mcpTools !== undefined) next.mcpTools = input.mcpTools
      const hit = reuse(next)
      if (hit === undefined) await releaseLive(sessions, input.resumeSessionId)
      return open(next, true)
    },
    usage: async (handle) => {
      if (handle === undefined) return { inputTokens: 0, outputTokens: 0 }
      const live = sessions.get(handle.runId)
      if (live === undefined) return { inputTokens: 0, outputTokens: 0 }
      if (live.final !== undefined) return live.final
      // The TURN's own spend, not the warm session's running total (see `usageSince`).
      const turn = usageSince(usageOf(live.session), live.base)
      if (live.finished) live.final = turn
      return turn
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
