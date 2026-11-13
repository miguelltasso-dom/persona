/**
 * The desktop's own reader/writer of the station's small state file (`station.json`, shape fixed by
 * `persona-host/src/station/station-store.ts`).
 * The desktop cannot ask the Host: when the Host is crash-looping nobody answers, and that is exactly when it must read "is this the paired
 * station?" and, at the ceiling of crashes, pause the station. A spec pins this reader to the host's `loadStationState` so the two cannot
 * drift.
 *
 * One writer at a time: the desktop writes ONLY while no host child is alive (between a fall and the next start); the host writes only
 * while it
 * lives. Both read-merge-write atomically, and the desktop keeps every field it does not know.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** What the desktop reads from the file (the host's `StationState`, same rules). */
export interface DesktopStationState {
  /** This machine is the paired dedicated station. */
  readonly paired: boolean
  /** The person did not turn the station off (the default is on). */
  readonly running: boolean
  /** Falls in a row since the last stable run (absent = 0). */
  readonly crashes?: number
  /** Epoch ms of the last launch. */
  readonly lastStartAt?: number
  /** `clean` when the previous run left on purpose. */
  readonly lastExit?: 'clean'
  /** `queda` when the app itself stopped the station because the fall budget ran out. */
  readonly pausedBy?: 'queda'
  /** The team and the registration of this computer; absent = a local station. */
  readonly team?: { readonly workspaceId: string; readonly computerId: string }
}

/** A machine nobody configured. */
export const DEFAULT_DESKTOP_STATION: DesktopStationState = { paired: false, running: true }

/**
 * Where the host keeps it: next to the database, `<PERSONA_HOME>/db/station.json` (the host uses `dirname(store.path)`).
 * @param home - The product home (`PERSONA_HOME`).
 */
export function stationFilePath(home: string): string {
  return join(home, 'db', 'station.json')
}

function parse(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  } catch { return undefined }
}

/**
 * @param home - The product home.
 * @returns The stored state; the default when the file is missing, unreadable or not the stored shape (same rule as the host).
 */
export function readStationState(home: string): DesktopStationState {
  let text: string
  try { text = readFileSync(stationFilePath(home), 'utf8') } catch { return DEFAULT_DESKTOP_STATION }
  const record = parse(text)
  if (record === undefined) return DEFAULT_DESKTOP_STATION
  const team = record.team as { workspaceId?: unknown; computerId?: unknown } | null | undefined
  return {
    paired: record.paired === true,
    running: record.running !== false,
    ...(typeof record.crashes === 'number' && Number.isInteger(record.crashes) && record.crashes > 0 ? { crashes: record.crashes } : {}),
    ...(typeof record.lastStartAt === 'number' && Number.isFinite(record.lastStartAt) ? { lastStartAt: record.lastStartAt } : {}),
    ...(record.lastExit === 'clean' ? { lastExit: 'clean' as const } : {}),
    ...(record.pausedBy === 'queda' ? { pausedBy: 'queda' as const } : {}),
    ...(typeof team?.workspaceId === 'string' && typeof team.computerId === 'string' ? { team: { workspaceId: team.workspaceId, computerId: team.computerId } } : {}),
  }
}

/** What the desktop may change while the host is down. */
export interface StationPatch {
  readonly running?: boolean
  readonly crashes?: number
  readonly lastStartAt?: number
  readonly lastExit?: 'clean'
  readonly pausedBy?: 'queda'
  /** Fields to remove. */
  readonly clear?: readonly ('crashes' | 'lastExit' | 'pausedBy')[]
}

/**
 * Merge a patch into the file, keeping every other field (`team`, anything newer). Atomic: a temp file renamed over the original, so a
 * crash
 * mid-write never leaves half a file. A damaged file is replaced by a clean one.
 * @param home - The product home.
 * @param patch - What to set and what to clear.
 */
export function patchStationState(home: string, patch: StationPatch): void {
  const path = stationFilePath(home)
  let current: Record<string, unknown> = {}
  try { current = parse(readFileSync(path, 'utf8')) ?? {} } catch { current = {} }
  const cleared = new Set<string>(patch.clear ?? [])
  const merged = { ...current, paired: current.paired === true }
  const next: Record<string, unknown> = Object.fromEntries(Object.entries(merged).filter(([key]) => !cleared.has(key)))
  if (patch.running !== undefined) next.running = patch.running
  if (patch.crashes !== undefined) next.crashes = patch.crashes
  if (patch.lastStartAt !== undefined) next.lastStartAt = patch.lastStartAt
  if (patch.lastExit !== undefined) next.lastExit = patch.lastExit
  if (patch.pausedBy !== undefined) next.pausedBy = patch.pausedBy
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${String(process.pid)}.tmp`
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`)
  renameSync(temp, path)
}

/**
 * Pause (or resume) the station by writing `running`, keeping every other field.
 * @param home - The product home.
 * @param running - The new value.
 */
export function writeStationRunning(home: string, running: boolean): void {
  patchStationState(home, { running })
}
