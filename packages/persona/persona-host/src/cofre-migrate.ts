/**
 * H15b: the connector tokens that older builds kept in the body of a Cofre record (plaintext in SQLite) move to the sealed store.
 * The sweep runs once at boot: every active record whose `factKey` is a connector provider is sealed under its project slot and
 * then purged (body replaced by a tombstone, fact key cleared, every version deleted). Running it again finds nothing.
 */

import type { ProductRepos, VaultRepos } from '@deepseek-ai/dsh-persona-store'
import {
  VAULT_CALDAV,
  VAULT_DISCORD,
  VAULT_IMAP,
  VAULT_SLACK,
  VAULT_SMTP,
  VAULT_TELEGRAM,
  type CofreSecrets,
} from '@deepseek-ai/dsh-persona-vault'

/** The `factKey` of the GitHub webhook secret: the same class of secret as a connector token. */
export const GITHUB_WEBHOOK_FACT = 'github.webhook.secret'

/** The `factKey` of every secret older builds wrote as a record body: connector tokens and the GitHub webhook secret. */
export const SECRET_FACT_KEYS: readonly string[] = [
  VAULT_TELEGRAM,
  VAULT_SLACK,
  VAULT_DISCORD,
  VAULT_CALDAV,
  VAULT_IMAP,
  VAULT_SMTP,
  GITHUB_WEBHOOK_FACT,
]

/** Prefix of the sealed slot of a connector token (the rest is the provider id). */
export const CONNECTOR_SLOT_PREFIX = 'connector:'

/**
 * @param provider - Vault provider id (`telegram`, `imap`, …).
 * @returns The sealed slot of that connector in a project.
 */
export function connectorSlot(provider: string): string {
  return `${CONNECTOR_SLOT_PREFIX}${provider}`
}

/** What the sweep needs. */
export interface CofreMigrationDeps {
  readonly product: ProductRepos
  readonly vault: VaultRepos
  readonly secrets: CofreSecrets
}

/** How many records the sweep moved. */
export interface CofreMigrationResult {
  readonly migrated: number
}

/**
 * One boot sweep over every project of every workspace.
 */
export class CofreMigration {
  private readonly deps: CofreMigrationDeps

  /**
   * @param deps - Tenants, records and the sealed store.
   */
  constructor(deps: CofreMigrationDeps) {
    this.deps = deps
  }

  /**
   * Seal and purge every connector token still stored as a record body. Idempotent: a second run moves nothing.
   * @returns How many records were moved.
   */
  async run(): Promise<CofreMigrationResult> {
    let migrated = 0
    for (const workspace of this.deps.product.listWorkspaces()) {
      for (const project of this.deps.product.listProjects(workspace.id)) {
        for (const provider of SECRET_FACT_KEYS) {
          const row = this.deps.vault.findActiveFact(project.id, provider)
          if (row === undefined || row.body === '') continue
          const slot = connectorSlot(provider)
          if (!this.deps.secrets.has(project.id, slot)) await this.deps.secrets.put(project.id, slot, row.body)
          this.deps.vault.purgeSecret(row.id)
          migrated += 1
        }
      }
    }
    return { migrated }
  }
}
