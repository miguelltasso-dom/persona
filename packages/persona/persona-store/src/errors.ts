/**
 * Typed failures from opening, migrating, or mutating `persona.db`.
 */

/** Stable machine codes for store failures. */
export type StoreErrorCode =
  | 'foreign-application'
  | 'version-too-new'
  | 'unrecognized-database'
  | 'migration-gap'
  | 'migration-failed'
  | 'backup-failed'
  | 'not-open'
  | 'not-found'
  | 'conflict'
  | 'constraint'
  | 'forbidden'
  | 'invalid-input'

/** Store failure; `message` equals `code`. */
export class StoreError extends Error {
  /**
   * @param code - Stable machine code.
   * @param detail - Optional extra, never secrets or private message bodies.
   */
  constructor(
    readonly code: StoreErrorCode,
    readonly detail?: string,
  ) {
    super(code)
    this.name = 'StoreError'
  }
}
