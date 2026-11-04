import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './paths.ts'

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
  execFileSync(
    'pnpm',
    ['exec', 'vitest', 'run', spec, ...extraArgs],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    },
  )
}
