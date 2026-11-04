import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { ARTIFACTS_DIR } from './paths.ts'
import { onboarding } from './real-app-locale.pt.ts'

/** Copy the first-delivery flow asserts against (mirrors `onboarding.pt.json` / `shell.pt.json`; tests-only). */
export const firstDeliveryCopy = {
  workingTitle: 'Equipe trabalhando',
  needsEngineTitle: 'Falta uma IA para a equipe trabalhar.',
  needsEngineConnect: 'Conectar uma IA',
  celebrateTitle: 'Sua equipe entregou o primeiro trabalho!',
  acceptAndEnter: 'Aceitar e entrar',
  askChange: 'Pedir ajuste',
  enterAndFollow: 'Entrar e acompanhar',
  skipHarness: 'Continuar sem conectar',
} as const

/**
 * Paid model turns one first delivery may cost (Keel, 04/11): the target is ONE (the worker's execution; persona prompt
 * as session context, deterministic routing, no model triage). The ceiling of three is only a safety stop.
 */
export const FIRST_DELIVERY_PAID_TURNS_TARGET = 1
export const FIRST_DELIVERY_PAID_TURNS_CEILING = 3

/** Where first-delivery screenshots and `proof.json` go (gitignored). */
export function firstDeliveryArtifactsDir(scenario: string): string {
  return join(ARTIFACTS_DIR, 'first-delivery', scenario)
}

/**
 * Walk onboarding steps 1→4 on a clean home and stop on step 5 ("Primeira entrega").
 * Step 3 tolerates "no engine detected": it uses "Continuar sem conectar" when "Continuar" is disabled.
 * @param page - Persona page with the onboarding overlay visible.
 * @param name - Display name typed in step 1.
 * @param shot - Optional screenshot sink called after each step.
 * @param notes - Optional sink for what step 3 showed (early and settled), for `proof.json`.
 */
export async function walkOnboardingToStep5(
  page: Page,
  name = 'Probe E2E',
  shot?: (label: string) => Promise<void>,
  notes?: string[],
): Promise<void> {
  const continueBtn = page.getByRole('button', { name: onboarding.continue, exact: true })
  await page.getByPlaceholder(onboarding.step1Placeholder).waitFor({ state: 'visible', timeout: 60_000 })
  await shot?.('01-step1')
  await page.getByPlaceholder(onboarding.step1Placeholder).fill(name)
  await continueBtn.click()

  await page.getByText(onboarding.step2VaultBadge).waitFor({ state: 'visible' })
  await page.getByPlaceholder('Descreva em linguagem natural ou cole um texto…')
    .fill('Agência Ponto — estúdio de sites e campanhas para PMEs. Cliente atual: Padaria Lua.')
  await shot?.('02-step2')
  await continueBtn.click()

  await page.getByRole('heading', { name: onboarding.step3Title }).waitFor({ state: 'visible' })
  // Detection is async: record what the cards say right away (a card must not claim "Não detectada" while it is still
  // checking), then wait until none says "Verificando…" before judging the button.
  const cardsText = async (): Promise<string> => (await page.locator('body').innerText())
    .split(/\r?\n/u).map(line => line.trim())
    .filter(line => /Claude|Codex|Cursor|OpenCode|detectad|Verificando|Conectad|Pronta/iu.test(line)).join(' | ')
  const step3At = Date.now()
  await page.waitForTimeout(800)
  notes?.push(`step 3 @0.8s: ${await cardsText()}`)
  await shot?.('03-step3-early')
  // Measured 04/11: detection takes 10–27 s and the cards say "Não detectada" the whole time (no "Verificando…"), so
  // "settled" means the text changed from the first snapshot, or 40 s passed with no change (nothing to detect).
  const firstCards = await cardsText()
  const settleDeadline = step3At + 40_000
  while (Date.now() < settleDeadline && (/Verificando/iu.test(await cardsText()) || await cardsText() === firstCards)) {
    await page.waitForTimeout(500)
  }
  const changed = await cardsText() !== firstCards
  notes?.push(`step 3 ${changed ? 'changed' : 'unchanged'} after ${String(Math.round((Date.now() - step3At) / 100) / 10)}s: ${await cardsText()}`)
  await shot?.('03-step3')
  const skip = page.getByRole('button', { name: firstDeliveryCopy.skipHarness })
  if (await continueBtn.isEnabled().catch(() => false)) await continueBtn.click()
  else await skip.click()

  await page.getByRole('button', { name: onboarding.step4TemplateBlank }).click()
  await shot?.('04-step4')
  await continueBtn.click()

  // With no engine the step opens straight on "Falta uma IA…" (needsEngine) instead of the intro title.
  await page.getByRole('heading', { name: onboarding.step5Title })
    .or(page.getByRole('heading', { name: firstDeliveryCopy.needsEngineTitle }))
    .first().waitFor({ state: 'visible', timeout: 30_000 })
}

