/**
 * Speak ACL and human charge for the persona card (schema ≥ 10).
 */

import type { SQLOutputValue } from 'node:sqlite'
import { integer, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Who may DM, @mention, or assign work to a persona. */
export interface PersonaSpeak {
  readonly personaId: string
  readonly mode: 'everyone' | 'members'
  readonly principalIds: readonly string[]
  readonly updatedAt: string
}

/** Workspace human who answers for a persona. */
export interface PersonaChargeRow {
  readonly personaId: string
  readonly responsibleHumanId: string
  readonly substituteHumanId?: string
  readonly sectorId?: string
  readonly confirmed: boolean
  readonly updatedAt: string
}

/**
 * SQLite speak ACL and charge.
 */
export class SqliteCardRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 10).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * @param personaId - Persona.
   */
  getSpeak(personaId: string): PersonaSpeak | undefined {
    const row = this.store.db.prepare(
      `SELECT persona_id AS personaId, mode, principals_json AS principalsJson, updated_at AS updatedAt
         FROM persona_speak WHERE persona_id = ?`,
    ).get(personaId)
    return row === undefined ? undefined : readSpeak(row)
  }

  /**
   * @param speak - Replacement.
   */
  putSpeak(speak: Omit<PersonaSpeak, 'updatedAt'>): PersonaSpeak {
    const updatedAt = this.now()
    this.store.tx((db) => {
      run(
        db,
        `INSERT INTO persona_speak (persona_id, mode, principals_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(persona_id) DO UPDATE SET
           mode = excluded.mode, principals_json = excluded.principals_json, updated_at = excluded.updated_at`,
        [speak.personaId, speak.mode, JSON.stringify(speak.principalIds), updatedAt],
      )
    })
    return { ...speak, updatedAt }
  }

  /**
   * @param personaId - Persona.
   */
  getCharge(personaId: string): PersonaChargeRow | undefined {
    const row = this.store.db.prepare(
      `SELECT persona_id AS personaId, responsible_human_id AS responsibleHumanId,
              substitute_human_id AS substituteHumanId, sector_id AS sectorId,
              confirmed, updated_at AS updatedAt
         FROM persona_charge WHERE persona_id = ?`,
    ).get(personaId)
    return row === undefined ? undefined : readCharge(row)
  }

  /**
   * Charges for every persona in the workspace.
   * @param workspaceId - Workspace.
   */
  listCharges(workspaceId: string): PersonaChargeRow[] {
    return this.store.db.prepare(
      `SELECT c.persona_id AS personaId, c.responsible_human_id AS responsibleHumanId,
              c.substitute_human_id AS substituteHumanId, c.sector_id AS sectorId,
              c.confirmed, c.updated_at AS updatedAt
         FROM persona_charge c
         JOIN persona p ON p.id = c.persona_id
        WHERE p.workspace_id = ?
        ORDER BY c.persona_id`,
    ).all(workspaceId).map(row => readCharge(row))
  }

  /**
   * @param charge - Replacement.
   */
  putCharge(charge: Omit<PersonaChargeRow, 'updatedAt'>): PersonaChargeRow {
    const updatedAt = this.now()
    this.store.tx((db) => {
      run(
        db,
        `INSERT INTO persona_charge
          (persona_id, responsible_human_id, substitute_human_id, sector_id, confirmed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(persona_id) DO UPDATE SET
           responsible_human_id = excluded.responsible_human_id,
           substitute_human_id = excluded.substitute_human_id,
           sector_id = excluded.sector_id,
           confirmed = excluded.confirmed,
           updated_at = excluded.updated_at`,
        [
          charge.personaId,
          charge.responsibleHumanId,
          charge.substituteHumanId ?? null,
          charge.sectorId ?? null,
          charge.confirmed ? 1 : 0,
          updatedAt,
        ],
      )
    })
    return { ...charge, updatedAt }
  }
}

function readSpeak(row: Record<string, SQLOutputValue>): PersonaSpeak {
  const mode = text(row, 'mode')
  if (mode !== 'everyone' && mode !== 'members') throw new Error('speak-mode')
  const raw: unknown = JSON.parse(text(row, 'principalsJson'))
  const principalIds = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
  return {
    personaId: text(row, 'personaId'),
    mode,
    principalIds,
    updatedAt: text(row, 'updatedAt'),
  }
}

function readCharge(row: Record<string, SQLOutputValue>): PersonaChargeRow {
  const substituteHumanId = optionalText(row, 'substituteHumanId')
  const sectorId = optionalText(row, 'sectorId')
  return {
    personaId: text(row, 'personaId'),
    responsibleHumanId: text(row, 'responsibleHumanId'),
    ...(substituteHumanId === undefined ? {} : { substituteHumanId }),
    ...(sectorId === undefined ? {} : { sectorId }),
    confirmed: integer(row, 'confirmed') === 1,
    updatedAt: text(row, 'updatedAt'),
  }
}
