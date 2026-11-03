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

/** pt-BR line for the UI. Machine `code` stays stable. */
export const STORE_USER_MESSAGES: Record<StoreErrorCode, string> = {
  'foreign-application': 'Este arquivo não é um banco do Persona.',
  'version-too-new': 'Este banco é de uma versão mais nova do Persona. Atualize o app para abrir.',
  'unrecognized-database': 'Não reconheço este arquivo como um banco do Persona.',
  'migration-gap': 'A migração do banco está incompleta. Restaure um backup.',
  'migration-failed': 'Não consegui migrar o banco. O backup anterior foi preservado.',
  'backup-failed': 'Não consegui copiar o banco antes de migrar.',
  'not-open': 'O banco já foi fechado.',
  'not-found': 'Registro não encontrado.',
  'conflict': 'Este registro já existe.',
  'constraint': 'Os dados violam uma regra do banco.',
  'forbidden': 'Sem acesso.',
  'invalid-input': 'Pedido inválido.',
}

/** Store failure. `code` is stable; `userMessage` is pt-BR for the UI. */
export class StoreError extends Error {
  readonly userMessage: string

  /**
   * @param code - Stable machine code.
   * @param detail - Optional extra, never secrets or private message bodies.
   */
  constructor(
    readonly code: StoreErrorCode,
    readonly detail?: string,
  ) {
    const userMessage = STORE_USER_MESSAGES[code]
    super(code === 'version-too-new' ? userMessage : code)
    this.name = 'StoreError'
    this.userMessage = userMessage
  }
}
