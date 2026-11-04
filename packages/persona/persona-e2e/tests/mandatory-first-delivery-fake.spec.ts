/**
 * V1-P0 first delivery — UI end to end on the REAL Persona profile with the FAKE CLI (never spends a model call).
 *
 *  1. happy path: clean home → onboarding 1–5 → "Pedir agora" → "Equipe trabalhando" → milestone → "Aceitar e entrar"
 *     → the runner's delivery is in #geral and the card is done on the board; < 2 min (UX-PHASE A).
 *  2. no engine: same walk with no CLI/key visible → step 5 says "Falta uma IA…" (FR-3), nothing hangs.
 *
 * Opt-in like B9: `PERSONA_E2E=1`. One host boot per scenario (~90 s each). Evidence: `artifacts/first-delivery/<scenario>/`
 * (`proof.json` + screenshots). The real-engine run is `mandatory-first-delivery-real.spec.ts` (Keel's budget, not here).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  FIRST_DELIVERY_PAID_TURNS_CEILING,
  FIRST_DELIVERY_PAID_TURNS_TARGET,
  createFirstDeliveryRecorder,
  acknowledged,
  converseInGeral,
  runHappyFirstDelivery,
  sendGeralMessageAndReload,
  runNoEngineFirstDelivery,
  walkOnboardingToStep5,
  type FirstDeliveryRecorder,
} from '../src/first-delivery-flow.ts'
import { geralComposerLocator } from '../src/geral-composer.ts'
import { shell } from '../src/real-app-locale.pt.ts'
import {
  assertConsoleClean,
  ensureGeralComposer,
  openRealPersonaApp,
  selectSidebarPanel,
  type RealPersonaSession,
} from '../src/real-app-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'
const UX_PHASE_A_MS = 120_000
const FAKE_TURN_MS = 2_500
const REPLY = [
  'Entrega do Probe: resumo da Agência Ponto em 5 pontos.',
  '1. Estúdio de sites e campanhas para PMEs.',
  '2. Cliente atual: Padaria Lua.',
  '3. Objetivo: divulgar o cardápio.',
  '4. Prazo ainda não informado.',
  '5. Tarefa da semana: revisar o texto do cardápio (dona: Coordenação; pronto quando revisado).',
].join('\n')

describe.skipIf(!runPersonaE2e)('first delivery — UI with fake CLI (V1-P0)', () => {
  describe.sequential('happy path: onboarding → delivery → accept', () => {
    let session: RealPersonaSession
    let rec: FirstDeliveryRecorder

    beforeAll(async () => {
      session = await openRealPersonaApp({
        engine: { kind: 'fake', turnMs: FAKE_TURN_MS, reply: REPLY },
        liveRunner: true,
        keepOnboarding: true,
        viewport: { width: 1280, height: 720 },
      })
      rec = await createFirstDeliveryRecorder(session.page, 'happy')
    }, 360_000)

    afterAll(async () => {
      await rec?.write({ stage: 'afterAll' }).catch(() => {})
      await session?.close()
    }, 60_000)

    it('asks on step 5, shows the working state, celebrates once and lands the delivery in #geral', async () => {
      const { page } = session
      await walkOnboardingToStep5(page, 'Probe E2E', rec.shot, rec.notes)
      await rec.shot('05-step5-intro')
      rec.mark('step5 visible')
      const result = await runHappyFirstDelivery(page, rec, { fakeTurnMs: FAKE_TURN_MS, deadlineMs: UX_PHASE_A_MS })
      expect(result.askToCelebrateMs).toBeLessThan(UX_PHASE_A_MS)
    }, UX_PHASE_A_MS + 180_000)

    it('has the runner delivery in #geral', async () => {
      const { page } = session
      await ensureGeralComposer(page)
      await page.getByText('Entrega do Probe: resumo da Agência Ponto em 5 pontos.').first().waitFor({ state: 'visible', timeout: 30_000 })
      expect(await geralComposerLocator(page).first().isVisible()).toBe(true)
      await rec.shot('08-geral-delivery')
      rec.mark('delivery in #geral')
      const calls = session.fakeCli.invocations()
      const turns = calls.filter(call => call.event === 'turn').length
      rec.notes.push(`fake CLI saw ${String(calls.length)} invocation(s), ${String(turns)} answered turn(s)`)
      const firstAt = calls[0]?.at ?? 0
      rec.notes.push(`stub timeline: ${calls.slice(0, 40).map(call => `+${String(Math.round((call.at - firstAt) / 100) / 10)}s ${call.tool} ${call.argv.slice(0, 3).join(' ')}[${call.event}]`).join('; ')}`)
      expect(turns, 'the delivery must come from a real CLI turn, not a scripted reply').toBeGreaterThanOrEqual(1)
    }, 120_000)

    it('costs at most one paid model turn (Keel target; ceiling 3)', () => {
      const turns = session.fakeCli.invocations().filter(call => call.event === 'turn').length
      rec.notes.push(`paid turns seen by the stub: ${String(turns)} (target ${String(FIRST_DELIVERY_PAID_TURNS_TARGET)})`)
      expect(turns, 'safety ceiling').toBeLessThanOrEqual(FIRST_DELIVERY_PAID_TURNS_CEILING)
      expect(turns, 'V1-P0 target: the first delivery is ONE paid turn').toBeLessThanOrEqual(FIRST_DELIVERY_PAID_TURNS_TARGET)
    })

    it('has the card done on the board', async () => {
      const { page } = session
      await selectSidebarPanel(page, shell.kanban)
      await page.locator('[data-persona-surface="boards"]').waitFor({ state: 'visible', timeout: 60_000 })
      await rec.shot('09-quadros')
      rec.mark('board open')
      // A clean home has no projects of its own except the one onboarding made: the client fixtures
      // (`boards/mock-data.ts`: "Contratação — Designer", "Site da agência") must never show in the real app, and the
      // delivered card must be counted as done on the user's board.
      const fixtures = await page.getByText(/Contratação — Designer|Site da agência/u).count()
      expect(fixtures, 'Quadros shows demo fixtures instead of the real project').toBe(0)
      await page.getByText(/(^|\s)1 conclu[ií]d[oa]/iu).first().waitFor({ state: 'visible', timeout: 30_000 })
    }, 120_000)

    it('step 3 lists the engine the host can actually run (cards agree with the engine that delivered)', () => {
      const step3 = rec.notes.filter(note => note.startsWith('step 3')).at(-1) ?? ''
      expect(step3, 'step 3 note recorded').not.toBe('')
      expect(step3, 'Claude is on PATH and answered the delivery, yet its card says it was not detected').not.toMatch(/Claude \| Não detectada/u)
    })

    it('D-079: with the first delivery awaiting review, "obrigado" and "quanto custou isso?" in #geral each get a reaction or a reply', async () => {
      const thanks = await converseInGeral(session.page, rec, 'obrigado')
      expect(thanks.sent, '"obrigado" was sent').toBe(true)
      expect(acknowledged(thanks), '"obrigado": no reaction, no reply and no state line (the message became a continuation and nothing answered)').toBe(true)
      const cost = await converseInGeral(session.page, rec, 'quanto custou isso?')
      expect(cost.sent, '"quanto custou isso?" was sent').toBe(true)
      expect(cost.reply, '"quanto custou isso?" needs a visible answer from the team').not.toBeNull()
    }, 180_000)

    it('typing in #geral + Enter sends the message and it persists after a reload (chat regression)', async () => {
      await sendGeralMessageAndReload(session.page, rec, 'Mensagem do Probe: o composer envia e persiste.')
    }, 240_000)

    it('leaves the console clean and writes proof.json', async () => {
      assertConsoleClean(session.tripwire)
      const file = await rec.write({ stage: 'done', fakeTurnMs: FAKE_TURN_MS, uxPhaseAMs: UX_PHASE_A_MS })
      const proof = JSON.parse(readFileSync(file, 'utf8')) as { marks: Record<string, number> }
      expect(Object.keys(proof.marks)).toEqual(expect.arrayContaining(['asked', 'working visible', 'celebrate visible', 'accepted']))
      expect(file.endsWith(join('first-delivery', 'happy', 'proof.json'))).toBe(true)
    })
  })

  describe.sequential('no engine: "Falta uma IA"', () => {
    let session: RealPersonaSession
    let rec: FirstDeliveryRecorder

    beforeAll(async () => {
      session = await openRealPersonaApp({
        engine: { kind: 'none' },
        liveRunner: true,
        keepOnboarding: true,
        viewport: { width: 1280, height: 720 },
      })
      rec = await createFirstDeliveryRecorder(session.page, 'no-engine')
    }, 360_000)

    afterAll(async () => {
      await rec?.write({ stage: 'afterAll' }).catch(() => {})
      await session?.close()
    }, 60_000)

    it('step 3 does not call any tool ready when none is installed', async () => {
      const { page } = session
      await walkOnboardingToStep5(page, 'Probe Sem IA', rec.shot, rec.notes)
      const step3 = rec.notes.filter(note => note.startsWith('step 3')).at(-1) ?? ''
      expect(step3, 'step 3 note recorded').not.toBe('')
      expect(step3, 'a card says "Pronta para usar" with no CLI visible (detection forces installed=true)').not.toMatch(/Pronta para usar/u)
    }, 240_000)

    it('step 5 says an AI is missing, offers to connect one, and lets the person enter', async () => {
      const { page } = session
      await runNoEngineFirstDelivery(page, rec)
    }, 120_000)

    it('does not hang on "Carregando…" and leaves no page error', async () => {
      const { page } = session
      await ensureGeralComposer(page)
      await rec.shot('07-geral-without-engine')
      expect(session.tripwire.pageErrors).toEqual([])
      await rec.write({ stage: 'done' })
    }, 180_000)
  })
})
