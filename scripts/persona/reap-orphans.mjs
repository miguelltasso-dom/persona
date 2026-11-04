#!/usr/bin/env node
/**
 * List or kill stale Persona vitest trees (Windows-first; best-effort elsewhere).
 * Usage:
 *   node scripts/persona/reap-orphans.mjs           # list candidates
 *   node scripts/persona/reap-orphans.mjs --kill  # taskkill /T /F (Windows)
 *   node scripts/persona/reap-orphans.mjs --dry-run --kill
 *
 * Env: PERSONA_ORPHAN_MIN_AGE_MIN (default 15)
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const minAgeMs = (Number(process.env.PERSONA_ORPHAN_MIN_AGE_MIN) || 15) * 60 * 1000
const doKill = process.argv.includes('--kill')
const dryRun = process.argv.includes('--dry-run') || !doKill

/** Never terminate Keel host, Maestri, or generic agent CLIs. */
const PROTECT = [
  /apps[/\\]cli[/\\]src[/\\]bin\.ts/i,
  /\bmaestri\b/i,
  /\bcodex\b/i,
  /\bclaude\b/i,
]

/** Vitest / fork workers tied to Persona E2E or long onboarding specs. */
const ORPHAN = [
  /vitest[/\\]vitest\.mjs/i,
  /onboarding-builder|onboarding-remote|onboarding-overlay-sync/i,
  /persona-e2e[/\\]tests/i,
  /packages[/\\]persona[/\\].*\.spec\.(ts|tsx)/i,
]

function protectedCmd(cmd) {
  return PROTECT.some(re => re.test(cmd))
}

function orphanCmd(cmd) {
  if (!cmd || protectedCmd(cmd)) return false
  if (!/persona/i.test(cmd) && !/vitest[/\\]vitest\.mjs/i.test(cmd)) return false
  return ORPHAN.some(re => re.test(cmd))
}

/** @typedef {{ pid: number, parent: number, wsMb: number, ageMin: number, cmd: string }} Proc */

/** @returns {Proc[]} */
function listWindows() {
  const ps = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CreationDate,CommandLine | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
  if (ps.status !== 0) {
    console.error(ps.stderr || ps.stdout)
    return []
  }
  // Another agent's command line can carry raw control characters that PowerShell's ConvertTo-Json leaves unescaped (04/11: a long
  // `tell` message made JSON.parse throw and the reaper crash at the end of a locked job). Blank them, and never throw.
  const raw = ps.stdout.replace(/[\u0000-\u001f]/gu, ' ').trim()
  if (!raw) return []
  /** @type {Array<{ ProcessId: number, ParentProcessId: number, WorkingSetSize: number, CreationDate: string, CommandLine: string }>} */
  let rows
  try {
    rows = raw.startsWith('[') ? JSON.parse(raw) : [JSON.parse(raw)]
  } catch (error) {
    console.error(`reap-orphans: could not read the process list (${error instanceof Error ? error.message : String(error)}); skipping this round`)
    return []
  }
  const now = Date.now()
  return rows.map(r => {
    const created = new Date(r.CreationDate).getTime()
    const ageMin = (now - created) / 60_000
    return {
      pid: r.ProcessId,
      parent: r.ParentProcessId,
      wsMb: Math.round((r.WorkingSetSize || 0) / (1024 * 1024)),
      ageMin: Math.round(ageMin * 10) / 10,
      cmd: (r.CommandLine || '').slice(0, 200),
    }
  })
}

/** Prefer vitest.mjs roots; skip fork leaves when parent is also a candidate. */
function pickKillRoots(procs) {
  const byPid = new Map(procs.map(p => [p.pid, p]))
  const candidates = procs.filter(p => p.ageMin * 60_000 >= minAgeMs && orphanCmd(p.cmd))
  const roots = candidates.filter(p => {
    const parent = byPid.get(p.parent)
    if (parent && orphanCmd(parent.cmd) && parent.ageMin * 60_000 >= minAgeMs) return false
    return /vitest[/\\]vitest\.mjs/i.test(p.cmd) || p.wsMb >= 400
  })
  return roots.length > 0 ? roots : candidates.filter(p => /vitest[/\\]vitest\.mjs/i.test(p.cmd))
}

function killWindows(pid) {
  const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' })
  return r.status === 0
}

function freeMemGbWindows() {
  const ps = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', '[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,2)'],
    { encoding: 'utf8' },
  )
  return ps.stdout.trim()
}

function main() {
  if (process.platform !== 'win32') {
    console.error('reap-orphans: only Windows is implemented; use pkill manually on Unix.')
    process.exit(2)
  }
  const before = freeMemGbWindows()
  const all = listWindows()
  const roots = pickKillRoots(all)
  if (roots.length === 0) {
    console.log(`reap-orphans: no vitest trees older than ${minAgeMs / 60_000} min (free ${before} GB)`)
    return
  }
  console.log(`reap-orphans: ${roots.length} tree(s) (free ${before} GB before)`)
  for (const p of roots.sort((a, b) => b.wsMb - a.wsMb)) {
    console.log(`  PID ${p.pid} ${p.wsMb} MB age ${p.ageMin}m ${p.cmd}`)
    if (!dryRun) {
      const ok = killWindows(p.pid)
      console.log(ok ? `    killed ${p.pid}` : `    FAILED ${p.pid}`)
    }
  }
  if (!dryRun) {
    const after = freeMemGbWindows()
    console.log(`reap-orphans: free ${after} GB after`)
  }
}

main()
