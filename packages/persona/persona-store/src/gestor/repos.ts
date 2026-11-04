/**
 * Gestor de equipe mandates, open plans, and audit (schema ≥ 16 / BRIEFING 20).
 */

import {
  DEFAULT_GESTOR_LIMITS,
  type GestorLimits,
  type GestorPlan,
  type GestorAudit,
} from '@deepseek-ai/dsh-persona-core'
import { jsonValue, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

function asLimits(raw: unknown): GestorLimits {
  if (raw === null || typeof raw !== 'object') return DEFAULT_GESTOR_LIMITS
  const row = raw as Partial<GestorLimits>
  return {
    approval: row.approval === 'auto_within_limits' || row.approval === 'auto_and_notify'
      ? row.approval
      : 'always_ask',
    maxPersonas: typeof row.maxPersonas === 'number' && row.maxPersonas >= 1 ? row.maxPersonas : 8,
    budgetTokens: typeof row.budgetTokens === 'number' && row.budgetTokens >= 0 ? row.budgetTokens : 0,
    allowedTools: Array.isArray(row.allowedTools) ? row.allowedTools.filter(item => typeof item === 'string') : [],
    allowedEngines: Array.isArray(row.allowedEngines)
      ? row.allowedEngines.filter((item): item is GestorLimits['allowedEngines'][number] =>
        item === 'dsh' || item === 'claude' || item === 'codex' || item === 'cursor' || item === 'opencode')
      : [],
    sectorIds: Array.isArray(row.sectorIds) ? row.sectorIds.filter(item => typeof item === 'string') : [],
    projectIds: Array.isArray(row.projectIds) ? row.projectIds.filter(item => typeof item === 'string') : [],
    canGrantGestor: row.canGrantGestor === true,
  }
}

/**
 * Persist Gestor de equipe limits, conflict plans, and audit lines.
 */
export class GestorRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 16).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * @param personaId - Gestor persona.
   * @param workspaceId - Workspace.
   * @param limits - User ceiling.
   */
  putMandate(personaId: string, workspaceId: string, limits: GestorLimits): void {
    const at = this.now()
    this.store.tx((db) => {
      run(db, `INSERT INTO team_manager_mandate (persona_id, workspace_id, limits_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(persona_id) DO UPDATE SET limits_json = excluded.limits_json, updated_at = excluded.updated_at`, [
        personaId, workspaceId, JSON.stringify(limits), at,
      ])
    })
  }

  /**
   * @param personaId - Gestor persona.
   */
  getMandate(personaId: string): GestorLimits | undefined {
    const row = this.store.db.prepare('SELECT limits_json FROM team_manager_mandate WHERE persona_id = ?').get(personaId)
    if (row === undefined) return undefined
    return asLimits(jsonValue(text(row, 'limits_json')))
  }

  /**
   * Default mandate when the persona is Gestor but no row exists yet.
   * @param personaId - Gestor.
   * @param workspaceId - Workspace.
   */
  mandateOrDefault(personaId: string, workspaceId: string): GestorLimits {
    const existing = this.getMandate(personaId)
    if (existing !== undefined) return existing
    this.putMandate(personaId, workspaceId, DEFAULT_GESTOR_LIMITS)
    return DEFAULT_GESTOR_LIMITS
  }

  /**
   * @param plan - Open or applied plan.
   */
  putPlan(plan: GestorPlan): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO team_manager_plan
        (id, workspace_id, team_manager_id, action, scope_key, summary, reason, status, body_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, summary = excluded.summary, reason = excluded.reason, body_json = excluded.body_json`, [
        plan.id, plan.workspaceId, plan.gestorId, plan.action, plan.scopeKey,
        plan.summary, plan.reason, plan.status, JSON.stringify(plan), plan.createdAt,
      ])
    })
  }

  /**
   * @param id - Plan.
   */
  getPlan(id: string): GestorPlan | undefined {
    const row = this.store.db.prepare('SELECT body_json FROM team_manager_plan WHERE id = ?').get(id)
    if (row === undefined) return undefined
    return jsonValue(text(row, 'body_json')) as GestorPlan
  }

  /**
   * @param workspaceId - Workspace.
   * @param scopeKey - Conflict key.
   */
  listOpenPlans(workspaceId: string, scopeKey?: string): GestorPlan[] {
    const sql = scopeKey === undefined
      ? 'SELECT body_json FROM team_manager_plan WHERE workspace_id = ? AND status = ?'
      : 'SELECT body_json FROM team_manager_plan WHERE workspace_id = ? AND status = ? AND scope_key = ?'
    const params = scopeKey === undefined ? [workspaceId, 'proposed'] : [workspaceId, 'proposed', scopeKey]
    const rows = this.store.db.prepare(sql).all(...params)
    return rows.map(row => jsonValue(text(row, 'body_json')) as GestorPlan)
  }

  /** Plans that still render a chat card (pending, approved, or declined). */
  listDisplayPlans(workspaceId: string): GestorPlan[] {
    const rows = this.store.db.prepare(
      'SELECT body_json FROM team_manager_plan WHERE workspace_id = ? AND status IN (\'proposed\', \'applied\', \'rejected\', \'commented\')',
    ).all(workspaceId)
    return rows.map(row => jsonValue(text(row, 'body_json')) as GestorPlan)
  }

  /**
   * @param audit - Immutable line.
   */
  putAudit(audit: GestorAudit): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO team_manager_audit
        (id, workspace_id, team_manager_id, action, summary, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        audit.id, audit.workspaceId, audit.gestorId, audit.action, audit.summary, audit.reason, audit.at,
      ])
    })
  }

  /**
   * @param workspaceId - Workspace.
   */
  listAudit(workspaceId: string): GestorAudit[] {
    const rows = this.store.db.prepare(
      'SELECT id, workspace_id, team_manager_id, action, summary, reason, at FROM team_manager_audit WHERE workspace_id = ? ORDER BY at DESC',
    ).all(workspaceId)
    return rows.map(row => ({
      id: text(row, 'id'),
      workspaceId: text(row, 'workspace_id'),
      gestorId: text(row, 'team_manager_id'),
      action: text(row, 'action') as GestorAudit['action'],
      summary: text(row, 'summary'),
      reason: text(row, 'reason'),
      at: text(row, 'at'),
    }))
  }
}