/** Screenshot + timing recorder shared by the first-delivery scenarios. */
export interface FirstDeliveryRecorder {
  readonly dir: string
  readonly marks: Record<string, number>
  readonly notes: string[]
  shot(label: string): Promise<void>
  mark(key: string): number
  write(extra?: Record<string, unknown>): Promise<string>
}

/**
 * @param page - Page to capture.
 * @param scenario - Folder name under `artifacts/first-delivery/`.
 */
export async function createFirstDeliveryRecorder(page: Page, scenario: string): Promise<FirstDeliveryRecorder> {
  const dir = firstDeliveryArtifactsDir(scenario)
  await mkdir(dir, { recursive: true })
  const t0 = Date.now()
  const marks: Record<string, number> = {}
  const notes: string[] = []
  return {
    dir,
    marks,
    notes,
    shot: async (label: string) => {
      // Finite CSS transitions off + a short settle: the rail's active pill slides for ~220–360 ms after a nav click and
      // used to be caught mid-slide (a blank white bar over "Organização").
      await page.waitForTimeout(450)
      await page.screenshot({ path: join(dir, `${label}.png`), animations: 'disabled' }).catch(() => {})
    },
    mark: (key: string) => {
      marks[key] = Date.now() - t0
      return marks[key]
    },
    write: async (extra = {}) => {
      const file = join(dir, 'proof.json')
      await writeFile(file, `${JSON.stringify({ scenario, marks, notes, ...extra }, null, 2)}\n`)
      return file
    },
  }
}

/**
 * WCAG 2.4.3 on a phase change of step 5 (working / celebrate / needsEngine / failed): focus must be on the new step
 * (its title or first action) inside the dialog, never on `<body>` and never behind the modal. Notes the result; throws on a violation.
 * @param page - Persona page on onboarding step 5.
 * @param rec - Recorder (notes).
 * @param phase - Label of the phase just entered.
 */
export async function expectFocusInDialog(page: Page, rec: FirstDeliveryRecorder, phase: string): Promise<void> {
  // Give the step a frame to move focus (the title takes it on mount).
  await page.waitForTimeout(150)
  const info = await page.evaluate(() => {
    const active = document.activeElement
    return {
      tag: active?.tagName ?? 'NONE',
      name: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').trim().slice(0, 60),
      inDialog: active?.closest('[role="dialog"]') != null,
      isBody: active === document.body || active === null,
    }
  })
  rec.notes.push(`focus @${phase}: ${JSON.stringify(info)}`)
  if (info.isBody || !info.inDialog) {
    throw new Error(`focus after entering "${phase}" is ${info.isBody ? 'on <body>' : 'outside the dialog'} (${JSON.stringify(info)})`)
  }
}

/** Tunables for {@link runHappyFirstDelivery}. */
export interface HappyFirstDeliveryOptions {
  /** Latency the fake CLI adds to its turn; the working state must be observable at least this long. */
  readonly fakeTurnMs: number
  /** UX-PHASE A budget for ask → celebrate (ms). */
  readonly deadlineMs: number
  readonly name?: string
}

/** What the happy walk measured (also written to `proof.json`). */
export interface HappyFirstDeliveryResult {
  readonly askToCelebrateMs: number
  readonly askToAcceptedMs: number
}

/**
 * Step 5 happy path: "Pedir agora" → "Equipe trabalhando" → milestone → "Aceitar e entrar" → the app shell.
 * Throws on any broken expectation; the caller owns the page/session.
 * @param page - Persona page already on onboarding step 5 (see {@link walkOnboardingToStep5}).
 * @param rec - Recorder for marks and screenshots.
 * @param options - Fake latency and the ask → celebrate budget.
 */
