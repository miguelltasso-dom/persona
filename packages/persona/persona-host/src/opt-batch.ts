/**
 * Scheduled librarian + initiative batches: only rows changed since the cursor.
 */

import { BrainRepos, OptRepos, type EventRepos } from '@deepseek-ai/dsh-persona-store'
import type { ProactivityHost, ProactivityTickResult } from './proactivity.ts'

const EPOCH = '1970-01-01T00:00:00.000Z'

/** One librarian lote. */
export interface LibrarianBatchView {
  readonly scanned: number
  readonly duplicates: number
  readonly reminders: number
  readonly since: string
}

/**
 * @param brain - Pages.
 * @param opt - Cursors.
 * @param now - Clock.
 */
export function tickLibrarianBatch(
  brain: BrainRepos,
  opt: OptRepos,
  projectId: string,
  now: () => string,
): LibrarianBatchView {
  const cursor = opt.getCursor('librarian', projectId)
  const since = cursor?.lastAt ?? EPOCH
  const pages = brain.listChangedSince(projectId, since).filter(page => page.updatedAt > since)
  const seen = new Set<string>()
  let duplicates = 0
  for (const page of pages) {
    const key = `${page.kind}:${page.body.trim().toLowerCase()}`
    if (seen.has(key)) duplicates += 1
    else seen.add(key)
  }
  const at = now()
  opt.putCursor('librarian', projectId, at)
  return {
    scanned: pages.length,
    duplicates,
    reminders: 0,
    since,
  }
}

/**
 * Initiative only when the project has events after the last pass.
 * @param proactivity - Existing ticker.
 * @param events - Project log.
 * @param opt - Cursors.
 */
export function tickInitiativeBatch(
  proactivity: ProactivityHost,
  events: EventRepos,
  opt: OptRepos,
  projectId: string,
  leaseUntil: string,
  stallAfterMs: number,
): ProactivityTickResult {
  const cursor = opt.getCursor('initiative', projectId)
  const since = cursor?.lastAt ?? EPOCH
  const changed = events.listProject(projectId).filter(row => row.occurredAt > since)
  if (changed.length === 0) {
    opt.putCursor('initiative', projectId, proactivity.now())
    return { initiatives: 0, skipped: 0, warnings: 0 }
  }
  const result = proactivity.tick(projectId, leaseUntil, stallAfterMs)
  opt.putCursor('initiative', projectId, proactivity.now())
  return result
}
