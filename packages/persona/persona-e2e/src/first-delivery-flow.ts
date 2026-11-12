import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { ARTIFACTS_DIR } from './paths.ts'
import { geralComposerLocator } from './geral-composer.ts'
import { onboarding } from './real-app-locale.pt.ts'
import { ensureGeralComposer } from './real-app-session.ts'

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

  await page.getByLabel('Sobre a empresa').getByText(onboarding.step2VaultBadge, { exact: true }).waitFor({ state: 'visible' })
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
  // `PERSONA_E2E_DETECT_SETTLE_MS` lengthens the wait on a loaded machine / the installed app (default 40 s).
  const settleDeadline = step3At + Number(process.env.PERSONA_E2E_DETECT_SETTLE_MS ?? 40_000)
  // Measured on the INSTALLED exe (H2 #3, loaded machine): Claude says "Pronta para usar" only after ~1–3 min while another card still says "Verificando…";
  // with an engine ready there is nothing else to wait for.
  const engineReady = async (): Promise<boolean> => /Claude [|] Pronta para usar/u.test(await cardsText())
  // The card can flash "Pronta para usar" and go back to "Verificando…" (measured on H2 #3): ready counts only when it STAYS ready for 4 s.
  let readySince: number | null = null
  const stableReady = async (): Promise<boolean> => {
    if (await engineReady()) {
      readySince ??= Date.now()
      return Date.now() - readySince >= 4_000
    }
    readySince = null
    return false
  }
  while (Date.now() < settleDeadline && !(await stableReady()) && (/Verificando/iu.test(await cardsText()) || await cardsText() === firstCards || readySince !== null)) {
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
  /** Epoch ms of the window attach (zero of every mark). */
  readonly startedAt: number
  shot(label: string): Promise<void>
  /** Screenshot without the settle wait: for timed milestones where the capture must not delay the next poll. */
  shotNow(label: string): Promise<void>
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
    startedAt: t0,
    shot: async (label: string) => {
      // Finite CSS transitions off + a short settle: the rail's active pill slides for ~220–360 ms after a nav click and
      // used to be caught mid-slide (a blank white bar over "Organização").
      await page.waitForTimeout(450)
      await page.screenshot({ path: join(dir, `${label}.png`), animations: 'disabled' }).catch(() => {})
    },
    shotNow: async (label: string) => {
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

  // Fail FAST with the app's own words when the engine could not run (it used to look like a 2-minute timeout): "O motor de X não está disponível…".
  const celebrateText = page.getByText(firstDeliveryCopy.celebrateTitle)
  const engineFailure = page.getByText(/não está disponível neste computador/u)
  await celebrateText.or(engineFailure).first().waitFor({ state: 'visible', timeout: options.deadlineMs })
  if (await engineFailure.first().isVisible().catch(() => false) && !(await celebrateText.isVisible().catch(() => false))) {
    await rec.shot('zz-engine-unavailable')
    const said = ((await engineFailure.first().innerText().catch(() => '')) ?? '').replace(/\s+/gu, ' ').trim()
    throw new Error(`the first delivery failed instead of being delivered: "${said.slice(0, 200)}" (engine_unavailable before any model turn)`)
  }
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

/**
 * Chat regression (Keel 04/11: the #geral composer did not send, `postMessage` without `occurredAt`): type in #geral, press
 * Enter, see the message in the list, RELOAD the app and see it again (it was persisted, not just echoed by the client).
 * @param page - Persona page after onboarding.
 * @param rec - Recorder (marks, screenshots).
 * @param text - Unique message text.
 */
export async function sendGeralMessageAndReload(page: Page, rec: FirstDeliveryRecorder, text: string): Promise<void> {
  await ensureGeralComposer(page)
  const composer = geralComposerLocator(page).first()
  // Focus, do not click: with a team in the channel a balloon ("A Coordenação distribui o pedido") can sit over the composer and intercept the pointer.
  await composer.focus()
  await composer.fill(text)
  await composer.press('Enter')
  rec.mark('chat message sent')
  try {
    await page.getByText(text).first().waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    await rec.shot('zz-chat-not-sent')
    throw new Error('the message typed in #geral never showed up after Enter (composer does not send)')
  }
  rec.mark('chat message visible')
  await rec.shot('10-chat-sent')
  await page.reload({ waitUntil: 'load' })
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
  await ensureGeralComposer(page)
  try {
    await page.getByText(text).first().waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    await rec.shot('zz-chat-lost-after-reload')
    throw new Error('the message typed in #geral is gone after reloading the app (it was not persisted)')
  }
  rec.mark('chat message persisted after reload')
  await rec.shot('11-chat-after-reload')
}

/** What happened to one message the person sent in #geral (D-079: every message gets a reply, a reaction or a visible line). */
export interface ConversationOutcome {
  readonly text: string
  readonly sent: boolean
  /** A reaction chip (Joinha, Coração, Rindo, Comemorando, Pensando, Feito) appeared on the person's message. */
  readonly reaction: string | null
  /** The first new message in #geral after the person's own (any author but the person), if any. */
  readonly reply: { readonly id: string; readonly text: string } | null
  /** A new visible state line (`role=status` / `aria-live`) that was not on screen before the send. */
  readonly stateLine: string | null
  readonly waitedMs: number
}

/** D-079: never silence: a reaction, a reply or a visible state line. */
export function acknowledged(outcome: ConversationOutcome): boolean {
  return outcome.sent && (outcome.reaction !== null || outcome.reply !== null || outcome.stateLine !== null)
}

const REACTION_LABEL = /^(Joinha|Coração|Rindo|Comemorando|Pensando|Feito)/u

/**
 * Bolt's P0 (04/11, D-079): with a Task open in #geral (the first delivery waiting for review), the person's NEXT conversational
 * message became a continuation and NOTHING answered. Type `text` in #geral + Enter and wait (up to `timeoutMs`) for a reaction on it or
 * a new message from anyone else. Returns what was seen; the caller asserts (`obrigado` → reaction or reply, a question → a reply).
 * Read-only apart from the send itself; no retry.
 * @param page - Persona page after onboarding.
 * @param rec - Recorder (marks, notes, screenshot).
 * @param text - Unique message text.
 * @param timeoutMs - How long to wait for the acknowledgement.
 */
export async function converseInGeral(
  page: Page,
  rec: FirstDeliveryRecorder,
  text: string,
  timeoutMs = 30_000,
  options: { readonly expectReply?: boolean } = {},
): Promise<ConversationOutcome> {
  // `expectReply`: a QUESTION is first met with a reaction ("Pensando") and answered later by the persona's turn: keep waiting for the reply itself.
  const expectReply = options.expectReply === true
  await ensureGeralComposer(page)
  const idsNow = async (): Promise<string[]> => page.evaluate(() => [...document.querySelectorAll('[data-message-id]')].map(node => node.getAttribute('data-message-id') ?? ''))
  const statusLines = async (): Promise<string[]> => page.evaluate(() => [...document.querySelectorAll('[role="status"], [aria-live]')]
    .map(node => (node.textContent ?? '').replace(/\s+/gu, ' ').trim()).filter(line => line !== ''))
  const before = new Set(await idsNow())
  const statusBefore = new Set(await statusLines())
  const composer = geralComposerLocator(page).first()
  // Focus, do not click: with a team in the channel a balloon ("A Coordenação distribui o pedido") can sit over the composer and intercept the pointer.
  await composer.focus()
  await composer.fill(text)
  await composer.press('Enter')
  const startedAt = Date.now()
  const own = page.locator('[data-message-id]').filter({ hasText: text }).last()
  try {
    await own.waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    await rec.shot('zz-converse-not-sent')
    return { text, sent: false, reaction: null, reply: null, stateLine: null, waitedMs: Date.now() - startedAt }
  }
  const ownId = (await own.getAttribute('data-message-id')) ?? ''
  let reaction: string | null = null
  let reply: { id: string; text: string } | null = null
  let stateLine: string | null = null
  while (Date.now() - startedAt < timeoutMs && (expectReply ? reply === null : (reaction === null && reply === null && stateLine === null))) {
    const chip = own.getByRole('button', { name: REACTION_LABEL }).first()
      .or(own.locator('xpath=..').getByRole('button', { name: REACTION_LABEL }).first())
    if (await chip.count() > 0) reaction = (await chip.getAttribute('aria-label')) ?? 'reaction'
    const fresh = (await idsNow()).filter(id => !before.has(id) && id !== ownId && !id.endsWith('-progress'))
    for (const id of fresh) {
      const body = ((await page.locator(`[data-message-id="${id}"]`).first().innerText().catch(() => '')) ?? '').trim()
      if (body !== '' && !body.includes(text)) { reply = { id, text: body.slice(0, 240) }; break }
    }
    if (!expectReply && reaction === null && reply === null) {
      stateLine = (await statusLines()).find(line => !statusBefore.has(line) && !line.includes(text)) ?? null
    }
    if (expectReply ? reply === null : (reaction === null && reply === null && stateLine === null)) await page.waitForTimeout(500)
  }
  const waitedMs = Date.now() - startedAt
  rec.notes.push(`converse "${text}": reaction=${reaction ?? 'none'}, reply=${reply === null ? 'none' : JSON.stringify(reply)}, stateLine=${stateLine === null ? 'none' : JSON.stringify(stateLine.slice(0, 160))}, after ${String(waitedMs)} ms`)
  await rec.shot(`13-converse-${text.replace(/[^a-z]/giu, '').slice(0, 12).toLowerCase()}`)
  return { text, sent: true, reaction, reply, stateLine, waitedMs }
}

/** Milestones of the real run in ms since the window attached (Muse's FIRST-DELIVERY-SPEC "Medição na rodada real"). */
export interface RealDeliveryTimeline {
  /** Instant right before the click on "Pedir agora". */
  readonly t0: number
  /** "Equipe trabalhando" visible. */
  readonly working?: number
  /** "Ainda trabalhando." (slow state). */
  readonly slow?: number
  /** Typed error card (`aria-label` carries the code). */
  readonly failed?: { readonly at: number; readonly label: string }
  /** "Aceitar e entrar" visible. */
  readonly acceptVisible?: number
  /** The ask echoed into #geral (event `first-delivery`). */
  readonly geralAskEcho?: number
  /**
   * The persona's delivery in #geral: the first message whose id ends in `-done` (the runner's delivery event). Rehearsal
   * 04/11: the #geral list loads AFTER the click, so "any new id" also caught the pre-existing welcome messages.
   */
  readonly geralPersonaMessage?: number
  /** First of {@link acceptVisible} and {@link geralPersonaMessage}: the number that matters is `t1 - t0`. */
  readonly t1?: number
  readonly t1Source?: 'accept' | 'geral'
  /** Click on "Aceitar e entrar". */
  readonly t2?: number
  readonly outcome: 'delivered' | 'failed' | 'timeout'
  /** Every #geral message id that appeared after t0, with the instant it was first seen (diagnosis). */
  readonly messageIds: readonly { readonly id: string; readonly at: number }[]
}

interface RealPoll {
  readonly working: boolean
  readonly slow: boolean
  readonly failed: string | null
  readonly accept: boolean
  readonly ids: readonly string[]
}

async function pollReal(page: Page): Promise<RealPoll> {
  return page.evaluate(() => {
    const text = document.body.innerText
    const headings = [...document.querySelectorAll('h1')].map(node => (node.textContent ?? '').trim())
    const error = document.querySelector('section[role="status"][aria-label*=":"]')
    return {
      working: headings.includes('Equipe trabalhando'),
      slow: /Ainda trabalhando/u.test(text),
      failed: error === null ? null : error.getAttribute('aria-label'),
      accept: [...document.querySelectorAll('button')].some(button => /Aceitar e entrar/u.test(button.textContent ?? '')),
      ids: [...document.querySelectorAll('[data-message-id]')].map(node => node.getAttribute('data-message-id') ?? ''),
    }
  })
}

/**
 * The REAL-engine first delivery with Muse's milestone timeline: polls every ~200 ms, marks each milestone once (ms since the
 * window attached, via the recorder), takes one screenshot per milestone without delaying the poll, clicks "Aceitar e entrar"
 * when it shows, and stops at the first failure card or at the deadline. Never retries.
 * @param page - Persona page on onboarding step 5 (intro).
 * @param rec - Recorder created right after the window attached.
 * @param options - Hard deadline for ask → accept (ms).
 */
export async function runRealFirstDelivery(
  page: Page,
  rec: FirstDeliveryRecorder,
  options: { readonly deadlineMs: number },
): Promise<RealDeliveryTimeline> {
  const baselineIds = new Set((await pollReal(page)).ids)
  const t0 = rec.mark('t0')
  const deadlineAt = Date.now() + options.deadlineMs
  await page.getByRole('button', { name: onboarding.requestNow, exact: true }).click()
  await rec.shotNow('m0-t0')

  const seen = new Set<string>()
  const once = async (key: string, shotLabel: string): Promise<number | undefined> => {
    if (seen.has(key)) return undefined
    seen.add(key)
    const at = rec.mark(key)
    await rec.shotNow(shotLabel)
    return at
  }
  let working: number | undefined
  let slow: number | undefined
  let failed: { at: number; label: string } | undefined
  let acceptVisible: number | undefined
  let geralAskEcho: number | undefined
  let geralPersonaMessage: number | undefined
  const messageIds: { id: string; at: number }[] = []

  while (Date.now() < deadlineAt) {
    const state = await pollReal(page)
    const fresh = state.ids.filter(id => !baselineIds.has(id))
    for (const id of fresh) {
      if (!messageIds.some(row => row.id === id)) messageIds.push({ id, at: Date.now() - rec.startedAt })
    }
    if (state.working) working ??= await once('working', 'm1-working')
    if (state.slow) slow ??= await once('slow', 'm2-slow')
    if (fresh.includes('first-delivery')) geralAskEcho ??= await once('geral ask echo', 'm3-geral-ask-echo')
    if (fresh.some(id => id.endsWith('-done'))) {
      geralPersonaMessage ??= await once('geral persona message', 'm4-geral-persona-message')
    }
    if (state.failed !== null) {
      const at = await once('failed', 'm5-failed')
      if (at !== undefined) failed = { at, label: state.failed }
      break
    }
    if (state.accept) {
      acceptVisible ??= await once('accept visible', 'm6-accept-visible')
      break
    }
    await page.waitForTimeout(200)
  }

  const t1Candidates = [acceptVisible, geralPersonaMessage].filter((value): value is number => value !== undefined)
  const t1 = t1Candidates.length === 0 ? undefined : Math.min(...t1Candidates)
  const t1Source = t1 === undefined ? undefined : (t1 === acceptVisible ? 'accept' : 'geral')
  let t2: number | undefined
  if (acceptVisible !== undefined && failed === undefined) {
    await page.getByRole('button', { name: firstDeliveryCopy.acceptAndEnter }).click()
    t2 = rec.mark('t2 accept clicked')
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('heading', { name: onboarding.step5Title }).waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
    await rec.shot('m7-after-accept')
  }
  const outcome: RealDeliveryTimeline['outcome'] = failed !== undefined ? 'failed' : (t2 !== undefined ? 'delivered' : 'timeout')
  if (outcome === 'timeout') await rec.shotNow('m8-timeout')
  return {
    t0,
    ...(working === undefined ? {} : { working }),
    ...(slow === undefined ? {} : { slow }),
    ...(failed === undefined ? {} : { failed }),
    ...(acceptVisible === undefined ? {} : { acceptVisible }),
    ...(geralAskEcho === undefined ? {} : { geralAskEcho }),
    ...(geralPersonaMessage === undefined ? {} : { geralPersonaMessage }),
    ...(t1 === undefined ? {} : { t1 }),
    ...(t1Source === undefined ? {} : { t1Source }),
    ...(t2 === undefined ? {} : { t2 }),
    outcome,
    messageIds,
  }
}

/** LEAK-1 (Muse, 04/11, H2 #3 instalado): the INTERNAL prompt of the first delivery must never show up as a message in #geral. */
export const LEAK_1_PATTERNS: readonly RegExp[] = [/Não use ferramentas/iu, /resuma somente/iu, /\bbrief\b/iu]

/** Every message visible in the open conversation (id + text, whoever wrote it). */
export async function visibleMessages(page: Page): Promise<Array<{ id: string; text: string }>> {
  return page.evaluate(() => [...document.querySelectorAll('[data-message-id]')].map(node => ({
    id: node.getAttribute('data-message-id') ?? '',
    text: ((node as HTMLElement).innerText ?? '').replace(/\s+/gu, ' ').trim(),
  })))
}

/** What leaked: one `id: matched phrase` per visible message that carries an internal-prompt phrase. */
export function leakedInternalPrompt(messages: ReadonlyArray<{ id: string; text: string }>): string[] {
  return messages.flatMap(message => LEAK_1_PATTERNS.filter(pattern => pattern.test(message.text)).map(pattern => `${message.id}: ${pattern.source}`))
}

/**
 * Read #geral after the first delivery: the visible lines (for the proof, 300 chars each) and what leaked. The caller decides whether a leak
 * fails the run (the REAL run only records it: LEAK-1 does not block D-069).
 */
export async function recordFirstDeliveryLines(page: Page): Promise<{ lines: string[]; leaked: string[] }> {
  const messages = await visibleMessages(page)
  return { lines: messages.map(message => `${message.id}: ${message.text.slice(0, 300)}`), leaked: leakedInternalPrompt(messages) }
}
