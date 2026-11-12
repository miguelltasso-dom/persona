/**
 * Carbon P0-09: a connector token that an older build kept as the body of a Cofre record must leave NO plaintext in the database, whatever the status
 * of the record (active or revoked), in its versions, or in the copies made before the sweep (the pre-migration backups).
 */

import type { DatabaseSync } from 'node:sqlite'

/** Body left in place of a secret that moved to the sealed store: the record is revoked, so it is a tombstone, not knowledge. */
export const SECRET_PURGED_BODY = 'Conteúdo movido para o Cofre.'

function placeholders(count: number): string {
  return new Array<string>(count).fill('?').join(', ')
}

/**
 * Erase every record whose fact key is one of `factKeys` (ANY status: a rotated token leaves a revoked row with its own body) and all their versions.
 * Runs inside the caller's transaction or on its own connection.
 * @param db - An open database (the live one inside a transaction, or a backup).
 * @param factKeys - Fact keys that hold secrets.
 * @returns How many records were erased.
 */
export function scrubSecretFacts(db: DatabaseSync, factKeys: readonly string[]): number {
  if (factKeys.length === 0) return 0
  const holders = placeholders(factKeys.length)
  const rows = db.prepare(`SELECT id FROM vault_record WHERE fact_key IN (${holders})`).all(...factKeys)
  const ids = rows.map(row => String(row.id))
  for (const id of ids) {
    db.prepare('UPDATE vault_record SET body = ?, fact_key = NULL, status = ? WHERE id = ?').run(SECRET_PURGED_BODY, 'revoked', id)
    db.prepare('DELETE FROM vault_version WHERE target_kind = ? AND target_id = ?').run('record', id)
  }
  return ids.length
}

/**
 * Whether a database still holds a record under one of `factKeys` (a backup made before the sweep does).
 * @param db - An open database.
 * @param factKeys - Fact keys that hold secrets.
 */
export function hasSecretFacts(db: DatabaseSync, factKeys: readonly string[]): boolean {
  if (factKeys.length === 0) return false
  const row = db.prepare(`SELECT COUNT(*) AS total FROM vault_record WHERE fact_key IN (${placeholders(factKeys.length)})`).get(...factKeys)
  return Number(row?.total ?? 0) > 0
}
