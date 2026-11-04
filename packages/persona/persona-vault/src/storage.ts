/** Versioned ciphertext-only file with atomic replacement and corruption quarantine. */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { credentialRef, parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type { VaultConnection } from './vault.ts'
import { VaultStorageError } from './errors.ts'

/** Serialized store; credential values occur only inside sealed strings. */
export interface StoredVault {
  version: 1
  refs: Record<string, string>
  records: Record<string, { kind: CredentialRecord['kind']; sealed: string }>
  connections: VaultConnection[]
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringMap(value: unknown): Record<string, string> {
  if (!record(value)) throw new Error('invalid vault map')
  const entries: Array<[string, string]> = []
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new Error('invalid vault value')
    entries.push([key, item])
  }
  return Object.fromEntries(entries)
}

function parse(value: unknown): StoredVault {
  if (!record(value) || value.version !== 1 || !record(value.records) || !Array.isArray(value.connections)
    || Object.keys(value).some(key => !['version', 'refs', 'records', 'connections'].includes(key))) throw new Error('invalid vault file')
  const refs = stringMap(value.refs)
  for (const key of Object.keys(refs)) credentialRef(key)
  const records: StoredVault['records'] = {}
  for (const [key, entry] of Object.entries(value.records)) {
    parseCredentialKey(key)
    if (!record(entry) || (entry.kind !== 'api-key' && entry.kind !== 'grant') || typeof entry.sealed !== 'string'
      || Object.keys(entry).some(field => field !== 'kind' && field !== 'sealed')) throw new Error('invalid vault record')
    records[key] = { kind: entry.kind, sealed: entry.sealed }
  }
  const connections: VaultConnection[] = []
  for (const row of value.connections) {
    if (!record(row) || typeof row.personId !== 'string' || typeof row.provider !== 'string' || typeof row.sealed !== 'string'
      || (row.accountId !== undefined && typeof row.accountId !== 'string') || (row.label !== undefined && typeof row.label !== 'string')
      || Object.keys(row).some(key => !['personId', 'provider', 'sealed', 'accountId', 'label'].includes(key))) throw new Error('invalid vault connection')
    connections.push({ personId: row.personId, provider: row.provider, sealed: row.sealed,
      ...(row.accountId === undefined ? {} : { accountId: row.accountId }), ...(row.label === undefined ? {} : { label: row.label }) })
  }
  return { version: 1, refs, records, connections }
}

/** @returns Empty version-one file contents. */
export function emptyStoredVault(): StoredVault { return { version: 1, refs: {}, records: {}, connections: [] } }

/**
 * Load valid ciphertext or quarantine malformed JSON without logging its contents.
 * @param path - Configured vault file; empty selects volatile storage.
 * @returns Parsed ciphertext or an empty store after absence/corruption.
 */
export function readStoredVault(path: string): StoredVault {
  if (path === '' || !existsSync(path)) return emptyStoredVault()
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return parse(raw)
  } catch (_error) {
    try { renameSync(path, existsSync(`${path}.bad`) ? `${path}.bad-${randomUUID()}` : `${path}.bad`) }
    catch (_renameError) { throw new VaultStorageError() }
    console.warn('Persona: o arquivo do Cofre estava danificado; foi separado e um Cofre vazio foi aberto.')
    return emptyStoredVault()
  }
}

/**
 * Replace the complete ciphertext document atomically; failure preserves the previous file.
 * @param path - Configured vault file; empty keeps an explicitly selected volatile store.
 * @param value - Complete sealed state.
 * @returns After the temporary file has been flushed and renamed.
 */
export function writeStoredVault(path: string, value: StoredVault): void {
  if (path === '') return
  const temporary = `${path}.${randomUUID()}.tmp`
  let descriptor: number | undefined
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(value)}\n`)
    fsyncSync(descriptor)
    closeSync(descriptor); descriptor = undefined
    renameSync(temporary, path)
  } catch (_error) {
    throw new VaultStorageError()
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    try { unlinkSync(temporary) } catch (_error) { /* A committed rename leaves no temporary file. */ }
  }
}
