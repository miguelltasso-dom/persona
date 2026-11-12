/**
 * Dry proof for item 17 (colheita): the product drives the Google Chrome the person already has, on its own profile.
 *
 * Zero model, zero network: finds Chrome at the standard Windows paths, launches it headless on a throw-away profile
 * folder with the product's flags, waits for the DevTools endpoint and prints the version it reports. Nothing is
 * installed, nothing is downloaded, and the person's own Chrome profile is never opened.
 *
 * Usage: pnpm exec tsx scripts/persona/chrome-dry.ts [--json <path>]
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome } from '../../packages/persona/persona-host/src/browser/chrome.ts'
import { launchChrome } from '../../packages/persona/persona-host/src/browser/launch.ts'

const jsonAt = process.argv.indexOf('--json')
const outPath = (jsonAt >= 0 ? process.argv[jsonAt + 1] : undefined) ?? join('.maestri', 'tmp', 'chrome-dry.json')
const chrome = findChrome()
if (chrome === undefined) {
  const missing = { chrome: 'missing', note: 'sem Google Chrome nas pastas padrao; o produto nao baixa navegador' }
  console.log(JSON.stringify(missing, null, 2))
  process.exit(0)
}
const profileDir = mkdtempSync(join(tmpdir(), 'persona-chrome-dry-'))
const started = Date.now()
let session
try {
  session = await launchChrome({ chrome, profileDir, headless: true })
  const result = {
    note: 'Chrome do proprio Windows, perfil descartavel, sem modelo e sem rede',
    chrome: chrome.path,
    onDisk: chrome.version ?? null,
    devtools: session.version ?? null,
    port: session.port,
    ms: Date.now() - started,
    profileDir,
  }
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
} finally {
  await session?.close()
  try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch (error) { void error }
}
