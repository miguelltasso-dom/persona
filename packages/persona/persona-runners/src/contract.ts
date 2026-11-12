/**
 * Runner contract for Persona executors (D-009 / D-031 / R-1).
 *
 * Events normalize to Forge engine Report / Assignment fields: `ReportState`
 * matches `persona-engine` and `toWorkerReport` is what `Engine.report` accepts.
 */

/** Same states the engine stores on `Assignment.report.state`. */
export type ReportState = 'progress' | 'waiting' | 'ready' | 'blocked' | 'failed' | 'dropped'

/** Direct DSH agent or a delegated CLI. */
export type RunnerKind = 'dsh' | 'cli'

/** CLI families the OAR adapters wrap (D1a/D1b/D2). */
export type CliKind = 'claude' | 'codex' | 'cursor' | 'opencode'

/** One prior model-visible turn kept across resume and model swaps. */
export interface HistoryTurn {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Payload `Engine.report` / `WorkerReport` accept after a run event.
 * Optional question fields are omitted when unset (`exactOptionalPropertyTypes`).
 */
export interface NormalizedReport {
  state: ReportState
  summary: string
  question?: string | null
  askedBy?: string
  answers?: string
  /** Untrusted model-supplied facts; the Host validates source and audience before persistence. */
  facts?: unknown
  /**
   * A structured question the persona wrote (chips, a sequence of up to five): untrusted, read with the engine's `askInputOf` and
   * validated by `normalizeAskQuestions` in the Host. When the Host cannot open it, `question` (plain text) is still shown.
   */
  ask?: unknown
}

/**
 * What a CLI session loaded at start (ISO-4, D-081): COUNTS only, from the runtime's own `system/init` frame. Names of
 * servers, tools and skills are personal data and are never carried. Absent fields were not reported (never 0).
 */
export interface RunnerEnvironment {
  tools?: number
  mcpServers?: number
  skills?: number
  slashCommands?: number
  plugins?: number
  model?: string
}

/** Token / cost snapshot a runner can report. */
export interface RunnerUsage {
  /** Everything the session spent, as the runtime reports it (for Claude: every model call of the pipeline). */
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /**
   * ISO-4: the part of `inputTokens`/`outputTokens` the root agent's own main loop spent, as the runtime reported it. Absent
   * when the runtime does not tell it apart; `total − main loop` is the auxiliary spend (subagents, compaction, internal calls).
   */
  mainLoopInputTokens?: number
  mainLoopOutputTokens?: number
  /** ISO-4: what the session loaded (counts). Present for CLIs that report a start frame (Claude). */
  environment?: RunnerEnvironment
  /** D-085: the environment mode this call RAN with (`native` | `answer-only` | `needed`), so every measurement says what it measured. */
  envMode?: 'native' | 'answer-only' | 'needed'
  /** Only when the gate made the call fall back to `native`: the mode that was asked. */
  envModeRequested?: 'native' | 'answer-only' | 'needed'
  /** Why the call ran in `envMode` (`verified`, `unverified`, `failed-version`, `parity-unproven`, `parity-failed`, `off`, `ungated`...): codes only. */
  envModeReason?: string
  /** HT-11: the person turned "use my Claude skills" on: `loaded` = this call had them, `dropped` = not proven for this CLI version or none found (the call ran at the floor). Absent = option off or not applicable. */
  personalSkills?: 'loaded' | 'dropped'
  /** ISO-5: account connectors this call loaded, and how many that were asked for were NOT usable (needs-auth, gone, unproven) and dropped. */
  connectorsLoaded?: number
  connectorsDropped?: number
  /**
   * D-096: the GRANTED connectors the `needed` launch did not deliver to the call, by position in the (deduplicated, first-occurrence order) `accountConnectors` list the host passed,
   * with a code for why. Present only when at least one was not reached. Codes only: no URL and no name ever leaves the runner (the host maps the ordinal to its connector).
   */
  connectorsUnreached?: readonly ConnectorUnreached[]
  /**
   * D-096: what the runner did about it. `native-once` = THIS call ran native (`envMode: 'native'`, `envModeRequested: 'needed'`, `envModeReason: 'connector-unreached'`: the native launch loads
   * every account connector, so one that the isolated launch could not find may be found by name); the decision is per call, never remembered. `floor` = the call ran at the `needed` floor with the
   * connectors that did arrive (native could not reach one that needs the person to sign in again either, and costs ~300 000 tokens per request for nothing).
   */
  connectorsFallback?: 'native-once' | 'floor'
  /** EFF-1: the effort the persona asked for that the engine/model REFUSED (a model without an effort menu). The call ran at the engine's default. */
  effortDropped?: string
  /** EFF-1: the model the PERSON chose for the persona (absent = "padrão do motor": nothing was sent). */
  modelRequested?: string
  /** EFF-1: the effort the person chose (absent = none). `effortDropped` says when the model refused it. */
  effortRequested?: string
  /** EFF-1: the chosen model the engine does not offer: the call ran on the engine's default instead of failing (the Task is not lost). */
  modelDropped?: string
}

/** D-096: why a granted connector did not reach the call (codes only). */
export type ConnectorUnreachedReason = 'needs-auth' | 'no-login' | 'failed' | 'absent' | 'many' | 'timeout'

/** D-096: one granted connector that did not reach the call: its position in the list the host passed, and why. */
export interface ConnectorUnreached {
  readonly ordinal: number
  readonly reason: ConnectorUnreachedReason
}

/** What a runner can do before a turn starts. */
export interface RunnerCapabilities {
  kind: RunnerKind
  stream: boolean
  cancel: boolean
  resume: boolean
  usage: boolean
  /** Cursor without MCP must advertise `unavailable` (D-018 / D2). */
  mcpTools: 'available' | 'unavailable'
  /** TEAM-5: the turn can carry images the persona really sees. Absent = `unavailable` (only a CLI proven to read them says `available`). */
  images?: 'available' | 'unavailable'
  /** CLI turns always require an explicit permission mode. */
  permission: 'explicit' | 'none'
  cli?: CliKind
}

/** Live handle for one Assignment turn (one session + one worktree). */
export interface RunHandle {
  runId: string
  sessionId: string
  ticketId: string
  assignmentId: string
  personaId: string
  cwd: string
  model: string
}

/**
 * HT-0: one product tool offered to a CLI turn. The handler is already bound to the turn that offered it (gateway lease): identity
 * is the turn, never an argument. Same shape as `PersonaMcpTool`, so `gateway`/`personaMcpTools` rows can be passed as they are.
 */
export interface TurnTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>
}

