/**
 * Workspace governance rows (schema ≥ 11 / GOV-5).
 */

import type { SQLOutputValue } from 'node:sqlite'
import { integer, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Editable sector plus policy JSON. */
export interface StoredSector {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly policyJson: string
  readonly updatedAt: string
}

/** Closed `[from, until)` when a human is out. */
export interface StoredAwayWindow {
  readonly id: string
  readonly workspaceId: string
  readonly humanId: string
  readonly kind: 'away' | 'absent'
  readonly from: string
  readonly until: string
}

/** Owner overlay for a recurring routine. */
export interface StoredRoutineCharge {
  readonly routineId: string
  readonly workspaceId: string
  readonly title: string
  readonly executorPersonaId?: string
  readonly responsibleHumanId?: string
  readonly sectorId?: string
  readonly requiresApproval: boolean
  readonly approvalKind?: string
  readonly autonomy?: string
  readonly cadence?: string
  readonly updatedAt: string
}

/** Who changed what, in whose name. */
export interface StoredGovernanceAudit {
  readonly id: string
  readonly workspaceId: string
  readonly at: string
  readonly action: string
  readonly actorId: string
  readonly body: string
}

/** Shareable workspace dump. Never a DM. */
export interface GovernanceDump {
  readonly sectors: readonly StoredSector[]
  readonly away: readonly StoredAwayWindow[]
  readonly routines: readonly StoredRoutineCharge[]
  readonly delegates: readonly string[]
  readonly audit: readonly StoredGovernanceAudit[]
}

/**
 * SQLite sectors, availability, routine owners, delegates, audit.
 */
export class SqliteGovernanceRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 11).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * @param workspaceId - Workspace.
   */
  listSectors(workspaceId: string): StoredSector[] {
    return this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, name, policy_json AS policyJson, updated_at AS updatedAt
         FROM sector WHERE workspace_id = ? ORDER BY name, id`,
    ).all(workspaceId).map(readSector)
  }

  /**
   * @param id - Sector.
   */
  getSector(id: string): StoredSector | undefined {
    const row = this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, name, policy_json AS policyJson, updated_at AS updatedAt
         FROM sector WHERE id = ?`,
    ).get(id)
    return row === undefined ? undefined : readSector(row)
  }

  /**
   * @param sector - Replacement.
   */
  putSector(sector: Omit<StoredSector, 'updatedAt'>): StoredSector {
    const updatedAt = this.now()
    this.store.tx((db) => {
      run(
        db,
        `INSERT INTO sector (id, workspace_id, name, policy_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, policy_json = excluded.policy_json, updated_at = excluded.updated_at`,
        [sector.id, sector.workspaceId, sector.name, sector.policyJson, updatedAt],
      )
    })
    return { ...sector, updatedAt }
  }

  /**
   * @param workspaceId - Workspace.
   */
  listAway(workspaceId: string): StoredAwayWindow[] {
    return this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, human_id AS humanId, kind,
              starts_at AS "from", until_at AS "until"
         FROM away_window WHERE workspace_id = ? ORDER BY starts_at, id`,
    ).all(workspaceId).map(readAway)
  }

  /**
   * Replace every window for one human. Empty `windows` clears.
   * @param workspaceId - Workspace.
   * @param humanId - Person.
   * @param windows - Next closed intervals.
   */
  setAway(
    workspaceId: string,
    humanId: string,
    windows: readonly Omit<StoredAwayWindow, 'id' | 'workspaceId' | 'humanId'>[],
  ): StoredAwayWindow[] {
    this.store.tx((db) => {
      run(db, 'DELETE FROM away_window WHERE workspace_id = ? AND human_id = ?', [workspaceId, humanId])
      for (const window of windows) {
        const id = `${humanId}:${window.from}`
        run(
          db,
          `INSERT INTO away_window (id, workspace_id, human_id, kind, starts_at, until_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, workspaceId, humanId, window.kind, window.from, window.until],
        )
      }
    })
    return this.listAway(workspaceId).filter(row => row.humanId === humanId)
  }

  /**
   * @param workspaceId - Workspace.
   */
  listRoutineCharges(workspaceId: string): StoredRoutineCharge[] {
    return this.store.db.prepare(
      `SELECT routine_id AS routineId, workspace_id AS workspaceId, title,
              executor_persona_id AS executorPersonaId, responsible_human_id AS responsibleHumanId,
              sector_id AS sectorId, requires_approval AS requiresApproval,
              approval_kind AS approvalKind, autonomy, cadence, updated_at AS updatedAt
         FROM routine_charge WHERE workspace_id = ? ORDER BY title, routine_id`,
    ).all(workspaceId).map(readRoutineCharge)
  }

  /**
   * @param row - Replacement.
   */
  putRoutineCharge(row: Omit<StoredRoutineCharge, 'updatedAt'>): StoredRoutineCharge {
    const updatedAt = this.now()
    this.store.tx((db) => {
      run(
        db,
        `INSERT INTO routine_charge (
           routine_id, workspace_id, title, executor_persona_id, responsible_human_id,
           sector_id, requires_approval, approval_kind, autonomy, cadence, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(routine_id) DO UPDATE SET
           title = excluded.title,
           executor_persona_id = excluded.executor_persona_id,
           responsible_human_id = excluded.responsible_human_id,
           sector_id = excluded.sector_id,
           requires_approval = excluded.requires_approval,
           approval_kind = excluded.approval_kind,
           autonomy = excluded.autonomy,
           cadence = excluded.cadence,
           updated_at = excluded.updated_at`,
        [
          row.routineId, row.workspaceId, row.title,
          row.executorPersonaId ?? null, row.responsibleHumanId ?? null,
          row.sectorId ?? null, row.requiresApproval ? 1 : 0,
          row.approvalKind ?? null, row.autonomy ?? null, row.cadence ?? null, updatedAt,
        ],
      )
    })
    return { ...row, updatedAt }
  }

  /**
   * Forget everything governance holds for a deleted routine (its charge and its delegation to Coordenação), so no ghost
   * row stays in “Quem cuida de quem”. Missing rows are fine.
   * @param workspaceId - Workspace.
   * @param routineId - Routine that no longer exists.
   */
  deleteRoutineCharge(workspaceId: string, routineId: string): void {
    this.store.tx((db) => {
      run(db, 'DELETE FROM routine_charge WHERE workspace_id = ? AND routine_id = ?', [workspaceId, routineId])
      run(db, 'DELETE FROM governance_delegate WHERE workspace_id = ? AND routine_id = ?', [workspaceId, routineId])
    })
  }

  /**
   * @param workspaceId - Workspace.
   */
  listDelegates(workspaceId: string): readonly string[] {
    return this.store.db.prepare(
      'SELECT routine_id AS routineId FROM governance_delegate WHERE workspace_id = ?',
    ).all(workspaceId).map(row => text(row, 'routineId'))
  }

  /**
   * @param workspaceId - Workspace.
   * @param routineId - Routine delegated to Coordenação.
   */
  addDelegate(workspaceId: string, routineId: string): void {
    this.store.tx((db) => {
      run(
        db,
        'INSERT INTO governance_delegate (workspace_id, routine_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
        [workspaceId, routineId],
      )
    })
  }

  /**
   * Newest first.
   * @param workspaceId - Workspace.
   */
  listAudit(workspaceId: string): StoredGovernanceAudit[] {
    return this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, at, action, actor_id AS actorId, body
         FROM governance_audit WHERE workspace_id = ? ORDER BY at DESC, id DESC`,
    ).all(workspaceId).map(readAudit)
  }

  /**
   * Shareable dump. DMs are never included.
   * @param workspaceId - Workspace.
   */
  snapshot(workspaceId: string): GovernanceDump {
    return {
      sectors: this.listSectors(workspaceId),
      away: this.listAway(workspaceId),
      routines: this.listRoutineCharges(workspaceId),
      delegates: this.listDelegates(workspaceId),
      audit: this.listAudit(workspaceId),
    }
  }

  /**
   * Replace workspace governance from a dump (import / sync). Idempotent.
   * @param workspaceId - Workspace.
   * @param dump - Dump.
   */
  restore(workspaceId: string, dump: GovernanceDump): void {
    this.store.tx((db) => {
      run(db, 'DELETE FROM governance_audit WHERE workspace_id = ?', [workspaceId])
      run(db, 'DELETE FROM governance_delegate WHERE workspace_id = ?', [workspaceId])
      run(db, 'DELETE FROM routine_charge WHERE workspace_id = ?', [workspaceId])
      run(db, 'DELETE FROM away_window WHERE workspace_id = ?', [workspaceId])
      run(db, 'DELETE FROM sector WHERE workspace_id = ?', [workspaceId])
    })
    for (const sector of dump.sectors) {
      this.putSector({
        id: sector.id, workspaceId, name: sector.name, policyJson: sector.policyJson,
      })
    }
    const byHuman = new Map<string, Omit<StoredAwayWindow, 'id' | 'workspaceId' | 'humanId'>[]>()
    for (const window of dump.away) {
      const list = byHuman.get(window.humanId) ?? []
      list.push({ kind: window.kind, from: window.from, until: window.until })
      byHuman.set(window.humanId, list)
    }
    for (const [humanId, windows] of byHuman) this.setAway(workspaceId, humanId, windows)
    for (const row of dump.routines) {
      this.putRoutineCharge({
        routineId: row.routineId, workspaceId, title: row.title,
        requiresApproval: row.requiresApproval,
        ...(row.executorPersonaId === undefined ? {} : { executorPersonaId: row.executorPersonaId }),
        ...(row.responsibleHumanId === undefined ? {} : { responsibleHumanId: row.responsibleHumanId }),
        ...(row.sectorId === undefined ? {} : { sectorId: row.sectorId }),
        ...(row.approvalKind === undefined ? {} : { approvalKind: row.approvalKind }),
        ...(row.autonomy === undefined ? {} : { autonomy: row.autonomy }),
        ...(row.cadence === undefined ? {} : { cadence: row.cadence }),
      })
    }
    for (const routineId of dump.delegates) this.addDelegate(workspaceId, routineId)
    for (const row of dump.audit) {
      this.putAudit({ ...row, workspaceId })
    }
  }

  /**
   * Keep the newest `keep` audit rows. Older ones are dropped (GOV-5 retention).
   * @param workspaceId - Workspace.
   * @param keep - Rows to keep (default 200).
   * @returns Deleted count.
   */
  pruneAudit(workspaceId: string, keep: number = 200): number {
    const cap = Math.max(0, Math.trunc(keep))
    const ids = this.listAudit(workspaceId).map(row => row.id)
    if (ids.length <= cap) return 0
    const drop = ids.slice(cap)
    this.store.tx((db) => {
      for (const id of drop) run(db, 'DELETE FROM governance_audit WHERE id = ?', [id])
    })
    return drop.length
  }

  /**
   * @param row - Decision or mutation.
   */
  putAudit(row: StoredGovernanceAudit): StoredGovernanceAudit {
    this.store.tx((db) => {
      run(
        db,
        `INSERT INTO governance_audit (id, workspace_id, at, action, actor_id, body)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, row.workspaceId, row.at, row.action, row.actorId, row.body],
      )
    })
    return row
  }
}

