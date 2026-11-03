/**
 * Routine calendar and leased runs. Idempotency key is `routine_id:scheduled_for` (D-014).
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Catch-up policy when several due instants piled up. */
export type CatchUp = 'skip' | 'run_once' | 'run_all'

/** One persisted routine. */
export interface Routine {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly rrule: string
  readonly timeZone: string
  readonly paused: boolean
  readonly silenceStart?: string
  readonly silenceEnd?: string
  readonly catchUp: CatchUp
  readonly createdAt: string
  readonly updatedAt: string
}

/** One scheduled occurrence. */
export interface RoutineRun {
  readonly id: string
  readonly projectId: string
  readonly routineId: string
  readonly scheduledFor: string
  readonly leaseUntil?: string
  readonly status: 'pending' | 'leased' | 'done' | 'failed' | 'cancelled'
  readonly attempt: number
}

/** Fields to create a routine. */
export interface CreateRoutineInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly rrule: string
  readonly timeZone: string
  readonly catchUp: CatchUp
  readonly silenceStart?: string
  readonly silenceEnd?: string
}

/** Repositories for `routine` / `routine_run`. Clock is injectable for tests. */
export class RoutineRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store.
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * Persist a routine. The project must exist.
   * @param input - Routine fields.
   * @returns The stored routine.
   */
  create(input: CreateRoutineInput): Routine {
    if (this.store.db.prepare('SELECT 1 AS ok FROM project WHERE id = ?').get(input.projectId) === undefined) {
      throw new StoreError('not-found', input.projectId)
    }
    const now = this.now()
    this.store.tx((db) => {
      run(db, 'INSERT INTO routine (id, workspace_id, project_id, name, rrule, time_zone, paused, silence_start, silence_end, catch_up, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)', [
        input.id, input.workspaceId, input.projectId, input.name, input.rrule, input.timeZone,
        input.silenceStart ?? null, input.silenceEnd ?? null, input.catchUp, now, now,
      ])
    })
    const created = this.get(input.id)
    if (created === undefined) throw new StoreError('not-found', input.id)
    return created
  }

  /**
   * @param id - Routine id.
   * @returns The routine or `undefined`.
   */
  get(id: string): Routine | undefined {
    const row = this.store.db.prepare('SELECT * FROM routine WHERE id = ?').get(id)
    return row === undefined ? undefined : readRoutine(row)
  }

  /**
   * @param projectId - Tenant.
   * @returns Routines, newest first.
   */
  list(projectId: string): Routine[] {
    return this.store.db.prepare(
      'SELECT * FROM routine WHERE project_id = ? ORDER BY created_at DESC, id DESC',
    ).all(projectId).map(readRoutine)
  }

  /**
   * Pause or resume one routine. Pausing cancels its pending and leased runs.
   * @param id - Routine id.
   * @param paused - Next flag.
   * @returns The updated routine.
   */
  setPaused(id: string, paused: boolean): Routine {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const now = this.now()
    this.store.tx((db) => {
      run(db, 'UPDATE routine SET paused = ?, updated_at = ? WHERE id = ?', [paused ? 1 : 0, now, id])
      if (paused) {
        run(db, "UPDATE routine_run SET status = 'cancelled', lease_until = NULL WHERE routine_id = ? AND status IN ('pending', 'leased')", [id])
      }
    })
    const next = this.get(id)
    if (next === undefined) throw new StoreError('not-found', id)
    return next
  }

  /**
   * Pause every routine in the project and cancel active runs.
   * @param projectId - Tenant.
   */
  pauseTeam(projectId: string): void {
    const now = this.now()
    this.store.tx((db) => {
      run(db, 'UPDATE routine SET paused = 1, updated_at = ? WHERE project_id = ?', [now, projectId])
      run(db, "UPDATE routine_run SET status = 'cancelled', lease_until = NULL WHERE project_id = ? AND status IN ('pending', 'leased')", [projectId])
    })
  }

  /**
   * Insert a pending occurrence. Unique on `(routine_id, scheduled_for)`.
   * @param input - Run identity.
   * @returns The stored run (existing row when the key already exists).
   */
  schedule(input: { id: string; routineId: string; scheduledFor: string }): RoutineRun {
    const routine = this.get(input.routineId)
    if (routine === undefined) throw new StoreError('not-found', input.routineId)
    if (routine.paused) throw new StoreError('constraint', 'paused')
    this.store.tx((db) => {
      run(db, 'INSERT INTO routine_run (id, project_id, routine_id, scheduled_for, lease_until, status, attempt) VALUES (?, ?, ?, ?, NULL, \'pending\', 0) ON CONFLICT(routine_id, scheduled_for) DO NOTHING', [
        input.id, routine.projectId, input.routineId, input.scheduledFor,
      ])
    })
    const row = this.store.db.prepare(
      'SELECT * FROM routine_run WHERE routine_id = ? AND scheduled_for = ?',
    ).get(input.routineId, input.scheduledFor)
    if (row === undefined) throw new StoreError('not-found', input.routineId)
    return readRun(row)
  }

  /**
   * Lease due pending runs under IMMEDIATE. Honors pause, silence, and catch-up.
   * @param projectId - Tenant.
   * @param leaseUntil - Lease expiry instant.
   * @returns Newly leased runs.
   */
  claimDue(projectId: string, leaseUntil: string): RoutineRun[] {
    const now = this.now()
    return this.store.tx((db) => {
      const routines = db.prepare('SELECT * FROM routine WHERE project_id = ? AND paused = 0').all(projectId).map(readRoutine)
      const claimed: RoutineRun[] = []
      for (const routine of routines) {
        if (inSilence(now, routine.silenceStart, routine.silenceEnd)) continue
        const due = db.prepare(
          "SELECT * FROM routine_run WHERE routine_id = ? AND status = 'pending' AND scheduled_for <= ? ORDER BY scheduled_for ASC, id ASC",
        ).all(routine.id, now).map(readRun)
        const picked = pickDue(due, routine.catchUp)
        for (const extra of due.filter(run => !picked.includes(run))) {
          run(db, "UPDATE routine_run SET status = 'cancelled' WHERE id = ?", [extra.id])
        }
        for (const item of picked) {
          const row = db.prepare(
            "UPDATE routine_run SET status = 'leased', lease_until = ? WHERE id = ? AND status = 'pending' RETURNING *",
          ).get(leaseUntil, item.id)
          if (row !== undefined) claimed.push(readRun(row))
        }
      }
      return claimed
    })
  }

  /**
   * Mark a leased run done.
   * @param id - Run id.
   */
  complete(id: string): void {
    this.store.tx((db) => {
      run(db, "UPDATE routine_run SET status = 'done', lease_until = NULL WHERE id = ? AND status = 'leased'", [id])
    })
  }

  /**
   * Mark a leased run failed and increment the attempt.
   * @param id - Run id.
   */
  fail(id: string): void {
    this.store.tx((db) => {
      run(db, "UPDATE routine_run SET status = 'failed', lease_until = NULL, attempt = attempt + 1 WHERE id = ? AND status = 'leased'", [id])
    })
  }

  /**
   * Re-queue a failed run as pending (retry).
   * @param id - Run id.
   * @returns The pending run.
   */
  retry(id: string): RoutineRun {
    this.store.tx((db) => {
      run(db, "UPDATE routine_run SET status = 'pending', lease_until = NULL WHERE id = ? AND status = 'failed'", [id])
    })
    const row = this.store.db.prepare('SELECT * FROM routine_run WHERE id = ?').get(id)
    if (row === undefined) throw new StoreError('not-found', id)
    const next = readRun(row)
    if (next.status !== 'pending') throw new StoreError('constraint', 'retry')
    return next
  }

  /**
   * @param id - Run id.
   * @returns The run or `undefined`.
   */
  getRun(id: string): RoutineRun | undefined {
    const row = this.store.db.prepare('SELECT * FROM routine_run WHERE id = ?').get(id)
    return row === undefined ? undefined : readRun(row)
  }

  /**
   * @param routineId - Parent routine.
   * @returns Runs, newest scheduled first.
   */
  listRuns(routineId: string): RoutineRun[] {
    return this.store.db.prepare(
      'SELECT * FROM routine_run WHERE routine_id = ? ORDER BY scheduled_for DESC, id DESC',
    ).all(routineId).map(readRun)
  }
}

