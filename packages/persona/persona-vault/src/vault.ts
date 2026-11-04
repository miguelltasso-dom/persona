/** Per-person DSH API-key vault. Ciphertext only; plaintext never persisted. */

import { createMemoryCipher, type SealedSecret, type VaultCipher } from './cipher.ts'

export const VAULT_SCOPE = 'persona-vault'

export interface VaultConnection {
  personId: string
  provider: string
  /** WAVE2: second+ login of the same provider. Default account omits this. */
  accountId?: string
  /** Human label ("Pessoal", "Trabalho"). Never a secret. */
  label?: string
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
  setAccount(personId: string, provider: string, accountId: string, secret: string, label?: string): Promise<void>
  getAccount(personId: string, provider: string, accountId: string): Promise<string | undefined>
  unsetAccount(personId: string, provider: string, accountId: string): Promise<void>
  list(): PersonaVaultSnapshot
  key(personId: string, provider: string, accountId?: string): string
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
  const key = (personId: string, provider: string, accountId?: string): string => (
    accountId === undefined || accountId === 'default'
      ? `${VAULT_SCOPE}/${personId}/${provider}`
      : `${VAULT_SCOPE}/${personId}/${provider}/${accountId}`
  )
  const write = async (
    personId: string,
    provider: string,
    secret: string,
    accountId?: string,
    label?: string,
  ): Promise<void> => {
    if (secret.length === 0) throw new Error('empty secret')
    const row: VaultConnection = { personId, provider, sealed: await cipher.seal(secret) }
    if (accountId !== undefined && accountId !== 'default') row.accountId = accountId
    if (label !== undefined && label.length > 0) row.label = label
    store.set(key(personId, provider, accountId), row)
  }
  const read = async (personId: string, provider: string, accountId?: string): Promise<string | undefined> => {
    const row = store.get(key(personId, provider, accountId))
    if (row === undefined) return undefined
    return cipher.open(row.sealed)
  }
  return {
    key,
    set: async (personId, provider, secret) => write(personId, provider, secret),
    get: async (personId, provider) => read(personId, provider),
    unset: async (personId, provider) => {
      store.delete(key(personId, provider))
    },
    setAccount: async (personId, provider, accountId, secret, label) => (
      write(personId, provider, secret, accountId, label)
    ),
    getAccount: async (personId, provider, accountId) => read(personId, provider, accountId),
    unsetAccount: async (personId, provider, accountId) => {
      store.delete(key(personId, provider, accountId))
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
