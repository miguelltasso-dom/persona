#!/usr/bin/env node
/** Run one persona-e2e spec with PERSONA_E2E=1 (for with-lock.mjs on Windows).
 *  Outer with-lock sets PERSONA_LOCK → web-host skips nested lock (no deadlock). */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const spec = process.argv[2]
if (!spec) {
  process.stderr.write('Usage: run-persona-e2e-vitest.mjs <vitest-spec-path>\n')
  process.exit(2)
}
process.env.PERSONA_E2E = '1'
const args = [
  'exec',
  'vitest',
  'run',
  spec,
  '--testTimeout',
  '360000',
  '--hookTimeout',
  '360000',
  '--teardownTimeout',
  '120000',
  ...process.argv.slice(3),
]
const run = spawnSync('pnpm', args, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})
process.exit(run.status ?? 1)