/**
 * HT-0: the product tools one turn may call (already filtered by the persona's grant). The runner serves them to the CLI
 * (OAR `serveMcpTools`); it never sees the gateway, token or ACL.
 */
export interface TurnToolSet {
  /** Server name the CLI shows (`^[\w-]+$`); Claude calls the tools `mcp__<server>__<tool>`. Default `persona`. */
  server?: string
  /** Guidance across the tools, returned in the MCP `initialize` result. */
  instructions?: string
  tools: readonly TurnTool[]
  /** Called once when the turn is over (ended, failed, cancelled): the host closes its lease here. */
  close?: () => void | Promise<void>
}

/** Input for `start` / `resume`. */
export interface StartTurnInput {
  ticketId: string
  assignmentId: string
  personaId: string
  cwd: string
  prompt: string
  model: string
  history?: readonly HistoryTurn[]
  resumeSessionId?: string
  /**
   * The conversation this turn belongs to, when it is not the engine session id. A talk reply has a session id of its own per
   * message (`talk-<event>`), yet every reply of a channel is the same conversation: the runner keys its live CLI process and its
   * `--resume` target by this value, so two conversations never share a process and a reopened one reattaches to its own session.
   * Absent = the runner's default scope (one conversation per persona, cwd and model).
   */
  threadKey?: string
  /** When true the runner prepends the engine recovery note. */
  recovery?: boolean
  /** Explicit permission mode for CLI runners; DSH ignores it. */
  permissionMode?: 'prompt' | 'allow-once' | 'deny'
  /**
   * EFF-1 (D-088): the persona's own reasoning effort (`low` | `medium` | `high` | `xhigh` | `max` for Claude). Absent = the engine's
   * default; never an invented value. Applies to the persona's own model (a task), not to the cheap talk model.
   */
  effort?: string
  /** HT-0: product tools this turn may call (CLIs with `mcpTools: 'available'`; Cursor ignores them). Absent = none. */
  mcpTools?: TurnToolSet
  /**
   * COLHEITA 17: extra stdio MCP servers this turn carries besides the product tools (the persona's browser, attached to
   * the Chrome of its profile). The runner appends them to the session's `mcpServers`; a CLI with `mcpTools:
   * 'unavailable'` gets none. Part of the session key: a warm session opened without them is not reused.
   */
  extraMcpServers?: readonly TurnMcpServer[]
  /**
   * TEAM-5: images that travel with this turn (an attachment of the team channel the host already saved on this machine). Delivered as the
   * engine's native image input, never as a path in the prompt. Refused whole, in human words, when the engine does not read images or an
   * image is too big/not an image (`ImagesRefusedError`); never silently dropped. Not sticky: a later turn carries only its own.
   */
  images?: readonly TurnImage[]
}

