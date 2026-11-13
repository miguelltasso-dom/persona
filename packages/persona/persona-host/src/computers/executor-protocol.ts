/**
 * D-116 executor (Bolt, decision B of Keel 12/11 18:04): a persona whose home is ANOTHER computer of the team runs her turn THERE, with that computer's runner and account, while the project (the thread, the board,
 * the documents) stays on the owner's PC. The wire between the two is this protocol, on the signed computer-to-computer door (`POST /remote/computer/executor`, one body, an `op`):
 *   A (owner's PC, holds the project) → B (the persona's home): `start` (the turn: prompt, history, model, the NAMES and schemas of the product tools — never their handlers), `cancel`, `steer`, `info`;
 *   B → A: `event` (a batch of what the runner emitted; an empty batch is the heartbeat), `tool` (the turn's tool call: A runs it bound to the turn's lease, so the grants and the ACL stay on A; B only carries).
 * What does NOT travel: the working directory (B uses a scratch folder of its own), images (a path on A means nothing on B: refused whole, in words), A's browser servers, A's session id to resume.
 * Everything here is validated at BOTH ends from untrusted JSON, with caps on every size, and every field is rebuilt from the allowed ones: an unknown field is dropped, never forwarded.
 */

import type { RunEvent, StartTurnInput, TurnToolSet } from '@deepseek-ai/dsh-persona-runners'

/** The route (one door, one body). */
export const EXECUTOR_PATH = '/remote/computer/executor'
/** A turn is worth this long from the moment A asks (B refuses a start past it). */
export const EXECUTOR_TURN_TTL_MS = 6 * 3_600_000
/** B beats this often while a turn runs (an empty batch of events); A that hears nothing for {@link EXECUTOR_SILENCE_MS} calls the turn lost. */
export const EXECUTOR_HEARTBEAT_MS = 15_000
export const EXECUTOR_SILENCE_MS = 90_000
/** B that cannot reach A for this long stops the local turn (nobody is listening: it would only burn tokens). */
export const EXECUTOR_ORPHAN_MS = 120_000
/** Turns B runs for the team at once. */
export const EXECUTOR_MAX_TURNS = 4
/** Caps. */
export const EXECUTOR_MAX_PROMPT = 1_000_000
export const EXECUTOR_MAX_HISTORY = 200
export const EXECUTOR_MAX_HISTORY_TEXT = 100_000
export const EXECUTOR_MAX_TOOLS = 64
export const EXECUTOR_MAX_SCHEMA = 20_000
export const EXECUTOR_MAX_EVENTS = 200
export const EXECUTOR_MAX_EVENT_BYTES = 262_144
export const EXECUTOR_MAX_TOOL_ARGS = 262_144
export const EXECUTOR_MAX_TOOL_RESULT = 262_144
/** A `start` A builds stays under this many bytes: below the door's body limit (`COMPUTER_BODY_MAX`, 12 MB), so the gate never cuts it silently. The oldest history goes first. */
export const EXECUTOR_MAX_START_BYTES = 11_000_000
/** How long A lets a tool call of a turn run. */
export const EXECUTOR_TOOL_TIMEOUT_MS = 300_000

const ID = /^[A-Za-z0-9._:@-]{1,200}$/u
const NAME = /^[A-Za-z0-9_.-]{1,100}$/u
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** One product tool as B sees it: the name and the schema, never the handler. */
export interface ExecutorTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

/** The engine hint of a turn. */
export interface ExecutorSpec {
  readonly kind: 'dsh' | 'cli'
  readonly cli?: 'claude' | 'codex' | 'cursor' | 'opencode'
}

