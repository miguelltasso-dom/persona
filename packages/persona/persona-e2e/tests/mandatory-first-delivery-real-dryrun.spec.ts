/**
 * Dress rehearsal of the REAL-run harness (`runRealFirstDelivery` + `readLedgerEvidence`) against the web app with the FAKE CLI:
 * proves the milestone polling, the `[data-message-id]` hooks, the screenshots and the `turn_ledger` read work before one of the
 * three authorized real attempts is spent on a harness bug. Spends nothing. Opt-in `PERSONA_E2E=1`.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createFirstDeliveryRecorder,
  expectBootOverlayGone,
  runRealFirstDelivery,
  walkOnboardingToStep5,
  type FirstDeliveryRecorder,
  type RealDeliveryTimeline,
} from '../src/first-delivery-flow.ts'
import { baselineD085, readLedgerEvidence } from '../src/ledger-evidence.ts'
import { runRealRunVerifier } from '../src/real-run-verifier.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'
const FAKE_TURN_MS = 3_000

describe.skipIf(!runPersonaE2e).sequential('real-run harness rehearsal (fake CLI, web)', () => {
  let session: RealPersonaSession
  let rec: FirstDeliveryRecorder
  let timeline: RealDeliveryTimeline

  beforeAll(async () => {
    session = await openRealPersonaApp({
      engine: { kind: 'fake', turnMs: FAKE_TURN_MS, reply: 'Resumo do ensaio: a equipe entregou em um turno. Próxima tarefa: revisar o cardápio.' },
      liveRunner: true,
      keepOnboarding: true,
      viewport: { width: 1280, height: 720 },
    })
    rec = await createFirstDeliveryRecorder(session.page, 'real-dryrun')
  }, 360_000)

  afterAll(async () => {
    await rec?.write({ stage: 'afterAll', timeline: timeline ?? null }).catch(() => {})
    await session?.close()
  }, 60_000)

  it('records Muse\'s milestones in order and ends on an accepted delivery', async () => {
    await expectBootOverlayGone(session.page, rec).catch(() => {})
    await walkOnboardingToStep5(session.page, 'Probe Ensaio', rec.shot, rec.notes)
    timeline = await runRealFirstDelivery(session.page, rec, { deadlineMs: 120_000 })
    expect(timeline.outcome).toBe('delivered')
    expect(timeline.working, 'working milestone').toBeTypeOf('number')
    expect(timeline.acceptVisible, 'accept visible milestone').toBeTypeOf('number')
    expect(timeline.t1, 't1').toBeTypeOf('number')
    expect(timeline.t2, 't2').toBeTypeOf('number')
    expect(timeline.t0).toBeLessThan(timeline.working!)
    expect(timeline.working!).toBeLessThanOrEqual(timeline.t1!)
    expect(timeline.t1!).toBeLessThanOrEqual(timeline.t2!)
    expect(timeline.t1! - timeline.t0, 'the fake turn must show in t1 − t0').toBeGreaterThanOrEqual(FAKE_TURN_MS - 500)
    rec.notes.push(`timeline ${JSON.stringify(timeline)}`)
    expect(timeline.messageIds.some(row => row.id.endsWith('-done')), 'the delivery message (…-done) was seen in #geral').toBe(true)
    expect(timeline.geralPersonaMessage, 'persona message milestone').toBeTypeOf('number')
    for (const shot of ['m0-t0', 'm1-working', 'm6-accept-visible', 'm7-after-accept']) {
      expect(existsSync(join(rec.dir, `${shot}.png`)), `${shot}.png`).toBe(true)
    }
  }, 300_000)

  it('Forge\'s verifyRealFirstDeliveryRun accepts the rehearsal: canonical ledger, attempt history, observation from the database copy', () => {
    const ledger = readLedgerEvidence(session.host.home)
    expect(ledger).toBeDefined()
    const verdict = runRealRunVerifier({
      home: session.host.home,
      dir: rec.dir,
      ledger: ledger ?? null,
      attempts: [{ paidTurns: ledger?.turns ?? null }],
      currentAttempt: 1,
      elapsedMs: timeline.t1! - timeline.t0,
      maxElapsedMs: 600_000, // the rehearsal runs on a loaded machine with a fake turn: only the budget/ledger/observation logic is under test
    })
    rec.notes.push(`verifier: ${JSON.stringify({ passed: verdict.passed, failed: verdict.failed })}`)
    expect(verdict.failed).toEqual([])
    expect(verdict.passed).toBe(true)
  })

  it('reads the turn ledger of the host home without touching it (one paid turn, measured)', () => {
    const ledger = readLedgerEvidence(session.host.home)
    expect(ledger, 'turn_ledger readable from <home>/db/persona.db').toBeDefined()
    rec.notes.push(`ledger ${JSON.stringify({ turns: ledger!.turns, kinds: ledger!.rows.map(row => row.kind), allMeasured: ledger!.allMeasured, in: ledger!.inputTokens, out: ledger!.outputTokens })}`)
    expect(ledger!.turns, 'paid turns for the first delivery').toBeGreaterThanOrEqual(1)
    expect(ledger!.turns).toBeLessThanOrEqual(1)
    expect(ledger!.allMeasured).toBe(true)
    expect(ledger!.outputTokens).toBeGreaterThan(0)
    // D-085: the proof's baseline block is usable on a fully measured ledger (native mode declared; fail closed otherwise).
    const baseline = baselineD085(ledger!)
    rec.notes.push(`baseline D-085 ${JSON.stringify({ valid: baseline.valid, mode: baseline.mode, in: baseline.inputTokens, out: baseline.outputTokens, cacheRead: baseline.cacheReadTokens, cacheWrite: baseline.cacheWriteTokens, tools: baseline.layers.tools })}`)
    expect(baseline).toMatchObject({ id: 'D-085', mode: 'native', valid: true, reason: null })
  })
})
