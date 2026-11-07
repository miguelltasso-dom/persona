/**
 * V1-P0-5 / V1-P0-6 — THE real-engine acceptance (Atlas D-069): clean profile in the INSTALLED Persona.exe → onboarding → ask →
 * one real model turn on the user's own logged-in CLI → delivery in #geral → the card done on Quadros → accept, in under 2 minutes.
 *
 * It spends the user's quota, so it refuses to run unless ALL of this holds:
 *   - `PERSONA_REAL_E2E=1` and `PERSONA_REAL_E2E_OK=D-069` (+ the authorization text `.maestri/tmp/atlas-ok-real-run.txt` exists);
 *   - `PERSONA_INSTALLED_EXE=<Persona.exe>` and `PERSONA_NSIS_COMMIT=<hash of the NSIS candidate>`;
 *   - the fake-CLI happy path went GREEN on this very exe (same sha256: `installed-happy/proof.json`);
 *   - no fake CLI is configured in the environment;
 *   - the BUDGET allows it: at most 3 paid turns in TOTAL (every earlier attempt counts what its ledger booked, or 1 when it
 *     could not be read), at most 3 attempts, stop at the first green, and from the 2nd attempt on
 *     `PERSONA_REAL_E2E_DIAGNOSED=<what the offline fake diagnosis found>` (never repeat straight after a failure).
 *
 * There is NO pre-turn call limit inside the app or the runner (`FIRST_DELIVERY_MAX_PAID_TURNS` is only read by the after-the-fact
 * verifier), so this spec is the guard: a watcher copies the run's `turn_ledger` every 1.5 s and kills the whole app tree the moment it
 * shows more than ONE paid turn or any turn that is not an `execution`; the run is GREEN only if, after the app stopped, the ledger holds
 * exactly one measured `execution` (0 triage, 0 inject). 120 s hard stop; the process tree is killed afterwards. Run it under the
 * real-execution lock so nothing else spends in parallel:
 *
 *   $env:PERSONA_REAL_E2E='1'; $env:PERSONA_REAL_E2E_OK='D-069'; $env:PERSONA_NSIS_COMMIT='<hash>'; $env:PERSONA_INSTALLED_EXE='C:\p8i\Persona.exe'
 *   node scripts/persona/with-lock.mjs "Probe real" --lock real --wait-max 3600000 -- pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-first-delivery-real-installed.spec.ts
 *
 * Read-only after the accept: Quadros is opened and captured (no new post). The #geral composer send/reload check is fake-only on purpose.
 * Evidence (`artifacts/first-delivery/real-installed/`): `proof.json` (Muse's timeline in ms since the window attached, the `turn_ledger`
 * rows and totals, the budget verdict, exe identity, attempt number), one screenshot per milestone (+ `m9-quadros`), `electron.log`, and
 * `evidence/` = a copy of the run's `persona.db` (+WAL/SHM) for Forge's read-only `verifyFirstDeliveryRun`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { watchConsole } from '../src/console-tripwire.ts'
import { exeIdentity, fakeGreenProblem } from '../src/exe-identity.ts'
import {
  recordFirstDeliveryLines,
  FIRST_DELIVERY_PAID_TURNS_TARGET,
  createFirstDeliveryRecorder,
  expectBootOverlayGone,
  readBootOverlay,
  runRealFirstDelivery,
  walkOnboardingToStep5,
} from '../src/first-delivery-flow.ts'
import { startInstalledDesktop } from '../src/installed-desktop.ts'
import { baselineD085, fakeRunnerSignature, readLedgerEvidence } from '../src/ledger-evidence.ts'
import { probeLoggedCli } from '../src/logged-cli.ts'
import { assessAttempts, attemptsForVerifier, refusalsForNextAttempt, spentTurns, type BudgetAttempt } from '../src/real-run-budget.ts'
import { runRealRunVerifier } from '../src/real-run-verifier.ts'
import { TURN_CAP_ENV, TURN_LEDGER_ENV, readTurnLedgerFile, scanForTurnCap } from '../src/turn-cap.ts'
import { ARTIFACTS_DIR, PACKAGE_ROOT, REPO_ROOT } from '../src/paths.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'

const exe = process.env.PERSONA_INSTALLED_EXE
const FAKE_DIR = join(PACKAGE_ROOT, 'fixtures', 'fake-cli')
const AUTHORIZATION_FILE = join(REPO_ROOT, '.maestri', 'tmp', 'atlas-ok-real-run.txt')
const ATTEMPTS_FILE = join(ARTIFACTS_DIR, 'first-delivery', 'real-attempts.json')
const UX_PHASE_A_MS = 120_000
const LEDGER_WATCH_MS = 1_500

type Attempt = BudgetAttempt

/** Absent file = no attempts yet. Present but unreadable/corrupt = FAIL CLOSED (an empty list would reopen the whole budget). */
function readAttempts(): Attempt[] {
  if (!existsSync(ATTEMPTS_FILE)) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(ATTEMPTS_FILE, 'utf8'))
  } catch (error) {
    throw new Error(`${ATTEMPTS_FILE} is unreadable (${error instanceof Error ? error.message : String(error)}): refusing to spend; ask Keel before touching it`)
  }
  const assessed = assessAttempts(parsed)
  if (assessed.problems.length > 0) {
    throw new Error(`${ATTEMPTS_FILE} cannot be trusted (${assessed.problems.join('; ')}): refusing to spend; ask Keel before touching it`)
  }
  return [...assessed.attempts]
}

