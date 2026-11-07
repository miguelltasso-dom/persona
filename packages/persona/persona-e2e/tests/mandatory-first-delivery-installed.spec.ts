/**
 * V1-P0-6 — the INSTALLED Persona.exe runs the same first-delivery flow as the web profile, on a clean profile,
 * with the fake CLI (no model call). Opt-in: `PERSONA_E2E=1` + `PERSONA_INSTALLED_EXE=<path to Persona.exe>`
 * (+ `PERSONA_NSIS_COMMIT=<hash of the NSIS candidate>` so the proof says which build it is).
 *
 *   $env:PERSONA_E2E='1'; $env:PERSONA_INSTALLED_EXE='C:\p8i\Persona.exe'; $env:PERSONA_NSIS_COMMIT='a1dccb5f8f'
 *   node scripts/persona/with-lock.mjs "Probe installed first delivery" -- pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-first-delivery-installed.spec.ts
 *
 * Evidence: `artifacts/first-delivery/installed-happy|installed-no-engine/` (`proof.json` with the exe sha256, the stub calls
 * and the `turn_ledger` totals read AFTER the app stopped; screenshots; `electron.log`) — written even when the scenario
 * fails, so a red run says where and why. The happy proof is the prerequisite the REAL run checks (same exe sha256).
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { D079_FAKE_TURN_MS, D079_FIRST_DELIVERY_REPLY, D079_RULES, d079StepNoTeam, runD079Scenarios } from '../src/conversation-d079.ts'
import { hireSuggestedTeam } from '../src/gauge-app.ts'
import { readHostFlags } from '../src/host-flags.ts'
import { watchConsole } from '../src/console-tripwire.ts'
import { exeIdentity } from '../src/exe-identity.ts'
import { withFakeCliOnPath, withNoEngineOnPath, type FakeCliPathScope } from '../src/fake-cli.ts'
import {
  FIRST_DELIVERY_PAID_TURNS_CEILING,
  FIRST_DELIVERY_PAID_TURNS_TARGET,
  createFirstDeliveryRecorder,
  type ConversationOutcome,
  expectBootOverlayGone,
  readBootOverlay,
  runHappyFirstDelivery,
  acknowledged,
  converseInGeral,
  recordFirstDeliveryLines,
  runNoEngineFirstDelivery,
  sendGeralMessageAndReload,
  walkOnboardingToStep5,
} from '../src/first-delivery-flow.ts'
import { startInstalledDesktop } from '../src/installed-desktop.ts'
import { readLedgerEvidence } from '../src/ledger-evidence.ts'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { TURN_CAP_ENV, TURN_LEDGER_ENV, readTurnLedgerFile } from '../src/turn-cap.ts'
import { assertConsoleClean, assertNotHarnessShell, ensureGeralComposer } from '../src/real-app-session.ts'
import { readRecentEvents } from '../src/team-transcript.ts'

// The installed app detects engines slowly (measured 04/11 on H2 #3: Claude "Pronta para usar" after 1–3 min on a loaded machine); the delivery started before
// that settles is NOT produced by a runner. Wait for it (the flow stops as soon as Claude is ready).
process.env.PERSONA_E2E_DETECT_SETTLE_MS ??= '300000'
const exe = process.env.PERSONA_INSTALLED_EXE
const run = process.env.PERSONA_E2E === '1' && exe !== undefined && exe !== '' && existsSync(exe)
const UX_PHASE_A_MS = 120_000
const FAKE_TURN_MS = 2_500
const HEADLINE = 'Entrega do Probe (instalado): resumo da Agência Ponto em 5 pontos.'
const REPLY = [
  HEADLINE,
  '1. Estúdio de sites e campanhas para PMEs.',
  '2. Cliente atual: Padaria Lua.',
  '3. Objetivo: divulgar o cardápio.',
  '4. Prazo ainda não informado.',
  '5. Tarefa da semana: revisar o texto do cardápio (dona: Coordenação; pronto quando revisado).',
].join(' ')

describe.skipIf(!run)('first delivery — installed Persona.exe with fake CLI (V1-P0-6)', () => {
  it('happy path on a clean profile: onboarding → ask → delivery → accept → #geral has the reply', async () => {
    const identity = await exeIdentity(exe!)
    const scope: FakeCliPathScope = withFakeCliOnPath({ turnMs: FAKE_TURN_MS, reply: REPLY })
    // Same limiter as the real run (Rivet): CAP=1 and an absolute ledger file. The first delivery is the one allowed turn; the chat
    // message sent afterwards would start a SECOND model turn, which the app must refuse (ledger stays turns=1, the stub is not called).
    const capLedgerDir = join(ARTIFACTS_DIR, 'first-delivery', 'real-turn-ledger')
    mkdirSync(capLedgerDir, { recursive: true })
    const capLedger = join(capLedgerDir, 'fake-installed.ledger')
    rmSync(capLedger, { force: true })
    const desktop = await startInstalledDesktop({
      exe: exe!,
      keepRunRoot: true,
      env: { [TURN_CAP_ENV]: '1', [TURN_LEDGER_ENV]: capLedger },
    })
    const { page } = desktop
    const tripwire = watchConsole(page)
    const rec = await createFirstDeliveryRecorder(page, 'installed-happy')
    let outcome: Record<string, unknown> = { stage: 'started' }
    let leak: string[] = []
    const soft: string[] = []
    let failed = false
    try {
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await assertNotHarnessShell(page)
      rec.mark('shell visible')
      await expectBootOverlayGone(page, rec)
      await walkOnboardingToStep5(page, 'Probe Instalado', rec.shot, rec.notes)
      rec.mark('step5 visible')
      const result = await runHappyFirstDelivery(page, rec, { fakeTurnMs: FAKE_TURN_MS, deadlineMs: UX_PHASE_A_MS })
      // After "Aceitar e entrar" the app lands on Visão geral (H2 #3/#4); the delivery text lives in #geral: open it before reading.
      await ensureGeralComposer(page)
      await page.getByText(HEADLINE).first().waitFor({ state: 'visible', timeout: 60_000 })
      await rec.shot('08-geral-delivery')
      rec.mark('delivery in #geral')
      // LEAK-1 (Muse): the internal prompt must not be a visible message. Recorded in the proof; raised AFTER the proof is written so the
      // core flow stays green for the real-run prerequisite (LEAK-1 does not block D-069).
      const geral = await recordFirstDeliveryLines(page)
      leak = geral.leaked
      const turns = scope.invocations().filter(call => call.event === 'turn').length
      outcome = { stage: 'passed', ...result, fakeCliTurns: turns, leak1: { leaked: geral.leaked, firstDeliveryLines: geral.lines } }
      expect(turns, 'the delivery must come from a real CLI turn, not a scripted reply').toBeGreaterThanOrEqual(1)
      expect(turns, 'safety ceiling').toBeLessThanOrEqual(FIRST_DELIVERY_PAID_TURNS_CEILING)
      expect(turns, 'V1-P0 target: the first delivery is ONE paid turn').toBeLessThanOrEqual(FIRST_DELIVERY_PAID_TURNS_TARGET)
      expect(result.askToCelebrateMs).toBeLessThan(UX_PHASE_A_MS)
      // D-079 (Bolt): with the first delivery awaiting review, the next conversational messages must be acknowledged — without a second model turn (CAP=1).
      // SOFT: on the H2 base a channel WITHOUT any persona ("Monte sua equipe") met the person's message with silence (Bolt's fix is in the v1.1 tree: "Ainda não há ninguém na
      // equipe para responder…"). The conversation result is recorded and raised AFTER the proof is written, so the first-delivery proof (the real-run prerequisite) is not
      // turned red by a conversation finding that does not touch it.
      const thanks = await converseInGeral(page, rec, 'obrigado')
      expect(thanks.sent, '"obrigado" was sent').toBe(true)
      if (!acknowledged(thanks)) soft.push('"obrigado": no reaction, no reply and no state line')
      const cost = await converseInGeral(page, rec, 'quanto custou isso?', 60_000, { expectReply: true })
      expect(cost.sent, '"quanto custou isso?" was sent').toBe(true)
      if (cost.reply === null) soft.push('"quanto custou isso?" needs a visible answer from the team')
      outcome = { ...outcome, conversationSoft: soft }
      // Chat regression (Keel 04/11): the #geral composer must send and the message must survive a reload.
      await sendGeralMessageAndReload(page, rec, 'Mensagem do Probe (instalado): o composer envia e persiste.')
      outcome = { ...outcome, chatPersisted: true }
      // The limiter: the chat message must NOT have produced a second model turn.
      await page.waitForTimeout(6_000)
      const turnsAfterChat = scope.invocations().filter(call => call.event === 'turn').length
      const capAfterChat = readTurnLedgerFile(capLedger)
      const refusal = await page.getByText(/Precisa de você: o limite de execuções reais desta rodada foi atingido \(1 de 1\)\. Nada foi iniciado/u).first().isVisible().catch(() => false)
      rec.notes.push(`after the chat message: stub turns=${String(turnsAfterChat)}, limiter ledger turns=${String(capAfterChat.turns)} valid=${String(capAfterChat.valid)}, pt-BR refusal visible=${String(refusal)}`)
      await rec.shot('12-after-chat-refused')
      expect(capAfterChat.valid, `limiter ledger invalid: ${capAfterChat.error ?? ''}`).toBe(true)
      expect(capAfterChat.turns, 'the limiter booked exactly the first delivery turn').toBe(1)
      expect(turnsAfterChat, 'the second turn must be refused before the CLI starts (stub untouched)').toBe(1)
      assertConsoleClean(tripwire)
    } catch (error) {
      failed = true
      outcome = { stage: 'FAILED', error: error instanceof Error ? error.message.slice(0, 600) : String(error) }
      await rec.shot('zz-failed')
      throw error
    } finally {
      const calls = scope.invocations()
      const overlay = await readBootOverlay(page).catch(() => 'unreadable')
      await writeFile(join(rec.dir, 'electron.log'), desktop.log().slice(-60_000)).catch(() => {})
      await desktop.stop()
      const recentEvents = readRecentEvents(desktop.home)
      // TEAM-15: the exe prints its four v1.1 switches at boot; read WITHOUT having passed any flag variable, it proves the app came up with the team functions ON.
      const hostFlags = readHostFlags(desktop.log(), desktop.home) ?? null
      const ledger = readLedgerEvidence(desktop.home) ?? null
      await rec.write({
        exe, exeIdentity: identity, home: desktop.home, outcome,
        bootOverlay: overlay,
        fakeCliInvocations: calls.length,
        fakeCliTurns: calls.filter(call => call.event === 'turn').length,
        fakeCliCalls: calls.slice(0, 40).map(call => `${call.tool} ${call.argv.slice(0, 3).join(' ')} [${call.event}]`),
        ledger,
        recentEvents,
        hostFlags,
        turnCap: { ledgerFile: capLedger, ledger: (() => { const read = readTurnLedgerFile(capLedger); return { exists: read.exists, valid: read.valid, turns: read.turns, raw: read.raw.slice(0, 2_000) } })() },
        consoleErrors: tripwire.consoleErrors.slice(0, 20),
        pageErrors: tripwire.pageErrors.slice(0, 20),
      })
      await rm(dirname(desktop.home), { recursive: true, force: true }).catch(() => {})
      scope.restore()
      if (!failed && leak.length > 0) throw new Error(`LEAK-1: the internal first-delivery prompt is visible in #geral: ${leak.join('; ')}`)
      if (!failed && soft.length > 0) throw new Error(`conversation finding (does not touch the first-delivery proof): ${soft.join('; ')}`)
    }
  }, UX_PHASE_A_MS + 720_000)

  // D-079 (Atlas/Keel, 04/11): the FINAL candidate's installed fake must run the WHOLE conversation spec (a/b/c/d), not only (a).
  // A separate boot WITHOUT the turn limiter: (b) and (c) need further model turns (the stub answers by what was asked — `D079_RULES`).
  it('D-079 full conversation in the installed exe: (a) another subject, (b) answer continues the Task, (c) same subject while running, (d) never silent', async () => {
    const identity = await exeIdentity(exe!)
    const scope: FakeCliPathScope = withFakeCliOnPath({ turnMs: D079_FAKE_TURN_MS, rules: D079_RULES, reply: D079_FIRST_DELIVERY_REPLY })
    const desktop = await startInstalledDesktop({ exe: exe!, keepRunRoot: true })
    const { page } = desktop
    const tripwire = watchConsole(page)
    const rec = await createFirstDeliveryRecorder(page, 'installed-d079')
    const outcomes: ConversationOutcome[] = []
    let outcome: Record<string, unknown> = { stage: 'started' }
    const turns = (): number => scope.invocations().filter(call => call.event === 'turn').length
    try {
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await assertNotHarnessShell(page)
      await expectBootOverlayGone(page, rec)
      await walkOnboardingToStep5(page, 'Probe D079 Instalado', rec.shot, rec.notes)
      const result = await runHappyFirstDelivery(page, rec, { fakeTurnMs: D079_FAKE_TURN_MS, deadlineMs: UX_PHASE_A_MS })
      outcome = { stage: 'first delivery accepted', ...result }
      // The channel has NO team yet ("Monte sua equipe"). v1.1 (PERSONA_E2E_V11=1): the person gets the honest line instead of silence. Then the conversation
      // scenarios run WITH a team (the suggested team hired through the structure assistant), where they are about conversation, not about an empty channel.
      if (process.env.PERSONA_E2E_V11 === '1') await d079StepNoTeam({ page, rec, outcomes, turns })
      await hireSuggestedTeam(page)
      await runD079Scenarios({ page, rec, outcomes, turns })
      outcome = { stage: 'passed', ...result, fakeCliTurns: turns(), messages: outcomes.length }
      assertConsoleClean(tripwire)
    } catch (error) {
      outcome = { ...outcome, stage: 'FAILED', error: error instanceof Error ? error.message.slice(0, 600) : String(error) }
      await rec.shot('zz-failed')
      throw error
    } finally {
      const calls = scope.invocations()
      await writeFile(join(rec.dir, 'electron.log'), desktop.log().slice(-60_000)).catch(() => {})
      await desktop.stop()
      const recentEvents = readRecentEvents(desktop.home)
      // TEAM-15: the exe prints its four v1.1 switches at boot; read WITHOUT having passed any flag variable, it proves the app came up with the team functions ON.
      const hostFlags = readHostFlags(desktop.log(), desktop.home) ?? null
      await rec.write({
        exe, exeIdentity: identity, home: desktop.home, outcome,
        recentEvents,
        hostFlags,
        spec: 'persona-spec/contracts/conversation.md (a/b/c/d)',
        messages: outcomes.map(item => ({ text: item.text, sent: item.sent, acknowledged: acknowledged(item), reply: item.reply })),
        fakeCliTurns: calls.filter(call => call.event === 'turn').length,
        fakeCliCalls: calls.slice(0, 60).map(call => `${call.tool} ${call.argv.slice(0, 3).join(' ')} [${call.event}]`),
        ledger: readLedgerEvidence(desktop.home) ?? null,
        consoleErrors: tripwire.consoleErrors.slice(0, 20),
        pageErrors: tripwire.pageErrors.slice(0, 20),
      })
      await rm(dirname(desktop.home), { recursive: true, force: true }).catch(() => {})
      scope.restore()
    }
  }, UX_PHASE_A_MS + 1_080_000)

  it('no engine on a clean profile: step 5 says "Falta uma IA…" and lets the person enter', async () => {
    const identity = await exeIdentity(exe!)
    const scope: FakeCliPathScope = withNoEngineOnPath()
    const desktop = await startInstalledDesktop({ exe: exe! })
    const { page } = desktop
    const tripwire = watchConsole(page)
    const rec = await createFirstDeliveryRecorder(page, 'installed-no-engine')
    let outcome: Record<string, unknown> = { stage: 'started' }
    try {
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await expectBootOverlayGone(page, rec)
      await walkOnboardingToStep5(page, 'Probe Sem IA', rec.shot, rec.notes)
      await runNoEngineFirstDelivery(page, rec)
      outcome = { stage: 'passed' }
      expect(tripwire.pageErrors).toEqual([])
    } catch (error) {
      outcome = { stage: 'FAILED', error: error instanceof Error ? error.message.slice(0, 600) : String(error) }
      await rec.shot('zz-failed')
      throw error
    } finally {
      await rec.write({
        exe, exeIdentity: identity, home: desktop.home, outcome,
        bootOverlay: await readBootOverlay(page).catch(() => 'unreadable'),
        bodyText: await page.locator('body').innerText().then(text => text.replace(/\s+/gu, ' ').slice(0, 700)).catch(() => ''),
        consoleErrors: tripwire.consoleErrors.slice(0, 20),
        pageErrors: tripwire.pageErrors.slice(0, 20),
      })
      await writeFile(join(rec.dir, 'electron.log'), desktop.log().slice(-60_000)).catch(() => {})
      await desktop.stop()
      scope.restore()
    }
  }, 720_000)
})
