import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ARTIFACTS_DIR } from '../paths.ts'

export const BASELINE_DIR = join(ARTIFACTS_DIR, 'baselines', 'previews')

/**
 * Resolve baseline PNG path for a preview capture id.
 * @param id - preview stem (e.g. prism-onboarding).
 */
export function baselinePath(id: string): string {
  return join(BASELINE_DIR, `${id}.png`)
}

/**
 * Ensure a baseline exists (copy actual on first run or when UPDATE_BASELINE=1).
 * @param id - preview stem.
 * @param actualPath - freshly captured screenshot.
 */
export function ensureBaseline(id: string, actualPath: string): string {
  mkdirSync(BASELINE_DIR, { recursive: true })
  const target = baselinePath(id)
  if (process.env.UPDATE_BASELINE === '1' || !existsSync(target)) {
    copyFileSync(actualPath, target)
  }
  return target
}