/** COLHEITA 17: one stdio MCP server a turn carries besides the product tools. */
export interface TurnMcpServer {
  /** The name the CLI knows the tools by (`mcp__<name>__<tool>` in Claude). */
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
}

/** TEAM-5: an image file on this machine that goes with a turn. */
export interface TurnImage {
  /** Absolute path of the saved attachment. */
  path: string
  /** `image/png` | `image/jpeg` | `image/gif` | `image/webp`; read from the extension when omitted. */
  mediaType?: string
}

/** Why a runner session was recovered (PRO-3 / PROACTIVITY.md). */
export type InfraFailureKind = 'context_full' | 'connection_error' | 'process_dead' | 'trust_prompt'

export type RunEvent =
  | { type: 'started'; at: string; handle: RunHandle }
  | { type: 'delta'; at: string; text: string }
  /** Cumulative text so far — Anvil forwards this to the UI without waiting for `ended`. */
  | { type: 'partial'; at: string; text: string }
  | { type: 'report'; at: string; report: NormalizedReport }
  | { type: 'usage'; at: string; usage: RunnerUsage }
  | { type: 'ended'; at: string; report: NormalizedReport }
  | { type: 'infra'; at: string; kind: InfraFailureKind; attempt: number; summary: string }
  /** The runtime echoed an input it took (`user_message` with its id): the steer was read, not merely accepted. */
  | { type: 'inputRead'; at: string; inputId: string }
  /** The runtime discarded an accepted input before reading it (`input_dropped`): the caller owns it again. */
  | { type: 'inputDropped'; at: string; inputId: string; reason: string }

export interface RunnerHealth {
  ok: boolean
  detail: string
}

export interface RunnerAuth {
  ok: boolean
  detail: string
}

/**
 * Turn-level runner (start / stream / cancel / resume / usage). The session
 * port the engine calls lives in `persona-engine/src/ports/runner.ts`.
 */
export interface Runner {
  capabilities(): RunnerCapabilities
  health(): Promise<RunnerHealth>
  authenticate(): Promise<RunnerAuth>
  start(input: StartTurnInput): Promise<RunHandle>
  startTurn(input: StartTurnInput): Promise<RunHandle>
  stream(handle: RunHandle): AsyncIterable<RunEvent>
  events(handle: RunHandle): AsyncIterable<RunEvent>
  cancel(handle: RunHandle): Promise<void>
  /**
   * Put text into the turn that is open right now, without starting another one.
   * @param handle - The open turn.
   * @param requestId - Input id the runtime echoes back (and reports when it drops it).
   * @param text - What the person wants to change.
   * @returns `true` when the runtime accepted it; `false` when no turn is open (the caller starts one).
   */
  steer?(handle: RunHandle, requestId: string, text: string): Promise<boolean>
  resume(input: StartTurnInput): Promise<RunHandle>
  usage(handle?: RunHandle): Promise<RunnerUsage>
  /** Open the CLI session without a model turn (host boot prewarm). */
  prime?(input: StartTurnInput): Promise<RunHandle>
  /** Drop warm CLI sessions (quit / pauseTeam / model change). */
  dispose?(): Promise<void>
}

/** Engine recovery note copied from `persona-engine` (no package edge yet). */
export const RECOVERY_NOTE = 'The host restarted during this ticket. Inspect the current worktree, git history and GitHub state before continuing. Do not repeat an already completed external operation. Finish the original assignment and report its status.'

/**
 * Map a run event onto the engine WorkerReport / Assignment.report fields.
 * @param event - a `report` or `ended` event.
 * @returns the payload `Engine.report` accepts.
 */
export function toWorkerReport(event: Extract<RunEvent, { type: 'report' | 'ended' }>): NormalizedReport {
  return event.report
}

/**
 * ISO timestamp for run events.
 * @param now - optional clock.
 */
export function eventTime(now: () => Date = () => new Date()): string {
  return now().toISOString()
}
