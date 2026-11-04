/**
 * Autonomy, visit cursor, initiative fires, Vigia audit, attention spend (schema ≥ 4).
 */

import type { SQLOutputValue } from 'node:sqlite'
import { integer, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Só quando pedido · Propor (default) · Agir dentro de limites. */
export type AutonomyMode = 'asked' | 'propose' | 'act'

/** Per-persona autonomy and attention budget. */
export interface AutonomyRow {
  readonly projectId: string
  readonly personaId: string
  readonly mode: AutonomyMode
  readonly proposalBudget: number
  readonly tokenBudget: number
  readonly executionBudget: number
  readonly silenceStart?: string
  readonly silenceEnd?: string
  readonly updatedAt: string
}

/** One initiative or event fire. */
export interface InitiativeFire {
  readonly projectId: string
  readonly id: string
  readonly personaId: string
  readonly source: 'routine' | 'event'
  readonly kind: 'initiative' | 'watchdog'
  readonly at: string
  readonly title: string
  readonly ticketId?: string
}

/** One Vigia audit line (never a channel ping). */
export interface WatchdogAudit {
  readonly projectId: string
  readonly id: string
  readonly at: string
  readonly kind: string
  readonly subjectId: string
  readonly detail: string
}

const DEFAULT_MODE: AutonomyMode = 'propose'
const DEFAULT_PROPOSAL_BUDGET = 3
const DEFAULT_TOKEN_BUDGET = 50_000
const DEFAULT_EXECUTION_BUDGET = 8

/** Persistence for proactivity read-models. Clock is injectable. */
export class ProactivityRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 4).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - Persona.
   */
  getAutonomy(projectId: string, personaId: string): AutonomyRow {
    const row = this.store.db.prepare(
      'SELECT * FROM autonomy WHERE project_id = ? AND persona_id = ?',
    ).get(projectId, personaId)
    if (row !== undefined) return readAutonomy(row)
    return {
      projectId,
      personaId,
      mode: DEFAULT_MODE,
      proposalBudget: DEFAULT_PROPOSAL_BUDGET,
      tokenBudget: DEFAULT_TOKEN_BUDGET,
      executionBudget: DEFAULT_EXECUTION_BUDGET,
      updatedAt: this.now(),
    }
  }

  /**
   * @param row - Config to persist.
   */
  setAutonomy(row: Omit<AutonomyRow, 'updatedAt'>): AutonomyRow {
    const updatedAt = this.now()
    this.store.tx((db) => {
      run(db, `INSERT INTO autonomy
        (project_id, persona_id, mode, proposal_budget, token_budget, execution_budget, silence_start, silence_end, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, persona_id) DO UPDATE SET
          mode = excluded.mode,
          proposal_budget = excluded.proposal_budget,
          token_budget = excluded.token_budget,
          execution_budget = excluded.execution_budget,
          silence_start = excluded.silence_start,
          silence_end = excluded.silence_end,
          updated_at = excluded.updated_at`, [
        row.projectId, row.personaId, row.mode, row.proposalBudget, row.tokenBudget, row.executionBudget,
        row.silenceStart ?? null, row.silenceEnd ?? null, updatedAt,
      ])
    })
    return this.getAutonomy(row.projectId, row.personaId)
  }

  /**
   * @param projectId - Tenant.
   */
  lastVisit(projectId: string): string | undefined {
    const row = this.store.db.prepare('SELECT last_seen_at AS at FROM visit WHERE project_id = ?').get(projectId)
    return row === undefined ? undefined : text(row, 'at')
  }

  /**
   * Start of the person's current "while you were away" window (P1-7), kept so it stays the same across refreshes and restarts.
   * @param projectId - Tenant.
   * @returns Where it starts and when it was opened; absent until a window has been opened.
   */
  awayWindow(projectId: string): { readonly since: string; readonly openedAt: string } | undefined {
    const row = this.store.db.prepare('SELECT window_since AS since, window_opened_at AS opened FROM visit WHERE project_id = ?').get(projectId)
    if (row === undefined) return undefined
    const since = optionalText(row, 'since')
    return since === undefined ? undefined : { since, openedAt: optionalText(row, 'opened') ?? since }
  }

  /**
   * Open (or restart) the away window at `since`, opened at `openedAt`. The last-seen marker is kept; a first-ever row is
   * stamped with `openedAt`.
   * @param projectId - Tenant.
   * @param since - Window start.
   * @param openedAt - Now.
   */
  setAwayWindow(projectId: string, since: string, openedAt: string): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO visit (project_id, last_seen_at, window_since, window_opened_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET window_since = excluded.window_since, window_opened_at = excluded.window_opened_at`, [projectId, openedAt, since, openedAt])
    })
  }

  /**
   * @param projectId - Tenant.
   * @param at - Visit instant.
   */
  markVisit(projectId: string, at: string): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO visit (project_id, last_seen_at) VALUES (?, ?)
        ON CONFLICT(project_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`, [projectId, at])
    })
  }

  /**
   * @param fire - Initiative or event record.
   */
  recordFire(fire: InitiativeFire): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO initiative_fire
        (project_id, id, persona_id, source, kind, at, title, ticket_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, id) DO NOTHING`, [
        fire.projectId, fire.id, fire.personaId, fire.source, fire.kind, fire.at, fire.title,
        fire.ticketId ?? null,
      ])
    })
  }

  /**
   * @param projectId - Tenant.
   * @param since - Exclusive lower bound.
   */
  firesSince(projectId: string, since: string): InitiativeFire[] {
    return this.store.db.prepare(
      'SELECT * FROM initiative_fire WHERE project_id = ? AND at > ? ORDER BY at ASC, id ASC',
    ).all(projectId, since).map(readFire)
  }

  /**
   * @param audit - Vigia line.
   */
  recordAudit(audit: WatchdogAudit): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO watchdog_audit (project_id, id, at, kind, subject_id, detail)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, id) DO NOTHING`, [
        audit.projectId, audit.id, audit.at, audit.kind, audit.subjectId, audit.detail,
      ])
    })
  }

  /**
   * @param projectId - Tenant.
   * @param since - Exclusive lower bound.
   */
  auditsSince(projectId: string, since: string): WatchdogAudit[] {
    return this.store.db.prepare(
      'SELECT * FROM watchdog_audit WHERE project_id = ? AND at > ? ORDER BY at ASC, id ASC',
    ).all(projectId, since).map(readAudit)
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - Persona.
   * @param day - `YYYY-MM-DD`.
   */
  proposalsToday(projectId: string, personaId: string, day: string): number {
    const row = this.store.db.prepare(
      'SELECT proposals AS n FROM attention_spend WHERE project_id = ? AND persona_id = ? AND day = ?',
    ).get(projectId, personaId, day)
    return row === undefined ? 0 : integer(row, 'n')
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - Persona.
   * @param day - `YYYY-MM-DD`.
   */
  addProposal(projectId: string, personaId: string, day: string): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO attention_spend (project_id, persona_id, day, proposals) VALUES (?, ?, ?, 1)
        ON CONFLICT(project_id, persona_id, day) DO UPDATE SET proposals = proposals + 1`, [
        projectId, personaId, day,
      ])
    })
  }
}

function readAutonomy(row: Record<string, SQLOutputValue>): AutonomyRow {
  const silenceStart = optionalText(row, 'silence_start')
  const silenceEnd = optionalText(row, 'silence_end')
  return {
    projectId: text(row, 'project_id'),
    personaId: text(row, 'persona_id'),
    mode: asMode(text(row, 'mode')),
    proposalBudget: integer(row, 'proposal_budget'),
    tokenBudget: integer(row, 'token_budget'),
    executionBudget: integer(row, 'execution_budget'),
    ...(silenceStart === undefined ? {} : { silenceStart }),
    ...(silenceEnd === undefined ? {} : { silenceEnd }),
    updatedAt: text(row, 'updated_at'),
  }
}

function readFire(row: Record<string, SQLOutputValue>): InitiativeFire {
  const ticketId = optionalText(row, 'ticket_id')
  return {
    projectId: text(row, 'project_id'),
    id: text(row, 'id'),
    personaId: text(row, 'persona_id'),
    source: text(row, 'source') === 'event' ? 'event' : 'routine',
    kind: text(row, 'kind') === 'watchdog' ? 'watchdog' : 'initiative',
    at: text(row, 'at'),
    title: text(row, 'title'),
    ...(ticketId === undefined ? {} : { ticketId }),
  }
}

function readAudit(row: Record<string, SQLOutputValue>): WatchdogAudit {
  return {
    projectId: text(row, 'project_id'),
    id: text(row, 'id'),
    at: text(row, 'at'),
    kind: text(row, 'kind'),
    subjectId: text(row, 'subject_id'),
    detail: text(row, 'detail'),
  }
}

function asMode(value: string): AutonomyMode {
  if (value === 'asked' || value === 'propose' || value === 'act') return value
  return 'propose'
}
