/**
 * M4/M5 (Lumen, `m5-seguranca-requisitos.md` §B): the pairing lock lives on disk. Before, the count of wrong codes and the lock lived in RAM, so
 * restarting the app (or making it fall on purpose) reset the guesses. The file holds counters and instants only: never a code, never its hash.
 *
 * Fail closed: a file that exists but cannot be read is a full lock, never an empty one.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The file name inside the data folder (next to `station.json`). */
export const LOCK_FILE = 'pairing-lock.json'

/** What survives a restart. */
export interface PairingLockState {
  /** Wrong codes in a row. */
  readonly misses: number
  /** Epoch ms until which every code is refused. */
  readonly lockedUntil: number
  /** Epoch ms of the redemptions in the last hour (the hourly cap). */
  readonly redeemedAt: readonly number[]
}

/** Where the lock is kept. */
export interface PairingLockStore {
  /** @returns The stored state, `missing` on a fresh install, `corrupt` when a file exists and cannot be read. */
  load(): PairingLockState | 'missing' | 'corrupt'
  /** @param state - What to remember (written atomically). */
  save(state: PairingLockState): void
}

/**
 * @param dataRoot - The product's data folder.
 * @returns A store that keeps the lock in one JSON file there.
 */
export function fileLockStore(dataRoot: string): PairingLockStore {
  const path = join(dataRoot, LOCK_FILE)
  return {
    load() {
      let text: string
      try { text = readFileSync(path, 'utf8') } catch (error) { return isMissing(error) ? 'missing' : 'corrupt' }
      let parsed: unknown
      try { parsed = JSON.parse(text) } catch (error) { void error; return 'corrupt' }
      if (parsed === null || typeof parsed !== 'object') return 'corrupt'
      const record = parsed as { misses?: unknown; lockedUntil?: unknown; redeemedAt?: unknown }
      if (!Number.isFinite(record.misses) || !Number.isFinite(record.lockedUntil) || !Array.isArray(record.redeemedAt)) return 'corrupt'
      if (!record.redeemedAt.every(value => typeof value === 'number' && Number.isFinite(value))) return 'corrupt'
      return { misses: record.misses as number, lockedUntil: record.lockedUntil as number, redeemedAt: record.redeemedAt as number[] }
    },
    save(state) {
      mkdirSync(dataRoot, { recursive: true })
      const temp = `${path}.${String(process.pid)}.tmp`
      writeFileSync(temp, `${JSON.stringify(state)}\n`)
      renameSync(temp, path)
    },
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
}
