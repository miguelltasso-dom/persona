/**
 * Resolve the session Runner for one persona. Fake/scripted unless PERSONA_REAL_CLI=1.
 * Live resolve goes through Rivet (`resolveRunner` / `ctx.personaRunners.resolveRunner`).
 */

import { join } from 'node:path'
import {
  cheapModelForFirstDelivery,
  preferConnectedCli,
  type Runner,
} from '@deepseek-ai/dsh-persona-engine'
import {
  createFakeRunner,
  createOarSessionRunner,
  effectiveToolLevel,
  resolveRunner,
  RunnerResolveError,
  toolNameFromEvent,
  type PermissionGate,
  type PersonaRunnerSpec,
  type NormalizedReport,
  type RunEvent,
  type ToolLevel,
  type TurnRunner,
  type UsageMeterSink,
} from '@deepseek-ai/dsh-persona-runners'
import type { ProductToolsOpener } from './harness-turn.ts'
import type { AutonomyMode } from './types.ts'

/** Why this runner is opening. Talk has no tools; task runs in a worktree. */
export type RunnerPurpose = 'talk' | 'task'

/** CLI/DSH permission. Never inline a comment inside this union (Typert). */
export type HostPermissionMode = 'prompt' | 'allow-once' | 'deny'

/** One connector of the person's CLI granted to the persona (ISO-2). Sorted by `(cli, id)` by whoever builds the list. */
export interface HostConnectorGrant {
  readonly cli: string
  readonly id: string
  /** How far THIS Task may go. */
  readonly access: 'read' | 'write'
  /** Why it is authorized: the person's request or "desta vez" (that Task only), or a permanent permission. */
  readonly basis: 'request' | 'once' | 'permanent'
  /** Classes the runner lets through at launch without asking; anything else the CLI asks for and the turn ends `blocked`. Pay and delete are in only when explicitly waived. */
  readonly preAllow: readonly ('read' | 'change' | 'send' | 'pay' | 'delete')[]
  /** After the person approved: this tool, ONCE, only with these arguments (the runner checks the hash of the real call). */
  readonly approved?: readonly { readonly tool: string; readonly argsHash: string }[]
}

/** Spec + host-derived permission for one persona. */
export interface HostRunnerRequest {
  readonly spec: PersonaRunnerSpec
  readonly permissionMode: HostPermissionMode
  readonly autonomy: 'on_request' | 'propose' | 'act'
  /** Isolated CLI home. Empty/omitted = process home (native `~/.claude`). */
  readonly home?: string
  readonly personId: string
  readonly usage?: UsageMeterSink
  readonly tools?: Readonly<Record<string, ToolLevel>>
  /** Only a Task's execution on a CLI carries connectors; absent = the runner builds a config with no MCP at all (D-081). */
  readonly connectors?: readonly HostConnectorGrant[]
  /** HT-9: the gate the CLI's PreToolUse hook points at (Claude only). The host arms it before each turn and reads what it refused after (`action-bridge.ts`). */
  readonly permissionGate?: PermissionGate
  /** HT-0 (v1.1, OFF by default): opens the product tools of each turn of a Task (board, sprints, routines) on the turn lease. */
  readonly productTools?: ProductToolsOpener
  readonly purpose?: RunnerPurpose
  readonly projectId?: string
  readonly personaName?: string
  readonly personaTitle?: string
  readonly onFirstToken?: (text: string) => void
  /** Talk uses an isolated home dir — never the repo checkout. */
  readonly cwd?: string
}

/** Factory the orchestration uses per persona (optional request = default fake). */
export type HostRunnerFactory = (request?: HostRunnerRequest) => Promise<Runner>

/**
 * Permission mode from autonomy (explicit — never implicit default inside resolve).
 * @param mode - Host autonomy.
 */
export function permissionModeOf(mode: AutonomyMode): HostPermissionMode {
  return mode === 'act' ? 'allow-once' : 'prompt'
}

