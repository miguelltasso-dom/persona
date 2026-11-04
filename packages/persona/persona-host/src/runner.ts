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
  type PersonaRunnerSpec,
  type RunEvent,
  type ToolLevel,
  type TurnRunner,
  type UsageMeterSink,
} from '@deepseek-ai/dsh-persona-runners'
import type { AutonomyMode } from './types.ts'

/** Why this runner is opening. Talk has no tools; task runs in a worktree. */
export type RunnerPurpose = 'talk' | 'task'

/** CLI/DSH permission. Never inline a comment inside this union (Typert). */
export type HostPermissionMode = 'prompt' | 'allow-once' | 'deny'

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
  runner: { kind: 'dsh' | 'cli'; model: string; cli?: string },
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
export function specOfPersona(runner: { kind: 'dsh' | 'cli'; model: string; cli?: string }): PersonaRunnerSpec {
  if (runner.kind === 'cli' && runner.cli !== undefined && runner.cli !== '') {
    if (runner.cli === 'claude' || runner.cli === 'codex' || runner.cli === 'opencode' || runner.cli === 'cursor') {
      return { kind: 'cli', cli: runner.cli, model: runner.model }
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
 * @param request - Persona spec; omitted → fake.
 * @param runners - Plugin inject (`ctx.personaRunners`). Falls back to the import.
 */
export async function resolveHostRunner(
  request?: HostRunnerRequest,
  runners?: PersonaRunnersSlice,
): Promise<Runner> {
  if (request === undefined || allowsScriptedReplies()) {
    return runners?.createFakeRunner() ?? createFakeRunner()
  }
  assertCliPermission(request.spec, request.permissionMode)
  const resolve = runners?.resolveRunner ?? resolveRunner
  const capture: TextCapture = {
    last: '',
    ...(request.onFirstToken === undefined ? {} : { onFirst: request.onFirstToken }),
  }
  const home = request.home === undefined || request.home === '' ? undefined : request.home
  const tools = request.tools
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
  }), capture)
  const session = createOarSessionRunner({
    turn,
    personaId: request.personId,
    model: request.spec.model,
    permissionMode: request.permissionMode,
    ...(request.purpose === undefined ? {} : { purpose: request.purpose }),
    ...(request.personaName === undefined ? {} : { personaName: request.personaName }),
    ...(request.personaTitle === undefined ? {} : { personaTitle: request.personaTitle }),
  })
  captures.set(session, capture)
  return session
}

/** Last streamed model text for a live runner (empty on fake/scripted). */
export interface TextCapture {
  last: string
  firstAt?: number
  onFirst?: (text: string) => void
  question?: string
}

const captures = new WeakMap<Runner, TextCapture>()

/**
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns Trimmed model text, or empty when the runner did not stream.
 */
export function lastRunnerText(runner: Runner): string {
  return captures.get(runner)?.last.trim() ?? ''
}

/**
 * @param runner - Session runner from {@link resolveHostRunner}.
 * @returns `ended.report.question` when the CLI asked a person.
 */
export function lastRunnerQuestion(runner: Runner): string | undefined {
  return captures.get(runner)?.question
}

/**
 * Tee OAR deltas so the host can persist the real reply.
 * @param turn - Rivet turn runner.
 * @param capture - Accumulator.
 */
export function tapTurn(turn: TurnRunner, capture: TextCapture): TurnRunner {
  const take = (event: RunEvent): void => {
    if (event.type === 'delta') {
      const first = capture.last === ''
      capture.last += event.text
      if (first && capture.last.trim() !== '') {
        capture.firstAt = Date.now()
        capture.onFirst?.(capture.last)
      }
    }
    if (event.type === 'partial' && event.text.trim() !== '') {
      capture.last = event.text
      if (capture.firstAt === undefined) {
        capture.firstAt = Date.now()
        capture.onFirst?.(event.text)
      }
    }
    if (event.type === 'ended' || event.type === 'report') {
      const question = event.report.question
      if (typeof question === 'string' && question !== '') capture.question = question
      if (event.type === 'ended' && capture.last.trim() === '' && event.report.summary !== '') {
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
