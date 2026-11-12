/**
 * The Cofre v2 of one host: the entries (Logins, Chaves and the company Ficha), the CSV import and the 2FA code requests, over the
 * sealed store. The screen reads this one object; the secrets never leave the vault.
 */

import { CofreCodes } from './cofre-2fa.ts'
import { CofreEntries, type CofreEntriesDeps } from './cofre-entries.ts'
import { CofreImport } from './cofre-import.ts'

/** What the Cofre needs from the host. */
export type CofreHostDeps = CofreEntriesDeps

/**
 * One Cofre per host, shared by every project.
 */
export class CofreHost {
  /** Logins, Chaves and the company Ficha. */
  readonly entries: CofreEntries
  /** Chrome/Bitwarden CSV: preview first, then commit. */
  readonly csv: CofreImport
  /** The six-digit requests the persona opens and the owner fills. */
  readonly codes: CofreCodes
  private readonly deps: CofreHostDeps

  /**
   * @param deps - Store, sealed slots, workspace lookup and clock.
   */
  constructor(deps: CofreHostDeps) {
    this.deps = deps
    this.entries = new CofreEntries(deps)
    this.csv = new CofreImport({ entries: this.entries })
    this.codes = new CofreCodes({
      screens: deps.screens,
      secrets: deps.secrets,
      ...(deps.now === undefined ? {} : { now: deps.now }),
      ...(deps.newId === undefined ? {} : { newId: deps.newId }),
    })
  }

  /**
   * The sealed value of one Cofre slot. Host-only: typing into a browser, checking a code, the GitHub webhook secret.
   * @param projectId - Tenant.
   * @param slot - Slot id (`connector:<provider>`, `code:<requestId>`).
   * @returns The plaintext, or undefined when the slot is empty.
   */
  async secretOf(projectId: string, slot: string): Promise<string | undefined> {
    return this.deps.secrets.read(projectId, slot)
  }
}
