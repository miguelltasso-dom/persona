import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root (`C:/Users/migue/dev/persona`). */
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/** This package root. */
export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Screenshot and debug output (gitignored). */
export const ARTIFACTS_DIR = join(PACKAGE_ROOT, 'artifacts')

/** Persona E2E temp homes under `.maestri/tmp`. */
export const E2E_TMP_ROOT = join(REPO_ROOT, '.maestri', 'tmp')

/** Built web UI entry; required for Tier 1. */
export const WEB_DIST_INDEX = join(REPO_ROOT, 'apps', 'web', 'dist', 'index.html')

/**
 * Fail loud when `apps/web/dist` is missing.
 */
export function requireWebDist(): void {
  if (!existsSync(WEB_DIST_INDEX)) {
    throw new Error(
      'web app dist not built — run `pnpm run build:artifacts` from the repository root (under the build lock)',
    )
  }
}
