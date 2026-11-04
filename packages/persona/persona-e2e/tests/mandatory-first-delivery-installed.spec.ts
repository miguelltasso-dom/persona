/**
 * V1-P0-6 — the INSTALLED Persona.exe runs the same first-delivery flow as the web profile, on a clean profile,
 * with the fake CLI (no model call). Opt-in: `PERSONA_E2E=1` + `PERSONA_INSTALLED_EXE=<path to Persona.exe>`.
 *
 *   $env:PERSONA_E2E='1'; $env:PERSONA_INSTALLED_EXE='C:\p8i\Persona.exe'
 *   node scripts/persona/with-lock.mjs "Probe installed first delivery" -- pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-first-delivery-installed.spec.ts
 *
 * Evidence: `artifacts/first-delivery/installed-happy|installed-no-engine/` (`proof.json` + screenshots).
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { watchConsole } from '../src/console-tripwire.ts'
import { withFakeCliOnPath, withNoEngineOnPath, type FakeCliPathScope } from '../src/fake-cli.ts'
import {
  FIRST_DELIVERY_PAID_TURNS_CEILING,
  FIRST_DELIVERY_PAID_TURNS_TARGET,
  createFirstDeliveryRecorder,
  runHappyFirstDelivery,
  runNoEngineFirstDelivery,
  walkOnboardingToStep5,
} from '../src/first-delivery-flow.ts'
import { startInstalledDesktop } from '../src/installed-desktop.ts'
import { assertConsoleClean, assertNotHarnessShell } from '../src/real-app-session.ts'

const exe = process.env.PERSONA_INSTALLED_EXE
const run = process.env.PERSONA_E2E === '1' && exe !== undefined && exe !== '' && existsSync(exe)
const UX_PHASE_A_MS = 120_000
const FAKE_TURN_MS = 2_500
const REPLY = [
  'Entrega do Probe (instalado): resumo da Agência Ponto em 5 pontos.',
  '1. Estúdio de sites e campanhas para PMEs.',
  '2. Cliente atual: Padaria Lua.',
  '3. Objetivo: divulgar o cardápio.',
  '4. Prazo ainda não informado.',
  '5. Tarefa da semana: revisar o texto do cardápio (dona: Coordenação; pronto quando revisado).',
].join('\n')

describe.skipIf(!run)('first delivery — installed Persona.exe with fake CLI (V1-P0-6)', () => {
  it('happy path on a clean profile: onboarding → ask → delivery → accept → #geral has the reply', async () => {
    const scope: FakeCliPathScope = withFakeCliOnPath({ turnMs: FAKE_TURN_MS, reply: REPLY })
    const desktop = await startInstalledDesktop({ exe: exe! })
    try {
      const { page } = desktop
      const tripwire = watchConsole(page)
      const rec = await createFirstDeliveryRecorder(page, 'installed-happy')
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await assertNotHarnessShell(page)
      rec.mark('shell visible')
      await walkOnboardingToStep5(page, 'Probe Instalado', rec.shot, rec.notes)
      rec.mark('step5 visible')
      const result = await runHappyFirstDelivery(page, rec, { fakeTurnMs: FAKE_TURN_MS, deadlineMs: UX_PHASE_A_MS })
      await page.getByText('Entrega do Probe (instalado): resumo da Agência Ponto em 5 pontos.').first()
        .waitFor({ state: 'visible', timeout: 60_000 })
      await rec.shot('08-geral-delivery')
      rec.mark('delivery in #geral')
      const calls = scope.invocations()
      const turns = calls.filter(call => call.event === 'turn').length
      await rec.write({
        exe, home: desktop.home, ...result,
        fakeCliInvocations: calls.length, fakeCliTurns: turns,
        fakeCliTools: [...new Set(calls.map(call => call.tool + ' ' + call.argv.slice(0, 2).join(' ')))],
        consoleErrors: tripwire.consoleErrors, pageErrors: tripwire.pageErrors,
      })
      expect(turns, 'the delivery must come from a real CLI turn, not a scripted reply').toBeGreaterThanOrEqual(1)
      expect(turns, 'safety ceiling').toBeLessThanOrEqual(FIRST_DELIVERY_PAID_TURNS_CEILING)
      expect(turns, 'V1-P0 target: the first delivery is ONE paid turn').toBeLessThanOrEqual(FIRST_DELIVERY_PAID_TURNS_TARGET)
      expect(result.askToCelebrateMs).toBeLessThan(UX_PHASE_A_MS)
      assertConsoleClean(tripwire)
    } finally {
      await desktop.stop()
      scope.restore()
    }
  }, UX_PHASE_A_MS + 420_000)

  it('no engine on a clean profile: step 5 says "Falta uma IA…" and lets the person enter', async () => {
    const scope: FakeCliPathScope = withNoEngineOnPath()
    const desktop = await startInstalledDesktop({ exe: exe! })
    try {
      const { page } = desktop
      const tripwire = watchConsole(page)
      const rec = await createFirstDeliveryRecorder(page, 'installed-no-engine')
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await walkOnboardingToStep5(page, 'Probe Sem IA', rec.shot, rec.notes)
      await runNoEngineFirstDelivery(page, rec)
      await rec.write({ exe, home: desktop.home, consoleErrors: tripwire.consoleErrors, pageErrors: tripwire.pageErrors })
      expect(tripwire.pageErrors).toEqual([])
    } finally {
      await desktop.stop()
      scope.restore()
    }
  }, 420_000)
})
