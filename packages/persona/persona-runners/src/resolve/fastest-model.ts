/** Cheap triage models when the persona does not pin one. */

import type { CliKind } from '../contract.ts'

/** Fastest generally-available id per CLI (Anvil uses this for talk/triage). */
export const TRIAGE_MODELS: Readonly<Record<CliKind | 'dsh', string>> = {
  claude: 'haiku',
  codex: 'default',
  opencode: 'opencode/beam-free',
  cursor: 'default',
  dsh: 'deepseek-chat',
}

/**
 * True when the spec left the model to the host (`''` / `default` / `auto`).
 * @param model - Persona runner model.
 */
export function modelIsUnpinned(model: string | undefined): boolean {
  return model === undefined || model === '' || model === 'default' || model === 'auto'
}

/**
 * Pin the cheapest CLI model for triage; keep an explicit persona choice.
 * Codex `default` stays `default` (OAR omits the field).
 * @param spec - Runner spec.
 */
export function pickFastestModel(spec: { kind: 'dsh' | 'cli'; cli?: CliKind; model: string }): string {
  if (!modelIsUnpinned(spec.model)) return spec.model
  if (spec.kind === 'cli' && spec.cli !== undefined) return TRIAGE_MODELS[spec.cli]
  return TRIAGE_MODELS.dsh
}
