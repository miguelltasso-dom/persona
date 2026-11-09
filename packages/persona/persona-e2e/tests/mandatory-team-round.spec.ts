/**
 * TEAM-10 — the short REAL round of the team on the TREE host through the web harness (D-090 acceptance b; Atlas 05/11 03:03 via Keel), and its FAKE rehearsal.
 *
 *   FAKE (0 AI, stubs):  PERSONA_E2E=1 PERSONA_TEAM10=fake  → same driver, same configuration (clean env, production defaults, 3 personas, the poster, one request).
 *                        Writes `artifacts/team10/fake-proof.json` (green + commit + fingerprint of what the round runs): the REAL round refuses to start without it.
 *   REAL (paid):         PERSONA_REAL_E2E=1 PERSONA_REAL_E2E_OK=TEAM-10 [PERSONA_REAL_E2E_DIAGNOSED=…]  under  `node scripts/persona/with-lock.mjs "Probe real" --lock real …`
 *                        Refuses unless `evaluateTreeRoundGate` allows: Atlas's file (Teto de turnos 14, Total máximo 25), the budget of attempts, the fake proof of THIS
 *                        configuration, the default isolation (answer-only) and a clean environment. The app limiter gets the cap of the attempt (`PERSONA_REAL_TURN_CAP`)
 *                        and a fresh absolute ledger; the harness watchdog kills the host above the cap or at a native-weight turn.
 * Verdict: `evaluateTeamRound` over the database (never the screen alone). Evidence: `artifacts/team10/<run>/` (proof.json, transcript.md, reading-transcript.md, shots, evidence/persona.db).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanChildEnv } from '../src/clean-env.ts'
import { fakeRunnerSignature } from '../src/ledger-evidence.ts'
import { ARTIFACTS_DIR, REPO_ROOT } from '../src/paths.ts'
import { ART_FILE, ATTACHMENT_NAME, CAST, DELIVERY_END, PreflightRefusal, runTeamRound, type TeamRoundResult } from '../src/team-round-driver.ts'
import { ledgerWarnings } from '../src/team-round-guard.ts'
import { describeBehaviors } from '../src/team-round-verdict.ts'
import { gitCommit, libHash, manifestChanges, treeFingerprint, treeManifest, type TreeManifest } from '../src/tree-fingerprint.ts'
import { assessTeam10Attempts, authorizationFileName, nextAttemptNumber, type Team10Attempt } from '../src/team-round-budget.ts'
import { evaluateTreeRoundGate, fakeConfigProblem } from '../src/team-round-tree-gate.ts'
import { readTurnLedgerFile } from '../src/turn-cap.ts'

const TEAM10_DIR = join(ARTIFACTS_DIR, 'team10')
const ATTEMPTS_FILE = join(TEAM10_DIR, 'real-attempts.json')
const FAKE_PROOF = join(TEAM10_DIR, 'fake-proof.json')
const stamp = (): string => new Date().toISOString().replace(/[:.]/gu, '-')
/** What the round runs, as it was when this run started (before the host boots): compared with the end of the run. */
const MANIFEST_AT_LOAD: TreeManifest | undefined = process.env.PERSONA_TEAM10 === 'fake' || process.env.PERSONA_REAL_E2E === '1' ? treeManifest() : undefined
const FINGERPRINT_AT_LOAD = MANIFEST_AT_LOAD === undefined ? '' : treeFingerprint(MANIFEST_AT_LOAD)
/**
 * Which client bundle the round ran on, and how it relates to the next one (Keel 07/11 14:27): the harness serves the built LIB, never the client `src`, so saves in client `src`
 * do not touch the proof. Lib 6 (Quill, 14:21) is the release CANDIDATE the real round runs on; lib 6b comes AFTER the round and only changes the Settings and chat screens
 * (EFF-1 in the engines' own levels, the popover at 200%, the singular "Até 1 rodada").
 */
