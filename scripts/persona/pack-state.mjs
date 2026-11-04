/**
 * Final state of a packaging run: ALWAYS recorded, even when the run dies.
 *
 * `package-clean.mjs` keeps two files in the cache directory:
 *  - `package-clean.live.json`  - what is happening now: `{ pid, state, stage, at, startedAt, requested, commit, ended? }`;
 *  - `package-clean.json`       - the result of the last run (the `--resume` input).
 *
 * `state` is `running | ok | failed | killed`; `ended = { at, ok, reason }` is present once the run has an end. Every way a
 * process can end that Node can see (normal finish, `process.exit`, SIGINT/SIGTERM/SIGBREAK, uncaught exception, unhandled
 * rejection) goes through `finalize`, which writes both files before the process leaves. A hard kill (`taskkill /F`) cannot
 * be caught: `describePackStatus` / `pack-status.mjs` detect it afterwards (pid gone while `state` is still `running`).
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Write JSON through a sibling temp file; fall back to a direct write if the rename is blocked (Windows scanners). */
export function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const text = `${JSON.stringify(value, null, 2)}\n`
  const tmp = `${file}.${String(process.pid)}.tmp`
  try {
    writeFileSync(tmp, text)
    renameSync(tmp, file)
  } catch {
    try { unlinkSync(tmp) } catch { /* nothing to clean */ }
    writeFileSync(file, text)
  }
}

/** @returns the parsed JSON file, or undefined when it is missing or unreadable. */
export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Build the end records for a run, without touching the disk.
 * @param live - The live record as last written (may be a legacy one without `state`).
 * @param end - `{ state, reason, at, stage?, ok? }`.
 * @param previousReport - The report currently on disk.
 * @param reportWritten - True when the normal path already wrote the report for this run.
 * @returns The new live record and the report to write (undefined = leave the report alone).
 */
export function endRecords(live, end, previousReport, reportWritten) {
  const ok = end.state === 'ok'
  const ended = { at: end.at, ok, reason: end.reason }
  const nextLive = { ...live, ...(end.extra ?? {}), state: end.state, ...(end.stage === undefined ? {} : { stage: end.stage }), at: end.at, ended }
  if (reportWritten || ok) return { live: nextLive, report: undefined }
  const run = { state: end.state, stage: nextLive.stage, reason: end.reason, ended, pid: live.pid }
  // A --resume run builds the installer from an already-validated unpacked app: if it dies, that app is still good, so the
  // earlier report keeps `ok: true` (the next --resume must still be allowed) and only records what happened to this run.
  if (live.resume === true && previousReport?.ok === true) return { live: nextLive, report: { ...previousReport, lastResume: run } }
  return {
    live: nextLive,
    report: { ok: false, commit: live.commit ?? live.requested, requested: live.requested, ...run, logPath: live.logPath },
  }
}

/**
 * Track one packaging run.
 * @param options - `liveFile`, `reportFile`, `requested`, `resume`, `logPath`, `pid`, `now`.
 */
export function createPackState(options) {
  const now = options.now ?? (() => new Date())
  const pid = options.pid ?? process.pid
  const base = {
    pid, startedAt: now().toISOString(), requested: options.requested, resume: options.resume === true,
    ...(options.logPath === undefined ? {} : { logPath: options.logPath }),
  }
  const minIntervalMs = options.minIntervalMs ?? 400
  let stage = 'start'
  let commit
  let lastLog
  let lastWriteAt = Number.NEGATIVE_INFINITY
  let finalized = false
  let reportWritten = false
  const record = (extra) => ({ ...base, state: 'running', stage, at: now().toISOString(), ...(commit === undefined ? {} : { commit }), ...extra })
  const api = {
    get finalized() { return finalized },
    /** Record progress. Ignored once the run has ended (an end is never undone). */
    update(nextStage, extra = {}) {
      if (finalized) return
      const changed = nextStage !== stage
      stage = nextStage
      // The build streams hundreds of chunks a second: within a stage, write at most every `minIntervalMs`.
      const at = now().getTime()
      if (!changed && at - lastWriteAt < minIntervalMs) return
      lastWriteAt = at
      writeJsonAtomic(options.liveFile, record(extra))
    },
    setCommit(value) { commit = value },
    /** Remember the last log line: the reason of a plain `process.exit(n)`. */
    noteLog(line) { lastLog = line },
    /** Call after the normal path wrote `package-clean.json`, so an end does not overwrite it. */
    markReportWritten() { reportWritten = true },
    /**
     * Record the end of the run in both files. Only the first call counts.
     * @param end - `{ state: 'ok'|'failed'|'killed', reason, stage? }`.
     */
    finalize(end) {
      if (finalized) return
      finalized = true
      const at = now().toISOString()
      const live = record({})
      const records = endRecords(live, { ...end, at }, readJson(options.reportFile), reportWritten)
      writeJsonAtomic(options.liveFile, records.live)
      if (records.report !== undefined) writeJsonAtomic(options.reportFile, records.report)
    },
    /** Reason for an exit that nobody described. */
    exitReason(code) { return lastLog === undefined ? `exit code ${String(code)}` : `exit code ${String(code)}: ${lastLog}` },
  }
  return api
}

