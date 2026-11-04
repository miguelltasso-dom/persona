/** Persona credential vault: DPAPI-backed secrets via Electron main IPC. */

export { default } from './plugin.ts'
export { default as PersonaVaultProvider } from './plugin.ts'
export type { Config as PersonaVaultConfig } from './plugin.ts'

export const PACKAGE_VAULT = 'persona-vault'
export { VaultUnavailableError, VaultStorageError } from './errors.ts'

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

export {
  INVITE_TOKEN_PROVIDER,
  dropInviteToken,
  openInviteToken,
  sealInviteToken,
} from './invite-token.ts'

export {
  VAULT_CALDAV,
  VAULT_DISCORD,
  VAULT_IMAP,
  VAULT_SLACK,
  VAULT_SMTP,
  VAULT_TELEGRAM,
} from './channel-providers.ts'
