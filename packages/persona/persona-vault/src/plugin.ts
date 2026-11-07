/** CredentialProvider with a ciphertext-only file and private Electron DPAPI transport. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  CredentialProvider, credentialKeyScope, type CredentialInfo, type CredentialKey, type CredentialRecord,
  type CredentialRecordEntry, type CredentialRecordInfo, type CredentialRef, type ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { createIpcVaultCipher, createMemoryCipher, type VaultCipher } from './cipher.ts'
import { VaultUnavailableError } from './errors.ts'
import { vaultBackend } from './backend.ts'
import { VAULT_REQUEST_TIMEOUT_MS, createProcessVaultTransport } from './process-transport.ts'
import { emptyStoredVault, readStoredVault, writeStoredVault, type StoredVault } from './storage.ts'
import { dropInviteToken, openInviteToken, sealInviteToken } from './invite-token.ts'
import { createPersonaVault, type PersonaVault, type VaultConnection } from './vault.ts'

// Local browser authentication is process-scoped when OS encryption is unavailable.
const EPHEMERAL_RECORD_SCOPES: ReadonlySet<string> = new Set(['client-connection'])

/** Durable file and main-process request deadline. */
export interface Config {
  /** Empty selects volatile ciphertext storage; production profiles set persona-vault.json. */
  path: string
  /** Main-process request deadline; defaults to {@link VAULT_REQUEST_TIMEOUT_MS} (60 s: the first answer of a booting app is slow). */
  timeoutMs?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context { /** Persona credential store and per-person connections. */ personaVault: PersonaVaultProvider }
}

function decodeRecord(text: string): CredentialRecord {
  const raw: unknown = JSON.parse(text)
  if (typeof raw === 'object' && raw !== null && 'kind' in raw && raw.kind === 'grant'
    && 'payload' in raw && Object.keys(raw).every(key => key === 'kind' || key === 'payload')) {
    return { kind: 'grant', payload: raw.payload }
  }
  if (typeof raw !== 'object' || raw === null || !('kind' in raw) || raw.kind !== 'api-key'
    || Object.keys(raw).some(key => !['kind', 'key', 'env'].includes(key))) throw new VaultUnavailableError()
  const key = 'key' in raw ? raw.key : undefined
  if (key !== undefined && (typeof key !== 'string' || key === '')) throw new VaultUnavailableError()
  let env: Record<string, string> | undefined
  if ('env' in raw) {
    if (typeof raw.env !== 'object' || raw.env === null || Array.isArray(raw.env)) throw new VaultUnavailableError()
    env = {}
    for (const [name, value] of Object.entries(raw.env)) {
      if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new VaultUnavailableError()
      env[name] = value
    }
  }
  return { kind: 'api-key', ...(key === undefined ? {} : { key }), ...(env === undefined ? {} : { env }) }
}

/** Web permits ephemeral local browser authentication; persistent secrets require explicit encryption. */
export default class PersonaVaultProvider extends CredentialProvider {
  static inject: string[] = []
  static Config: z<Config> = z.object({ path: z.string().default(''), timeoutMs: z.number().min(1).default(VAULT_REQUEST_TIMEOUT_MS) })
  readonly config: Required<Config>
  readonly availability: 'available' | 'unavailable' | 'test'
  readonly cipher: VaultCipher
  readonly vault: PersonaVault
  readonly sealInviteToken: (inviteId: string, token: string) => Promise<void>
  readonly openInviteToken: (inviteId: string) => Promise<string | undefined>
  readonly dropInviteToken: (inviteId: string) => Promise<void>
  private readonly refs = new Map<string, string>()
  private readonly records = new Map<string, StoredVault['records'][string]>()
  private readonly ephemeralRecords = new Map<CredentialKey, CredentialRecord>()
  private readonly connections = new Map<string, VaultConnection>()
  private pending: Promise<void> = Promise.resolve()

