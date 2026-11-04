/**
 * Desktop cold-start costs. Updates / Welcome / mandatory policy are off
 * in production; keep them off the first-paint path.
 */

export const COLD_START_BEFORE_MS = {
  electronUpdater: 180,
  updateStack: 90,
  welcomeMandatory: 70,
} as const

export const COLD_START_AFTER_MS = {
  electronUpdater: 0,
  updateStack: 0,
  welcomeMandatory: 0,
} as const

/**
 * True when the updater stack must stay unloaded (Persona default).
 */
export function skipUpdaterAtBoot(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DSH_DESKTOP_UPDATES !== '1'
}

/**
 * True when DeepSeek Welcome must stay unloaded (Persona default).
 */
export function skipWelcomeAtBoot(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DSH_DESKTOP_WELCOME !== '1'
}

/**
 * Marks for a boot profile. Callers record `Date.now()` themselves.
 * @param marks - Named timestamps.
 */
export function coldStartDelta(marks: { start: number; ready: number }): number {
  return Math.max(0, marks.ready - marks.start)
}
