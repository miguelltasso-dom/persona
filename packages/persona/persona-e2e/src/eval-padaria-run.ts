/**
 * COLHEITA item 14 — drives the Padaria Lua eval: N rounds (fake) or N kept homes (replay) → one `PadariaEvalReport` each → one summary on disk.
 *
 *   FAKE    `runPadariaEval({ engine: 'fake', repeat: 3 })` runs the TEAM-10 driver (`team-round-driver.ts`, the SAME code as the real round, stubs instead of the model) N times, each in its own
 *           home and out folder, and evaluates what each left behind. 0 paid turns.
 *   REPLAY  `replayPadariaEval(homes)` evaluates homes a round already left (a real attempt, an older fake): no host, no model, no cost. It is how a rule is proven against the real attempts BEFORE it counts.
 *   REAL    NOT wired here. A paid round needs Atlas's written OK with a ceiling and goes through the TEAM-10 gate (`tests/mandatory-team-round.spec.ts`); this module refuses it by name.
 *
 * The driver is imported lazily, so a replay does not load the web harness.
 */
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { aggregatePadariaEval, evaluatePadariaRound, renderPadariaEvalMarkdown, unreadableRoundReport, type EvalRunMeta, type PadariaEvalReport, type PadariaEvalSummary } from './eval-padaria.ts'
import { PADARIA_SCENARIOS, PADARIA_SCENARIO_IDS, renderScenariosMarkdown, scenarioVerdict, type PadariaScenario, type PadariaScenarioId, type ScenarioVerdict } from './eval-padaria-scenarios.ts'
import { visibleThreadText } from './eval-padaria-rules.ts'
import { ARTIFACTS_DIR } from './paths.ts'
import { readTeamTranscript } from './team-transcript.ts'
import type { TeamRoundOptions, TeamRoundResult } from './team-round-driver.ts'

export interface PadariaEvalOutcome {
  readonly summary: PadariaEvalSummary
  readonly reports: readonly PadariaEvalReport[]
  readonly meta: EvalRunMeta
  readonly outDir: string
  readonly markdown: string
}

export interface RunPadariaEvalOptions {
  readonly engine: 'fake' | 'real'
  /** How many rounds (default 3). */
  readonly repeat?: number
  /** Where the summary, each round's proof and each round's home go. */
  readonly outRoot: string
  readonly fingerprint?: string
  /** Hard stop and quiet time of ONE round (the fake's own numbers by default). */
  readonly deadlineMs?: number
  readonly quietMs?: number
  /** FAKE only: `d100` = the stub makes no hand-off of its own and the host's D-100 flow does the work (see `TeamRoundOptions.choreography`). */
  readonly choreography?: 'legacy' | 'd100'
}

type RunRound = (options: TeamRoundOptions) => Promise<TeamRoundResult>

export const stamp = (): string => new Date().toISOString().replace(/[:.]/gu, '-')

export function writeEvalSummary(outDir: string, summary: PadariaEvalSummary, reports: readonly PadariaEvalReport[], meta: EvalRunMeta): string {
  mkdirSync(outDir, { recursive: true })
  const markdown = renderPadariaEvalMarkdown(summary, reports, meta)
  writeFileSync(join(outDir, 'summary.md'), markdown)
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({
    meta, summary,
    reports: reports.map(report => ({ ok: report.ok, problems: report.problems, metrics: report.metrics, checks: report.checks, findings: report.findings, d100: { ok: report.d100.ok, problems: report.d100.problems, measures: report.d100.measures } })),
  }, null, 2))
  return markdown
}

/**
 * @param deps.runRound - The round driver; the real one by default (lazy import). Injected by the specs.
 */
