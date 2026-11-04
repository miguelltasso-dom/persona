/**
 * SQLite {@link Repositories} for one project (P2b). Document-per-row, STRICT, tenant `project_id`.
 */

import {
  latestAssignment,
  ticketStage,
  type Decision,
  type Repositories,
  type Thread,
  type Ticket,
  type Trigger,
  type TriggerDisposition,
} from '@deepseek-ai/dsh-persona-engine'
import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

const clone = <T>(value: T): T => structuredClone(value)

/**
 * Engine repositories bound to one `projectId` on an open store.
 * `atomic` uses {@link PersonaStore.tx} (IMMEDIATE + nested savepoints).
 * `afterCommit` runs after the outermost commit; hooks from a rolled-back tx are dropped.
 */
export class SqliteRepositories implements Repositories {
  readonly projectId: string
  readonly store: PersonaStore
  #depth = 0
  readonly #committed: Array<Array<() => void>> = []
  readonly #report: (error: unknown) => void

  /**
   * @param store - Open Persona store (schema ≥ 2).
   * @param projectId - Tenant (D-038).
   * @param report - Receives errors thrown by `afterCommit` hooks after a successful commit.
   */
  constructor(
    store: PersonaStore,
    projectId: string,
    report: (error: unknown) => void = () => {},
  ) {
    this.store = store
    this.projectId = projectId
    this.#report = report
  }

  afterCommit(action: () => void): void {
    if (this.#depth > 0) {
      const queued = this.#committed[this.#depth - 1]
      if (queued === undefined) throw new Error('afterCommit queue missing')
      queued.push(action)
      return
    }
    action()
  }

  atomic<T>(work: () => T): T {
    const level = this.#depth
    this.#committed[level] = []
    this.#depth += 1
    try {
      const value = this.store.tx(() => work())
      const actions = this.#committed[level] ?? []
      this.#committed[level] = []
      this.#depth = level
      if (level > 0) {
        const parent = this.#committed[level - 1]
        if (parent === undefined) throw new Error('afterCommit parent queue missing')
        parent.push(...actions)
      } else {
        for (const action of actions) {
          try { action() }
          catch (error: unknown) { this.#report(error) }
        }
      }
      return value
    } catch (error: unknown) {
      this.#committed[level] = []
      this.#depth = level
      throw error
    }
  }

  readonly triggers: Repositories['triggers'] = {
    get: (id: string): Trigger | undefined => this.#get('engine_trigger', id),
    save: (trigger: Trigger): void => {
      this.#upsert('engine_trigger', trigger.id, trigger)
    },
    disposition: (id: string): TriggerDisposition | undefined => this.#get('engine_disposition', id),
    saveDisposition: (id: string, value: TriggerDisposition): void => {
      this.#upsert('engine_disposition', id, value)
    },
  }

  readonly threads: Repositories['threads'] = {
    get: (key: string): Thread | undefined => this.#get('engine_thread', key, 'key'),
    save: (thread: Thread): void => {
      const body = JSON.stringify(clone(thread))
      this.store.tx((db) => {
        run(db, `INSERT INTO engine_thread (project_id, key, pending_len, evaluating, body) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(project_id, key) DO UPDATE SET pending_len = excluded.pending_len, evaluating = excluded.evaluating, body = excluded.body`, [
          this.projectId, thread.key, thread.pending.length, thread.evaluating === undefined ? 0 : 1, body,
        ])
      })
    },
    list: (): Thread[] => this.#listThreads(false),
    active: (): Thread[] => this.#listThreads(true),
  }

  readonly tickets: Repositories['tickets'] = {
    get: (id: string): Ticket | undefined => this.#get('engine_ticket', id),
    save: (ticket: Ticket): void => {
      const copied = clone(ticket)
      const stage = ticketStage(copied)
      const action = 'action' in stage ? stage.action : undefined
      const latest = latestAssignment(copied)
      const body = JSON.stringify(copied)
      this.store.tx((db) => {
        run(db, `INSERT INTO engine_ticket (project_id, id, updated_at, stage, stage_action, ended, undelivered_len, assignment_state, body)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id, id) DO UPDATE SET
            updated_at = excluded.updated_at, stage = excluded.stage, stage_action = excluded.stage_action,
            ended = excluded.ended, undelivered_len = excluded.undelivered_len, assignment_state = excluded.assignment_state, body = excluded.body`, [
          this.projectId, copied.id, copied.updatedAt, stage.stage, action ?? null,
          copied.ended === undefined ? 0 : 1, copied.undelivered.length, latest?.state ?? null, body,
        ])
      })
    },
    list: (): Ticket[] => this.#listTickets(''),
    open: (): Ticket[] => this.#listTickets('AND ended = 0'),
    active: (): Ticket[] => this.#listTickets("AND (undelivered_len > 0 OR assignment_state IN ('pending', 'running'))"),
  }

  readonly decisions: Repositories['decisions'] = {
    get: (id: string): Decision | undefined => this.#get('engine_decision', id),
    save: (decision: Decision): void => {
      const body = JSON.stringify(clone(decision))
      this.store.tx((db) => {
        run(db, `INSERT INTO engine_decision (project_id, id, thread_key, body) VALUES (?, ?, ?, ?)
          ON CONFLICT(project_id, id) DO UPDATE SET thread_key = excluded.thread_key, body = excluded.body`, [
          this.projectId, decision.id, decision.threadKey, body,
        ])
      })
    },
    byThread: (key: string): Decision[] => {
      const rows = this.store.db.prepare(
        'SELECT body FROM engine_decision WHERE project_id = ? AND thread_key = ? ORDER BY rowid ASC',
      ).all(this.projectId, key)
      return rows.map(row => parseBody<Decision>(row))
    },
  }

  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- caller chooses the stored engine document type
  #get<T>(table: string, id: string, column: string = 'id'): T | undefined {
    const row = this.store.db.prepare(
      `SELECT body FROM ${table} WHERE project_id = ? AND ${column} = ?`,
    ).get(this.projectId, id)
    return row === undefined ? undefined : parseBody<T>(row)
  }

