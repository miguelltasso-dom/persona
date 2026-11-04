import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './paths.ts'

/** Global caps so forked E2E workers fail loud instead of hanging (Atlas memory policy). */
export const PERSONA_E2E_VITEST_TIMEOUT_ARGS = [
  '--testTimeout',
  '120000',
  '--hookTimeout',
  '180000',
  '--teardownTimeout',
  '120000',
] as const

/**
 * Run a vitest file in a subprocess. Drops `PERSONA_E2E` / `PERSONA_A11Y` by default so layer-1
 * contract gates stay green when the operator shell has gallery env set.
 */
export function runVitestSubprocess(
  spec: string,
  extraArgs: readonly string[] = [],
  options?: { inheritPersonaE2e?: boolean },
): void {
  const env = { ...process.env }
  if (options?.inheritPersonaE2e !== true) {
    delete env.PERSONA_E2E
    delete env.PERSONA_A11Y
  }
  const timeoutArgs = spec.includes('persona-e2e/') ? [...PERSONA_E2E_VITEST_TIMEOUT_ARGS] : []
  execFileSync(
    'pnpm',
    ['exec', 'vitest', 'run', spec, ...timeoutArgs, ...extraArgs],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    },
  )
}