function saveAttempts(attempts: readonly Attempt[]): void {
  mkdirSync(dirname(ATTEMPTS_FILE), { recursive: true })
  writeFileSync(ATTEMPTS_FILE, `${JSON.stringify(attempts, null, 2)}\n`)
}

/** Fakes leaking into a "real" run would make it meaningless (or, worse, look green): refuse. */
function fakeLeaks(): string[] {
  const leaks: string[] = []
  for (const name of ['OAR_CLAUDE_BIN', 'OAR_CODEX_BIN', 'OAR_OPENCODE_BIN']) {
    if ((process.env[name] ?? '').startsWith(FAKE_DIR)) leaks.push(name)
  }
  if ((process.env.PATH ?? '').split(delimiter).some(entry => entry === FAKE_DIR)) leaks.push('PATH')
  if ((process.env.PERSONA_E2E_EXTRA_PATH ?? '') !== '') leaks.push('PERSONA_E2E_EXTRA_PATH')
  return leaks
}

/** @returns Why the run must not start, or `undefined` when authorized. */
function authorizationProblem(): string | undefined {
  if (process.env.PERSONA_REAL_E2E !== '1') return 'PERSONA_REAL_E2E=1 is not set'
  if (process.env.PERSONA_REAL_E2E_OK !== 'D-069') return 'PERSONA_REAL_E2E_OK=D-069 is not set (Atlas authorization)'
  if (!existsSync(AUTHORIZATION_FILE) || !/AUTORIZAÇÃO EXPLÍCITA/u.test(readFileSync(AUTHORIZATION_FILE, 'utf8'))) {
    return `the authorization text ${AUTHORIZATION_FILE} is missing`
  }
  if (exe === undefined || exe === '' || !existsSync(exe)) return 'PERSONA_INSTALLED_EXE does not point to a Persona.exe'
  if ((process.env.PERSONA_NSIS_COMMIT ?? '').trim() === '') return 'PERSONA_NSIS_COMMIT (the NSIS candidate hash) is not set'
  return undefined
}

const gate = authorizationProblem()