export async function runPadariaEval(options: RunPadariaEvalOptions, deps: { readonly runRound?: RunRound; readonly request?: string } = {}): Promise<PadariaEvalOutcome> {
  if (options.engine === 'real') {
    throw new Error('the real round of the eval is not run from here: a paid round needs Atlas\'s written OK with a ceiling and goes through the TEAM-10 gate (tests/mandatory-team-round.spec.ts)')
  }
  const repeat = options.repeat ?? 3
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error(`--repeat must be a whole number from 1 to 10 (got ${String(options.repeat)})`)
  const driver = deps.runRound === undefined || deps.request === undefined ? await import('./team-round-driver.ts') : undefined
  const runRound: RunRound = deps.runRound ?? driver!.runTeamRound
  const request = deps.request ?? driver!.REQUEST_TEXT
  const runStamp = stamp()
  const outDir = join(options.outRoot, `eval-${options.engine}-${runStamp}`)
  mkdirSync(outDir, { recursive: true })

  const reports: PadariaEvalReport[] = []
  const sources: string[] = []
  const notes: Record<number, string> = {}
  for (let index = 1; index <= repeat; index += 1) {
    const run = `r${String(index)}`
    sources.push(run)
    try {
      const result = await runRound({ engine: options.engine, outDir: join(outDir, run), home: join(outDir, 'homes', run), cap: 14, deadlineMs: options.deadlineMs ?? 8 * 60_000, quietMs: options.quietMs ?? 30_000, ...(options.choreography === undefined ? {} : { choreography: options.choreography }) })
      if (result.aborted !== undefined) notes[index] = `watchdog: ${result.aborted}`
      else if (result.timedOut) notes[index] = 'the round did not settle within the deadline'
      reports.push(result.transcript === undefined ? unreadableRoundReport('the transcript could not be read from the round\'s database') : evaluatePadariaRound(result.transcript, { request }))
    } catch (error) {
      const reason = `the round failed before it could be read: ${error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)}`
      notes[index] = reason
      reports.push(unreadableRoundReport(reason))
    }
  }
  const summary = aggregatePadariaEval(reports)
  const meta: EvalRunMeta = { engine: options.engine, stamp: runStamp, ...(options.fingerprint === undefined ? {} : { fingerprint: options.fingerprint }), sources, notes }
  const markdown = writeEvalSummary(outDir, summary, reports, meta)
  return { summary, reports, meta, outDir, markdown }
}

// ══ the RED scenarios (end to end through the host) ═══════════════════════════════════════════════════════════════════════════════════════════
export interface ScenarioRun {
  readonly scenario: PadariaScenario
  readonly verdict: ScenarioVerdict
  readonly report: PadariaEvalReport
  /** Why the round is not a valid observation (the host failed, the watchdog killed it, it did not settle): a broken round never counts as "caught". */
  readonly invalid: string | undefined
  /** Valid, the defect was caught and nothing else flipped. */
  readonly ok: boolean
}

export interface PadariaScenariosOutcome {
  readonly runs: readonly ScenarioRun[]
  readonly ok: boolean
  readonly outDir: string
  readonly markdown: string
}

export interface RunPadariaScenariosOptions {
  readonly outRoot: string
  /** Default: all of them. */
  readonly scenarios?: readonly PadariaScenarioId[]
  readonly fingerprint?: string
  readonly deadlineMs?: number
  readonly quietMs?: number
}

/**
 * One round of the fake PER scenario (the stub plays the persona that does the one wrong thing), evaluated by the same eval. Each scenario must be caught by the check that owns it and flip
 * nothing else but what the product itself pays for (`PadariaScenario.mayFail`).
 * @param deps.runRound - The round driver; the real one by default (lazy import). Injected by the specs.
 */
