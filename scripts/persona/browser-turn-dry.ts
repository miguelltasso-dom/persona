/**
 * Dry proof for item 17 (colheita): the turn of a shared browser profile, with the real Google Chrome.
 *
 * Zero model, zero network: creates a profile, grants it to a persona, the persona takes the turn and opens Chrome,
 * another persona is told who holds it, the person assumes control, and the persona's next command is refused. The
 * Chrome is headless on a throw-away data folder and is killed at the end.
 *
 * Usage: pnpm exec tsx scripts/persona/browser-turn-dry.ts [--json <path>]
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserService } from '../../packages/persona/persona-host/src/browser/service.ts'
import { launchChrome } from '../../packages/persona/persona-host/src/browser/launch.ts'

const jsonAt = process.argv.indexOf('--json')
const outPath = (jsonAt >= 0 ? process.argv[jsonAt + 1] : undefined) ?? join('.maestri', 'tmp', 'browser-turn-dry.json')
const dataRoot = mkdtempSync(join(tmpdir(), 'persona-browser-turn-'))
// The proof stays headless: the product's shared window is headed, and a dry run must not pop one on the person's desktop.
const browser = new BrowserService({
  dataRoot,
  launch: input => launchChrome({ ...input, headless: true }),
})
const BIA = { kind: 'persona', id: 'bia' } as const
const TEO = { kind: 'persona', id: 'teo' } as const
const PERSON = { kind: 'person', id: 'owner' } as const
const steps: Array<Record<string, unknown>> = []
try {
  const profile = browser.create('Loja')
  browser.grant('bia', profile.id)
  browser.grant('teo', profile.id)
  steps.push({ step: 'sem-grant', result: browser.takeTurn(profile.id, { kind: 'persona', id: 'luna' }) })
  const turn = await browser.sessionFor('bia', 'Loja')
  steps.push({ step: 'bia-pega-e-abre', profile: turn.profile.name, port: turn.session.port, version: turn.session.version })
  steps.push({ step: 'teo-espera', result: browser.takeTurn(profile.id, TEO) })
  steps.push({ step: 'pessoa-assume', result: browser.takeTurn(profile.id, PERSON) })
  let refused = ''
  try { await browser.open(profile.id, BIA) } catch (error) { refused = error instanceof Error ? error.message : String(error) }
  steps.push({ step: 'bia-sem-a-vez', refused })
  browser.releaseTurn(profile.id, PERSON)
  steps.push({ step: 'pessoa-devolve', holder: browser.holderOf(profile.id) ?? null })
  const result = { note: 'Chrome real, headless, perfil descartavel; sem modelo e sem rede', steps }
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.closeAll()
  try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch (error) { void error }
}
