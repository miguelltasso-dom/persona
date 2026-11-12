/**
 * Cofre v2 sealed slots: the password of a Login, the value of a Chave and the six digits of a 2FA code request are sealed by the
 * same cipher as the DSH API keys (DPAPI on Windows). Metadata (site, user, title) never enters this file, and no value read here
 * reaches a model: `read` exists for the host's own use (typing into a browser, checking a code).
 */

import type { PersonaVault, VaultConnection } from './vault.ts'

/** Reserved `personId` of the Cofre slots: a namespace, never a person, so it never shows up as a connection of anyone. */
export const COFRE_OWNER = 'cofre'

/** One Cofre entry's sealed secret, addressed by tenant and entry. */
export class CofreSecrets {
  /**
   * @param vault - The sealed store (`ctx.personaVault.vault`).
   */
  constructor(private readonly vault: PersonaVault) {}

  /**
   * Seal one secret under a Cofre entry.
   * @param projectId - Tenant.
   * @param entryId - Cofre entry (`code:<requestId>` for a 2FA code).
   * @param secret - Plaintext; the vault refuses an empty value.
   */
  async put(projectId: string, entryId: string, secret: string): Promise<void> {
    await this.vault.setAccount(COFRE_OWNER, projectId, entryId, secret)
  }

  /**
   * @param projectId - Tenant.
   * @param entryId - Cofre entry.
   * @returns The plaintext, or undefined when the entry holds no sealed secret.
   */
  async read(projectId: string, entryId: string): Promise<string | undefined> {
    return this.vault.getAccount(COFRE_OWNER, projectId, entryId)
  }

  /**
   * @param projectId - Tenant.
   * @param entryId - Cofre entry.
   */
  async drop(projectId: string, entryId: string): Promise<void> {
    await this.vault.unsetAccount(COFRE_OWNER, projectId, entryId)
  }

  /**
   * Whether the entry holds a sealed secret, without decrypting it.
   * @param projectId - Tenant.
   * @param entryId - Cofre entry.
   */
  has(projectId: string, entryId: string): boolean {
    return this.rows(projectId).some(row => row.accountId === entryId)
  }

  /**
   * @param projectId - Tenant.
   * @returns The entry ids of this tenant that hold a sealed secret (metadata only, never a value).
   */
  ids(projectId: string): readonly string[] {
    return this.rows(projectId).flatMap(row => (row.accountId === undefined ? [] : [row.accountId]))
  }

  private rows(projectId: string): readonly VaultConnection[] {
    return this.vault.list().connections.filter(row => row.personId === COFRE_OWNER && row.provider === projectId)
  }
}