function pickDue(due: RoutineRun[], catchUp: CatchUp): RoutineRun[] {
  if (due.length === 0) return []
  if (catchUp === 'skip') return []
  if (catchUp === 'run_once') {
    const last = due.at(-1)
    return last === undefined ? [] : [last]
  }
  return due
}

function inSilence(now: string, start?: string, end?: string): boolean {
  if (start === undefined || end === undefined) return false
  const hm = now.slice(11, 16)
  if (hm.length !== 5) return false
  if (start <= end) return hm >= start && hm < end
  return hm >= start || hm < end
}

function readCatchUp(value: string): CatchUp {
  if (value !== 'skip' && value !== 'run_once' && value !== 'run_all') throw new StoreError('constraint', 'catchUp')
  return value
}

function readStatus(value: string): RoutineRun['status'] {
  if (value !== 'pending' && value !== 'leased' && value !== 'done' && value !== 'failed' && value !== 'cancelled') {
    throw new StoreError('constraint', 'status')
  }
  return value
}

function readRoutine(row: Record<string, SQLOutputValue>): Routine {
  const silenceStart = optionalText(row, 'silence_start')
  const silenceEnd = optionalText(row, 'silence_end')
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    name: text(row, 'name'),
    rrule: text(row, 'rrule'),
    timeZone: text(row, 'time_zone'),
    paused: integer(row, 'paused') === 1,
    ...(silenceStart === undefined ? {} : { silenceStart }),
    ...(silenceEnd === undefined ? {} : { silenceEnd }),
    catchUp: readCatchUp(text(row, 'catch_up')),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  }
}

function readRun(row: Record<string, SQLOutputValue>): RoutineRun {
  const leaseUntil = optionalText(row, 'lease_until')
  return {
    id: text(row, 'id'),
    projectId: text(row, 'project_id'),
    routineId: text(row, 'routine_id'),
    scheduledFor: text(row, 'scheduled_for'),
    ...(leaseUntil === undefined ? {} : { leaseUntil }),
    status: readStatus(text(row, 'status')),
    attempt: integer(row, 'attempt'),
  }
}
