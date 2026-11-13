/**
 * M4 (Marco Dogfood, critério 4): the Tasks the station stopped ("sem vaga") survive a restart. Before, the waiting list was a `Map` in RAM: a fall or an
 * update forgot every card the station had stopped, and nothing ran them again. One small JSON file next to `station.json`, written atomically.
 *
 * Only identifiers are kept (project, ticket, assignment). The gate still checks, when it runs a row again, that the ticket did not move on since.
 * A missing or unreadable file is an empty list: the Vigia's pull still finds a card nobody executes, so nothing is lost for good.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StationWaitRow } from './station-gate.ts'

/** The file name inside the data folder. */
export const WAIT_FILE = 'station-waiting.json'

/** Where the waiting list is kept. */
export interface StationWaitStore {
  /** @returns The stored rows, oldest first. */
  load(): StationWaitRow[]
  /** @param rows - The whole list to remember (written atomically). */
  save(rows: readonly StationWaitRow[]): void
}

/**
 * @param dataRoot - The product's data folder.
 * @returns A store that keeps the waiting list in one JSON file there.
 */
export function fileWaitStore(dataRoot: string): StationWaitStore {
  const path = join(dataRoot, WAIT_FILE)
  return {
    load() {
      let text: string
      try { text = readFileSync(path, 'utf8') } catch (error) { void error; return [] }
      let parsed: unknown
      try { parsed = JSON.parse(text) } catch (error) { void error; return [] }
      if (!Array.isArray(parsed)) return []
      const rows: StationWaitRow[] = []
      for (const item of parsed as readonly (Partial<Record<keyof StationWaitRow, unknown>> | null)[]) {
        if (typeof item?.projectId === 'string' && typeof item.ticketId === 'string' && typeof item.assignmentId === 'string') {
          rows.push({ projectId: item.projectId, ticketId: item.ticketId, assignmentId: item.assignmentId })
        }
      }
      return rows
    },
    save(rows) {
      mkdirSync(dataRoot, { recursive: true })
      const temp = `${path}.${String(process.pid)}.tmp`
      writeFileSync(temp, `${JSON.stringify(rows)}\n`)
      renameSync(temp, path)
    },
  }
}
