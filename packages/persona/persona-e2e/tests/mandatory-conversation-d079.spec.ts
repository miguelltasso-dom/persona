/**
 * D-079 (Atlas, 04/11) — INVARIANT: every message the person sends gets a reply, a reaction or a visible state line; NEVER silence.
 * A message only becomes a CONTINUATION of the Task when the Task is RUNNING and the message is on the SAME subject, or when it answers a
 * QUESTION the persona asked in that thread (persona-spec/contracts/conversation.md). Found by Bolt: with a Task open in #geral (the first
 * delivery awaiting review) the next conversational message vanished. Real `persona` profile, fake CLI (no model call), one host, the
 * scenarios in order (shared with the INSTALLED fake run through `src/conversation-d079.ts`):
 *
 *   setup  the first delivery is delivered and accepted: a Task is open in #geral (the channel still has NO team)
 *   (a0)   a channel WITHOUT a team: the honest line "Ainda não há ninguém na equipe para responder…" (v1.1; the H2 exe was mute here)
 *   hire   the suggested team is hired through the structure assistant (Gauge's helper): the channel now has personas
 *   (a)    ANOTHER subject ("obrigado", "quanto custou isso?"): reaction / reply / state line; the question needs a REPLY
 *   (b)    the persona asks a question and the person's answer CONTINUES that Task (a 2nd model turn runs, the final report shows up)
 *   (c)    SAME subject while the Task is running becomes a visible continuation ("Passei para …")
 *   (d)    no message sent in (a)–(c) was left without a return
 *
 * Opt-in `PERSONA_E2E=1` (one host boot, ~2–3 min). Evidence: `artifacts/first-delivery/d079/` (`proof.json` + a shot per message).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  D079_FAKE_TURN_MS,
  D079_FIRST_DELIVERY_REPLY,
  D079_RULES,
  d079StepA,
  d079StepNoTeam,
  d079StepC,
  d079StepD,
  type D079Context,
} from '../src/conversation-d079.ts'
import {
  createFirstDeliveryRecorder,
  runHappyFirstDelivery,
  walkOnboardingToStep5,
  type ConversationOutcome,
  type FirstDeliveryRecorder,
} from '../src/first-delivery-flow.ts'
import { hireSuggestedTeam, railTeamCount } from '../src/gauge-app.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'
import { readRecentEvents } from '../src/team-transcript.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

describe.skipIf(!runPersonaE2e).sequential('D-079 — conversation with a Task open in #geral (fake CLI)', () => {
  let session: RealPersonaSession
  let rec: FirstDeliveryRecorder
  const outcomes: ConversationOutcome[] = []
  const context = (): D079Context => ({
    page: session.page,
    rec,
    outcomes,
    turns: () => session.fakeCli.invocations().filter(call => call.event === 'turn').length,
  })

  beforeAll(async () => {
    session = await openRealPersonaApp({
      engine: { kind: 'fake', turnMs: D079_FAKE_TURN_MS, rules: D079_RULES, reply: D079_FIRST_DELIVERY_REPLY },
      liveRunner: true,
      keepOnboarding: true,
      viewport: { width: 1280, height: 720 },
    })
    rec = await createFirstDeliveryRecorder(session.page, 'd079')
  }, 360_000)

  afterAll(async () => {
    // What the host stored (every event incl. the internal coord-… lines) and the stub's calls: so a step that went mute can be read in the proof.
    const calls = session?.fakeCli.invocations() ?? []
    await rec?.write({
      stage: 'afterAll', outcomes,
      recentEvents: session === undefined ? [] : readRecentEvents(session.host.home, 80),
      fakeCliTurns: calls.filter(call => call.event === 'turn').length,
      fakeCliCalls: calls.filter(call => call.event === 'turn').map(call => `${call.tool} ${call.argv.slice(0, 3).join(' ')}`),
    }).catch(() => {})
    await session?.close()
  }, 60_000)

  it('setup: the first delivery is delivered and accepted — a Task is open in #geral', async () => {
    await walkOnboardingToStep5(session.page, 'Probe D079', rec.shot, rec.notes)
    const result = await runHappyFirstDelivery(session.page, rec, { fakeTurnMs: D079_FAKE_TURN_MS, deadlineMs: 180_000 })
    expect(result.askToCelebrateMs).toBeGreaterThan(0)
  }, 360_000)

  it('(a0) a channel WITHOUT a team: the person gets the honest line "Ainda não há ninguém na equipe para responder…", never silence (v1.1)', async () => {
    await d079StepNoTeam(context())
  }, 120_000)

  it('hire the suggested team: from here the channel HAS personas (coordination + workers)', async () => {
    await hireSuggestedTeam(session.page)
    expect(await railTeamCount(session.page)).toBeGreaterThanOrEqual(3)
  }, 240_000)

  it('(a) another subject: "obrigado" and "quanto custou isso?" are each acknowledged — never silence', async () => {
    await d079StepA(context())
  }, 240_000)

  // (b) needs the worker to ask THROUGH A HOST TOOL (HT-0): the OAR adapter does not read a question out of the reply text (measured 05/11), so a CLI stub cannot ask.
  // Proven at the host by Bolt's conversation-d079.spec.ts (scripted worker reports); here it waits for a stub that can call the tool.
  it.todo('(b) the persona asks a question (host tool) and the person\'s answer CONTINUES that Task — web, once the stub can call the host\'s ask tool')

  it('(c) a message on the SAME subject while the Task is running becomes a visible continuation', async () => {
    await d079StepC(context())
  }, 240_000)

  it('(d) no message sent in (a)–(c) was left without a return', () => {
    d079StepD(context())
  })
})
