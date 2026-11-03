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
} from '@deepseek-ai/dsh-persona-runners'
import type { AutonomyMode } from './types.ts'

/** Spec + host-derived permission for one persona. */
export interface HostRunnerRequest {
  readonly spec: PersonaRunnerSpec
  readonly permissionMode: 'prompt' | 'allow-once' | 'deny'
  readonly autonomy: 'on_request' | 'propose' | 'act'
  readonly home: string
  readonly personId: string
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
 * Isolated runner home for a project (`<PERSONA_HOME>/runners/<projectId>`).
 * @param projectId - Tenant.
 */
export function runnerHomeOf(projectId: string): string {
  const root = process.env.PERSONA_HOME ?? process.env.DSH_HOME ?? process.cwd()
  return join(root, 'runners', projectId)
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

/**
 * Fake unless PERSONA_REAL_CLI=1, then Rivet resolveRunner.
 * @param request - Persona spec; omitted → fake.
 */
export async function resolveHostRunner(request?: HostRunnerRequest): Promise<Runner> {
  if (request === undefined || process.env.PERSONA_REAL_CLI !== '1') return createFakeRunner()
  const turn = await resolveRunner({
    spec: request.spec,
    permissionMode: request.permissionMode,
    autonomy: request.autonomy,
    home: request.home,
    personId: request.personId,
  })
  return createOarSessionRunner({
    turn,
    personaId: request.personId,
    model: request.spec.model,
    permissionMode: request.permissionMode,
  })
}

/** @deprecated Use {@link resolveHostRunner}. Kept as the default factory alias. */
export const createHostRunner: HostRunnerFactory = resolveHostRunner