/** The turn A asks B to run. */
export interface ExecutorStart {
  readonly op: 'start'
  readonly turnId: string
  readonly personaId: string
  /** The persona's home epoch A believes in: B refuses unless the persona's home on B is B at this epoch or higher. */
  readonly epoch: number
  readonly sessionId: string
  readonly ticketId: string
  readonly assignmentId: string
  readonly prompt: string
  readonly model: string
  readonly history?: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[]
  readonly threadKey?: string
  readonly effort?: string
  readonly permissionMode?: 'prompt' | 'allow-once' | 'deny'
  readonly authority?: 'person' | 'routine' | 'unattended'
  readonly recovery?: boolean
  readonly toolServer?: string
  readonly toolInstructions?: string
  /** What the persona asked for as an engine on A (`kind`, and which CLI): a HINT. B honors it when it has that engine and falls back to the engine of ITS own account otherwise (the account of that PC decides). */
  readonly spec?: ExecutorSpec
  readonly tools: readonly ExecutorTool[]
  /** Epoch milliseconds of A's clock after which B refuses the start. */
  readonly notAfter: number
}

/** The other ops. */
export type ExecutorOp =
  | ExecutorStart
  | { readonly op: 'cancel'; readonly turnId: string }
  | { readonly op: 'steer'; readonly turnId: string; readonly requestId: string; readonly text: string }
  | { readonly op: 'info' }
  | { readonly op: 'event'; readonly turnId: string; readonly seq: number; readonly events: readonly RunEvent[] }
  | { readonly op: 'tool'; readonly turnId: string; readonly callId: string; readonly name: string; readonly args: Record<string, unknown> }

/** Why a call to the executor was refused. Stable codes; B and A answer with them in `{ ok: false, reason }`. */
export type ExecutorRefusal =
  | 'malformed' | 'not-owner' | 'not-here' | 'epoch' | 'expired' | 'busy' | 'unknown-turn' | 'wrong-computer' | 'unknown-tool' | 'images-not-supported' | 'executor-offline' | 'no-runner' | 'too-big' | 'timeout' | 'home-not-trusted'

const text = (value: unknown, max: number): string | undefined => (typeof value === 'string' && value.length <= max ? value : undefined)
const id = (value: unknown): string | undefined => (typeof value === 'string' && ID.test(value) ? value : undefined)
const optionalText = (value: unknown, max: number): string | undefined | 'bad' => (value === undefined ? undefined : text(value, max) ?? 'bad')

/**
 * Rebuild a `start` from untrusted JSON.
 * @param value - Parsed JSON.
 * @returns The start, or `malformed` / `too-big`.
 */