/**
 * CLI never uses `prompt` (D-013: OAR does not answer approvals).
 * Talk / coordination with no tools → `deny`. Task in a confined worktree
 * → `allow-once` when the persona may write files or run a safe shell.
 * @param purpose - Talk vs ticket execution.
 * @param tools - Persona `tools` map (files/shell/…).
 */
export function cliPermissionOf(
  purpose: RunnerPurpose,
  tools: Readonly<Record<string, string>> = {},
): 'deny' | 'allow-once' {
  if (purpose === 'talk') return 'deny'
  if (tools.files === 'write' || tools.shell === 'safe' || tools.shell === 'write') return 'allow-once'
  return 'deny'
}

/**
 * Permission for one resolve. CLI rejects `prompt` (fails loud, pt-BR).
 * @param spec - Runner spec.
 * @param purpose - Talk vs task.
 * @param tools - Persona tools.
 * @param autonomy - Host autonomy (DSH only).
 */
export function permissionFor(
  spec: PersonaRunnerSpec,
  purpose: RunnerPurpose,
  tools: Readonly<Record<string, string>>,
  autonomy: AutonomyMode,
): HostPermissionMode {
  if (spec.kind === 'cli') return cliPermissionOf(purpose, tools)
  return permissionModeOf(autonomy)
}

/**
 * Invalid `prompt` on a CLI is a load-time / resolve-time failure.
 * @param spec - Runner spec.
 * @param mode - Requested mode.
 */
export function assertCliPermission(
  spec: PersonaRunnerSpec,
  mode: HostPermissionMode,
): void {
  if (spec.kind === 'cli' && mode === 'prompt') {
    throw new Error('CLI não aceita modo prompt — a aprovação interativa não existe. Use deny (resposta) ou allow-once (tarefa no worktree).')
  }
}

/**
 * Highest grant on the persona tools map (`none` when empty).
 * @param tools - Persona tools.
 */
export function toolLevelOf(tools: Readonly<Record<string, ToolLevel>> | undefined): ToolLevel {
  return effectiveToolLevel(tools ?? {})
}

/**
 * Engine autonomy tag from the host mode.
 * @param mode - Host autonomy.
 */
export function autonomyLevelOf(mode: AutonomyMode): HostRunnerRequest['autonomy'] {
  if (mode === 'act') return 'act'
  if (mode === 'propose') return 'propose'
  return 'on_request'
}

/**
 * CLI config home for resolveRunner.
 * Default is the process home (native `~/.claude` / `~/.codex`). Isolation
 * (`<PERSONA_HOME>/runners/<projectId>`) is opt-in only — not a v1 field.
 * @param projectId - Tenant (used only when `isolate` is true).
 * @param isolate - Explicit per-persona/project opt-in. Absent in v1.
 */
export function runnerHomeOf(projectId: string, isolate = false): string {
  if (!isolate) return ''
  const root = process.env.PERSONA_HOME ?? process.env.DSH_HOME ?? process.cwd()
  return join(root, 'runners', projectId)
}

/**
 * Fake/scripted replies are tests (`VITEST`) or `PERSONA_SCRIPTED=1`.
 * `PERSONA_REAL_CLI=1` and production never invent channel text.
 */
export function allowsScriptedReplies(): boolean {
  if (process.env.PERSONA_REAL_CLI === '1') return false
  return process.env.VITEST === 'true' || process.env.PERSONA_SCRIPTED === '1'
}

/**
 * Desktop / production host: force the live CLI. Tests stay fake.
 * Without this, `resolveHostRunner` used a fake and dogfoods recorded 0 execs.
 * @returns Nothing. Sets `PERSONA_REAL_CLI=1` when not under Vitest.
 */
export function ensureProductionRealCli(): void {
  if (process.env.VITEST === 'true' || process.env.PERSONA_SCRIPTED === '1') return
  process.env.PERSONA_REAL_CLI = '1'
}

/** Logged-in CLI kinds the host may bind without a manual engine step. */
export type DetectedCli = 'claude' | 'codex' | 'opencode' | 'cursor'

