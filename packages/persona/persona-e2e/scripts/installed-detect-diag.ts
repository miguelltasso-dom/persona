/**
 * Diagnostic for the INSTALLED exe: how long does engine detection (onboarding step 3 "Ferramentas") take with the fake CLI on PATH,
 * and does the stub get called at all? Spends nothing (fake CLI).
 *
 *   $env:PERSONA_INSTALLED_EXE='C:\p8i\Persona.exe'; node --import tsx/esm packages/persona/persona-e2e/scripts/installed-detect-diag.ts [noengine]
 */
import { withFakeCliOnPath, withNoEngineOnPath } from '../src/fake-cli.ts'
import { createFirstDeliveryRecorder, expectBootOverlayGone, walkOnboardingToStep5 } from '../src/first-delivery-flow.ts'
import { startInstalledDesktop } from '../src/installed-desktop.ts'

const exe = process.env.PERSONA_INSTALLED_EXE ?? 'C:\p8i\Persona.exe'
const noEngine = process.argv.includes('noengine')
process.env.PERSONA_E2E_DETECT_SETTLE_MS ??= '180000'
const scope = noEngine ? withNoEngineOnPath() : withFakeCliOnPath({ turnMs: 1500, reply: 'diag' })
const desktop = await startInstalledDesktop({ exe })
const startedAt = Date.now()
try {
  const rec = await createFirstDeliveryRecorder(desktop.page, noEngine ? 'diag-noengine' : 'diag-fake')
  await desktop.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
  await expectBootOverlayGone(desktop.page, rec)
  await walkOnboardingToStep5(desktop.page, 'Probe Diag', rec.shot, rec.notes)
  console.log(`walk done in ${String(Math.round((Date.now() - startedAt) / 1000))} s`)
  for (const note of rec.notes) console.log(note)
  const body = (await desktop.page.locator('body').innerText()).replace(/\s+/gu, ' ')
  console.log('needs-engine heading:', /Falta uma IA/u.test(body), '| "Pedir agora":', /Pedir agora/u.test(body))
  if (!('invocations' in scope)) throw new Error('no scope')
  const calls = scope.invocations()
  console.log(`stub invocations: ${String(calls.length)}`, calls.slice(0, 8).map(call => `${call.tool} ${call.argv.slice(0, 3).join(' ')} [${call.event}]`))
} finally {
  await desktop.stop()
  scope.restore()
}