function readSector(row: Record<string, SQLOutputValue>): StoredSector {
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    name: text(row, 'name'),
    policyJson: text(row, 'policyJson'),
    updatedAt: text(row, 'updatedAt'),
  }
}

function readAway(row: Record<string, SQLOutputValue>): StoredAwayWindow {
  const kind = text(row, 'kind')
  if (kind !== 'away' && kind !== 'absent') throw new Error('away-kind')
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    humanId: text(row, 'humanId'),
    kind,
    from: text(row, 'from'),
    until: text(row, 'until'),
  }
}

function readRoutineCharge(row: Record<string, SQLOutputValue>): StoredRoutineCharge {
  const executorPersonaId = optionalText(row, 'executorPersonaId')
  const responsibleHumanId = optionalText(row, 'responsibleHumanId')
  const sectorId = optionalText(row, 'sectorId')
  const approvalKind = optionalText(row, 'approvalKind')
  const autonomy = optionalText(row, 'autonomy')
  const cadence = optionalText(row, 'cadence')
  return {
    routineId: text(row, 'routineId'),
    workspaceId: text(row, 'workspaceId'),
    title: text(row, 'title'),
    ...(executorPersonaId === undefined ? {} : { executorPersonaId }),
    ...(responsibleHumanId === undefined ? {} : { responsibleHumanId }),
    ...(sectorId === undefined ? {} : { sectorId }),
    requiresApproval: integer(row, 'requiresApproval') === 1,
    ...(approvalKind === undefined ? {} : { approvalKind }),
    ...(autonomy === undefined ? {} : { autonomy }),
    ...(cadence === undefined ? {} : { cadence }),
    updatedAt: text(row, 'updatedAt'),
  }
}

function readAudit(row: Record<string, SQLOutputValue>): StoredGovernanceAudit {
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    at: text(row, 'at'),
    action: text(row, 'action'),
    actorId: text(row, 'actorId'),
    body: text(row, 'body'),
  }
}
