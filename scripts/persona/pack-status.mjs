#!/usr/bin/env node
/**
 * What happened to the last packaging run? Reads the live record, checks that its process is still alive, and says so.
 *
 *   node scripts/persona/pack-status.mjs [--file <package-clean.live.json>] [--record] [--json]
 *
 * Output (one line):  running (pid X, stage Y, ...) | ok | failed (reason) | killed (reason)
 *                     | died (pid X gone at stage Y; last update T)      <- hard kill (taskkill /F), nothing could be recorded
 *                     | stalled? (pid alive but no update for N min)     | no pack recorded
 * Exit code: 0 running/ok, 1 failed/killed, 2 died, 3 stalled?, 4 unknown/none.
 * `--record` also writes the `killed` end into the live record and the report when the process is gone (so later readers see it).
 */
import { join } from 'node:path'
import { describePackStatus, readJson, recordDeath } from './pack-state.mjs'

const CACHE = process.env.PERSONA_PACK_CACHE ?? 'C:\\p8c'
const argv = process.argv.slice(2)
const fileFlag = argv.indexOf('--file')
const liveFile = fileFlag >= 0 ? argv[fileFlag + 1] : join(CACHE, 'package-clean.live.json')
const reportFile = join(liveFile, '..', 'package-clean.json')

/** @returns true when a process with this pid exists (EPERM means it exists but is not ours). */
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

const live = readJson(liveFile)
const status = describePackStatus(live, { alive: isAlive })
if (argv.includes('--record') && status.kind === 'died') {
  recordDeath(liveFile, reportFile, `process ${String(live.pid)} gone at stage ${String(live.stage)} without a final record (hard kill?)`)
}
process.stdout.write(argv.includes('--json') ? `${JSON.stringify({ ...status, live })}\n` : `${status.line}\n`)
process.exit(status.code)
