/**
 * M4/D-116: atomic disk store for the last seen heartbeat of each team computer (`computer-presence.json` next to `station.json`).
 * Keeping this beside `station-store.ts` lets `ComputerPresence` survive host restarts ("visto pela última vez às…") and continue
 * rejecting replayed heartbeat counters without polluting SQLite or crashing on truncated JSON.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseBeat, type PresenceRecord } from './computer-presence.ts'

/** File name inside the host data folder (next to `station.json`). */
export const PRESENCE_FILE = 'computer-presence.json'

/** Persistence callbacks matching {@link ComputerPresence} options. */
export interface PresenceStore {
  readonly load: () => Readonly<Record<string, PresenceRecord>>
  readonly save: (records: Readonly<Record<string, PresenceRecord>>) => void
}

function asObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePresenceRecord(raw: unknown): PresenceRecord | undefined {
  if (!asObject(raw)) return undefined
  if (typeof raw.lastSeenAt !== 'number' || !Number.isFinite(raw.lastSeenAt) || raw.lastSeenAt < 0) return undefined
  const beat = parseBeat(raw.beat)
  if (beat === undefined) return undefined
  return { lastSeenAt: raw.lastSeenAt, beat }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    void error
    return undefined
  }
}

function loadPresenceRecords(dataRoot: string): Readonly<Record<string, PresenceRecord>> {
  const path = join(dataRoot, PRESENCE_FILE)
  if (!existsSync(path)) return {}
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    void error
    return {}
  }
  const parsed = parseJson(raw)
  if (!asObject(parsed)) return {}
  const out: Record<string, PresenceRecord> = {}
  for (const [computerId, entry] of Object.entries(parsed)) {
    const record = parsePresenceRecord(entry)
    if (record !== undefined) out[computerId] = record
  }
  return out
}

function savePresenceRecords(dataRoot: string, records: Readonly<Record<string, PresenceRecord>>): void {
  mkdirSync(dataRoot, { recursive: true })
  const path = join(dataRoot, PRESENCE_FILE)
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(records, null, 2))
  renameSync(tmp, path)
}

/**
 * Create a file-backed presence store rooted at the host data folder.
 *
 * @param dataRoot - Host directory holding `station.json` and `computer-presence.json`.
 * @returns Atomic `load` / `save` callbacks for {@link ComputerPresence}.
 */
export function filePresenceStore(dataRoot: string): PresenceStore {
  return {
    load: () => loadPresenceRecords(dataRoot),
    save: (records) => { savePresenceRecords(dataRoot, records) },
  }
}
