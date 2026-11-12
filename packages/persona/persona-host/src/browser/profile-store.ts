/**
 * Item 17 (colheita): where the named browser profiles and their grants live between launches. One JSON file in the
 * product's data folder, written atomically (a temp file renamed over it) so a crash mid-write never leaves half a list.
 *
 * A missing or unreadable file is an EMPTY list, not a crash: a fresh install and a corrupted file look the same to the
 * person (no profiles), and the next save rewrites it.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BrowserProfile, ProfileGrants } from './profiles.ts'

/** The file name inside the data folder. */
export const BROWSER_PROFILES_FILE = 'browser-profiles.json'

/** What is stored. */
export interface StoredBrowserProfiles {
  readonly profiles: readonly BrowserProfile[]
  readonly grants: ProfileGrants
}

/** Filesystem seam so the store is testable. */
export interface BrowserProfileStoreIo {
  read(path: string): string | undefined
  write(path: string, text: string): void
  rename(from: string, to: string): void
  mkdir(path: string): void
}

/** The real filesystem. */
export const defaultBrowserProfileStoreIo: BrowserProfileStoreIo = {
  read: (path) => { try { return readFileSync(path, 'utf8') } catch (error) { void error; return undefined } },
  write: (path, text) => { writeFileSync(path, text) },
  rename: (from, to) => { renameSync(from, to) },
  mkdir: (path) => { mkdirSync(path, { recursive: true }) },
}

/** Whether a parsed value has the stored shape (a hand-edited file must not crash the host). */
function isStored(value: unknown): value is StoredBrowserProfiles {
  if (value === null || typeof value !== 'object') return false
  const record = value as { profiles?: unknown; grants?: unknown }
  if (!Array.isArray(record.profiles)) return false
  if (record.grants === null || typeof record.grants !== 'object' || Array.isArray(record.grants)) return false
  if (!Object.values(record.grants).every(value => Array.isArray(value) && value.every(id => typeof id === 'string'))) return false
  return record.profiles.every(profile => profile !== null && typeof profile === 'object'
    && typeof (profile as { id?: unknown }).id === 'string'
    && typeof (profile as { name?: unknown }).name === 'string')
}

/**
 * Read the stored profiles.
 * @param dataRoot - The product's data folder.
 * @param io - Filesystem seam.
 * @returns The profiles and grants; empty when the file is missing or unreadable.
 */
export function loadBrowserProfiles(dataRoot: string, io: BrowserProfileStoreIo = defaultBrowserProfileStoreIo): StoredBrowserProfiles {
  const text = io.read(join(dataRoot, BROWSER_PROFILES_FILE))
  if (text === undefined) return { profiles: [], grants: {} }
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (error) { void error; return { profiles: [], grants: {} } }
  if (!isStored(parsed)) return { profiles: [], grants: {} }
  return { profiles: parsed.profiles, grants: parsed.grants }
}

/**
 * Write the profiles atomically.
 * @param dataRoot - The product's data folder.
 * @param stored - Profiles and grants.
 * @param io - Filesystem seam.
 */
export function saveBrowserProfiles(dataRoot: string, stored: StoredBrowserProfiles, io: BrowserProfileStoreIo = defaultBrowserProfileStoreIo): void {
  const path = join(dataRoot, BROWSER_PROFILES_FILE)
  io.mkdir(dirname(path))
  const temp = `${path}.${String(process.pid)}.tmp`
  io.write(temp, `${JSON.stringify(stored, null, 2)}\n`)
  io.rename(temp, path)
}