  /** @param ctx - Credential service owner. @param config - File and request deadline. */
  constructor(ctx: Context, config: Config = { path: '' }) {
    super(ctx)
    ctx.effect(() => () => { this.ephemeralRecords.clear() })
    this.config = { path: config.path, timeoutMs: config.timeoutMs ?? VAULT_REQUEST_TIMEOUT_MS }
    this.availability = vaultBackend(process.versions.electron !== undefined,
      process.connected && process.send !== undefined, process.env.PERSONA_VAULT_TEST_CIPHER === '1')
    if (this.availability === 'available') {
      const transport = createProcessVaultTransport(this.config.timeoutMs)
      ctx.effect(() => () => { transport.dispose() })
      this.cipher = createIpcVaultCipher(transport)
    } else if (this.availability === 'test') {
      console.warn('Persona: o Cofre usa um cipher de teste sem proteção do sistema. Não use credenciais reais neste modo.')
      this.cipher = createMemoryCipher()
    } else {
      this.cipher = { seal: () => Promise.reject(new VaultUnavailableError()), open: () => Promise.reject(new VaultUnavailableError()) }
    }
    const saved = this.availability === 'unavailable' ? emptyStoredVault() : readStoredVault(this.config.path)
    for (const [key, value] of Object.entries(saved.refs)) this.refs.set(key, value)
    for (const [key, value] of Object.entries(saved.records)) this.records.set(key, value)
    const inner = createPersonaVault(this.cipher, this.connections, () => { this.persist() })
    for (const row of saved.connections) this.connections.set(inner.key(row.personId, row.provider, row.accountId), row)
    this.vault = {
      key: (person, provider, account) => inner.key(person, provider, account),
      list: () => inner.list(),
      set: (person, provider, secret) => this.mutate(() => inner.set(person, provider, secret)),
      unset: (person, provider) => this.mutate(() => inner.unset(person, provider)),
      setAccount: (person, provider, account, secret, label) => this.mutate(() => inner.setAccount(person, provider, account, secret, label)),
      unsetAccount: (person, provider, account) => this.mutate(() => inner.unsetAccount(person, provider, account)),
      get: async (person, provider) => { await this.pending; return inner.get(person, provider) },
      getAccount: async (person, provider, account) => { await this.pending; return inner.getAccount(person, provider, account) },
    }
    if (this.availability !== 'unavailable') this.persist()
    this.sealInviteToken = (inviteId, token) => sealInviteToken(this.vault, inviteId, token)
    this.openInviteToken = inviteId => openInviteToken(this.vault, inviteId)
    this.dropInviteToken = inviteId => dropInviteToken(this.vault, inviteId)
    ctx.provide('personaVault', this)
  }

