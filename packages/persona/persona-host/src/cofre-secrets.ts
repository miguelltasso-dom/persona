/**
 * SecretVault backed by the company Cofre (`factKey` = Rivet provider).
 * Token bodies are never logged.
 */

import type { ProductRepos, VaultRepos } from '@deepseek-ai/dsh-persona-store'
import type { SecretVault } from './external-sources.ts'

/**
 * Read sealed source tokens from vault records. Missing / revoked ⇒ `undefined`.
 */
export class CofreSecretVault implements SecretVault {
  /**
   * @param vault - Company vault.
   * @param product - Workspaces and projects.
   */
  constructor(
    readonly vault: VaultRepos,
    readonly product: ProductRepos,
  ) {}

  /**
   * @param personId - Vault owner (record author or workspace-visible).
   * @param provider - Rivet key (`telegram`, `slack`, …).
   */
  get(personId: string, provider: string): Promise<string | undefined> {
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        const row = this.vault.findActiveFact(project.id, provider)
        if (row === undefined || row.body === '') continue
        if (row.authorId === personId) return Promise.resolve(row.body)
        if (row.visibility.kind === 'workspace' || row.visibility.kind === 'members') return Promise.resolve(row.body)
      }
    }
    return Promise.resolve(undefined)
  }
}