/**
 * Prefer the persona's stored CLI. If the persona is still `dsh` and a CLI
 * is already logged in, use that connection — no extra UI step.
 * @param runner - Stored persona runner.
 * @param logged - Probe card that is `loggedIn` (not `dsh`).
 * @returns Rivet spec for {@link resolveHostRunner}.
 */
export function specFromConnection(
  runner: { kind: 'dsh' | 'cli'; model: string; cli?: string | undefined; effort?: string | undefined },
  logged?: DetectedCli,
): PersonaRunnerSpec {
  const stored = specOfPersona(runner)
  if (stored.kind === 'cli') return stored
  if (logged !== undefined) {
    const model = runner.model === '' || runner.model === 'default'
      ? cheapModelForFirstDelivery(logged)
      : runner.model
    return { kind: 'cli', cli: logged, model }
  }
  return stored
}

/**
 * Rivet order on host cards: Claude > Codex > OpenCode > Cursor.
 * @param cards - `listConnections` rows.
 */
export function loggedCliFromCards(
  cards: readonly { kind: string; loggedIn: boolean }[],
): DetectedCli | undefined {
  return preferConnectedCli(cards.filter(row => row.loggedIn && row.kind !== 'dsh').map(row => row.kind))
}

/**
 * Persona store runner → Rivet spec.
 * @param runner - Stored runner.
 */
export function specOfPersona(runner: { kind: 'dsh' | 'cli'; model: string; cli?: string | undefined; effort?: string | undefined }): PersonaRunnerSpec {
  if (runner.kind === 'cli' && runner.cli !== undefined && runner.cli !== '') {
    if (runner.cli === 'claude' || runner.cli === 'codex' || runner.cli === 'opencode' || runner.cli === 'cursor') {
      // EFF-1: only what the person chose; without a choice the spec has no `effort` and the engine runs at its default.
      return { kind: 'cli', cli: runner.cli, model: runner.model, ...(runner.effort === undefined ? {} : { effort: runner.effort }) }
    }
  }
  return { kind: 'dsh', model: runner.model === '' ? 'default' : runner.model }
}

/** Cordis `ctx.personaRunners` slice the host prefers over a direct import. */
export interface PersonaRunnersSlice {
  resolveRunner: typeof resolveRunner
  createFakeRunner: typeof createFakeRunner
}

/**
 * Fake in tests / `PERSONA_SCRIPTED`. Production and `PERSONA_REAL_CLI=1` resolve live.
 * @param request - Persona spec; omission is allowed only in scripted/test mode.
 * @param runners - Plugin inject (`ctx.personaRunners`). Falls back to the import.
 */
export async function resolveHostRunner(
  request?: HostRunnerRequest,
  runners?: PersonaRunnersSlice,
): Promise<Runner> {
  if (allowsScriptedReplies()) {
    return runners?.createFakeRunner() ?? createFakeRunner()
  }
  if (request === undefined) throw new RunnerResolveError('engine_unavailable', 'dsh')
  assertCliPermission(request.spec, request.permissionMode)
  const resolve = runners?.resolveRunner ?? resolveRunner
  const capture: TextCapture = {
    last: '',
    ...(request.onFirstToken === undefined ? {} : { onFirst: request.onFirstToken }),
  }
  const home = request.home === undefined || request.home === '' ? undefined : request.home
  const tools = request.tools
  const accountConnectors = request.spec.kind === 'cli' && request.spec.cli === 'claude' ? (request.connectors ?? []).filter(item => item.cli === 'claude').map(item => item.id) : []
  const turn = tapTurn(await resolve({
    spec: request.spec,
    permissionMode: request.permissionMode,
    autonomy: request.autonomy,
    personId: request.personId,
    toolLevel: request.purpose === 'talk' ? 'none' : toolLevelOf(tools),
    ...(request.purpose === undefined ? {} : { purpose: request.purpose }),
    ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
    ...(tools === undefined ? {} : { tools }),
    ...(home === undefined ? {} : { home }),
    ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
    ...(request.usage === undefined ? {} : { usage: request.usage }),
    // HT-8/9: the connectors of THIS Task (a Claude Task only) and the gate that guards their calls. Without a gate the runner loads them read-only.
    ...(accountConnectors.length === 0 ? {} : { accountConnectors }),
    ...(request.permissionGate === undefined ? {} : { permissionGate: request.permissionGate }),
  }), capture)
  const session = createOarSessionRunner({
    turn,
    personaId: request.personId,
    model: request.spec.model,
    permissionMode: request.permissionMode,
    ...(request.purpose === undefined ? {} : { purpose: request.purpose }),
    ...(request.personaName === undefined ? {} : { personaName: request.personaName }),
    ...(request.personaTitle === undefined ? {} : { personaTitle: request.personaTitle }),
    ...(request.productTools === undefined ? {} : {
      toolsFor: turn => request.productTools?.({ personaId: turn.personaId, ticketId: turn.ticketId, assignmentId: turn.assignmentId, cwd: turn.cwd }),
    }),
  })
  capture.onPartial = (text) => { partialSinks.get(session)?.(text) }
  captures.set(session, capture)
  return session
}

