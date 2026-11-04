/** Actionable vault failures without secret-bearing native diagnostics. */
export class VaultUnavailableError extends Error {
  readonly code = 'vault_unavailable'
  constructor() { super('Cofre indisponível neste modo. Abra a Persona no aplicativo para salvar suas conexões.'); this.name = 'VaultUnavailableError' }
}

/** A durable write failed; the previous committed credentials remain active. */
export class VaultStorageError extends Error {
  readonly code = 'vault_storage_failed'
  constructor() { super('Não foi possível salvar no Cofre. Suas conexões anteriores continuam guardadas. Tente de novo.'); this.name = 'VaultStorageError' }
}