describe('first delivery — REAL engine in the installed exe (D-069, gated)', () => {
  it.skipIf(gate === undefined)('is gated: refuses to run without the authorization, the exe and the NSIS commit', () => {
    expect(gate, 'gate message').toBeTypeOf('string')
  })

  it.skipIf(gate !== undefined)('clean profile → ask → real delivery in #geral → card done on Quadros → accept, within 2 minutes (one attempt, one paid turn)', async () => {
    expect(fakeLeaks(), 'a fake CLI is configured: this must be the real engine').toEqual([])
    const identity = await exeIdentity(exe!)
    expect(fakeGreenProblem(identity), 'the fake-CLI happy path must be green on this very exe first').toBeUndefined()

    const attempts = readAttempts()
    expect(refusalsForNextAttempt(attempts, FIRST_DELIVERY_PAID_TURNS_TARGET), 'shared budget: attempts, first green, paid turns').toEqual([])
    // Independent of the app and of the ledger: ask the CLI itself (status only, no model turn) who is logged in.
    const loggedCli = await probeLoggedCli()
    expect(loggedCli, 'no real CLI reports a logged-in account on this machine: nothing to spend').not.toEqual([])
    if (attempts.length > 0) {
      expect(process.env.PERSONA_REAL_E2E_DIAGNOSED ?? '', 'after a failure the fake diagnosis must come first: set PERSONA_REAL_E2E_DIAGNOSED').not.toBe('')
    }
    const attempt: Attempt = { at: new Date().toISOString(), nsisCommit: identity.nsisCommit, sha256: identity.sha256, outcome: 'started', paidTurns: null }
    attempts.push(attempt)
    saveAttempts(attempts) // counted before anything can be spent: a crash still uses an attempt (and counts one paid turn)

    // The app-side limiter must exist in THIS build (Rivet): without it there is no pre-turn ceiling, so nothing real is spent.
    const capScan = scanForTurnCap(exe!)
    expect(capScan.found, `the installed build has no ${TURN_CAP_ENV} limiter (scanned ${String(capScan.scannedFiles)} files, ${String(capScan.scannedBytes)} bytes${capScan.timedOut ? ', timed out' : ''}): no real turn may be spent`).toBe(true)
    const capLedgerDir = join(ARTIFACTS_DIR, 'first-delivery', 'real-turn-ledger')
    mkdirSync(capLedgerDir, { recursive: true })
    const capLedger = join(capLedgerDir, `attempt-${String(attempts.length)}.ledger`) // one file per attempt; they add up in the total
    attempt.capLedger = capLedger

    const desktop = await startInstalledDesktop({
      exe: exe!,
      keepRunRoot: true,
      env: { [TURN_CAP_ENV]: '1', [TURN_LEDGER_ENV]: capLedger },
    })
    const { page } = desktop
    const tripwire = watchConsole(page)
    const rec = await createFirstDeliveryRecorder(page, 'real-installed')
    // Muse (D-069) measures the time from "Equipe trabalhando" to the first delivery with a READ-ONLY observer attached to this renderer: publish the CDP port
    // as soon as the window is up (before the request). She only reads; she never clicks.
    mkdirSync(join(REPO_ROOT, '.maestri', 'tmp'), { recursive: true })
    writeFileSync(join(REPO_ROOT, '.maestri', 'tmp', 'probe-real-cdp-port.txt'), `${String(desktop.rendererPort)}\n`)
    writeFileSync(join(rec.dir, 'cdp-port.txt'), `${String(desktop.rendererPort)}\n`)

    // The guard that does not exist in the app: watch the ledger and kill the tree on the first sign of a second paid turn.
    let overBudget: string | undefined
    const watcher = setInterval(() => {
      if (overBudget !== undefined) return
      const seen = readLedgerEvidence(desktop.home)
      if (seen === undefined) return
      if (seen.turns > FIRST_DELIVERY_PAID_TURNS_TARGET || seen.rows.some(row => row.kind !== 'execution')) {
        overBudget = `ledger shows ${String(seen.turns)} paid turn(s) [${seen.rows.map(row => row.kind).join(', ')}]; the target is ONE execution: app killed`
        rec.mark('OVER BUDGET: app killed')
        void desktop.stop()
      }
    }, LEDGER_WATCH_MS)

    let flowOutcome = 'started'
    let flowFailure: unknown
    let timeline: unknown = null
    let board: { fixtures: number; doneVisible: boolean } | null = null
    let firstDeliveryLines: { lines: string[]; leaked: string[] } | null = null
    try {
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await expectBootOverlayGone(page, rec)
      await walkOnboardingToStep5(page, 'Probe Real', rec.shot, rec.notes)
      rec.mark('step5 visible')
      // Optional grace so the observer is attached BEFORE "Pedir agora" (PERSONA_REAL_E2E_OBSERVER_GRACE_MS, default 8 s): it is outside the measured window,
      // which starts at the request.
      const grace = Number(process.env.PERSONA_REAL_E2E_OBSERVER_GRACE_MS ?? 8_000)
      if (grace > 0) await page.waitForTimeout(grace)
      const result = await runRealFirstDelivery(page, rec, { deadlineMs: UX_PHASE_A_MS })
      timeline = result
      flowOutcome = result.outcome
      expect(result.outcome, 'real delivery outcome').toBe('delivered')
      expect(result.t1 === undefined ? Infinity : result.t1 - result.t0, 'ask → first delivery (t1 − t0) must fit 2 min').toBeLessThan(UX_PHASE_A_MS)
      expect(overBudget, 'budget tripwire').toBeUndefined()
      // LEAK-1 (Muse/Keel, 04/11): RECORD the visible text of the first-delivery lines in #geral (and whether the internal prompt leaked). It does NOT
      // fail the real run (D-069 runs on H2 #3 as is); the installed fake asserts it.
      firstDeliveryLines = await recordFirstDeliveryLines(page).catch(() => null)

      // READ-ONLY: the delivered card must be done on the user's board (Quadros), in the same run, before the app stops.
      const kanban = REAL_GALLERY_PANELS.find(panel => panel.slug === 'kanban')!
      await navigateGalleryPanel(page, kanban)
      await rec.shot('m9-quadros')
      board = {
        fixtures: await page.getByText(/Contratação — Designer|Site da agência/u).count(),
        doneVisible: await page.getByText(/(^|\s)1 conclu[ií]d[oa]/iu).first().isVisible().catch(() => false),
      }
      rec.mark('quadros captured')
      expect(board.fixtures, 'Quadros shows demo fixtures instead of the real project').toBe(0)
      expect(board.doneVisible, 'the delivered card is not counted as done on Quadros').toBe(true)
      expect(tripwire.pageErrors).toEqual([])
    } catch (error) {
      flowFailure = error
      await rec.shotNow('zz-failed')
      throw error
    } finally {
      clearInterval(watcher)
      const overlay = await readBootOverlay(page).catch(() => 'unreadable')
      await writeFile(join(rec.dir, 'electron.log'), desktop.log().slice(-60_000)).catch(() => {})
      await desktop.stop() // kills the whole tree: no warm real CLI session may survive the run
      const ledger = readLedgerEvidence(desktop.home) ?? null
      const ledgerOk = ledger !== null && ledger.turns === FIRST_DELIVERY_PAID_TURNS_TARGET
        && ledger.rows.every(row => row.kind === 'execution') && ledger.allMeasured && ledger.outputTokens > 0
      const problems: string[] = []
      if (flowFailure !== undefined) problems.push(`flow: ${flowFailure instanceof Error ? flowFailure.message.slice(0, 300) : String(flowFailure)}`)
      if (overBudget !== undefined) problems.push(overBudget)
      // D-085: the native-mode baseline is only usable when fully measured; otherwise the proof accuses instead of accepting an estimate.
      const baseline = baselineD085(ledger)
      // A REAL run must not carry the scripted fake's fingerprint (engine dsh / 1-1 tokens): it means the app ran its fake (e.g. VITEST leaked in).
      const fakeRows = fakeRunnerSignature(ledger)
      if (fakeRows.length > 0) problems.push(`the ledger carries the FAKE runner signature — this was not a real run: ${fakeRows.join(' | ')}`)
      if (!baseline.valid) problems.push(`baseline D-085 unusable: ${baseline.reason ?? 'unknown'}`)
      if (ledger === null) problems.push('no ledger could be read after the run: the paid turn cannot be verified')
      else if (!ledgerOk) {
        problems.push(`ledger after the run: ${String(ledger.turns)} turn(s) [${ledger.rows.map(row => row.kind).join(', ')}], measured=${String(ledger.allMeasured)}, output tokens=${String(ledger.outputTokens)}; expected exactly ONE measured execution (0 triage, 0 inject)`)
      }
      const cap = readTurnLedgerFile(capLedger)
      if (!cap.valid) problems.push(`the app's limiter ledger is invalid (${cap.error ?? 'unknown'}): failing closed, the attempt counts as spent: ${capLedger}`)
      if (cap.turns !== null && cap.turns > FIRST_DELIVERY_PAID_TURNS_TARGET) {
        problems.push(`the app's own limiter ledger recorded ${String(cap.turns)} turn(s) (target ${String(FIRST_DELIVERY_PAID_TURNS_TARGET)}): ${capLedger}`)
      }
      // Forge's pure verifier decides acceptance (never the UI, never run.passed alone): canonical ledger, whole attempt history, 1-based current attempt.
      attempt.paidTurns = ledger?.turns ?? null
      attempt.capTurns = cap.valid ? cap.turns : FIRST_DELIVERY_PAID_TURNS_TARGET // invalid = assume the target was spent
      const timelineRow = timeline as { t0: number; t1?: number } | null
      const verifier = runRealRunVerifier({
        home: desktop.home,
        dir: rec.dir,
        ledger,
        // Every settled row with the SAME known count the guard charges it (unreadable ledger = 1, limiter count if larger):
        // guard and verifier can never disagree.
        attempts: attemptsForVerifier(attempts),
        currentAttempt: attempts.length,
        loggedCli,
        elapsedMs: timelineRow?.t1 === undefined ? UX_PHASE_A_MS : timelineRow.t1 - timelineRow.t0,
        maxElapsedMs: UX_PHASE_A_MS,
      })
      if (!verifier.passed) problems.push(`verifyRealFirstDeliveryRun rejected the run: [${verifier.failed.join(', ')}]`)
      const green = problems.length === 0 && flowOutcome === 'delivered' && verifier.passed
      attempt.outcome = green ? 'delivered' : (overBudget !== undefined ? 'OVERBUDGET' : (flowOutcome === 'delivered' ? 'UNVERIFIED' : (flowOutcome === 'started' ? 'FAILED' : flowOutcome)))
      saveAttempts(attempts)
      // Evidence for Forge (read-only verifier): the run's database, copied before the run directory goes away.
      const evidenceDir = join(rec.dir, 'evidence')
      mkdirSync(evidenceDir, { recursive: true })
      for (const suffix of ['', '-wal', '-shm']) {
        const source = join(desktop.home, 'db', `persona.db${suffix}`)
        if (existsSync(source)) copyFileSync(source, join(evidenceDir, `persona.db${suffix}`))
      }
      await rec.write({
        exe, exeIdentity: identity, authorization: 'D-069', attempt: attempts.length, currentAttempt: attempts.length, home: desktop.home,
        // Inputs for the pure verifier (Forge): the attempts exactly as persisted (this attempt included), 1-based current attempt,
        // the raw `turn_ledger` rows (every column) are in `ledger.rawRows`, the database copy is in `evidence/persona.db`.
        attemptsFile: ATTEMPTS_FILE,
        attemptsSnapshot: attempts.map(row => ({ ...row })),
        verdict: { green, problems, paidTurnsSpentTotal: spentTurns(attempts), loggedCli, loggedCliSource: 'claude auth status --json, before the run, outside the app (not derived from the ledger)' },
        outcome: flowOutcome, timeline, board, bootOverlay: overlay, ledger, verifier,
        // D-085 (Atlas/Keel): the real BEFORE of the first delivery, native mode (the bloated call). Fail closed: `valid:false` + reason when not fully measured.
        'baseline D-085': baseline,
        // LEAK-1: the visible #geral lines of the first delivery (300 chars each) and the internal-prompt phrases found in them (recorded, not asserted here).
        leak1: firstDeliveryLines,
        turnCap: { env: [TURN_CAP_ENV, TURN_LEDGER_ENV], scan: { found: capScan.found, file: capScan.file ?? null }, ledgerFile: capLedger, ledger: { exists: cap.exists, valid: cap.valid, turns: cap.turns, error: cap.error ?? null, raw: cap.raw.slice(0, 2_000) } },
        costNote: 'no price table in the repository: tokens are exact (turn_ledger, measured); dollar cost is an estimate to be stated in the report',
        consoleErrors: tripwire.consoleErrors.slice(0, 20),
        pageErrors: tripwire.pageErrors.slice(0, 20),
      })
      await rm(dirname(desktop.home), { recursive: true, force: true }).catch(() => {})
      // The UI flow alone is not enough for green: a second paid turn or an unreadable ledger fails the run and the budget shows it.
      if (flowFailure === undefined && problems.length > 0) throw new Error(problems.join(' | '))
    }
  }, UX_PHASE_A_MS + 360_000)
})