/** What stands in for her words when a turn spoke only between tools and ended on one (never the monologue, never a placeholder). */
export const NO_FINAL_WORDS = 'Terminei a minha parte.'

/**
 * Whether this event is a tool call (`tool:<name>`): the text before it is thinking aloud and the answer is what she writes after the last one (P0-2).
 * @param event - Streamed event.
 */
function isToolCallEvent(event: RunEvent): boolean {
  const name = toolNameFromEvent(event)
  return name !== undefined && event.type === 'report' && event.report.summary.startsWith('tool:') && /^[\w:./-]{1,120}$/u.test(name)
}

/** Last streamed model text for a live runner (empty on fake/scripted): the text AFTER the last tool of the turn, never the pieces between tools. */
export interface TextCapture {
  last: string
  /** Text was written before a tool and dropped (it was thinking aloud): with `last` empty the turn has no words of its own, see {@link NO_FINAL_WORDS}. */
  narrated?: boolean
  report?: NormalizedReport
  reportAt?: string
  firstAt?: number
  onFirst?: (text: string) => void
  /** Every cumulative piece of text of the turn (streaming into the thread); wired by {@link setRunnerPartialSink}. */
  onPartial?: (text: string) => void
  question?: string
  /** The structured question the persona wrote (untrusted; the host reads it with `askInputOf`). */
  ask?: unknown
}

const captures = new WeakMap<Runner, TextCapture>()
const partialSinks = new WeakMap<Runner, (text: string) => void>()

/**
 * Per-turn receiver of the text a runner is writing (cumulative). A cached warm runner serves many turns, so the sink is
 * set before a turn and cleared after it, never fixed at creation.
 * @param runner - Session runner.
 * @param sink - Receiver, or undefined to clear.
 */
export function setRunnerPartialSink(runner: Runner, sink: ((text: string) => void) | undefined): void {
  if (sink === undefined) partialSinks.delete(runner)
  else partialSinks.set(runner, sink)
}

/**
 * Deliver a piece of text to the sink of the current turn. Live runners reach it through the OAR tap; tests call it to
 * play a stream without any model.
 * @param runner - Session runner.
 * @param text - Cumulative text so far.
 */
export function emitRunnerPartial(runner: Runner, text: string): void {
  partialSinks.get(runner)?.(text)
}

/**
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns Trimmed model text, or empty when the runner did not stream.
 */
export function lastRunnerText(runner: Runner): string {
  return captures.get(runner)?.last.trim() ?? ''
}

/**
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns Whether the latest turn wrote text between tools and nothing after the last one (the text is empty but she did speak).
 */
export function lastRunnerNarrated(runner: Runner): boolean {
  const capture = captures.get(runner)
  return capture?.narrated === true && capture.last.trim() === ''
}

