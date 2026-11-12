/**
 * The Cofre v2 of one host: the entries (Logins, Chaves and the company Ficha), the CSV import and the 2FA code requests, over the
 * sealed store. The screen reads this one object; the secrets never leave the vault.
 */

import { CofreCodes, type CofreCodeRequestView } from './cofre-2fa.ts'
import { CofreEntries, type CofreEntriesDeps } from './cofre-entries.ts'
import { CofreImport } from './cofre-import.ts'

/** What the Cofre needs from the host. */
export interface CofreHostDeps extends CofreEntriesDeps {
  /** Carbon P1-04: the owner filled a six-digit request (the view never carries the digits): the host wakes the persona's Task. */
  readonly onCodeFilled?: (view: CofreCodeRequestView) => void
}

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
      ...(deps.onCodeFilled === undefined ? {} : { onFilled: deps.onCodeFilled }),
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

  /**
   * Seal one value in a Cofre slot. Host-only: a connector token written by the person's own form, the E2EE identity.
   * @param projectId - Tenant.
   * @param slot - Slot id (`connector:<provider>`).
   * @param secret - Plaintext; the vault refuses an empty value.
   */
  async putSecret(projectId: string, slot: string, secret: string): Promise<void> {
    await this.deps.secrets.put(projectId, slot, secret)
  }

  /**
   * @param projectId - Tenant.
   * @param slot - Slot id (`connector:<provider>`).
   * @returns Whether the slot holds a sealed value, without decrypting it.
   */
  hasSecret(projectId: string, slot: string): boolean {
    return this.deps.secrets.has(projectId, slot)
  }
}
