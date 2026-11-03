/** Clean host teardown: WAL checkpoint and child-process tree kill. */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const HOST_STOP_BUDGET_MS = 10_000

/**
 * Checkpoint SQLite WAL so a kill cannot leave a torn journal.
 * @param dbPath - persona.db (no-op if missing).
 */
export async function checkpointSqliteWal(dbPath: string): Promise<void> {
  if (!existsSync(dbPath)) return
  const sqlite = await import('node:sqlite')
  const db = new sqlite.DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
}

/**
 * Default persona.db under a product home.
 * @param home - PERSONA_HOME.
 */
export function personaDbPath(home: string): string {
  return join(home, 'db', 'persona.db')
}

/**
 * Kill a process and every descendant. Windows uses `taskkill /T`.
 * @param pid - Root pid.
 */
export async function killProcessTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    } catch (error) {
      void error
    }
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    void error
    try {
      process.kill(pid, 'SIGKILL')
    } catch (fallback) {
      void fallback
    }
  }
}
