/** Per-person DSH API-key vault. Ciphertext only; plaintext never persisted. */

import { createMemoryCipher, type SealedSecret, type VaultCipher } from './cipher.ts'

export const VAULT_SCOPE = 'persona-vault'

export interface VaultConnection {
  personId: string
  provider: string
  /** Ciphertext from {@link VaultCipher.seal}. */
  sealed: SealedSecret
}

export interface PersonaVaultSnapshot {
  connections: readonly VaultConnection[]
}

export interface PersonaVault {
  set(personId: string, provider: string, secret: string): Promise<void>
  get(personId: string, provider: string): Promise<string | undefined>
  unset(personId: string, provider: string): Promise<void>
  list(): PersonaVaultSnapshot
  key(personId: string, provider: string): string
}

/**
 * Create a vault that stores only sealed blobs.
 * @param cipher - DPAPI via IPC in production; memory cipher in tests.
 * @param store - optional durable map (defaults to in-memory).
 */
export function createPersonaVault(
  cipher: VaultCipher = createMemoryCipher(),
  store: Map<string, VaultConnection> = new Map(),
): PersonaVault {
  const key = (personId: string, provider: string): string => `${VAULT_SCOPE}/${personId}/${provider}`
  return {
    key,
    set: async (personId, provider, secret) => {
      if (secret.length === 0) throw new Error('empty secret')
      store.set(key(personId, provider), { personId, provider, sealed: await cipher.seal(secret) })
    },
    get: async (personId, provider) => {
      const row = store.get(key(personId, provider))
      if (row === undefined) return undefined
      return cipher.open(row.sealed)
    },
    unset: async (personId, provider) => {
      store.delete(key(personId, provider))
    },
    list: () => ({ connections: [...store.values()] }),
  }
}

/**
 * Fail if a snapshot still contains a known plaintext secret.
 * @param snapshot - vault list.
 * @param secrets - plaintext values that must be absent.
 */
export function assertNoPlaintextSecrets(snapshot: PersonaVaultSnapshot, secrets: readonly string[]): void {
  const blob = JSON.stringify(snapshot)
  for (const secret of secrets) {
    if (secret.length > 0 && blob.includes(secret)) throw new Error('plaintext secret leaked into vault snapshot')
  }
}
