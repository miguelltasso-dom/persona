/**
 * D-116 (Bolt): the DURABLE homes of the handoff's records, so that a crash or a restart at any step reads them back and goes on. One small JSON file per persona in the machine's data folder, written atomically (a
 * temp file, then a rename), owner-only where the system has modes. The file name is the SHA-256 of the persona id (an id may hold characters a file name cannot), and the id is kept inside the file.
 *
 * What A keeps is its transfer record (and the escrow: the bundle sealed for A ITSELF); what B keeps in quarantine is the SEALED bundle — ciphertext on disk, opened again only at activation — and the ids of the
 * bundles it already accepted (a repeat is refused, also after a restart). A damaged or unreadable file is "no record": it is never trusted and never throws.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Quarantined, QuarantineStore, TransferRecord, TransferStore } from './handoff.ts'

/** How many accepted bundle ids B remembers (a bundle is worth 24 hours: far more than that cannot be replayed). */
export const SEEN_KEPT = 2_000

const nameOf = (personaId: string): string => `${createHash('sha256').update(personaId).digest('hex').slice(0, 32)}.json`

function writeJson(dir: string, name: string, value: unknown): void {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  const temp = `${path}.tmp`
  writeFileSync(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 })
  renameSync(temp, path)
}

function readJson(dir: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown
  } catch (error) {
    void error // missing or damaged: no record
    return undefined
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const PHASES = ['sealed', 'released', 'rolled-back', 'done']

function transferOf(value: unknown): TransferRecord | undefined {
  if (!isObject(value)) return undefined
  const ok = ['transferId', 'personaId', 'from', 'to', 'digest'].every(key => typeof value[key] === 'string') && typeof value.epoch === 'number' && typeof value.startedAt === 'number'
    && typeof value.phase === 'string' && PHASES.includes(value.phase) && (value.activateBefore === undefined || typeof value.activateBefore === 'number') && (value.escrow === undefined || isObject(value.escrow))
  return ok ? value as unknown as TransferRecord : undefined
}

function quarantinedOf(value: unknown): Quarantined | undefined {
  if (!isObject(value)) return undefined
  const ok = ['transferId', 'personaId', 'from', 'digest'].every(key => typeof value[key] === 'string') && typeof value.epoch === 'number' && isObject(value.sealed)
  return ok ? value as unknown as Quarantined : undefined
}

/**
 * A's transfer records, one file per persona.
 * @param dir - The folder (created on the first write).
 * @returns The store.
 */
export function fileTransferStore(dir: string): TransferStore {
  const list = (): string[] => { try { return readdirSync(dir).filter(name => name.endsWith('.json')) } catch (error) { void error; return [] } }
  return {
    get(personaId) {
      const record = transferOf(readJson(dir, nameOf(personaId)))
      return record?.personaId === personaId ? record : undefined
    },
    put(record) { writeJson(dir, nameOf(record.personaId), record) },
    open() {
      return list().flatMap((name) => { const record = transferOf(readJson(dir, name)); return record !== undefined && (record.phase === 'sealed' || record.phase === 'released') ? [record] : [] })
    },
  }
}

/**
 * B's quarantine (the sealed bundles it holds but did not activate) and the ids of the bundles it accepted.
 * @param dir - The folder (created on the first write).
 * @returns The store.
 */
export function fileQuarantineStore(dir: string): QuarantineStore {
  const seenName = 'seen.json'
  const seenIds = (): string[] => { const value = readJson(dir, seenName); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
  return {
    get(personaId) {
      const held = quarantinedOf(readJson(dir, `q-${nameOf(personaId)}`))
      return held?.personaId === personaId ? held : undefined
    },
    put(item) { writeJson(dir, `q-${nameOf(item.personaId)}`, item) },
    drop(personaId) { rmSync(join(dir, `q-${nameOf(personaId)}`), { force: true }) },
    seen: bundleId => seenIds().includes(bundleId),
    markSeen(bundleId) { writeJson(dir, seenName, [...seenIds().filter(id => id !== bundleId), bundleId].slice(-SEEN_KEPT)) },
  }
}