export function cleanStart(value: unknown): ExecutorStart | 'malformed' | 'too-big' {
  if (!isObject(value) || value.op !== 'start') return 'malformed'
  const turnId = id(value.turnId)
  const personaId = id(value.personaId)
  const sessionId = text(value.sessionId, 200)
  const ticketId = text(value.ticketId, 200)
  const assignmentId = text(value.assignmentId, 200)
  const model = text(value.model, 200)
  if (turnId === undefined || personaId === undefined || sessionId === undefined || ticketId === undefined || assignmentId === undefined || model === undefined) return 'malformed'
  if (typeof value.epoch !== 'number' || !Number.isSafeInteger(value.epoch) || value.epoch < 0 || typeof value.notAfter !== 'number' || !Number.isFinite(value.notAfter)) return 'malformed'
  if (typeof value.prompt !== 'string') return 'malformed'
  if (value.prompt.length > EXECUTOR_MAX_PROMPT) return 'too-big'
  const history: { role: 'user' | 'assistant'; text: string }[] = []
  if (value.history !== undefined) {
    if (!Array.isArray(value.history)) return 'malformed'
    if (value.history.length > EXECUTOR_MAX_HISTORY) return 'too-big'
    for (const item of value.history as unknown[]) {
      if (!isObject(item) || (item.role !== 'user' && item.role !== 'assistant') || typeof item.text !== 'string') return 'malformed'
      if (item.text.length > EXECUTOR_MAX_HISTORY_TEXT) return 'too-big'
      history.push({ role: item.role, text: item.text })
    }
  }
  if (!Array.isArray(value.tools)) return 'malformed'
  if (value.tools.length > EXECUTOR_MAX_TOOLS) return 'too-big'
  const tools: ExecutorTool[] = []
  for (const item of value.tools as unknown[]) {
    if (!isObject(item) || typeof item.name !== 'string' || !NAME.test(item.name) || typeof item.description !== 'string' || item.description.length > 4_000 || !isObject(item.inputSchema)) return 'malformed'
    if (JSON.stringify(item.inputSchema).length > EXECUTOR_MAX_SCHEMA) return 'too-big'
    tools.push({ name: item.name, description: item.description, inputSchema: item.inputSchema })
  }
  const threadKey = optionalText(value.threadKey, 300)
  const effort = optionalText(value.effort, 40)
  const toolServer = optionalText(value.toolServer, 100)
  const toolInstructions = optionalText(value.toolInstructions, 20_000)
  if (threadKey === 'bad' || effort === 'bad' || toolServer === 'bad' || toolInstructions === 'bad') return 'malformed'
  if (value.permissionMode !== undefined && value.permissionMode !== 'prompt' && value.permissionMode !== 'allow-once' && value.permissionMode !== 'deny') return 'malformed'
  if (value.authority !== undefined && value.authority !== 'person' && value.authority !== 'routine' && value.authority !== 'unattended') return 'malformed'
  if (value.recovery !== undefined && typeof value.recovery !== 'boolean') return 'malformed'
  if (toolServer !== undefined && !/^[\w-]+$/u.test(toolServer)) return 'malformed'
  let spec: ExecutorSpec | undefined
  if (value.spec !== undefined) {
    const raw = value.spec
    if (!isObject(raw) || (raw.kind !== 'dsh' && raw.kind !== 'cli') || (raw.cli !== undefined && raw.cli !== 'claude' && raw.cli !== 'codex' && raw.cli !== 'cursor' && raw.cli !== 'opencode')) return 'malformed'
    spec = { kind: raw.kind, ...(raw.cli === undefined ? {} : { cli: raw.cli }) }
  }
  return {
    op: 'start', turnId, personaId, epoch: value.epoch, sessionId, ticketId, assignmentId, prompt: value.prompt, model, notAfter: value.notAfter, tools,
    ...(history.length === 0 ? {} : { history }), ...(threadKey === undefined ? {} : { threadKey }), ...(effort === undefined ? {} : { effort }),
    ...(value.permissionMode === undefined ? {} : { permissionMode: value.permissionMode }), ...(value.authority === undefined ? {} : { authority: value.authority }),
    ...(value.recovery === undefined ? {} : { recovery: value.recovery }), ...(toolServer === undefined ? {} : { toolServer }), ...(toolInstructions === undefined ? {} : { toolInstructions }),
    ...(spec === undefined ? {} : { spec }),
  }
}