const LIB_NOTE = 'client lib = the candidate (bundle 6); lib 6b (after this round) = lib 6 + EFF-1 native effort levels / popover at 200% / singular roundsCap — a diff only in Settings and chat screens'
/** Who moved the tree while a round ran (the files that differ from the start of the run), so a refused proof names the saver instead of just saying "it changed". */
function treeMovedSince(): { fingerprint: string; moved: ReturnType<typeof manifestChanges> | undefined } {
  const manifest = treeManifest()
  return { fingerprint: treeFingerprint(manifest), moved: MANIFEST_AT_LOAD === undefined ? undefined : manifestChanges(MANIFEST_AT_LOAD, manifest) }
}

function readJson(file: string): unknown {
  if (!existsSync(file)) return undefined
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return 'unreadable' }
}

function summarize(result: TeamRoundResult): Record<string, unknown> {
  const ledger = result.ledger
  return {
    engine: result.engine, elapsedMs: result.elapsedMs, aborted: result.aborted ?? null, timedOut: result.timedOut,
    preflight: result.preflight, requestId: result.requestId, attachmentId: result.attachmentId,
    ledger: ledger === undefined ? null : {
      turns: ledger.turns, inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens, cacheReadTokens: ledger.cacheReadTokens, cacheWriteTokens: ledger.cacheWriteTokens,
      allMeasured: ledger.allMeasured, warnings: ledgerWarnings(ledger, { requireEnvMode: result.engine === 'real' }), rows: ledger.rows.map(row => ({ kind: row.kind, engine: row.engine, origin: row.origin, envMode: row.envMode, input: row.inputTokens, output: row.outputTokens, cacheRead: row.cacheReadTokens, cacheWrite: row.cacheWriteTokens, at: row.at })),
    },
    fakeSignature: fakeRunnerSignature(ledger ?? null),
    verdict: result.verdict ?? null,
    // Keel 07/11: WHICH of the six behaviors happened and by which road (the host's plan or the model's choice), so a pass on "split + sealed review" is not read as "the model chose to collaborate".
    behaviorsVia: result.transcript === undefined ? null : describeBehaviors(result.transcript, result.morningBrief),
    threadLines: result.threadLines, reading: { shown: result.reading.shown, hidden: result.reading.hidden },
    stubImageTurns: result.stubImageTurns ?? null, stubRequestTurns: result.stubRequestTurns ?? null, stubProof: result.stubProof ?? null, draftProof: result.draftProof ?? null, answeredAsks: result.answeredAsks, askStopped: result.askStopped ?? null,
    asks: result.transcript?.asks ?? null, quota: result.quota, morningBrief: result.morningBrief ?? null, diagnostics: result.diagnostics ?? null, hostSoftLines: result.hostSoftLines, shots: result.shots,
    notes: result.transcript === undefined ? null : { count: result.transcript.notes.length, notes: result.transcript.notes },
    reviews: result.transcript === undefined ? null : result.transcript.reviews,
  }
}