  /** @param ref - Environment reference. @returns Vault secret or ambient environment value. */
  override async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    await this.pending
    const stored = this.refs.get(ref)
    if (stored !== undefined) return { value: await this.cipher.open(stored), source: 'persona-vault' }
    const ambient = process.env[ref]
    return ambient === undefined || ambient === '' ? undefined : { value: ambient, source: 'environment' }
  }

  /** @param ref - Environment reference. @returns Configuration and current writability without values. */
  override async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const found = await this.resolve(ref)
    return { configured: found !== undefined, writable: this.availability !== 'unavailable', ...(found === undefined ? {} : { source: found.source }) }
  }

  /** @param ref - Environment reference. @param value - Secret to seal. @returns After atomic commit. */
  override set(ref: CredentialRef, value: string): Promise<void> {
    return this.mutate(async () => {
      if (value === '') throw new Error('empty secret')
      this.replace(this.refs, ref, await this.cipher.seal(value))
      this.notifyUpdated(ref)
    })
  }

  /** @param ref - Environment reference. @returns After atomic removal. */
  override unset(ref: CredentialRef): Promise<void> {
    return this.mutate(() => { this.replace(this.refs, ref, undefined); this.notifyUpdated(ref) })
  }

  /** @param key - Credential address. @returns Decrypted owner record, or absence. */
  override async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    await this.pending
    if (this.isEphemeral(key)) {
      const record = this.ephemeralRecords.get(key)
      return record === undefined ? undefined : structuredClone(record)
    }
    return this.readRecordValue(key)
  }

  /** @param key - Credential address. @returns Metadata without decrypting the record. */
  override async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    await this.pending
    if (this.isEphemeral(key)) {
      const entry = this.ephemeralRecords.get(key)
      return { configured: entry !== undefined, writable: true, ...(entry === undefined ? {} : { kind: entry.kind }) }
    }
    const entry = this.records.get(key)
    return { configured: entry !== undefined, writable: this.availability !== 'unavailable', ...(entry === undefined ? {} : { kind: entry.kind }) }
  }

  /** @returns Stored addresses and discriminants, never credential values. */
  override async listRecords(): Promise<readonly CredentialRecordEntry[]> {
    await this.pending
    return [
      ...[...this.records].map(([key, row]) => ({ key: key as CredentialKey, kind: row.kind })),
      ...[...this.ephemeralRecords].map(([key, row]) => ({ key, kind: row.kind })),
    ]
  }

  /** @param key - Credential address. @param mutate - Exclusive replacement. @returns Committed owner record. */
  override modifyRecord(key: CredentialKey, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>): Promise<CredentialRecord | undefined> {
    if (this.isEphemeral(key)) return this.enqueue(async () => {
      const saved = this.ephemeralRecords.get(key)
      const current = saved === undefined ? undefined : structuredClone(saved)
      const next = await mutate(current)
      if (next === undefined) return saved === undefined ? undefined : structuredClone(saved)
      this.ephemeralRecords.set(key, structuredClone(next))
      this.notifyRecordUpdated(key)
      return structuredClone(next)
    })
    return this.mutate(async () => {
      const current = await this.readRecordValue(key)
      const next = await mutate(current)
      if (next === undefined) return current
      const encoded = JSON.stringify(next)
      const normalized = decodeRecord(encoded)
      this.replace(this.records, key, { kind: normalized.kind, sealed: await this.cipher.seal(encoded) })
      this.notifyRecordUpdated(key)
      return normalized
    })
  }

  /** @param key - Credential address. @returns After atomic removal. */
  override deleteRecord(key: CredentialKey): Promise<void> {
    if (this.isEphemeral(key)) return this.enqueue(() => { this.ephemeralRecords.delete(key); this.notifyRecordUpdated(key) })
    return this.mutate(() => { this.replace(this.records, key, undefined); this.notifyRecordUpdated(key) })
  }

  /** @returns Ciphertext and addressing metadata only. */
  snapshot(): StoredVault {
    return { version: 1, refs: Object.fromEntries(this.refs), records: Object.fromEntries(this.records), connections: [...this.connections.values()] }
  }

  /** @returns Availability and the selected protection, without credential values. */
  status(): { available: boolean; protection: 'dpapi' | 'test' | 'unavailable' } {
    return { available: this.availability !== 'unavailable', protection: this.availability === 'available' ? 'dpapi' : this.availability }
  }

  /** Refuse operations that require durable secrets in a host without encryption. */
  assertAvailable(): void {
    if (this.availability === 'unavailable') throw new VaultUnavailableError()
  }

  private persist(): void { writeStoredVault(this.config.path, this.snapshot()) }

  private isEphemeral(key: CredentialKey): boolean {
    return this.availability === 'unavailable' && EPHEMERAL_RECORD_SCOPES.has(credentialKeyScope(key))
  }

  private mutate<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.availability === 'unavailable') return Promise.reject(new VaultUnavailableError())
    return this.enqueue(operation)
  }

  private enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const next = this.pending.then(operation)
    this.pending = next.then(() => {}, (_error: unknown) => { /* The caller receives the failed write; following operations see committed state. */ })
    return next
  }

  private replace<T>(map: Map<string, T>, key: string, value: T | undefined): void {
    const previous = map.get(key)
    if (value === undefined) map.delete(key)
    else map.set(key, value)
    try { this.persist() } catch (error) {
      if (previous === undefined) map.delete(key)
      else map.set(key, previous)
      throw error
    }
  }

  private async readRecordValue(key: CredentialKey): Promise<CredentialRecord | undefined> {
    const entry = this.records.get(key)
    if (entry === undefined) return undefined
    try { return decodeRecord(await this.cipher.open(entry.sealed)) }
    catch (_error) { throw new VaultUnavailableError() }
  }
}
