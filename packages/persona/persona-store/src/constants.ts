/**
 * On-disk identity of `persona.db` (D-007).
 */

/**
 * SQLite `application_id` for Persona (`PNSQ`). Foreign ids are refused.
 * Distinct from session-query (`0x44534851`) and storage-sqlite.
 */
export const PERSONA_APPLICATION_ID = 0x504E5351

/**
 * Highest `user_version` this build can open. Adjacent migrations are
 * immutable; a greater on-disk version is refused (never reset in place).
 */
export const PERSONA_SCHEMA_VERSION = 21

/** Default `busy_timeout` in milliseconds. */
export const PERSONA_BUSY_TIMEOUT_MS = 5_000

/** Built-in personal project name (D-038 tenant = project). */
export const PERSONAL_PROJECT_NAME = 'Pessoal'
