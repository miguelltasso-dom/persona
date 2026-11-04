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
}

/** Token / cost snapshot a runner can report. */
export interface RunnerUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
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
  /** When true the runner prepends the engine recovery note. */
  recovery?: boolean
  /** Explicit permission mode for CLI runners; DSH ignores it. */
  permissionMode?: 'prompt' | 'allow-once' | 'deny'
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
