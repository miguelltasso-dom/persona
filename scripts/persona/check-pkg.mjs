#!/usr/bin/env node
// Typecheck one packages/persona/<pkg> including its tests (the per-package tsconfig only covers src; the repo-wide
// aggregate that covers tests takes minutes and is what blocks the push).
// Usage: node scripts/persona/check-pkg.mjs persona-host [more packages...]
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const names = process.argv.slice(2)
if (names.length === 0) { console.error('usage: node scripts/persona/check-pkg.mjs <package-dir-name> [...]'); process.exit(2) }

let failed = false
for (const name of names) {
  const dir = `packages/persona/${name}`
  if (!existsSync(join(root, dir))) { console.error(`unknown package ${name}`); process.exit(2) }
  const client = name.startsWith('client-ui-')
  const tmpDir = join(root, '.maestri', 'tmp', 'check-pkg')
  mkdirSync(tmpDir, { recursive: true })
  const config = join(tmpDir, `${name}.json`)
  // Client tests (*.client.spec.*) belong to the client program, everything else to the host program, as in the repo aggregates.
  const include = client
    ? [`../../../${dir}/src`, `../../../${dir}/tests`]
    : [`../../../${dir}/src`, `../../../${dir}/tests`, `../../../${dir}/scripts`].filter((entry) => existsSync(join(tmpDir, entry)))
  writeFileSync(config, JSON.stringify({
    extends: client ? '../../../tsconfig.base.client.json' : '../../../tsconfig.base.json',
    compilerOptions: { noEmit: true, composite: false, incremental: false, declaration: false, declarationMap: false, sourceMap: false, rewriteRelativeImportExtensions: false, ...(client ? { types: ['node', 'client-build-environment', 'client-assets'] } : {}) },
    include,
    exclude: client ? [] : [`../../../${dir}/tests/**/*.client.spec.ts`, `../../../${dir}/tests/**/*.client.spec.tsx`],
  }, null, 2))
  const started = Date.now()
  const result = spawnSync('pnpm', ['exec', 'tsc', '-p', config], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' })
  // Upstream sources pulled in through path aliases are compiled with their own project settings elsewhere; keep only this package.
  const output = `${result.stdout}${result.stderr}`.split('\n').filter((line) => /error TS/.test(line) && line.startsWith(`${dir}/`))
  console.log(`${name}: ${output.length === 0 ? 'OK' : `FAILED (${output.length} errors)`} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  for (const line of output.slice(0, 15)) console.log(`  ${line.slice(0, 300)}`)
  if (output.length > 0) failed = true
}
process.exit(failed ? 1 : 0)
