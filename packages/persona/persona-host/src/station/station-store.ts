/**
 * P1-10 (Carbon, colheita-s1), Item 24: what the dedicated station remembers between launches — whether THIS machine is the paired
 * station and whether the person turned it off. Before, `paired` lived only in RAM, so every restart forgot it.
 *
 * One small JSON file in the product's data folder (the machine's, like the browser profiles: pairing is a fact about this computer, not
 * about a project), written atomically. A missing or unreadable file is the default (ligada, não pareada): a fresh install and a damaged
 * file look the same, and nothing blocks a person who never touched the station.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The file name inside the data folder. */
export const STATION_FILE = 'station.json'

/** What is stored. */
export interface StationState {
  /** This machine is the paired dedicated station: the RAM floor and "stay awake while there is work" apply. */
  readonly paired: boolean
  /** The person did not turn the station off (the default is on: nothing blocks someone who never opened the screen). */
  readonly running: boolean
}

/** The state of a machine nobody configured. */
export const DEFAULT_STATION_STATE: StationState = { paired: false, running: true }

/**
 * @param dataRoot - The product's data folder.
 * @returns The stored state; the default when the file is missing, unreadable or not the stored shape.
 */
export function loadStationState(dataRoot: string): StationState {
  let text: string
  try { text = readFileSync(join(dataRoot, STATION_FILE), 'utf8') } catch (error) { void error; return DEFAULT_STATION_STATE }
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (error) { void error; return DEFAULT_STATION_STATE }
  if (parsed === null || typeof parsed !== 'object') return DEFAULT_STATION_STATE
  const record = parsed as { paired?: unknown; running?: unknown }
  return {
    paired: record.paired === true,
    // Only an explicit `false` turns the station off; anything else (missing, hand-edited garbage) is the default, on.
    running: record.running !== false,
  }
}

/**
 * Write the state atomically (a temp file renamed over it), so a crash mid-write never leaves half a file.
 * @param dataRoot - The product's data folder.
 * @param state - What to remember.
 */
export function saveStationState(dataRoot: string, state: StationState): void {
  const path = join(dataRoot, STATION_FILE)
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${String(process.pid)}.tmp`
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(temp, path)
}