export async function runPadariaScenarios(options: RunPadariaScenariosOptions, deps: { readonly runRound?: RunRound; readonly request?: string } = {}): Promise<PadariaScenariosOutcome> {
  const ids = options.scenarios ?? PADARIA_SCENARIO_IDS
  for (const id of ids) if (PADARIA_SCENARIOS[id] === undefined) throw new Error(`unknown scenario "${String(id)}" (known: ${PADARIA_SCENARIO_IDS.join(', ')})`)
  if (ids.length === 0) throw new Error('no scenario to run')
  const driver = deps.runRound === undefined || deps.request === undefined ? await import('./team-round-driver.ts') : undefined
  const runRound: RunRound = deps.runRound ?? driver!.runTeamRound
  const request = deps.request ?? driver!.REQUEST_TEXT
  const runStamp = stamp()
  const outDir = join(options.outRoot, `eval-scenarios-${runStamp}`)
  mkdirSync(outDir, { recursive: true })

  const runs: ScenarioRun[] = []
  for (const id of ids) {
    const scenario = PADARIA_SCENARIOS[id]
    let invalid: string | undefined
    let report: PadariaEvalReport
    let seen: string | undefined // what the person can read of this round; unknown (the strict reading) when no transcript could be read
    try {
      const result = await runRound({ engine: 'fake', outDir: join(outDir, id), home: join(outDir, 'homes', id), cap: 14, deadlineMs: options.deadlineMs ?? 8 * 60_000, quietMs: options.quietMs ?? 30_000, scenario: id })
      if (result.aborted !== undefined) invalid = `watchdog: ${result.aborted}`
      else if (result.timedOut) invalid = 'the round did not settle within the deadline'
      report = result.transcript === undefined ? unreadableRoundReport('the transcript could not be read from the round\'s database') : evaluatePadariaRound(result.transcript, { request })
      if (result.transcript === undefined) invalid = invalid ?? 'the transcript could not be read'
      else seen = visibleThreadText(result.transcript)
    } catch (error) {
      invalid = `the round failed before it could be read: ${error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)}`
      report = unreadableRoundReport(invalid)
    }
    const verdict = scenarioVerdict(scenario, report, seen)
    runs.push({ scenario, verdict, report, invalid, ok: invalid === undefined && verdict.ok })
  }
  const ok = runs.every(run => run.ok)
  const markdown = renderScenariosMarkdown(runs, { stamp: runStamp, ...(options.fingerprint === undefined ? {} : { fingerprint: options.fingerprint }) })
  writeFileSync(join(outDir, 'summary.md'), markdown)
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({
    stamp: runStamp, fingerprint: options.fingerprint ?? null, ok,
    runs: runs.map(run => ({ scenario: run.scenario.id, ok: run.ok, invalid: run.invalid ?? null, verdict: run.verdict, problems: run.report.problems, metrics: run.report.metrics })),
  }, null, 2))
  return { runs, ok, outDir, markdown }
}

/** The text the person wrote in a round, when the kept `request.json` of that round sits next to its home (`<dir>/homes/<run>` ↔ `<dir>/<run>/request.json`). */
export function requestOfHome(home: string): string | undefined {
  const file = join(dirname(dirname(home)), basename(home), 'request.json')
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { text?: unknown }
    return typeof parsed.text === 'string' ? parsed.text : undefined
  } catch { return undefined }
}

/** Evaluate homes a round already left behind. Nothing is started, nothing is spent. */
export function replayPadariaEval(homes: readonly string[], options: { readonly outRoot?: string; readonly request?: string } = {}): PadariaEvalOutcome {
  if (homes.length === 0) throw new Error('replay needs at least one kept home')
  const runStamp = stamp()
  const reports: PadariaEvalReport[] = []
  const notes: Record<number, string> = {}
  homes.forEach((home, offset) => {
    let transcript: ReturnType<typeof readTeamTranscript>
    try { transcript = readTeamTranscript(home) } catch (error) { transcript = undefined; notes[offset + 1] = `could not read ${home}: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}` }
    const request = options.request ?? requestOfHome(home)
    if (request === undefined) notes[offset + 1] = `${notes[offset + 1] ?? ''} no request.json next to this home: no question is called "already answered"`.trim()
    reports.push(transcript === undefined ? unreadableRoundReport(`the transcript of ${home} could not be read`) : evaluatePadariaRound(transcript, request === undefined ? {} : { request }))
  })
  const summary = aggregatePadariaEval(reports)
  const meta: EvalRunMeta = { engine: 'replay', stamp: runStamp, sources: homes.map(home => basename(home)), notes }
  const outDir = join(options.outRoot ?? join(ARTIFACTS_DIR, 'eval-padaria'), `eval-replay-${runStamp}`)
  const markdown = writeEvalSummary(outDir, summary, reports, meta)
  return { summary, reports, meta, outDir, markdown }
}
