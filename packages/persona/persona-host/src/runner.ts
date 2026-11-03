/**
 * Resolve the session Runner for one persona. Fake/scripted unless PERSONA_REAL_CLI=1.
 * Live resolve goes through Rivet (`resolveRunner` / `ctx.personaRunners.resolveRunner`).
 */

import { join } from 'node:path'
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import {
  createFakeRunner,
  createOarSessionRunner,
  resolveRunner,
  type PersonaRunnerSpec,
  type RunEvent,
  type TurnRunner,
  type UsageMeterSink,
} from '@deepseek-ai/dsh-persona-runners'
import type { AutonomyMode } from './types.ts'

/** Spec + host-derived permission for one persona. */
export interface HostRunnerRequest {
  readonly spec: PersonaRunnerSpec
  readonly permissionMode: 'prompt' | 'allow-once' | 'deny'
  readonly autonomy: 'on_request' | 'propose' | 'act'
  /** Isolated CLI home. Empty/omitted = process home (native `~/.claude`). */
  readonly home?: string
  readonly personId: string
  readonly usage?: UsageMeterSink
}

/** Factory the orchestration uses per persona (optional request = default fake). */
export type HostRunnerFactory = (request?: HostRunnerRequest) => Promise<Runner>

/**
 * Permission mode from autonomy (explicit — never implicit default inside resolve).
 * @param mode - Host autonomy.
 */
export function permissionModeOf(mode: AutonomyMode): HostRunnerRequest['permissionMode'] {
  return mode === 'act' ? 'allow-once' : 'prompt'
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
 * Fake unless PERSONA_REAL_CLI=1, then Rivet resolveRunner.
 * @param request - Persona spec; omitted → fake.
 * @param runners - Plugin inject (`ctx.personaRunners`). Falls back to the import.
 */
export async function resolveHostRunner(
  request?: HostRunnerRequest,
  runners?: PersonaRunnersSlice,
): Promise<Runner> {
  if (request === undefined || process.env.PERSONA_REAL_CLI !== '1') {
    return runners?.createFakeRunner() ?? createFakeRunner()
  }
  const resolve = runners?.resolveRunner ?? resolveRunner
  const capture: TextCapture = { last: '' }
  const home = request.home === undefined || request.home === '' ? undefined : request.home
  const turn = tapTurn(await resolve({
    spec: request.spec,
    permissionMode: request.permissionMode,
    autonomy: request.autonomy,
    personId: request.personId,
    ...(home === undefined ? {} : { home }),
    ...(request.usage === undefined ? {} : { usage: request.usage }),
  }), capture)
  const session = createOarSessionRunner({
    turn,
    personaId: request.personId,
    model: request.spec.model,
    permissionMode: request.permissionMode,
  })
  captures.set(session, capture)
  return session
}

/** Last streamed model text for a live runner (empty on fake/scripted). */
export interface TextCapture {
  last: string
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
 * Tee OAR deltas so the host can persist the real reply.
 * @param turn - Rivet turn runner.
 * @param capture - Accumulator.
 */
export function tapTurn(turn: TurnRunner, capture: TextCapture): TurnRunner {
  const take = (event: RunEvent): void => {
    if (event.type === 'delta') capture.last += event.text
    if (event.type === 'ended' && capture.last.trim() === '' && event.report.summary !== '') {
      capture.last = event.report.summary
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
