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
  runHappyFirstDelivery,
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
      // A finished first delivery shows up under a "Concluído" column/heading of the board.
      await page.getByText(/Conclu[ií]d[oa]s?/u).first().waitFor({ state: 'visible', timeout: 30_000 })
    }, 120_000)

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

    it('step 5 says an AI is missing, offers to connect one, and lets the person enter', async () => {
      const { page } = session
      await walkOnboardingToStep5(page, 'Probe Sem IA', rec.shot, rec.notes)
      await runNoEngineFirstDelivery(page, rec)
    }, 240_000)

    it('does not hang on "Carregando…" and leaves no page error', async () => {
      const { page } = session
      await ensureGeralComposer(page)
      await rec.shot('07-geral-without-engine')
      expect(session.tripwire.pageErrors).toEqual([])
      await rec.write({ stage: 'done' })
    }, 180_000)
  })
})
