/**
 * SecretVault backed by the company Cofre: the sealed slot of a connector (`connector:<provider>`) first, then the legacy record
 * body (`factKey` = Rivet provider) that older builds wrote in plaintext. Token bodies are never logged.
 */

import type { ProductRepos, VaultRepos } from '@deepseek-ai/dsh-persona-store'
import type { CofreSecrets } from '@deepseek-ai/dsh-persona-vault'
import { connectorSlot } from './cofre-migrate.ts'
import type { SecretVault } from './external-sources.ts'

/**
 * Read sealed source tokens from the vault. Missing / revoked ⇒ `undefined`.
 */
export class CofreSecretVault implements SecretVault {
  /**
   * @param vault - Company vault.
   * @param product - Workspaces and projects.
   * @param secrets - Sealed slots (absent = only the legacy record bodies are readable).
   */
  constructor(
    readonly vault: VaultRepos,
    readonly product: ProductRepos,
    readonly secrets?: CofreSecrets,
  ) {}

  /**
   * The sealed slot is project-scoped; the legacy record keeps its own visibility rule. A connector configured in one
   * project is never used by another.
   * @param projectId - Tenant whose sources are being read.
   * @param personId - Vault owner (record author or workspace-visible).
   * @param provider - Rivet key (`telegram`, `slack`, …).
   */
  async get(projectId: string, personId: string, provider: string): Promise<string | undefined> {
    const sealed = await this.sealedOf(projectId, provider)
    if (sealed !== undefined) return sealed
    const row = this.vault.findActiveFact(projectId, provider)
    if (row === undefined || row.body === '') return undefined
    if (row.authorId === personId) return row.body
    if (row.visibility.kind === 'workspace' || row.visibility.kind === 'members') return row.body
    return undefined
  }

  private async sealedOf(projectId: string, provider: string): Promise<string | undefined> {
    if (this.secrets === undefined) return undefined
    const slot = connectorSlot(provider)
    if (!this.secrets.has(projectId, slot)) return undefined
    const value = await this.secrets.read(projectId, slot)
    return value === undefined || value === '' ? undefined : value
  }
}
