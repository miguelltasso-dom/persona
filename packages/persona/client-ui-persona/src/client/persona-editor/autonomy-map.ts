/** Maps editor autonomy tiers to host {@link AutonomyMode} (PRO-4 data seam). */

import type { AutonomyLevel } from './persona-draft.ts'

export type HostAutonomyMode = 'asked' | 'propose' | 'act'

const UI_TO_HOST: Readonly<Record<AutonomyLevel, HostAutonomyMode>> = {
  'on-request': 'asked',
  propose: 'propose',
  'act-within-limits': 'act',
}

const HOST_TO_UI: Readonly<Record<HostAutonomyMode, AutonomyLevel>> = {
  asked: 'on-request',
  propose: 'propose',
  act: 'act-within-limits',
}

/** Editor tier → host RPC mode. */
export function autonomyLevelToHostMode(level: AutonomyLevel): HostAutonomyMode {
  return UI_TO_HOST[level]
}

/** Host RPC mode → editor tier. */
export function hostModeToAutonomyLevel(mode: HostAutonomyMode): AutonomyLevel {
  return HOST_TO_UI[mode]
}

/** Merge a new editor tier into an existing host autonomy row for `setAutonomy`. */
export function patchAutonomyMode<T extends { mode: HostAutonomyMode }>(
  current: T,
  level: AutonomyLevel,
): T {
  return { ...current, mode: autonomyLevelToHostMode(level) }
}
