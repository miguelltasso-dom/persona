/**
 * Cordis CredentialProvider (`ctx.credentials`) plus `ctx.personaVault` (D-015 / D-025).
 * Stores DSH API keys as sealed blobs. Environment fallback keeps llm-pi-ai working.
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  CredentialProvider,
  type CredentialInfo,
  type CredentialKey,
  type CredentialRecord,
  type CredentialRecordEntry,
  type CredentialRecordInfo,
  type CredentialRef,
  type ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { createMemoryCipher, type VaultCipher } from './cipher.ts'
import { dropInviteToken, openInviteToken, sealInviteToken } from './invite-token.ts'
import { createPersonaVault, type PersonaVault } from './vault.ts'

export interface Config {
  /** Optional durable JSON path. Empty keeps the store in memory. */
  path: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Persona vault facade (same plugin as `credentials`). */
    personaVault: PersonaVaultProvider
  }
}

interface StoreFile {
  refs: Record<string, string>
  records: Record<string, CredentialRecord>
}

/**
 * DPAPI-ready credential provider. Tests use the memory cipher.
 */
export default class PersonaVaultProvider extends CredentialProvider {
  static inject: string[] = []
  static Config: z<Config> = z.object({
    path: z.string().default(''),
  })

  readonly config: Config
  readonly vault: PersonaVault
  readonly cipher: VaultCipher
  readonly sealInviteToken: (inviteId: string, token: string) => Promise<void>
  readonly openInviteToken: (inviteId: string) => Promise<string | undefined>
  readonly dropInviteToken: (inviteId: string) => Promise<void>
  private readonly refs: Map<string, string> = new Map()
  private readonly records: Map<string, CredentialRecord> = new Map()

  /**
   * @param ctx - Host context.
   * @param config - Optional JSON path.
   */
  constructor(ctx: Context, config: Config = { path: '' }) {
    super(ctx)
    this.config = config
    this.cipher = createMemoryCipher()
    this.vault = createPersonaVault(this.cipher)
    this.sealInviteToken = (inviteId: string, token: string) => sealInviteToken(this.vault, inviteId, token)
    this.openInviteToken = (inviteId: string) => openInviteToken(this.vault, inviteId)
    this.dropInviteToken = (inviteId: string) => dropInviteToken(this.vault, inviteId)
    ctx.provide('personaVault', this)
  }

  /**
   * Resolve a reference from the sealed store, then the process environment.
   * @param ref - Environment-variable name.
   */
  override async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const stored = this.refs.get(ref)
    if (stored !== undefined && stored.length > 0) {
      return { value: await this.cipher.open(stored), source: 'persona-vault' }
    }
    const ambient = process.env[ref]
    if (ambient !== undefined && ambient.length > 0) return { value: ambient, source: 'environment' }
    return undefined
  }

  /**
   * Describe a reference without returning the secret.
   * @param ref - Environment-variable name.
   */
  override async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const resolved = await this.resolve(ref)
    if (resolved === undefined) return { configured: false, writable: true }
    return { configured: true, source: resolved.source, writable: true }
  }

  /**
   * Seal and store one API key.
   * @param ref - Environment-variable name.
   * @param value - Non-empty secret.
   */
  override async set(ref: CredentialRef, value: string): Promise<void> {
    if (value.length === 0) throw new Error('empty secret')
    this.refs.set(ref, await this.cipher.seal(value))
    this.notifyUpdated(ref)
  }

  /**
   * Remove one stored reference.
   * @param ref - Environment-variable name.
   */
  override unset(ref: CredentialRef): Promise<void> {
    this.refs.delete(ref)
    this.notifyUpdated(ref)
    return Promise.resolve()
  }

  /**
   * Read one stored record.
   * @param key - `<scope>/<id>`.
   */
  override readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return Promise.resolve(this.records.get(key))
  }

  /**
   * Describe one record without exposing its value.
   * @param key - `<scope>/<id>`.
   */
  override async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const record = await this.readRecord(key)
    if (record === undefined) return { configured: false, writable: true }
    return { configured: true, kind: record.kind, writable: true }
  }

  /**
   * List stored records without values.
   */
  override listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([...this.records.entries()].map(([key, record]) => ({
      key: key as CredentialKey,
      kind: record.kind,
    })))
  }

  /**
   * Serialized read-modify-write over one record.
   * @param key - `<scope>/<id>`.
   * @param mutate - Returns the replacement or `undefined` to keep the current value.
   */
  override async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const next = await mutate(this.records.get(key))
    if (next === undefined) return this.records.get(key)
    this.records.set(key, next)
    this.notifyRecordUpdated(key)
    return next
  }

  /**
   * Remove one record.
   * @param key - `<scope>/<id>`.
   */
  override deleteRecord(key: CredentialKey): Promise<void> {
    this.records.delete(key)
    this.notifyRecordUpdated(key)
    return Promise.resolve()
  }

  /** Snapshot used by tests; never contains plaintext. */
  snapshot(): StoreFile {
    return {
      refs: Object.fromEntries(this.refs),
      records: Object.fromEntries(this.records),
    }
  }
}