describe('TEAM-10 ensaio com o fake — mesma configuração da rodada real (0 IA)', () => {
  it.skipIf(process.env.PERSONA_E2E !== '1' || process.env.PERSONA_TEAM10 !== 'fake')('3 personas, o cartaz anexado, UM pedido: preflight, imagem até a CLI, transcrito de leitura, veredito calculado — e a prova do fake gravada', async () => {
    mkdirSync(TEAM10_DIR, { recursive: true })
    const run = `fake-${stamp()}`
    const outDir = join(TEAM10_DIR, run)
    const result = await runTeamRound({ engine: 'fake', outDir, home: join(TEAM10_DIR, 'homes', run), cap: 14, deadlineMs: 8 * 60_000, quietMs: 30_000 })
    writeFileSync(join(outDir, 'proof.json'), JSON.stringify(summarize(result), null, 2))

    const problems: string[] = []
    if (!result.preflight.flagsOn) problems.push('the host boot line does not show the four switches ON with defaults=production')
    if ([...result.preflight.personas].sort().join(',') !== CAST.map(member => member.name).sort().join(',')) problems.push(`personas seeded: ${result.preflight.personas.join(', ')}`)
    if (result.aborted !== undefined) problems.push(`watchdog: ${result.aborted}`)
    if (result.timedOut) problems.push('the round did not settle within the deadline')
    if (result.ledger === undefined || result.ledger.turns < 1) problems.push('no turn reached the ledger: the request never made a persona work')
    if (result.ledger !== undefined && result.ledger.turns > 14) problems.push(`${String(result.ledger.turns)} turns on the fake: above the cap the real round would have`)
    if (result.threadLines < 2) problems.push(`the thread has ${String(result.threadLines)} line(s): the request and at least one answer were expected`)
    if (result.stubImageTurns === undefined || result.stubImageTurns < 1) problems.push('the poster never reached the CLI (no stub turn carried an image block or the file name)')
    // Root cause of attempt 1 (real): the worker got the request CUT at the title and never saw the rest. At least one worker turn must have received the request WHOLE.
    if (result.stubRequestTurns === undefined || result.stubRequestTurns < 1) problems.push('no worker turn received the WHOLE text of the request (the prompt carried a cut title, the failure of the first real attempt)')
    // Bolt 07/11: on the real CLI the review of a Task received the placeholder "turn ended" instead of the author's text (the OAR adapter closes a turn without a report tool that way). The
    // stub goes through the same adapter, so a review that could not read the author's work is a defect in the tree this rehearsal covers (the fix is Bolt's, in orchestration.ts).
    const unreadableReviews = (result.transcript?.reviews ?? []).filter(review => review.failure === 'unreadable')
    if (unreadableReviews.length > 0) problems.push(`a peer review could not read the author's work (the placeholder "turn ended" reached the reviewer instead of the text): ${unreadableReviews.map(review => `${review.author} → ${review.reviewer}`).join(', ')}`)
    // The split by function (Bolt 07/11): "Preciso do texto e da arte" makes the Coordination divide the request, one Task per part. Each part must SEE the request's image — the first
    // fake on lib 6 found the children lost it (`stubImageTurns` 0) — and its assignment must cite the attachment ("Anexos do pedido: foto.png").
    const splitTasks = result.transcript?.splitTasks ?? 0
    if (splitTasks > 0) {
      if ((result.stubImageTurns ?? 0) < splitTasks) problems.push(`${String(splitTasks)} Task(s) were created by the split by function but only ${String(result.stubImageTurns ?? 0)} stub turn(s) received the poster: every part must see the request's image`)
      const uncited = (result.transcript?.splitAssignments ?? []).filter(text => !text.includes('Anexos do pedido') || !text.includes(ATTACHMENT_NAME))
      if (uncited.length > 0) problems.push(`the assignment of ${String(uncited.length)} split Task(s) does not cite "Anexos do pedido: ${ATTACHMENT_NAME}"`)
    }
    // P0 of the real round of 07/11 (Atlas): the review note lost the delivery — the reviewer got the first 290 characters ("o bilhete foi cortado logo após a menção ao SVG"). The stub's
    // parts answer with a long delivery that ends in DELIVERY_END, so a reviewer's Task must carry it. Recorded in the proof always; it FAILS the rehearsal when
    // `PERSONA_TEAM10_FULL_NOTE=1` (turned on for the next real attempt, once Tally/Bolt deliver the fix).
    const reviewTexts = result.transcript?.reviewAssignments ?? []
    const promptsWhole = result.reviewPromptsWhole
    // Bolt 07/11: the whole delivery is in the PROMPT of the reviewer's turn (`<entrega>` block), not in the card note — that is what the stub saw.
    const wholeDelivery = promptsWhole !== undefined ? promptsWhole.turns > 0 && promptsWhole.whole === promptsWhole.turns : reviewTexts.length > 0 && reviewTexts.every(text => text.includes(DELIVERY_END))
    if (process.env.PERSONA_TEAM10_FULL_NOTE === '1' && !wholeDelivery) problems.push(`the reviewer's Task does not carry the WHOLE delivery (${String(reviewTexts.filter(text => !text.includes(DELIVERY_END)).length)} of ${String(reviewTexts.length)} review Task(s) miss its last words "${DELIVERY_END}"): the review note is clipped`)
    // Attempt 4 (Atlas D-099, conditions 2): the art is a FILE in the Task's DRAFT of a project WITH a folder — never in the real folder before Apply — and the persona was started in the
    // writing mode of the contract (Tally P0-1): acceptEdits + the file tools, cwd = the draft.
    const draft = result.draftProof
    if (draft === undefined) problems.push('no draft proof was collected')
    else {
      // Only the ART part writes the art (Atlas 07/11, P0-1: the stub no longer writes it in every turn); who ELSE holds it is the shared-files rule below, not a count of the writers.
      const withArt = draft.drafts.filter(item => item.artBytes > 0)
      if (withArt.length < 1) problems.push(`no draft holds the art file "${ART_FILE}" (non-empty): the art part did not save it: ${JSON.stringify(draft.drafts)}`)
      if (draft.realFolderFiles.some(name => name === ART_FILE)) problems.push('the art file is already in the REAL folder before Apply/Revisar')
      if (!draft.writerArgvs.some(argv => /--permission-mode\s+acceptEdits/u.test(argv) && /--tools\s+\S*Write/u.test(argv))) problems.push(`no turn started with "--permission-mode acceptEdits" and the Write tool (argv: ${draft.writerArgvs.join(' | ') || 'none'})`)
      if (!draft.turnCwds.some(cwd => draft.drafts.some(item => item.directory === cwd))) problems.push(`no turn ran inside a Task draft directory (cwds: ${draft.turnCwds.join(' | ')})`)
    }
    // The three P0 of the real round of 07/11 (Atlas read attempt 4 and held the delivery; Keel 09/11). RED on a tree that still has them, green when Bolt (P0-1) and Tally (P0-2/P0-3) close:
    //   P0-1 shared files  — the drafts on disk (the request's attachment in every receiving Task, the bilhete's files in the colleague's draft, the reviewer holds what the author saved, every
    //                        file a Task is told about exists where it works) + the stub's own look at its working directory when each turn started + no file recreated for a missing copy;
    //   P0-2 narration     — nothing of what the model says between tool calls in the thread, bilhete, review or opinion ("Vou começar…", "Nenhum arquivo…", "contém.Nenhum");
    //   P0-3 jargon / PNG  — no "ferramenta de shell", nobody asks anybody to export a PNG, and the persona is TOLD the app makes the PNG of an SVG by itself.
    const p0Problems = (result.verdict?.harnessProblems ?? []).filter(problem => /^P0-/u.test(problem))
    problems.push(...p0Problems, ...(result.stubProof?.problems ?? []))
    if (result.stubProof === undefined) problems.push('the stub proof (P0-1 cwd look, tool calls, tool catalog) was not collected')
    // The opinion of the team (behavior 4) must be exercised: the request asks for it in plain words and the rehearsal must show the round.
    // (Keel 17:24) a stub cannot call ask_team_opinion (a tool of the model): behavior 4 is proven by Forge's dry with the REAL CLI + a fake endpoint on this same fingerprint, recorded in the proof, not here.
    // Behavior 5 of D-097 (Keel 07/11): the peer review runs to its SEAL ("Revisado por"). The stub answers the reviewer's Task with the first-line verdict the host reads in words, so a
    // fake with no review, or a review that did not seal, means the review pipeline is broken in this tree (the real round would only waste a turn of the reviewer on it).
    const behaviors = result.verdict?.behaviors
    if (behaviors !== undefined && behaviors.reviews < 1) problems.push('no peer review happened in the thread (behavior 5): the review pipeline did not start')
    else if (behaviors !== undefined && behaviors.seals < 1) problems.push(`the peer review did not seal the work ("Revisado por"; ${JSON.stringify(result.transcript?.reviews ?? [])}): the stub reviewer answered APROVADO`)
    // The reader must NOT call the question card of the team a leak (attempt 2 of the real round did): the marker at the end of a body is stripped by the screen.
    const askLeaks = (result.transcript?.leaks ?? []).filter(leak => /raw internal marker/u.test(leak) && (result.transcript?.asks ?? []).some(ask => leak.startsWith(`${ask.id}:`)))
    if (askLeaks.length > 0) problems.push(`the reader flagged a question card as a leak: ${askLeaks.join('; ')}`)
    if (result.reading.shown < 2) problems.push(`the reading transcript shows ${String(result.reading.shown)} line(s)`)
    if (result.transcript === undefined) problems.push('the transcript could not be read from the database')
    else if (!result.transcript.lines.some(line => line.attachments.some(name => /\.png$/iu.test(name)))) problems.push('no visible line carries the poster as an attachment')
    if (result.verdict === undefined) problems.push('no verdict could be computed')
    // Anvil's fail-soft lines: `subject-fold: forbidden` is the HANDLED case (a forbidden read adds no context — not a defect, only recorded); `boot-project:` and `compile-context:` are
    // real failures the host survived, so the rehearsal is not clean. The host also writes them (once per kind) to its stderr as `[persona-host] soft …`.
    const softFailures = [...(result.diagnostics?.lastErrors ?? []), ...(result.hostSoftLines ?? [])].filter(line => /^(?:soft )?(?:compile-context|boot-project)\b/u.test(line.replace(/^\[persona-host\]\s*/u, '')))
    if (result.diagnostics === undefined) problems.push('exportDiagnostics could not be read')
    else if (softFailures.length > 0) problems.push(`the host reported soft failures: ${softFailures.join(' | ')}`)
    if (result.morningBrief === undefined) problems.push('the "Bom dia agora" step did not run')
    else {
      if (result.morningBrief.turnsBefore < 0 || result.morningBrief.turnsAfter < 0) problems.push('the ledger could not be read around the morning card: its cost is unproven')
      else if (result.morningBrief.turnsAfter !== result.morningBrief.turnsBefore) problems.push(`asking for the morning card booked ${String(result.morningBrief.turnsAfter - result.morningBrief.turnsBefore)} model turn(s): it must cost none`)
      const outcomes = [result.morningBrief.day, result.morningBrief.forRequest].map(answer => String((answer as { outcome?: unknown } | null)?.outcome ?? 'none'))
      if (outcomes.some(outcome => ['error', 'none', 'off', 'no-coordination', 'no-channel'].includes(outcome))) problems.push(`postDailyBriefNow answered ${outcomes.join(' / ')}`)
      // Bolt (07/11): nothing changed between the two asks, so the 2nd answers "already" with the id of the card that is already in the thread — never a 2nd "Bom dia" card.
      if (outcomes[0] === 'posted' && outcomes[1] === 'posted') problems.push('asking for the morning card a 2nd time posted ANOTHER card: it must answer "already" when no fact changed')
    }

    // The proof is about the code that RAN: if anything the round runs was saved while it ran, the fingerprint at the end describes something else.
    const { fingerprint: fingerprintAtEnd, moved } = treeMovedSince()
    if (fingerprintAtEnd !== FINGERPRINT_AT_LOAD) {
      const names = [...(moved?.changed ?? []), ...(moved?.added ?? []).map(path => `+${path}`), ...(moved?.removed ?? []).map(path => `-${path}`)]
      problems.push(`the tree changed while the rehearsal ran (${String(moved?.total ?? '?')} file(s): ${names.join(', ')}): this run proves nothing about the final code; run it again`)
    }
    const green = problems.length === 0
    writeFileSync(FAKE_PROOF, JSON.stringify({
      engine: 'fake', green, at: new Date().toISOString(), commit: gitCommit(), fingerprint: fingerprintAtEnd, fingerprintAtStart: FINGERPRINT_AT_LOAD, treeMoved: moved ?? null, lib: libHash(), libNote: LIB_NOTE, personas: result.preflight.personas.length,
      run, problems, hostFlags: result.preflight.hostFlags ?? null, turns: result.ledger?.turns ?? null, stubImageTurns: result.stubImageTurns ?? null, stubRequestTurns: result.stubRequestTurns ?? null,
      note: 'the verdict of a fake round is expected to REJECT (scripted answers, no real handoffs); what is proven is the plumbing: preflight, seeding, image, ledger, transcript',
      verdictOnFake: result.verdict?.problems ?? null, behaviorsOnFake: result.verdict?.behaviors ?? null, reviewsOnFake: result.transcript?.reviews ?? null,
      draftProof: result.draftProof ?? null, fullDeliveryInReview: wholeDelivery, reviewTasks: reviewTexts.length, fullNoteRequired: process.env.PERSONA_TEAM10_FULL_NOTE === '1',
      p0: { problems: [...p0Problems, ...(result.stubProof?.problems ?? [])], stub: result.stubProof ?? null, textRules: 'src/team-p0-rules.ts', filesRules: 'src/team-draft-checks.ts' },
    }, null, 2))
    expect(problems, `see ${outDir}`).toEqual([])
  }, 12 * 60_000)
})

