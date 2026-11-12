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
  redactText,
  resolveRunner,
  RunnerResolveError,
  takeRunnerRefusals,
  toolNameFromEvent,
  type AuthorityKind,
  type PermissionGate,
  type PersonaRunnerSpec,
  type NormalizedReport,
  type RunEvent,
  type ToolLevel,
  type TurnRunner,
  type TurnMcpServer,
  type UsageMeterSink,
  withThreadResume,
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
  /**
   * COLHEITA 17: extra MCP servers of this runner's turns (the persona's browser, attached to the Chrome of its profile).
   * Absent = none. A CLI with `mcpTools: 'unavailable'` receives none (the adapter drops them).
   */
  readonly extraMcpServers?: readonly TurnMcpServer[]
  /**
   * Carbon P0-03a: who a turn of THIS Task acts for (`person`, `routine`, `unattended`), derived from the real origin of the Task. Asked on every turn: the runner is warm across Tasks, so it is never fixed
   * when the runner is built. Absent = `person`.
   */
  readonly authorityOf?: (ticketId: string) => AuthorityKind
  readonly purpose?: RunnerPurpose
  readonly projectId?: string
  readonly personaName?: string
  readonly personaTitle?: string
  readonly onFirstToken?: (text: string) => void
  /**
   * P0-07: the ONE conversation this talk runner serves (`<streamId>`, plus `#<subject>` when the stream has subjects). Its turns are stamped with it, so the CLI keeps a session (and a live process)
   * of its own per conversation and a private DM never shares a history with #geral. Absent on a talk runner that answers one-shot calls (aside, opinion, indicator): each call is its own thread.
   */
  readonly thread?: string
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
  const resolvedRunner = await resolve({
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
    // COLHEITA 17: a runner that carries the browser server needs the product's own gate even without a file/shell grant,
    // or its clicks and typing would run with no card (Lumen's native gate reads this).
    ...(request.extraMcpServers === undefined ? {} : { carriesBrowser: true }),
  })
  const turn = tapTurn(resolvedRunner, capture)
  // Item 2a: one live CLI process per conversation, reopened with `--resume` when the process is gone. A talk facade is one
  // channel; a task facade serves one ticket per session.
  // P0-07: a talk runner that serves ONE conversation (`request.thread`: its stream, and the subject when it has one) is stamped with it, so its CLI session is that conversation's own. Any other
  // talk runner (aside, opinion, indicator: the one-shot answers) keeps every call on a thread of its own: the old `shared` thread '' put every conversation in one CLI history.
  const threads = withThreadResume(turn, request.purpose === 'talk' && request.thread !== undefined ? { shared: true, thread: request.thread } : { shared: false })
  const session = createOarSessionRunner({
    turn: threads,
    personaId: request.personId,
    model: request.spec.model,
    permissionMode: request.permissionMode,
    ...(request.purpose === undefined ? {} : { purpose: request.purpose }),
    ...(request.personaName === undefined ? {} : { personaName: request.personaName }),
    ...(request.personaTitle === undefined ? {} : { personaTitle: request.personaTitle }),
    ...(request.productTools === undefined ? {} : {
      toolsFor: turn => request.productTools?.({ personaId: turn.personaId, ticketId: turn.ticketId, assignmentId: turn.assignmentId, cwd: turn.cwd }),
    }),
    // COLHEITA 17: the browser of this persona's turns; the adapter drops them on a CLI without MCP.
    ...(request.extraMcpServers === undefined ? {} : { serversFor: () => request.extraMcpServers }),
    // Carbon P0-03a: who each turn acts for, from the real origin of ITS Task (the runner is warm across Tasks).
    ...(request.authorityOf === undefined ? {} : { authorityFor: turn => request.authorityOf?.(turn.ticketId) }),
  })
  capture.onPartial = (text) => { partialSinks.get(session)?.(text) }
  capture.onTool = (tool) => { toolSinks.get(session)?.(tool) }
  captures.set(session, capture)
  refusalReaders.set(session, () => takeRunnerRefusals(resolvedRunner)) // Carbon P1-04: what the gate this runner opened by itself refused
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
  /** Item 12: each tool the turn calls reaches the per-turn tool sink (the background book counts them); wired by {@link setRunnerToolSink}. */
  onTool?: (tool: string) => void
  question?: string
  /** The structured question the persona wrote (untrusted; the host reads it with `askInputOf`). */
  ask?: unknown
  /** Item 7: the tool the turn called last (name as streamed); cleared when a turn starts. */
  step?: { readonly tool: string; readonly at: string }
  /** Item 3: every tool the turn called, in order (names as streamed); cleared when a turn starts. The proof the end-of-turn rules (`turn-close.ts`) ask for. */
  tools?: string[]
  /** Colheita §6: the instant of each call, parallel to {@link tools} (the conversation turn's step summary counts the time with them). */
  toolTimes?: string[]
  /** P0-07b: the state of each turn this runner played, by the ticket id of its handle (= the session of the facade). Set by {@link tapTurn}; absent on a seeded or fake capture. */
  turns?: Map<string, TextCapture>
  /** P0-07b: the key of the turn that STARTED last: what a reader that names no session reads. */
  turn?: string
}

