/**
 * Atlas: live-store bootstrap gate (pageerror, seeded team, no stuck Carregando… on main panels).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertBootstrapGateClean,
  BOOT_GATE_MAIN_PANELS,
  BOOT_GATE_PRISM_PANELS,
  formatBootstrapGateFailures,
  runBootstrapGateChecks,
} from '../src/boot-gate-bootstrap.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run)('mandatory boot — live store bootstrap', () => {
  let session: RealPersonaSession
  beforeAll(async () => {
    session = await openRealPersonaApp({
      dismissOnboardingViaStorage: true,
      devSeed: true,
      viewport: { width: 1440, height: 900 },
    })
    await session.page.waitForTimeout(3_000)
  }, 360_000)

  afterAll(async () => {
    await session?.close()
  }, 60_000)

  it('bootstrap healthy (Prism surfaces): Atlas visible, visão geral + #geral not loading', async () => {
    const pageErrors = [
      ...session.tripwire.pageErrors.map(e => `pageerror ${e.slice(0, 400)}`),
      ...session.tripwire.consoleErrors.map(e => `console.error ${e.slice(0, 400)}`),
    ]
    const result = await runBootstrapGateChecks(session.page, pageErrors, BOOT_GATE_PRISM_PANELS)
    const failures = formatBootstrapGateFailures(result)
    if (failures.length > 0) expect.fail(failures.join('\n\n'))
    assertBootstrapGateClean(result)
  }, 240_000)

  it('bootstrap healthy (all main panels): no page errors, Atlas visible, panels leave loading', async () => {
    const pageErrors = [
      ...session.tripwire.pageErrors.map(e => `pageerror ${e.slice(0, 400)}`),
      ...session.tripwire.consoleErrors.map(e => `console.error ${e.slice(0, 400)}`),
    ]
    const result = await runBootstrapGateChecks(session.page, pageErrors, BOOT_GATE_MAIN_PANELS)
    const failures = formatBootstrapGateFailures(result)
    if (failures.length > 0) {
      expect.fail(failures.join('\n\n'))
    }
    assertBootstrapGateClean(result)
  }, 600_000)
})