const attemptsRaw = readJson(ATTEMPTS_FILE)
// Each attempt after the 2nd needs ITS OWN written OK from Atlas (`atlas-ok-team10-3.txt`, naming "TENTATIVA 3"): the file read is the one of the attempt this round would be, so an
// old OK never covers a new attempt and no constant in code grants one.
const AUTHORIZATION_FILE = join(REPO_ROOT, '.maestri', 'tmp', authorizationFileName(nextAttemptNumber(assessTeam10Attempts(attemptsRaw).attempts)))
const authorization = existsSync(AUTHORIZATION_FILE) ? readFileSync(AUTHORIZATION_FILE, 'utf8') : undefined
const clean = cleanChildEnv(process.env)
const realRequested = process.env.PERSONA_REAL_E2E === '1'
const gate = realRequested
  ? evaluateTreeRoundGate({
    env: clean,
    authorization,
    attemptsRaw,
    fakeGreenProblem: fakeConfigProblem(readJson(FAKE_PROOF), { commit: gitCommit(), fingerprint: treeFingerprint(), personas: CAST.length }),
  })
  : undefined

describe('TEAM-10 rodada REAL no host da árvore (gated: gasta cota)', () => {
  it.skipIf(gate?.allowed === true)('is gated: refuses to run without Atlas\'s file, the budget, the fake proof of THIS configuration, answer-only and a clean environment', () => {
    expect(gate === undefined ? ['PERSONA_REAL_E2E=1 is not set'] : gate.problems, 'gate message').not.toEqual([])
  })

  it.skipIf(gate?.allowed !== true)('one request with the poster to 3 haiku personas: handoff with bilhete, help, opinion about the image, review — within the cap, verdict by evaluateTeamRound', async () => {
    const plan = gate!.plan!
    const attempts: Team10Attempt[] = [...assessTeam10Attempts(attemptsRaw).attempts]
    const run = `real-attempt-${String(plan.attemptNumber)}-${stamp()}`
    const outDir = join(TEAM10_DIR, run)
    const ledgerDir = join(TEAM10_DIR, 'real-turn-ledger')
    mkdirSync(ledgerDir, { recursive: true })
    const ledgerFile = join(ledgerDir, `attempt-${String(plan.attemptNumber)}-${stamp()}.ledger`) // absolute and FRESH: never reused
    const attempt: Team10Attempt = { at: new Date().toISOString(), cap: plan.cap, paidTurns: null, outcome: 'started', ledgerFile }
    attempts.push(attempt)
    writeFileSync(ATTEMPTS_FILE, `${JSON.stringify(attempts, null, 2)}\n`) // charged before anything can be spent: a crash still counts the whole cap
    // Where the readers (Tally: cost + quota; Forge: the observer) find THIS round: written the moment it starts, read-only for them.
    const home = join(TEAM10_DIR, 'homes', run)
    writeFileSync(join(REPO_ROOT, '.maestri', 'tmp', 'probe-team10-run.json'), `${JSON.stringify({ run, home, outDir, startedAt: attempt.at, attempt: plan.attemptNumber, cap: plan.cap, ledgerFile, engine: 'real' }, null, 2)}\n`)

    let result: TeamRoundResult | undefined
    let failure: unknown
    try {
      result = await runTeamRound({ engine: 'real', outDir, home, cap: plan.cap, ledgerFile, deadlineMs: 20 * 60_000, quietMs: 150_000 })
    } catch (error) {
      failure = error
    }
    const capLedger = readTurnLedgerFile(ledgerFile)
    attempt.paidTurns = result?.ledger?.turns ?? (capLedger.valid && capLedger.turns !== null ? capLedger.turns : null)
    const passed = result?.verdict?.passed === true && result.aborted === undefined && !result.timedOut
    // A preflight refusal happens BEFORE the request is posted: nothing was asked of the model. It is recorded (so the budget file tells the whole story) but spends no attempt —
    // and only when the limiter's ledger confirms zero turns.
    const refused = failure instanceof PreflightRefusal && capLedger.valid && capLedger.turns === 0
    attempt.outcome = refused ? 'refused' : passed ? 'passed' : result?.aborted !== undefined ? 'overbudget' : result?.verdict === undefined ? 'unverified' : 'failed'
    writeFileSync(ATTEMPTS_FILE, `${JSON.stringify(attempts, null, 2)}\n`)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'proof.json'), JSON.stringify({
      attempt: plan.attemptNumber, cap: plan.cap, spentBefore: plan.spentSoFar, outcome: attempt.outcome, commit: gitCommit(), fingerprint: treeMovedSince().fingerprint, fingerprintAtStart: FINGERPRINT_AT_LOAD, treeChangedDuringRound: treeMovedSince().fingerprint !== FINGERPRINT_AT_LOAD, treeMoved: treeMovedSince().moved ?? null, lib: libHash(), libNote: LIB_NOTE,
      authorization: authorization?.slice(0, 600) ?? null, diagnosed: process.env.PERSONA_REAL_E2E_DIAGNOSED ?? null,
      limiterLedger: { file: ledgerFile, valid: capLedger.valid, turns: capLedger.turns, error: capLedger.error ?? null, raw: capLedger.raw.slice(0, 2_000) },
      failure: failure === undefined ? null : (failure instanceof Error ? failure.message.slice(0, 600) : String(failure)),
      ...(result === undefined ? {} : summarize(result)),
      costNote: 'tokens are exact (turn_ledger, measured); quota windows are what the host knew before/after; no price table in the repository',
    }, null, 2))
    if (failure !== undefined) throw failure
    expect(result!.aborted, 'watchdog').toBeUndefined()
    expect(result!.morningBrief?.turnsBefore ?? -1, 'the ledger was readable around the morning card').toBeGreaterThanOrEqual(0)
    expect(result!.morningBrief?.turnsAfter, 'the morning card booked no model turn').toBe(result!.morningBrief?.turnsBefore)
    expect(result!.verdict?.problems ?? ['no verdict'], `see ${outDir}`).toEqual([])
  }, 30 * 60_000)
})
