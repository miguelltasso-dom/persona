/**
 * Per-project workflow, ticket seats, and sprints (schema ≥ 8 / PB-4).
 */

import {
  assertWorkflow,
  type PlacementStore,
  type ProjectWorkflow,
  type Sprint,
  type StageCategory,
  type TicketBoardSeat,
  type WorkflowColumn,
  type WorkflowField,
  type WorkflowFieldKind,
  type WorkflowStore,
  type WorkflowTemplateId,
} from '@deepseek-ai/dsh-persona-core'
import type { SQLOutputValue } from 'node:sqlite'
import { integer, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

const TEMPLATES: readonly WorkflowTemplateId[] = [
  'contratacao', 'site', 'software', 'marketing', 'atendimento', 'simples', 'em_branco',
]
const CATEGORIES: readonly StageCategory[] = ['todo', 'doing', 'review', 'needs_you', 'done']
const FIELD_KINDS: readonly WorkflowFieldKind[] = ['text', 'link', 'number', 'date', 'select']
const SPRINT_STATUS = ['planejado', 'ativo', 'encerrado'] as const

/** Shareable board dump (workflow + seats + sprints). Never a DM. */
export interface BoardSnapshot {
  readonly workflow?: ProjectWorkflow
  readonly seats: readonly TicketBoardSeat[]
  readonly sprints: readonly Sprint[]
}

/**
 * SQLite workflow, seats, and sprints. Sprint `list` is {@link listSprints}
 * so it does not collide with {@link PlacementStore.list}.
 */
export class SqliteBoardRepos implements WorkflowStore, PlacementStore {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 8).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * @param projectId - Tenant.
   */
  get(projectId: string): ProjectWorkflow | undefined {
    const head = this.store.db.prepare(
      'SELECT template FROM project_workflow WHERE project_id = ?',
    ).get(projectId)
    if (head === undefined) return undefined
    const template = text(head, 'template')
    if (!isTemplate(template)) return undefined
    const columns = this.store.db.prepare(
      `SELECT id, name, category, color, icon, wip
         FROM workflow_column WHERE project_id = ? ORDER BY ord ASC, id ASC`,
    ).all(projectId).map(readColumn)
    const fields = this.store.db.prepare(
      `SELECT id, name, kind, options_json AS optionsJson
         FROM workflow_field WHERE project_id = ? ORDER BY ord ASC, id ASC`,
    ).all(projectId).map(readField)
    return { projectId, template, columns, fields }
  }

  /**
   * Persist a flow (WorkflowStore) or a seat (PlacementStore).
   * @param value - Flow or seat.
   */
  save(value: ProjectWorkflow | TicketBoardSeat): void {
    if ('ticketId' in value) {
      this.saveSeat(value)
      return
    }
    this.persistWorkflow(value)
  }

  /**
   * @param workflow - Snapshot. Replaces columns and fields of the project.
   */
  persistWorkflow(workflow: ProjectWorkflow): void {
    assertWorkflow(workflow)
    const at = this.now()
    this.store.tx((db) => {
      run(db, `INSERT INTO project_workflow (project_id, template, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET template = excluded.template, updated_at = excluded.updated_at`, [
        workflow.projectId, workflow.template, at,
      ])
      run(db, 'DELETE FROM workflow_column WHERE project_id = ?', [workflow.projectId])
      run(db, 'DELETE FROM workflow_field WHERE project_id = ?', [workflow.projectId])
      workflow.columns.forEach((column, ord) => {
        run(db, `INSERT INTO workflow_column
          (project_id, id, name, category, color, icon, wip, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
          workflow.projectId, column.id, column.name, column.category,
          column.color ?? null, column.icon ?? null, column.wip ?? null, ord,
        ])
      })
      workflow.fields.forEach((field, ord) => {
        run(db, `INSERT INTO workflow_field
          (project_id, id, name, kind, options_json, ord) VALUES (?, ?, ?, ?, ?, ?)`, [
          workflow.projectId, field.id, field.name, field.kind,
          field.options === undefined ? null : JSON.stringify(field.options), ord,
        ])
      })
    })
  }

  /**
   * @param projectId - Tenant.
   */
  list(projectId: string): TicketBoardSeat[] {
    return this.store.db.prepare(
      `SELECT ticket_id AS ticketId, project_id AS projectId, column_id AS columnId,
              sprint_id AS sprintId, blocked, campos_json AS camposJson
         FROM ticket_seat WHERE project_id = ?`,
    ).all(projectId).map(readSeat)
  }

  /**
   * @param ticketId - Ticket.
   */
  of(ticketId: string): TicketBoardSeat | undefined {
    const row = this.store.db.prepare(
      `SELECT ticket_id AS ticketId, project_id AS projectId, column_id AS columnId,
              sprint_id AS sprintId, blocked, campos_json AS camposJson
         FROM ticket_seat WHERE ticket_id = ?`,
    ).get(ticketId)
    return row === undefined ? undefined : readSeat(row)
  }

  /**
   * @param seat - Seat.
   */
  saveSeat(seat: TicketBoardSeat): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO ticket_seat
        (ticket_id, project_id, column_id, sprint_id, blocked, campos_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticket_id) DO UPDATE SET
          project_id = excluded.project_id, column_id = excluded.column_id,
          sprint_id = excluded.sprint_id, blocked = excluded.blocked, campos_json = excluded.campos_json`, [
        seat.ticketId, seat.projectId, seat.columnId ?? null, seat.sprintId ?? null,
        seat.blocked === true ? 1 : 0,
        seat.campos === undefined ? null : JSON.stringify(seat.campos),
      ])
    })
  }

  /**
   * @param workflow - Snapshot.
   */
  saveWorkflow(workflow: ProjectWorkflow): void {
    this.persistWorkflow(workflow)
  }

  /**
   * @param projectId - Tenant.
   */
  listSprints(projectId: string): Sprint[] {
    const heads = this.store.db.prepare(
      `SELECT id, project_id AS projectId, name, objective, status,
              starts_at AS startsAt, ends_at AS endsAt, goal_id AS goalId
         FROM sprint WHERE project_id = ?
         ORDER BY CASE status WHEN 'ativo' THEN 0 WHEN 'planejado' THEN 1 ELSE 2 END, name ASC`,
    ).all(projectId)
    return heads.map(row => this.readSprint(row))
  }

  /**
   * @param sprint - Snapshot. Replaces the planned ticket set.
   */
  saveSprint(sprint: Sprint): void {
    const at = this.now()
    this.store.tx((db) => {
      run(db, `INSERT INTO sprint
        (id, project_id, name, objective, status, starts_at, ends_at, goal_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, objective = excluded.objective, status = excluded.status,
          starts_at = excluded.starts_at, ends_at = excluded.ends_at, goal_id = excluded.goal_id,
          updated_at = excluded.updated_at`, [
        sprint.id, sprint.projectId, sprint.name, sprint.objective, sprint.status,
        sprint.startsAt ?? null, sprint.endsAt ?? null, sprint.goalId, at, at,
      ])
      run(db, 'DELETE FROM sprint_ticket WHERE sprint_id = ?', [sprint.id])
      sprint.ticketIds.forEach((ticketId, ord) => {
        run(db, 'INSERT INTO sprint_ticket (sprint_id, ticket_id, ord) VALUES (?, ?, ?)', [
          sprint.id, ticketId, ord,
        ])
      })
    })
  }

  /**
   * Drop a sprint. Seats keep the ticket; `sprint_id` becomes null.
   * @param sprintId - Sprint.
   */
  deleteSprint(sprintId: string): void {
    this.store.tx((db) => {
      run(db, 'DELETE FROM sprint_ticket WHERE sprint_id = ?', [sprintId])
      run(db, 'DELETE FROM sprint WHERE id = ?', [sprintId])
    })
  }

  /**
   * Active sprint, else the latest planning one.
   * @param projectId - Tenant.
   */
  current(projectId: string): Sprint | undefined {
    const rows = this.listSprints(projectId)
    return rows.find(row => row.status === 'ativo') ?? rows.find(row => row.status === 'planejado')
  }

  /**
   * Shareable dump. DMs are never included.
   * @param projectId - Tenant.
   */
  snapshot(projectId: string): BoardSnapshot {
    const workflow = this.get(projectId)
    const snap: BoardSnapshot = {
      seats: this.list(projectId),
      sprints: this.listSprints(projectId),
    }
    return workflow === undefined ? snap : { ...snap, workflow }
  }

  /**
   * Replace the project's board from a snapshot (import / sync).
   * @param projectId - Tenant.
   * @param snap - Dump.
   */
  restore(projectId: string, snap: BoardSnapshot): void {
    this.store.tx((db) => {
      const sprintIds = this.store.db.prepare(
        'SELECT id FROM sprint WHERE project_id = ?',
      ).all(projectId) as Array<{ id: string }>
      for (const row of sprintIds) {
        run(db, 'DELETE FROM sprint_ticket WHERE sprint_id = ?', [row.id])
      }
      run(db, 'DELETE FROM ticket_seat WHERE project_id = ?', [projectId])
      run(db, 'DELETE FROM sprint WHERE project_id = ?', [projectId])
      run(db, 'DELETE FROM workflow_column WHERE project_id = ?', [projectId])
      run(db, 'DELETE FROM workflow_field WHERE project_id = ?', [projectId])
      run(db, 'DELETE FROM project_workflow WHERE project_id = ?', [projectId])
    })
    if (snap.workflow !== undefined) this.saveWorkflow({ ...snap.workflow, projectId })
    for (const sprint of snap.sprints) this.saveSprint({ ...sprint, projectId })
    for (const seat of snap.seats) this.saveSeat({ ...seat, projectId })
  }

  private readSprint(row: Record<string, SQLOutputValue>): Sprint {
    const id = text(row, 'id')
    const status = text(row, 'status')
    if (!isSprintStatus(status)) throw new Error('constraint')
    const ticketIds = this.store.db.prepare(
      'SELECT ticket_id AS ticketId FROM sprint_ticket WHERE sprint_id = ? ORDER BY ord ASC',
    ).all(id).map(item => text(item, 'ticketId'))
    const sprint: Sprint = {
      id,
      projectId: text(row, 'projectId'),
      name: text(row, 'name'),
      objective: text(row, 'objective'),
      status,
      ticketIds,
      goalId: text(row, 'goalId'),
    }
    const startsAt = optionalText(row, 'startsAt')
    const endsAt = optionalText(row, 'endsAt')
    if (startsAt !== undefined) sprint.startsAt = startsAt
    if (endsAt !== undefined) sprint.endsAt = endsAt
    return sprint
  }
}

/**
 * @param value - Candidate template id.
 */
function isTemplate(value: string): value is WorkflowTemplateId {
  return (TEMPLATES as readonly string[]).includes(value)
}

/**
 * @param value - Candidate category.
 */
function isCategory(value: string): value is StageCategory {
  return (CATEGORIES as readonly string[]).includes(value)
}

/**
 * @param value - Candidate field kind.
 */
function isFieldKind(value: string): value is WorkflowFieldKind {
  return (FIELD_KINDS as readonly string[]).includes(value)
}

/**
 * @param value - Candidate sprint status.
 */
function isSprintStatus(value: string): value is Sprint['status'] {
  return (SPRINT_STATUS as readonly string[]).includes(value)
}

function readColumn(row: Record<string, SQLOutputValue>): WorkflowColumn {
  const category = text(row, 'category')
  if (!isCategory(category)) throw new Error('constraint')
  const column: WorkflowColumn = {
    id: text(row, 'id'),
    name: text(row, 'name'),
    category,
  }
  const color = optionalText(row, 'color')
  const icon = optionalText(row, 'icon')
  if (color !== undefined) column.color = color
  if (icon !== undefined) column.icon = icon
  const wip = row.wip
  if (typeof wip === 'number' && Number.isInteger(wip)) column.wip = wip
  return column
}

function readField(row: Record<string, SQLOutputValue>): WorkflowField {
  const kind = text(row, 'kind')
  if (!isFieldKind(kind)) throw new Error('constraint')
  const field: WorkflowField = {
    id: text(row, 'id'),
    name: text(row, 'name'),
    kind,
  }
  const raw = optionalText(row, 'optionsJson')
  if (raw !== undefined) {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
      field.options = parsed
    }
  }
  return field
}

function readSeat(row: Record<string, SQLOutputValue>): TicketBoardSeat {
  const seat: TicketBoardSeat = {
    ticketId: text(row, 'ticketId'),
    projectId: text(row, 'projectId'),
  }
  const columnId = optionalText(row, 'columnId')
  const sprintId = optionalText(row, 'sprintId')
  if (columnId !== undefined) seat.columnId = columnId
  if (sprintId !== undefined) seat.sprintId = sprintId
  if (integer(row, 'blocked') === 1) seat.blocked = true
  const raw = optionalText(row, 'camposJson')
  if (raw !== undefined) {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const campos: Record<string, string | number> = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' || typeof value === 'number') campos[key] = value
      }
      seat.campos = campos
    }
  }
  return seat
}