export async function runHappyFirstDelivery(
  page: Page,
  rec: FirstDeliveryRecorder,
  options: HappyFirstDeliveryOptions,
): Promise<HappyFirstDeliveryResult> {
  await page.getByRole('button', { name: onboarding.requestNow, exact: true }).click()
  const askedAt = rec.mark('asked')

  await page.getByRole('heading', { name: firstDeliveryCopy.workingTitle }).waitFor({ state: 'visible', timeout: 30_000 })
  rec.mark('working visible')
  await expectFocusInDialog(page, rec, 'working')
  await rec.shot('06-working')

  await page.getByText(firstDeliveryCopy.celebrateTitle).waitFor({ state: 'visible', timeout: options.deadlineMs })
  const celebratedAt = rec.mark('celebrate visible')
  await expectFocusInDialog(page, rec, 'celebrate')
  await rec.shot('07-celebrate')
  const askToCelebrateMs = celebratedAt - askedAt
  if (askToCelebrateMs >= options.deadlineMs) {
    throw new Error(`ask → celebrate took ${String(askToCelebrateMs)} ms (budget ${String(options.deadlineMs)} ms)`)
  }
  if (askToCelebrateMs < options.fakeTurnMs - 500) {
    throw new Error(`ask → celebrate took ${String(askToCelebrateMs)} ms, faster than the fake turn (${String(options.fakeTurnMs)} ms): the delivery was not produced by the runner`)
  }

  await page.getByRole('button', { name: firstDeliveryCopy.acceptAndEnter }).click()
  const acceptedAt = rec.mark('accepted')
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByRole('heading', { name: onboarding.step5Title }).waitFor({ state: 'hidden', timeout: 30_000 })
  rec.notes.push(`ask→celebrate ${String(askToCelebrateMs)} ms (fake turn ${String(options.fakeTurnMs)} ms)`)
  return { askToCelebrateMs, askToAcceptedMs: acceptedAt - askedAt }
}

/**
 * Step 5 without an engine: "Falta uma IA…" + "Conectar uma IA", no working/celebrate state, "Entrar sem pedir agora" works.
 * @param page - Persona page already on onboarding step 5 with no CLI visible.
 * @param rec - Recorder for marks and screenshots.
 */
export async function runNoEngineFirstDelivery(page: Page, rec: FirstDeliveryRecorder): Promise<void> {
  await page.getByRole('heading', { name: firstDeliveryCopy.needsEngineTitle }).waitFor({ state: 'visible', timeout: 30_000 })
  await rec.shot('05-needs-engine')
  rec.mark('needs engine visible')
  await expectFocusInDialog(page, rec, 'needsEngine')
  await page.getByRole('dialog').getByRole('button', { name: firstDeliveryCopy.needsEngineConnect }).waitFor({ state: 'visible' })
  if (await page.getByRole('heading', { name: firstDeliveryCopy.workingTitle }).count() !== 0) {
    throw new Error('"Equipe trabalhando" shown without an engine')
  }
  if (await page.getByText(firstDeliveryCopy.celebrateTitle).count() !== 0) {
    throw new Error('first-delivery celebration shown without an engine')
  }
  await page.getByRole('button', { name: onboarding.enterApp }).click()
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByRole('heading', { name: firstDeliveryCopy.needsEngineTitle }).waitFor({ state: 'hidden', timeout: 30_000 })
  rec.mark('entered app without engine')
  await rec.shot('06-app-without-engine')
}

/** What the desktop boot overlay (`<persona-boot id="persona-boot-overlay">`) shows right now. */
export interface BootOverlayState {
  readonly present: boolean
  readonly text: string
}

/** Read the boot overlay without interacting with it (it sits above the app and intercepts pointer events). */
export async function readBootOverlay(page: Page): Promise<BootOverlayState> {
  return page.evaluate(() => {
    const overlay = document.getElementById('persona-boot-overlay')
    if (overlay === null) return { present: false, text: '' }
    const style = getComputedStyle(overlay)
    if (style.display === 'none' || style.visibility === 'hidden') return { present: false, text: '' }
    const text = (overlay.shadowRoot?.textContent ?? overlay.textContent ?? '').replace(/\s+/gu, ' ').trim()
    return { present: true, text: text.slice(0, 400) }
  })
}

/**
 * The installed app must hand the screen over to the app: wait until the boot overlay is gone and fail with its text if it
 * stays (an error card over a working app blocks every click: V1-P0-6).
 * @param page - Installed app page.
 * @param rec - Recorder (marks, screenshot).
 * @param timeoutMs - How long the overlay may stay (splash → app).
 */
export async function expectBootOverlayGone(page: Page, rec: FirstDeliveryRecorder, timeoutMs = 60_000): Promise<void> {
  const startedAt = Date.now()
  let state = await readBootOverlay(page)
  while (state.present && Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(500)
    state = await readBootOverlay(page)
  }
  rec.mark(state.present ? 'boot overlay STUCK' : 'boot overlay gone')
  if (state.present) {
    await rec.shot('00-boot-overlay-stuck')
    throw new Error(`boot overlay still on screen after ${String(timeoutMs)} ms: "${state.text}"`)
  }
}