/**
 * Make every end the process can see leave a final record.
 * @param state - From {@link createPackState}.
 * @param options - `proc` (default `process`), `kill` (stop child processes), `exit` (default `proc.exit`).
 */
export function installDeathHandlers(state, options = {}) {
  const proc = options.proc ?? process
  const kill = options.kill ?? (() => {})
  const exit = options.exit ?? ((code) => proc.exit(code))
  const describe = (value) => (value instanceof Error ? value.message : String(value)).slice(0, 300)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
    proc.on(signal, () => {
      try { kill() } catch { /* best effort */ }
      state.finalize({ state: 'killed', reason: `received ${signal}` })
      exit(signal === 'SIGINT' ? 130 : 143)
    })
  }
  proc.on('uncaughtException', (error) => {
    try { kill() } catch { /* best effort */ }
    state.finalize({ state: 'failed', reason: `uncaught exception: ${describe(error)}` })
    exit(1)
  })
  proc.on('unhandledRejection', (reason) => {
    try { kill() } catch { /* best effort */ }
    state.finalize({ state: 'failed', reason: `unhandled rejection: ${describe(reason)}` })
    exit(1)
  })
  // Backstop for every plain process.exit(n), including the early "cannot resolve / install failed" exits.
  proc.on('exit', (code) => {
    if (state.finalized) return
    state.finalize(code === 0
      ? { state: 'ok', reason: 'exited 0 without a final record' }
      : { state: 'failed', reason: state.exitReason(code) })
  })
}

/**
 * Say what happened to a run from its live record.
 * @param live - Parsed `package-clean.live.json` (undefined when missing).
 * @param options - `alive(pid)` and `now()` (ms); `staleMs` is how long a running record may go without an update.
 * @returns `{ kind, code, line }`; `code` is the exit code for `pack-status.mjs`.
 */
export function describePackStatus(live, options) {
  const now = options.now ?? Date.now()
  const staleMs = options.staleMs ?? 5 * 60_000
  if (live === undefined || live === null || typeof live !== 'object') {
    return { kind: 'none', code: 4, line: 'no pack recorded (live file missing or unreadable)' }
  }
  const stage = String(live.stage ?? '?')
  const commit = live.commit === undefined ? '' : `, commit ${String(live.commit).slice(0, 10)}`
  // Legacy records (before `state`): `done` / `failed` were written in `stage`.
  const state = live.state ?? (live.stage === 'done' ? 'ok' : live.stage === 'failed' ? 'failed' : live.pid === undefined ? 'unknown' : 'running')
  if (state === 'ok') return { kind: 'ok', code: 0, line: `ok (stage ${stage}${commit})` }
  if (state === 'failed') return { kind: 'failed', code: 1, line: `failed (${String(live.ended?.reason ?? `stage ${stage}`)}${commit})` }
  if (state === 'killed') return { kind: 'killed', code: 1, line: `killed (${String(live.ended?.reason ?? `stage ${stage}`)}${commit})` }
  if (state === 'unknown' || typeof live.pid !== 'number') {
    // A record written before `pid` existed: it cannot say whether the process lives, but a record that stopped updating
    // (build output and the 60 s heartbeat refresh it) belongs to a pack that is gone.
    const idleMs = now - Date.parse(String(live.at))
    if (Number.isFinite(idleMs) && idleMs > staleMs) {
      return {
        kind: 'died', code: 2,
        line: `died (legacy record without pid; no update for ${String(Math.round(idleMs / 60_000))} min at stage ${stage}, last update ${String(live.at)}${commit})`,
      }
    }
    return { kind: 'unknown', code: 4, line: `unknown (no pid recorded; last stage ${stage} at ${String(live.at)})` }
  }
  if (!options.alive(live.pid)) {
    return { kind: 'died', code: 2, line: `died (pid ${String(live.pid)} gone at stage ${stage}; last update ${String(live.at)}${commit})` }
  }
  const ageMs = now - Date.parse(String(live.at))
  if (Number.isFinite(ageMs) && ageMs > staleMs) {
    return {
      kind: 'stalled', code: 3,
      line: `stalled? (pid ${String(live.pid)} alive but no update for ${String(Math.round(ageMs / 60_000))} min at stage ${stage}; or the pid was reused)`,
    }
  }
  const seconds = Number.isFinite(ageMs) ? `, last update ${String(Math.max(0, Math.round(ageMs / 1000)))}s ago` : ''
  return { kind: 'running', code: 0, line: `running (pid ${String(live.pid)}, stage ${stage}${seconds}${commit})` }
}

/**
 * Persist the end of a run whose process vanished without writing one (hard kill).
 * @param liveFile - Live record path.
 * @param reportFile - Report path.
 * @param reason - Why we believe it ended.
 * @param at - ISO instant.
 * @returns true when something was written.
 */
export function recordDeath(liveFile, reportFile, reason, at = new Date().toISOString()) {
  const live = readJson(liveFile)
  if (live === undefined || live.state === 'ok' || live.state === 'failed' || live.state === 'killed') return false
  const records = endRecords(live, { state: 'killed', reason, at }, readJson(reportFile), false)
  writeJsonAtomic(liveFile, records.live)
  if (records.report !== undefined) writeJsonAtomic(reportFile, records.report)
  return true
}