/** How many turns a runner remembers (the oldest is forgotten first): the readers ask right after a turn, so the tail is all that matters. */
const MAX_TURNS_KEPT = 64

const captures = new WeakMap<Runner, TextCapture>()
const partialSinks = new WeakMap<Runner, (text: string) => void>()
const toolSinks = new WeakMap<Runner, (tool: string) => void>()
const refusalReaders = new WeakMap<Runner, () => string[]>()

/**
 * Carbon P1-04: the tools the gate a runner opened ON ITS OWN refused in the turn that just ended (a Task without connectors has no host gate). Drained: ask once per turn.
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns Tool names; empty for a runner with no gate of its own.
 */
export function takeRunnerRefusedTools(runner: Runner): string[] {
  return refusalReaders.get(runner)?.() ?? []
}

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
 * Per-turn receiver of each tool call a runner makes (the background book counts them). Like the partial sink: a warm runner serves many turns,
 * so it is set when a Task turn starts, never fixed at creation.
 * @param runner - Session runner.
 * @param sink - Receiver of the tool name, or undefined to clear.
 */
export function setRunnerToolSink(runner: Runner, sink: ((tool: string) => void) | undefined): void {
  if (sink === undefined) toolSinks.delete(runner)
  else toolSinks.set(runner, sink)
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
export function lastRunnerText(runner: Runner, session?: string): string {
  return captureOf(runner, session)?.last.trim() ?? ''
}

/**
 * P0-07b: what a reader sees of a runner. Without a session: the turn that started last (the runner's own capture mirrors it). With a session: THAT session's turn, and nothing at all when the
 * runner never ran it: a reader never gets the state of another session. A runner that kept no turns (a seeded capture) answers with its own.
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @param session - The facade's session id (a task session is `worker-<ticket>`; its handle carries the ticket).
 */
function captureOf(runner: Runner, session?: string): TextCapture | undefined {
  const base = captures.get(runner)
  if (session === undefined || base?.turns === undefined) return base
  return base.turns.get(session.replace(/^worker-/u, ''))
}

/**
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns Whether the latest turn wrote text between tools and nothing after the last one (the text is empty but she did speak).
 */
export function lastRunnerNarrated(runner: Runner, session?: string): boolean {
  const capture = captureOf(runner, session)
  return capture?.narrated === true && capture.last.trim() === ''
}

/**
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns `ended.report.question` when the CLI asked a person.
 */
export function lastRunnerQuestion(runner: Runner, session?: string): string | undefined {
  return captureOf(runner, session)?.question
}

/**
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns The structured question (chips, a sequence) the persona wrote in the latest turn, exactly as written (untrusted).
 */
export function lastRunnerAsk(runner: Runner, session?: string): unknown {
  return captureOf(runner, session)?.ask
}

/**
 * Last worker report, absent on session-only fake runners.
 * @param runner - Session runner returned by resolveHostRunner.
 * @returns The report from the most recent turn, or undefined before a report arrives.
 */
export function lastRunnerReport(runner: Runner, session?: string): NormalizedReport | undefined {
  return captureOf(runner, session)?.report
}

/** @param runner - Session runner with a captured report. @returns Source timestamp of its latest report event. */
export function lastRunnerReportAt(runner: Runner, session?: string): string | undefined {
  return captureOf(runner, session)?.reportAt
}

/**
 * Item 7: the tool the open turn called last, for the host's own status line (never shown as a tool name).
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns The tool and when it started, or undefined before the turn called any.
 */
export function lastRunnerStep(runner: Runner, session?: string): { readonly tool: string; readonly at: string } | undefined {
  return captureOf(runner, session)?.step
}

/**
 * Item 3: the tools the latest turn called, in order.
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns Their names as the stream reported them (empty when the turn called none, or on a runner that does not stream).
 */
export function lastRunnerTools(runner: Runner, session?: string): readonly string[] {
  return captureOf(runner, session)?.tools ?? []
}

/**
 * Colheita §6: the tools of the latest turn with the instant of each call (a conversation turn's step summary).
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns One entry per call, in order; empty when the turn called none.
 */
export function lastRunnerToolSteps(runner: Runner, session?: string): readonly { readonly tool: string; readonly at: string }[] {
  const capture = captureOf(runner, session)
  const tools = capture?.tools ?? []
  const times = capture?.toolTimes ?? []
  return tools.map((tool, index) => ({ tool, at: times[index] ?? '' }))
}

/**
 * Play a tool call to the capture of a runner without any model (tests; live runners reach it through the OAR tap).
 * @param runner - Session runner.
 * @param tool - Tool name as a stream reports it.
 * @param at - ISO time of the call.
 */
export function emitRunnerStep(runner: Runner, tool: string, at: string): void {
  const capture = captures.get(runner) ?? { last: '' }
  capture.step = { tool, at }
  capture.tools = [...(capture.tools ?? []), tool]
  capture.toolTimes = [...(capture.toolTimes ?? []), at]
  captures.set(runner, capture)
  toolSinks.get(runner)?.(tool)
}

/**
 * Tee OAR deltas so the host can persist the real reply.
 * @param turn - Rivet turn runner.
 * @param capture - Accumulator.
 */
export function tapTurn(turn: TurnRunner, capture: TextCapture): TurnRunner {
  // P0-07b: several turns can be open on ONE runner (the answer-only runner of a persona serves /lado, the opinion, the fan-out and the indicator refresh at once), so the state of a turn is kept
  // PER TURN — by the ticket id of its handle, which is the facade's session — and the runner's own capture only MIRRORS the turn that started last (what a reader that names no session reads).
  const turns = new Map<string, TextCapture>()
  capture.turns = turns
  const take = (event: RunEvent, key: string): void => {
    let own = turns.get(key)
    if (event.type === 'started' || own === undefined) {
      own = { last: '' } // a turn starts clean: nothing of an earlier turn (this session's or another's) is in it
      turns.set(key, own)
      if (turns.size > MAX_TURNS_KEPT) {
        const oldest = turns.keys().next()
        if (oldest.done !== true) turns.delete(oldest.value)
      }
    }
    if (event.type === 'started' || capture.turn === undefined) capture.turn = key
    if (isToolCallEvent(event)) {
      // P0-2: a tool closes the piece of text before it (thinking aloud: "Vou verificar…"). What a persona says is the LAST text after the LAST tool:
      // the thread, the bilhete, the review and the opinion never carry the monologue between tools.
      if (own.last.trim() !== '') own.narrated = true
      own.last = ''
      // Item 7: the tool in hand is the "step now" the host says, in plain words, when the owner asks how it is going.
      const tool = toolNameFromEvent(event)
      if (tool !== undefined) {
        own.step = { tool, at: event.at }
        own.tools = [...(own.tools ?? []), tool]
        own.toolTimes = [...(own.toolTimes ?? []), event.at]
        capture.onTool?.(tool)
      }
    }
    if (event.type === 'delta') {
      const first = own.last === ''
      own.last = redactText(own.last + event.text) // Carbon P0-05a: the accumulated text, so a secret split between two deltas is masked too
      if (first && own.last.trim() !== '') {
        own.firstAt = Date.now()
        capture.onFirst?.(own.last)
      }
      capture.onPartial?.(own.last)
    }
    if (event.type === 'partial' && event.text.trim() !== '') {
      own.last = redactText(event.text)
      if (own.firstAt === undefined) {
        own.firstAt = Date.now()
        capture.onFirst?.(own.last)
      }
      capture.onPartial?.(own.last)
    }
    if (event.type === 'ended' || event.type === 'report') {
      // Carbon P0-05a: what the report says is masked like the words (a typed secret never reaches the thread, a card or a screen through the model's mouth).
      own.report = { ...event.report, summary: redactText(event.report.summary), ...(typeof event.report.question === 'string' ? { question: redactText(event.report.question) } : {}) }
      own.reportAt = event.at
      const question = own.report.question
      if (typeof question === 'string' && question !== '') own.question = question
      if (event.report.ask !== undefined) own.ask = event.report.ask
      // The adapter's placeholder ("turn ended") is not words: a turn with nothing to say stays empty (the host then has its own sentence).
      if (event.type === 'ended' && own.last.trim() === '' && event.report.summary !== '' && event.report.summary !== 'turn ended') {
        own.last = own.report.summary
      }
    }
    if (capture.turn === key) mirrorTurn(own, capture)
  }
  return {
    ...turn,
    stream: handle => mapEvents(turn.stream(handle), (event) => { take(event, handle.ticketId) }),
    events: handle => mapEvents(turn.events(handle), (event) => { take(event, handle.ticketId) }),
  }
}

/** P0-07b: the runner's capture shows the state of the turn that started last (the hooks and the turns map are the runner's own and stay). */
function mirrorTurn(from: TextCapture, to: TextCapture): void {
  to.last = from.last
  if (from.narrated === undefined) delete to.narrated
  else to.narrated = from.narrated
  if (from.report === undefined) delete to.report
  else to.report = from.report
  if (from.reportAt === undefined) delete to.reportAt
  else to.reportAt = from.reportAt
  if (from.firstAt === undefined) delete to.firstAt
  else to.firstAt = from.firstAt
  if (from.question === undefined) delete to.question
  else to.question = from.question
  if (from.ask === undefined) delete to.ask
  else to.ask = from.ask
  if (from.step === undefined) delete to.step
  else to.step = from.step
  if (from.tools === undefined) delete to.tools
  else to.tools = from.tools
  if (from.toolTimes === undefined) delete to.toolTimes
  else to.toolTimes = from.toolTimes
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