function cleanEvent(value: unknown): RunEvent | 'malformed' | 'too-big' {
  if (!isObject(value) || typeof value.at !== 'string' || value.at.length > 40 || !Number.isFinite(Date.parse(value.at))) return 'malformed'
  if (JSON.stringify(value).length > EXECUTOR_MAX_EVENT_BYTES) return 'too-big'
  const at = value.at
  switch (value.type) {
    case 'started': return { type: 'started', at, handle: { runId: '', sessionId: '', ticketId: '', assignmentId: '', personaId: '', cwd: '', model: '' } }
    case 'delta': case 'partial': {
      const said = text(value.text, EXECUTOR_MAX_EVENT_BYTES)
      return said === undefined ? 'malformed' : { type: value.type, at, text: said }
    }
    case 'usage': {
      if (!isObject(value.usage)) return 'malformed'
      const u = value.usage
      const valid = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000
      if (!valid(u.inputTokens) || !valid(u.outputTokens)) return 'malformed'
      const usage: Extract<RunEvent, { type: 'usage' }>['usage'] = { inputTokens: u.inputTokens, outputTokens: u.outputTokens }
      for (const key of ['cacheReadTokens', 'cacheWriteTokens', 'mainLoopInputTokens', 'mainLoopOutputTokens', 'connectorsLoaded', 'connectorsDropped'] as const) {
        if (u[key] !== undefined) { if (!valid(u[key])) return 'malformed'; usage[key] = u[key] }
      }
      return { type: 'usage', at, usage }
    }
    case 'report': case 'ended': {
      if (!isObject(value.report)) return 'malformed'
      const r = value.report
      if (r.state !== 'progress' && r.state !== 'waiting' && r.state !== 'ready' && r.state !== 'blocked' && r.state !== 'failed' && r.state !== 'dropped') return 'malformed'
      const summary = text(r.summary, 100_000)
      if (summary === undefined || (r.question !== undefined && r.question !== null && text(r.question, 100_000) === undefined) || (r.askedBy !== undefined && text(r.askedBy, 200) === undefined) || (r.answers !== undefined && text(r.answers, 100_000) === undefined)) return 'malformed'
      const report: Extract<RunEvent, { type: 'report' }>['report'] = { state: r.state, summary }
      if (typeof r.question === 'string' || r.question === null) report.question = r.question
      if (typeof r.askedBy === 'string') report.askedBy = r.askedBy
      if (typeof r.answers === 'string') report.answers = r.answers
      if (r.facts !== undefined) report.facts = r.facts
      if (r.ask !== undefined) report.ask = r.ask
      return { type: value.type, at, report }
    }
    case 'infra': {
      if (value.kind !== 'context_full' && value.kind !== 'connection_error' && value.kind !== 'process_dead' && value.kind !== 'trust_prompt') return 'malformed'
      const summary = text(value.summary, 100_000)
      if (summary === undefined || typeof value.attempt !== 'number' || !Number.isInteger(value.attempt) || value.attempt < 0 || value.attempt > 20) return 'malformed'
      return { type: 'infra', at, kind: value.kind, attempt: value.attempt, summary }
    }
    case 'inputRead': case 'inputDropped': {
      const inputId = id(value.inputId)
      if (inputId === undefined) return 'malformed'
      if (value.type === 'inputRead') return { type: 'inputRead', at, inputId }
      const reason = text(value.reason, 100_000)
      return reason === undefined ? 'malformed' : { type: 'inputDropped', at, inputId, reason }
    }
    default: return 'malformed'
  }
}

/**
 * Rebuild any other op from untrusted JSON (a `start` goes through {@link cleanStart}).
 * @param value - Parsed JSON.
 * @returns The op, or why not.
 */
export function cleanOp(value: unknown): ExecutorOp | 'malformed' | 'too-big' {
  if (!isObject(value) || typeof value.op !== 'string') return 'malformed'
  switch (value.op) {
    case 'start': return cleanStart(value)
    case 'info': return { op: 'info' }
    case 'cancel': { const turnId = id(value.turnId); return turnId === undefined ? 'malformed' : { op: 'cancel', turnId } }
    case 'steer': {
      const turnId = id(value.turnId)
      const requestId = text(value.requestId, 200)
      const said = text(value.text, EXECUTOR_MAX_HISTORY_TEXT)
      return turnId === undefined || requestId === undefined || said === undefined ? 'malformed' : { op: 'steer', turnId, requestId, text: said }
    }
    case 'event': {
      const turnId = id(value.turnId)
      if (turnId === undefined || typeof value.seq !== 'number' || !Number.isSafeInteger(value.seq) || value.seq < 0 || !Array.isArray(value.events)) return 'malformed'
      if (value.events.length > EXECUTOR_MAX_EVENTS) return 'too-big'
      const events: RunEvent[] = []
      for (const item of value.events as unknown[]) {
        const event = cleanEvent(item)
        if (typeof event === 'string') return event
        events.push(event)
      }
      return { op: 'event', turnId, seq: value.seq, events }
    }
    case 'tool': {
      const turnId = id(value.turnId)
      const callId = id(value.callId)
      if (turnId === undefined || callId === undefined || typeof value.name !== 'string' || !NAME.test(value.name) || !isObject(value.args)) return 'malformed'
      if (JSON.stringify(value.args).length > EXECUTOR_MAX_TOOL_ARGS) return 'too-big'
      return { op: 'tool', turnId, callId, name: value.name, args: value.args }
    }
    default: return 'malformed'
  }
}

