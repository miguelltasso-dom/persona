/** Persona credential vault: DPAPI-backed secrets via Electron main IPC. */

export { default } from './plugin.ts'
export { default as PersonaVaultProvider } from './plugin.ts'
export type { Config as PersonaVaultConfig } from './plugin.ts'

export const PACKAGE_VAULT = 'persona-vault'

export {
  createIpcVaultCipher,
  createMemoryCipher,
  type IpcVaultTransport,
  type SealedSecret,
  type VaultCipher,
} from './cipher.ts'

export {
  assertNoPlaintextSecrets,
  createPersonaVault,
  VAULT_SCOPE,
  type PersonaVault,
  type PersonaVaultSnapshot,
  type VaultConnection,
} from './vault.ts'
