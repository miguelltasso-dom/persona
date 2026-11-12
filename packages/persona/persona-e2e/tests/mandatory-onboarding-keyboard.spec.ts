/**
 * S7 — keyboard-only path through onboarding steps 1–5 without focus-trap violations (was `it.todo` in
 * `mandatory-onboarding-from-zero.spec.ts`). Real `persona` profile, clean home, fake CLI on PATH.
 *
 * WCAG 2.1.1 / 2.1.2 / 2.4.3: every step is reachable and completable with Tab/Shift+Tab/Enter/Space only; focus never
 * escapes the modal (`role=dialog`) and never falls to `<body>` after a step change; the last step enters the app.
 * Opt-in `PERSONA_E2E=1` (one host boot, ~90 s). Evidence: `artifacts/first-delivery/keyboard/proof.json` + screenshots.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { createFirstDeliveryRecorder, firstDeliveryCopy, type FirstDeliveryRecorder } from '../src/first-delivery-flow.ts'
import { onboarding } from '../src/real-app-locale.pt.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

interface FocusInfo {
  readonly tag: string
  readonly name: string
  readonly inDialog: boolean
  readonly isBody: boolean
}

async function focusInfo(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    const active = document.activeElement
    const name = active === null ? '' : (active.getAttribute('aria-label') ?? active.getAttribute('placeholder') ?? active.textContent ?? '').trim().slice(0, 80)
    return {
      tag: active?.tagName ?? 'NONE',
      name,
      inDialog: active?.closest('[role="dialog"]') != null,
      isBody: active === document.body || active === null,
    }
  })
}

describe.skipIf(!runPersonaE2e)('onboarding — keyboard only (S7)', () => {
  let session: RealPersonaSession
  let rec: FirstDeliveryRecorder
  const stops: FocusInfo[] = []

  beforeAll(async () => {
    session = await openRealPersonaApp({ engine: { kind: 'fake' }, keepOnboarding: true, viewport: { width: 1280, height: 720 } })
    rec = await createFirstDeliveryRecorder(session.page, 'keyboard')
  }, 360_000)

  afterAll(async () => {
    await rec?.write({ stage: 'afterAll', focusStops: stops.length, escapedDialog: stops.filter(stop => !stop.inDialog).length }).catch(() => {})
    await session?.close()
  }, 60_000)

  /** Tab (never click) until `match` holds; every stop is recorded for the containment assertion. */
  async function tabTo(match: (info: FocusInfo) => boolean, what: string, max = 40): Promise<FocusInfo> {
    const { page } = session
    for (let index = 0; index < max; index += 1) {
      const info = await focusInfo(page)
      stops.push(info)
      if (match(info)) return info
      await page.keyboard.press('Tab')
    }
    throw new Error(`keyboard: could not reach ${what} with ${String(max)} Tab presses (last stop: ${JSON.stringify(stops.at(-1))})`)
  }

  it('walks steps 1–5 and enters the app with the keyboard only, focus contained and never lost', async () => {
    const { page } = session
    await page.getByPlaceholder(onboarding.step1Placeholder).waitFor({ state: 'visible', timeout: 60_000 })
    await rec.shot('01-step1')

    // Step 1 — name.
    await tabTo(info => info.tag === 'INPUT', 'the name field')
    await page.keyboard.type('Probe Teclado')
    await tabTo(info => info.name === onboarding.continue, '"Continuar" (step 1)')
    await page.keyboard.press('Enter')

    // Step 2 — company text.
    await page.getByLabel('Sobre a empresa').getByText(onboarding.step2VaultBadge, { exact: true }).waitFor({ state: 'visible' })
    const after1 = await focusInfo(page)
    stops.push(after1)
    rec.notes.push(`focus after step 1→2: ${JSON.stringify(after1)}`)
    await tabTo(info => info.tag === 'TEXTAREA', 'the company field')
    await page.keyboard.type('Agência Ponto — estúdio de sites para PMEs.')
    await tabTo(info => info.name === onboarding.continue, '"Continuar" (step 2)')
    await page.keyboard.press('Enter')

    // Step 3 — tools (Continuar may be disabled without an engine; the fake engine is on PATH here).
    await page.getByRole('heading', { name: onboarding.step3Title }).waitFor({ state: 'visible' })
    const after2 = await focusInfo(page)
    stops.push(after2)
    rec.notes.push(`focus after step 2→3: ${JSON.stringify(after2)}`)
    await page.waitForTimeout(2_000)
    await tabTo(info => info.name === onboarding.continue || info.name === firstDeliveryCopy.skipHarness, '"Continuar" (step 3)')
    await page.keyboard.press('Enter')

    // Step 4 — template.
    await tabTo(info => info.name.startsWith(onboarding.step4TemplateBlank), 'the "Em branco" template')
    await page.keyboard.press('Space')
    await tabTo(info => info.name === onboarding.continue, '"Continuar" (step 4)')
    await page.keyboard.press('Enter')

    // Step 5 — leave without asking (the ask itself is covered by the first-delivery specs).
    await page.getByRole('heading', { name: onboarding.step5Title }).waitFor({ state: 'visible', timeout: 30_000 })
    const after4 = await focusInfo(page)
    stops.push(after4)
    rec.notes.push(`focus after step 4→5: ${JSON.stringify(after4)}`)
    await rec.shot('05-step5')
    await tabTo(info => info.name === onboarding.enterApp, '"Entrar sem pedir agora"')
    await page.keyboard.press('Enter')
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('heading', { name: onboarding.step5Title }).waitFor({ state: 'hidden', timeout: 30_000 })
    rec.mark('entered app by keyboard')
    await rec.shot('06-app')

    const escaped = stops.filter(stop => !stop.inDialog)
    expect(escaped, `focus left the dialog on Tab: ${JSON.stringify(escaped.slice(0, 3))}`).toEqual([])
    const lost = [after1, after2, after4].filter(info => info.isBody)
    expect(lost, `focus fell to <body> after a step change: ${JSON.stringify(lost)}`).toEqual([])
  }, 300_000)
})