/**
 * A's side: what a runner is asked to start, as the wire carries it.
 * @param input - The turn as the orchestration built it.
 * @param extra - The turn id, the persona's home epoch and A's clock.
 * @returns The `start`, or `images-not-supported` (an image is a path on A: it means nothing on B, and it is never silently dropped).
 */
export function startOf(input: StartTurnInput, extra: { readonly turnId: string; readonly epoch: number; readonly now: number; readonly spec?: ExecutorSpec }): ExecutorStart | 'images-not-supported' | 'too-big' {
  if (input.images !== undefined && input.images.length > 0) return 'images-not-supported'
  const tools = input.mcpTools
  const whole: ExecutorStart = {
    op: 'start', turnId: extra.turnId, personaId: input.personaId, epoch: extra.epoch, sessionId: input.ticketId, ticketId: input.ticketId, assignmentId: input.assignmentId, prompt: input.prompt, model: input.model,
    notAfter: extra.now + EXECUTOR_TURN_TTL_MS, tools: tools === undefined ? [] : tools.tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
    ...(input.threadKey === undefined ? {} : { threadKey: input.threadKey }), ...(input.effort === undefined ? {} : { effort: input.effort }),
    ...(input.permissionMode === undefined ? {} : { permissionMode: input.permissionMode }), ...(input.authority === undefined ? {} : { authority: input.authority }),
    ...(input.recovery === undefined ? {} : { recovery: input.recovery }), ...(tools?.server === undefined ? {} : { toolServer: tools.server }), ...(tools?.instructions === undefined ? {} : { toolInstructions: tools.instructions }),
    ...(extra.spec === undefined ? {} : { spec: extra.spec }),
  }
  const history = input.history
  if (history === undefined || history.length === 0) return whole
  // The history is the only part that grows without a small cap: it is trimmed from the OLDEST turn until the whole start fits what the door reads.
  const budget = EXECUTOR_MAX_START_BYTES - Buffer.byteLength(JSON.stringify(whole), 'utf8') - 16
  if (budget <= 0) return 'too-big'
  const kept: { readonly role: 'user' | 'assistant'; readonly text: string }[] = []
  let used = 0
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (item === undefined) continue
    const entry = { role: item.role, text: item.text }
    used += Buffer.byteLength(JSON.stringify(entry), 'utf8') + 1
    if (used > budget) break
    kept.unshift(entry)
  }
  return kept.length === 0 ? whole : { ...whole, history: kept }
}

/**
 * B's side: the input the local runner starts, with the product tools served by a PROXY (each call goes back to A).
 * @param start - The validated `start`.
 * @param cwd - A scratch folder on B (never A's working directory).
 * @param call - How a tool call reaches A.
 * @returns The input for B's own runner.
 */
export function inputOf(start: ExecutorStart, cwd: string, call: (name: string, args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>): StartTurnInput {
  const mcpTools: TurnToolSet = {
    ...(start.toolServer === undefined ? {} : { server: start.toolServer }), ...(start.toolInstructions === undefined ? {} : { instructions: start.toolInstructions }),
    tools: start.tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, handler: (args: Record<string, unknown>) => call(tool.name, args) })),
  }
  return {
    ticketId: start.ticketId, assignmentId: start.assignmentId, personaId: start.personaId, cwd, prompt: start.prompt, model: start.model,
    ...(start.history === undefined ? {} : { history: start.history }), ...(start.threadKey === undefined ? {} : { threadKey: start.threadKey }), ...(start.effort === undefined ? {} : { effort: start.effort }),
    ...(start.permissionMode === undefined ? {} : { permissionMode: start.permissionMode }), ...(start.authority === undefined ? {} : { authority: start.authority }), ...(start.recovery === undefined ? {} : { recovery: start.recovery }),
    ...(start.tools.length === 0 ? {} : { mcpTools }),
  }
}
