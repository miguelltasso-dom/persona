#!/usr/bin/env node
/** Patch an existing win-unpacked app.asar so Host inline boot scripts can run. */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const asarPath = process.argv[2]
if (!asarPath) {
  process.stderr.write('Usage: patch-unpacked-csp.mjs <app.asar>\n')
  process.exit(2)
}

const desktopPackage = fileURLToPath(new URL('../../apps/desktop/package.json', import.meta.url))
const require = createRequire(desktopPackage)
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
const { extractAll, createPackage } = builderRequire('@electron/asar')

const extractDir = mkdtempSync(join(tmpdir(), 'persona-asar-csp-'))
try {
  extractAll(asarPath, extractDir)
} catch (error) {
  process.stderr.write(`asar extract failed: ${error instanceof Error ? error.message : String(error)}\n`)
  rmSync(extractDir, { recursive: true, force: true })
  process.exit(1)
}

const HASH = 'sha256-ikYDEfGOZZNuGAdbu2YAz9STcFnRaWk0u5Dc0unuOyI='
const candidates = [
  join(extractDir, 'lib', 'main.js'),
  join(extractDir, 'dist', 'main.js'),
  join(extractDir, 'main.js'),
]
const files = candidates.filter((path) => existsSync(path))
if (files.length === 0) {
  process.stderr.write('patch-unpacked-csp: no main bundle in asar\n')
  rmSync(extractDir, { recursive: true, force: true })
  process.exit(1)
}

let patched = 0
for (const file of files) {
  const before = readFileSync(file, 'utf8')
  if (!before.includes(HASH)) continue
  let next = before
  next = next.replace(
    /script-src 'self' dsh-app:/g,
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: dsh-app: http://127.0.0.1:*",
  )
  next = next.replace(
    /connect-src 'self' dsh-app:/g,
    "connect-src 'self' dsh-app: http://127.0.0.1:* ws://127.0.0.1:*",
  )
  if (next === before) {
    process.stderr.write(`patch-unpacked-csp: hash found in ${file} but no CSP source matched\n`)
    continue
  }
  writeFileSync(file, next)
  patched += 1
  process.stdout.write(`patched ${file}\n`)
}

if (patched === 0) {
  rmSync(extractDir, { recursive: true, force: true })
  process.stderr.write('patch-unpacked-csp: nothing patched\n')
  process.exit(1)
}

const backup = `${asarPath}.pre-csp`
if (!existsSync(backup)) copyFileSync(asarPath, backup)
await createPackage(extractDir, asarPath)
rmSync(extractDir, { recursive: true, force: true })
process.stdout.write(`repacked ${asarPath}\n`)
