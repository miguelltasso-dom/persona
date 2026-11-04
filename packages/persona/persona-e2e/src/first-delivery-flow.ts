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
  const settleDeadline = step3At + 45_000
  while (Date.now() < settleDeadline && /Verificando/iu.test(await cardsText())) await page.waitForTimeout(500)
  notes?.push(`step 3 settled @${String(Math.round((Date.now() - step3At) / 100) / 10)}s: ${await cardsText()}`)
  await shot?.('03-step3')
  const skip = page.getByRole('button', { name: firstDeliveryCopy.skipHarness })
  if (await continueBtn.isEnabled().catch(() => false)) await continueBtn.click()
  else await skip.click()

  await page.getByRole('button', { name: onboarding.step4TemplateBlank }).click()
  await shot?.('04-step4')
  await continueBtn.click()

  await page.getByRole('heading', { name: onboarding.step5Title }).waitFor({ state: 'visible', timeout: 30_000 })
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
      await page.screenshot({ path: join(dir, `${label}.png`) }).catch(() => {})
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
  await rec.shot('06-working')

  await page.getByText(firstDeliveryCopy.celebrateTitle).waitFor({ state: 'visible', timeout: options.deadlineMs })
  const celebratedAt = rec.mark('celebrate visible')
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
  await page.getByRole('button', { name: firstDeliveryCopy.needsEngineConnect }).waitFor({ state: 'visible' })
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