/**
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns `ended.report.question` when the CLI asked a person.
 */
export function lastRunnerQuestion(runner: Runner): string | undefined {
  return captures.get(runner)?.question
}

/**
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns The structured question (chips, a sequence) the persona wrote in the latest turn, exactly as written (untrusted).
 */
export function lastRunnerAsk(runner: Runner): unknown {
  return captures.get(runner)?.ask
}

/**
 * Last worker report, absent on session-only fake runners.
 * @param runner - Session runner returned by resolveHostRunner.
 * @returns The report from the most recent turn, or undefined before a report arrives.
 */
export function lastRunnerReport(runner: Runner): NormalizedReport | undefined {
  return captures.get(runner)?.report
}

/** @param runner - Session runner with a captured report. @returns Source timestamp of its latest report event. */
export function lastRunnerReportAt(runner: Runner): string | undefined {
  return captures.get(runner)?.reportAt
}

/**
 * Tee OAR deltas so the host can persist the real reply.
 * @param turn - Rivet turn runner.
 * @param capture - Accumulator.
 */
export function tapTurn(turn: TurnRunner, capture: TextCapture): TurnRunner {
  const take = (event: RunEvent): void => {
    if (event.type === 'started') {
      capture.last = ''
      delete capture.firstAt
      delete capture.question
      delete capture.ask
      delete capture.report
      delete capture.reportAt
      delete capture.narrated
    }
    if (isToolCallEvent(event)) {
      // P0-2: a tool closes the piece of text before it (thinking aloud: "Vou verificar…"). What a persona says is the LAST text after the LAST tool:
      // the thread, the bilhete, the review and the opinion never carry the monologue between tools.
      if (capture.last.trim() !== '') capture.narrated = true
      capture.last = ''
    }
    if (event.type === 'delta') {
      const first = capture.last === ''
      capture.last += event.text
      if (first && capture.last.trim() !== '') {
        capture.firstAt = Date.now()
        capture.onFirst?.(capture.last)
      }
      capture.onPartial?.(capture.last)
    }
    if (event.type === 'partial' && event.text.trim() !== '') {
      capture.last = event.text
      if (capture.firstAt === undefined) {
        capture.firstAt = Date.now()
        capture.onFirst?.(event.text)
      }
      capture.onPartial?.(event.text)
    }
    if (event.type === 'ended' || event.type === 'report') {
      capture.report = event.report
      capture.reportAt = event.at
      const question = event.report.question
      if (typeof question === 'string' && question !== '') capture.question = question
      if (event.report.ask !== undefined) capture.ask = event.report.ask
      // The adapter's placeholder ("turn ended") is not words: a turn with nothing to say stays empty (the host then has its own sentence).
      if (event.type === 'ended' && capture.last.trim() === '' && event.report.summary !== '' && event.report.summary !== 'turn ended') {
        capture.last = event.report.summary
      }
    }
  }
  return {
    ...turn,
    stream: handle => mapEvents(turn.stream(handle), take),
    events: handle => mapEvents(turn.events(handle), take),
  }
}

async function* mapEvents(
  source: AsyncIterable<RunEvent>,
  take: (event: RunEvent) => void,
): AsyncGenerator<RunEvent> {
  for await (const event of source) {
    take(event)
    yield event
  }
}

/**
 * Bind the factory to a live Cordis context so the app host uses the plugin.
 * @param ctx - Reads `personaRunners` via `get` (optional inject) when present.
 */
export function hostRunnerFromContext(ctx: { get?(name: string): unknown; personaRunners?: PersonaRunnersSlice }): HostRunnerFactory {
  return (request?: HostRunnerRequest) => {
    const fromGet = ctx.get?.('personaRunners')
    const runners = (fromGet ?? ctx.personaRunners) as PersonaRunnersSlice | undefined
    return resolveHostRunner(request, runners)
  }
}

/** @deprecated Use {@link resolveHostRunner}. Kept as the default factory alias. */
export const createHostRunner: HostRunnerFactory = resolveHostRunner
