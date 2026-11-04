/**
 * Host timers aligned to the next due instant. No polling under 1 s.
 * Retention tick archives only unless the user opted into delete.
 */

import { DEFAULT_RETENTION, applyRetention } from '@deepseek-ai/dsh-persona-engine'
import {
  SqliteGovernanceRepos,
  SqliteRetention,
  TeachRepos,
  type PersonaStore,
  type ScreenRepos,
} from '@deepseek-ai/dsh-persona-store'
import { TEACH_RETENTION_DAYS } from './wave2.ts'

const KIND_POLICY = 'retention_policy'
const KIND_LOG = 'retention_log'
const POLICY_ID = 'default'
const MIN_DELAY_MS = 1_000

/** Configurable archive/delete windows. */
export interface HostRetentionPolicy {
  readonly archiveOnly: boolean
  readonly quietStart: string
  readonly quietEnd: string
}

/** One archive/delete line. */
export interface RetentionLogView {
  readonly id: string
  readonly at: string
  readonly action: 'archived' | 'deleted'
  readonly recordId: string
}

const DEFAULT_POLICY: HostRetentionPolicy = {
  archiveOnly: true,
  quietStart: '02:00',
  quietEnd: '06:00',
}

/**
 * Next-due timer + retention apply.
 */
export class HostScheduler {
  readonly store: PersonaStore
  readonly screens: ScreenRepos
  readonly nowMs: () => number
  timer: ReturnType<typeof setTimeout> | undefined
  lastReadyMs: number = 0
  readonly armed: Set<string> = new Set<string>()

  /**
   * @param store - Open store.
   * @param screens - Policy + log.
   * @param nowMs - Clock.
   */
  constructor(store: PersonaStore, screens: ScreenRepos, nowMs: () => number = () => Date.now()) {
    this.store = store
    this.screens = screens
    this.nowMs = nowMs
  }

  /**
   * @param projectId - Tenant.
   */
  getPolicy(projectId: string): HostRetentionPolicy {
    return this.screens.get<HostRetentionPolicy>(projectId, KIND_POLICY, POLICY_ID) ?? DEFAULT_POLICY
  }

  /**
   * @param projectId - Tenant.
   * @param policy - Next policy.
   */
  putPolicy(projectId: string, policy: HostRetentionPolicy): HostRetentionPolicy {
    this.screens.put(projectId, KIND_POLICY, POLICY_ID, policy)
    return policy
  }

  /**
   * @param projectId - Tenant.
   */
  listLog(projectId: string): RetentionLogView[] {
    return this.screens.list<RetentionLogView>(projectId, KIND_LOG)
  }

  /**
   * Archive (and optionally delete) outside the working day. Default is archive-only.
   * @param projectId - Tenant.
   * @param force - Skip the quiet-window check (tests / explicit user action).
   */
  tickRetention(projectId: string, force: boolean = false): RetentionLogView[] {
    const policy = this.getPolicy(projectId)
    if (!force && !inQuietWindow(this.nowMs(), policy.quietStart, policy.quietEnd)) return []
    const enginePolicy = policy.archiveOnly
      ? { windows: DEFAULT_RETENTION.windows.map(window => ({ kind: window.kind, archiveAfterMs: window.archiveAfterMs })) }
      : DEFAULT_RETENTION
    const result = applyRetention(new SqliteRetention(this.store), enginePolicy, this.nowMs())
    const at = new Date(this.nowMs()).toISOString()
    const rows: RetentionLogView[] = [
      ...result.archived.map(recordId => ({
        id: `arch:${recordId}:${at}`, at, action: 'archived' as const, recordId,
      })),
      ...result.deleted.map(recordId => ({
        id: `del:${recordId}:${at}`, at, action: 'deleted' as const, recordId,
      })),
    ]
    for (const row of rows) this.screens.put(projectId, KIND_LOG, row.id, row)
    const workspace = this.store.db.prepare(
      'SELECT workspace_id AS workspaceId FROM project WHERE id = ?',
    ).get(projectId) as { workspaceId: string } | undefined
    if (workspace !== undefined) {
      new SqliteGovernanceRepos(this.store).pruneAudit(workspace.workspaceId)
    }
    const teachGone = new TeachRepos(this.store).purgeExpired(
      new Date(this.nowMs()).toISOString(),
      TEACH_RETENTION_DAYS,
      projectId,
    )
    for (const item of teachGone) {
      const row = { id: `del:${item.id}:${at}`, at, action: 'deleted' as const, recordId: item.id }
      this.screens.put(projectId, KIND_LOG, row.id, row)
      rows.push(row)
    }
    return rows
  }

  /**
   * Arm a single timeout for the next quiet-window start. Never under 1 s.
   * @param projectId - Tenant.
   */
  arm(projectId: string): void {
    this.armed.add(projectId)
    if (this.timer !== undefined) return
    const policy = this.getPolicy(projectId)
    const delay = Math.max(MIN_DELAY_MS, msUntilQuiet(this.nowMs(), policy.quietStart))
    this.timer = setTimeout(() => {
      this.timer = undefined
      for (const id of this.armed) this.tickRetention(id)
      if (this.armed.size > 0) this.arm(projectId)
    }, delay)
    this.timer.unref()
  }

  /** Drop the pending timeout (host dispose). */
  dispose(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }
}

/**
 * @param nowMs - Clock.
 * @param start - HH:MM
 * @param end - HH:MM
 */
export function inQuietWindow(nowMs: number, start: string, end: string): boolean {
  const hm = new Date(nowMs).toISOString().slice(11, 16)
  if (start <= end) return hm >= start && hm < end
  return hm >= start || hm < end
}

/**
 * @param nowMs - Clock.
 * @param start - HH:MM of the next archive window.
 */
export function msUntilQuiet(nowMs: number, start: string): number {
  const next = new Date(nowMs)
  const [hour, minute] = start.split(':').map(part => Number(part))
  next.setUTCHours(hour ?? 2, minute ?? 0, 0, 0)
  if (next.getTime() <= nowMs) next.setUTCDate(next.getUTCDate() + 1)
  return next.getTime() - nowMs
}
