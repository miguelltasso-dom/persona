/**
 * Colheita item 3, the host's side of `turn-close.ts`: the loop that hands a note back to the persona and runs the turn again, the switch, and the two reads of the
 * draft the rules need (what the turn saved, what the owner put there). The rules themselves are pure and live in `turn-close.ts`.
 *
 * Nothing here posts anything: it returns the verdict and her final raw words, and `orchestration.ts` decides what the thread shows.
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { changedSince } from './draft-turn-files.ts'
import { flagDefaultsOf } from './flags.ts'
import { readPass } from './speech.ts'
import { closeTurn, FRESH_TURN_CLOSE, MAX_PUSHES, type KnownFacts, type TurnCloseVerdict } from './turn-close.ts'

/** `PERSONA_TURN_CLOSE=0` turns the rules off in the real app; `=1` turns them on under Vitest (the in-process suites opt in, like the other host switches). */
export const TURN_CLOSE_ENV = 'PERSONA_TURN_CLOSE'

const OFF = new Set(['0', 'false', 'off', 'no'])

/**
 * @param config - The plugin `Config` slice (`flagDefaults: 'production'` asks for the product default even under Vitest).
 * @param env - The environment (tests inject one).
 * @returns Whether the end-of-turn rules run. ON in the real app, OFF under Vitest unless asked (same policy as `flags.ts`).
 */
export function resolveTurnClose(config: { readonly flagDefaults?: 'production' } = {}, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const raw = (env[TURN_CLOSE_ENV] ?? '').trim().toLowerCase()
  if (OFF.has(raw)) return false
  if (raw === '1') return true
  return flagDefaultsOf(config.flagDefaults, env) === 'production'
}

/** What the host keeps of a decision (diagnostics and tests; never shown to the owner). */
export interface TurnCloseLogEntry {
  readonly turn: number
  readonly kind: TurnCloseVerdict['kind']
  readonly rule: string
  readonly motivo?: string
}

/** What one run of the rules needs from the host. */
export interface TurnCloseRun {
  /** Her RAW words of the turn that just ended (before the speech layer). */
  readonly words: string
  /** The turn is somebody else's to settle (stopped, failed, an approval or a question card is open…): the rules stay out. Asked before every verdict. */
  readonly stepAside: () => boolean
  /** The tools she called in the turn that just ended. */
  readonly tools: () => readonly string[]
  /** Files saved in the draft since the Task's turn began (the host's copies are not counted). */
  readonly savedFiles: () => number
  /** The turn had tools: false for an answer-only turn. */
  readonly hadTools: boolean
  /** A hand-off she asked for is tracked and still pending. */
  readonly waitingColleague?: () => boolean
  readonly known: KnownFacts
  /** Run one more turn with an internal note and return her raw words of THAT turn. The host settles the turn (usage, gate) inside. */
  readonly rerun: (cobranca: string, turn: number) => Promise<string>
}

export interface TurnCloseOutcome {
  /** `undefined` when the rules stayed out (somebody else settles the turn). */
  readonly verdict: TurnCloseVerdict | undefined
  /** Her raw words of the LAST turn: what the thread would show if the verdict lets them through. */
  readonly words: string
  readonly log: readonly TurnCloseLogEntry[]
}

/**
 * Ask the rules how the turn ends and, while they say "continuar", run the turn again with the note. Bounded by {@link MAX_PUSHES} (the rules also stop sooner).
 * @param run - The turn and the host's hands.
 */
export async function runTurnClose(run: TurnCloseRun): Promise<TurnCloseOutcome> {
  let words = run.words
  let state = FRESH_TURN_CLOSE
  const log: TurnCloseLogEntry[] = []
  for (let turn = 0; turn <= MAX_PUSHES; turn += 1) {
    if (run.stepAside()) return { verdict: undefined, words, log }
    const ruled = closeTurn({
      words: readPass(words).text,
      tools: run.tools(),
      savedFiles: run.savedFiles(),
      hadTools: run.hadTools,
      waitingColleague: run.waitingColleague?.() === true,
      known: run.known,
    }, state)
    state = ruled.state
    const verdict = ruled.verdict
    log.push({ turn, kind: verdict.kind, rule: verdict.rule, ...('motivo' in verdict ? { motivo: verdict.motivo } : {}) })
    if (verdict.kind !== 'continuar') return { verdict, words, log }
    words = await run.rerun(verdict.cobranca, state.pushes.length)
  }
  return { verdict: undefined, words, log }
}

/** What the host puts in a draft is never something the persona saved. */
const HOST_PUT = /^(?:inputs|recebidos)\//u

/**
 * @param root - The Task's draft (`ticket.execution.directory`); `undefined`, '' or '.' means there is none.
 * @param sinceMs - When the Task's turn began.
 * @returns How many files the persona wrote in the draft since then.
 */
export function savedFilesSince(root: string | undefined, sinceMs: number): number {
  if (root === undefined || root === '' || root === '.') return 0
  try {
    return changedSince(root, sinceMs).filter(path => !HOST_PUT.test(path)).length
  }
  catch {
    return 0
  }
}

/**
 * @param root - The Task's draft.
 * @returns What the owner (and the team) put in the draft for her: `inputs/<name>` and `recebidos/<name>`, relative, at most 40.
 */
export function draftInputFiles(root: string | undefined): string[] {
  if (root === undefined || root === '' || root === '.') return []
  const out: string[] = []
  for (const folder of ['inputs', 'recebidos']) {
    try {
      for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
        if (entry.isFile()) out.push(`${folder}/${entry.name}`)
      }
    }
    catch { /* no such folder: nothing was put there */ }
  }
  return out.slice(0, 40)
}
