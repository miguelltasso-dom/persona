/** Measure application-owned history and drafts without following links into user folders. */
import { lstat, readdir } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { join } from 'node:path'
import { confinePath, HISTORY_RESTORE_RETENTION_MS } from '@deepseek-ai/dsh-persona-engine'
import { reviewHomeOf, reviewTreesOf } from './review.ts'
import type { ProjectStorageUsageView } from './types.ts'

async function logicalBytes(path: string): Promise<number> {
  let stat: Stats
  try { stat = await lstat(path) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0
    throw error
  }
  if (stat.isSymbolicLink()) throw new Error('history-storage-link')
  if (stat.isFile()) return stat.size
  if (!stat.isDirectory()) throw new Error('history-storage-kind')
  let bytes = 0
  for (const entry of await readdir(path)) bytes += await logicalBytes(join(path, entry))
  return bytes
}

/**
 * Count logical file bytes; missing private directories measure zero without creating them.
 * @param projectId - Project already authorized by the Remote.
 * @returns Independent history/draft counters or explicit unavailability, never partial zeroes.
 */
export async function projectStorageUsage(projectId: string): Promise<ProjectStorageUsageView> {
  const history = confinePath(join(reviewHomeOf(), 'history'), projectId)
  const drafts = reviewTreesOf(projectId)
  const retentionDays = HISTORY_RESTORE_RETENTION_MS / (24 * 60 * 60 * 1000)
  try {
    const historyBytes = await logicalBytes(history)
    const draftBytes = await logicalBytes(drafts)
    return { status: 'measured', historyBytes, draftBytes, totalBytes: historyBytes + draftBytes, retentionDays }
  } catch (error) {
    // A partial scan is not a trustworthy measurement; the caller can retry without data loss.
    void error
    return { status: 'unavailable', historyBytes: null, draftBytes: null, totalBytes: null, retentionDays }
  }
}