  #upsert(table: 'engine_trigger' | 'engine_disposition', id: string, value: unknown): void {
    const body = JSON.stringify(clone(value))
    this.store.tx((db) => {
      run(db, `INSERT INTO ${table} (project_id, id, body) VALUES (?, ?, ?)
        ON CONFLICT(project_id, id) DO UPDATE SET body = excluded.body`, [this.projectId, id, body])
    })
  }

  #listThreads(activeOnly: boolean): Thread[] {
    const filter = activeOnly ? 'AND (pending_len > 0 OR evaluating = 1)' : ''
    const rows = this.store.db.prepare(
      `SELECT body FROM engine_thread WHERE project_id = ? ${filter} ORDER BY rowid ASC`,
    ).all(this.projectId)
    return rows.map(row => parseBody<Thread>(row))
  }

  #listTickets(filter: string): Ticket[] {
    const rows = this.store.db.prepare(
      `SELECT body FROM engine_ticket WHERE project_id = ? ${filter} ORDER BY rowid DESC`,
    ).all(this.projectId)
    return rows.map(row => parseBody<Ticket>(row))
  }
}

/**
 * Open repositories for `projectId` on an existing store.
 * @param store - Open store.
 * @param projectId - Tenant.
 * @returns Bound repositories.
 */
export function openSqliteRepositories(store: PersonaStore, projectId: string): SqliteRepositories {
  if (store.schemaVersion() < 2) throw new StoreError('constraint', 'engine-schema')
  return new SqliteRepositories(store, projectId)
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- JSON body type is chosen by the caller
function parseBody<T>(row: Record<string, SQLOutputValue>): T {
  return structuredClone(JSON.parse(text(row, 'body')) as T)
}
