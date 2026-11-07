/**
 * DET-1 (P0 of v1.1; found by Probe on the INSTALLED H2 #3, 04/11 20:50; owners Rivet + Forge/Anvil) — a first delivery asked BEFORE engine
 * detection has settled must NOT be celebrated with ZERO model turns. Measured on `4b2c752b47` (loaded machine): the Claude card says
 * "Pronta para usar" only after ~3 min; the request made earlier showed "Equipe trabalhando" and then "Sua equipe entregou o primeiro
 * trabalho!" in < 1 s, with 0 stub invocations and an empty `turn_ledger`: a delivery nobody produced.
 *
 * Required behaviour (asserted here): either the request waits for / reports the engine ("Falta uma IA…", "Conectando…"), or, if it celebrates,
 * a real runner turn happened (stub turns ≥ 1). Today it FAILS (`it.fails`, EXPECTED failure, not a regression); this flips red when DET-1 is fixed.
 * The REAL D-069 run only starts with the engine ready, so it is not exposed to this.
 *
 * Opt-in: `PERSONA_E2E=1` + `PERSONA_INSTALLED_EXE=<Persona.exe>`; one app boot (~1–2 min); run under the build lock.
 * Evidence: `artifacts/first-delivery/installed-det1/` (`proof.json`).
 */
import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exeIdentity } from '../src/exe-identity.ts'
import { withFakeCliOnPath, type FakeCliPathScope } from '../src/fake-cli.ts'
import { createFirstDeliveryRecorder, expectBootOverlayGone, firstDeliveryCopy, walkOnboardingToStep5 } from '../src/first-delivery-flow.ts'
import { startInstalledDesktop } from '../src/installed-desktop.ts'
import { onboarding } from '../src/real-app-locale.pt.ts'

const exe = process.env.PERSONA_INSTALLED_EXE
const run = process.env.PERSONA_E2E === '1' && exe !== undefined && exe !== '' && existsSync(exe)
const FAKE_TURN_MS = 3_000

describe.skipIf(!run)('DET-1 — entrega pedida antes da detecção dos motores (exe instalado, fake CLI)', () => {
  it.fails('[DET-1 → Rivet/Forge/Anvil] pedir a 1ª entrega antes da detecção NÃO comemora com 0 turnos (ou espera/avisa o motor)', async (context) => {
    const identity = await exeIdentity(exe!)
    const scope: FakeCliPathScope = withFakeCliOnPath({ turnMs: FAKE_TURN_MS, reply: 'Entrega do Probe (DET-1).' })
    // Do not wait for detection: the point is to ask while it is still "Verificando…".
    const previousSettle = process.env.PERSONA_E2E_DETECT_SETTLE_MS
    process.env.PERSONA_E2E_DETECT_SETTLE_MS = '1500'
    const desktop = await startInstalledDesktop({ exe: exe! })
    const { page } = desktop
    const rec = await createFirstDeliveryRecorder(page, 'installed-det1')
    let outcome: Record<string, unknown> = { stage: 'started' }
    try {
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await expectBootOverlayGone(page, rec)
      await walkOnboardingToStep5(page, 'Probe DET1', rec.shot, rec.notes)
      const ask = page.getByRole('button', { name: onboarding.requestNow, exact: true })
      if (!(await ask.isVisible().catch(() => false))) {
        // The app already said "Falta uma IA…" / is gating the request: that is the required behaviour.
        outcome = { stage: 'passed', note: 'the request is gated before the engine is ready' }
        return
      }
      const cardsNow = (await page.locator('body').innerText()).replace(/\s+/gu, ' ')
      const settledAlready = /Claude \| Pronta para usar|Claude Pronta para usar/u.test(cardsNow) || rec.notes.some(note => /Claude \| Pronta para usar/u.test(note))
      if (settledAlready) {
        outcome = { stage: 'skipped', note: 'detection had already settled when the request was made (fast machine): nothing to assert' }
        context.skip('detection settled before the request; DET-1 needs the slow window')
      }
      await ask.click()
      const askedAt = Date.now()
      rec.mark('asked before detection settled')
      const celebrate = page.getByText(firstDeliveryCopy.celebrateTitle)
      const gated = page.getByRole('heading', { name: firstDeliveryCopy.needsEngineTitle })
      await celebrate.or(gated).first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
      const celebrated = await celebrate.isVisible().catch(() => false)
      const turns = scope.invocations().filter(call => call.event === 'turn').length
      outcome = { stage: celebrated ? 'celebrated' : 'not-celebrated', celebrated, fakeCliTurns: turns, askToCelebrateMs: celebrated ? Date.now() - askedAt : null }
      await rec.shot('det1-after-ask')
      expect(!celebrated || turns >= 1, `DET-1: "Sua equipe entregou o primeiro trabalho!" with ${String(turns)} model turns (a delivery nobody produced)`).toBe(true)
    } finally {
      if (previousSettle === undefined) delete process.env.PERSONA_E2E_DETECT_SETTLE_MS
      else process.env.PERSONA_E2E_DETECT_SETTLE_MS = previousSettle
      const calls = scope.invocations()
      await writeFile(join(rec.dir, 'electron.log'), desktop.log().slice(-40_000)).catch(() => {})
      await desktop.stop()
      await rec.write({
        exe, exeIdentity: identity, outcome, expectedFailure: 'DET-1 (P0 v1.1): expected to fail until fixed',
        fakeCliInvocations: calls.length, fakeCliTurns: calls.filter(call => call.event === 'turn').length,
      })
      await rm(dirname(desktop.home), { recursive: true, force: true }).catch(() => {})
      scope.restore()
    }
  }, 900_000)
})
