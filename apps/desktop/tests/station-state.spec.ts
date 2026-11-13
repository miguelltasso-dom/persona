import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DESKTOP_STATION, patchStationState, readStationState, stationFilePath, writeStationRunning } from '../src/station-state.ts'

function home(): string {
  return mkdtempSync(join(tmpdir(), 'persona-station-'))
}

function put(root: string, text: string): void {
  mkdirSync(join(root, 'db'), { recursive: true })
  writeFileSync(stationFilePath(root), text)
}

/** The host's own loader, imported by path from the repository root (so the same spec works in the tree and in the staging root). */
async function hostLoader(): Promise<(dataRoot: string) => { paired: boolean; running: boolean }> {
  const file = join(process.cwd(), 'packages', 'persona', 'persona-host', 'src', 'station', 'station-store.ts')
  const module = await import(pathToFileURL(file).href) as { loadStationState: (dataRoot: string) => { paired: boolean; running: boolean } }
  return module.loadStationState
}

describe('the desktop reader of station.json', () => {
  it('finds the file where the host keeps it: next to the database', () => {
    expect(stationFilePath('C:\\Persona')).toBe(join('C:\\Persona', 'db', 'station.json'))
  })

  it('a missing, damaged or foreign file is the default: nothing blocks someone who never opened the station', () => {
    expect(readStationState(home())).toEqual(DEFAULT_DESKTOP_STATION)
    for (const text of ['', '{', '[]', 'null', '"x"', '42']) {
      const root = home()
      put(root, text)
      expect(readStationState(root)).toEqual(DEFAULT_DESKTOP_STATION)
    }
  })

  it('reads paired and running with the host rule: only an explicit true pairs, only an explicit false turns it off', () => {
    const cases: Array<[string, { paired: boolean; running: boolean; crashes?: number }]> = [
      ['{"paired":true,"running":true}', { paired: true, running: true }],
      ['{"paired":true,"running":false}', { paired: true, running: false }],
      ['{"paired":"yes","running":"no"}', { paired: false, running: true }],
      ['{"paired":1}', { paired: false, running: true }],
      ['{"team":{"computerId":"pc-1"},"crashes":2}', { paired: false, running: true, crashes: 2 }], // a team without a workspace is not a team
    ]
    for (const [text, expected] of cases) {
      const root = home()
      put(root, text)
      expect(readStationState(root)).toEqual(expected)
    }
  })

  it('agrees with the host loader on every case (drift guard)', async () => {
    const load = await hostLoader()
    for (const text of [
      '{"paired":true,"running":false}', '{"paired":"x"}', '{', '[]', '{"running":false}', '{"paired":true,"crashes":3,"team":{"a":1}}',
      '{"paired":true,"crashes":3,"lastStartAt":1762990000000,"lastExit":"clean","pausedBy":"queda","team":{"workspaceId":"w1","computerId":"pc1"}}',
      '{"paired":true,"crashes":0,"lastStartAt":"x","lastExit":"crash","pausedBy":"pessoa","team":null}', '{"crashes":-2,"crashes2":1}',
    ]) {
      const root = home()
      put(root, text)
      // the host loads from `dirname(store.path)` = `<home>/db`
      expect(readStationState(root)).toEqual(load(join(root, 'db')))
    }
    expect(readStationState(home())).toEqual(load(join(home(), 'db')))
  })
})

describe('pausing the station from the desktop', () => {
  it('writes running:false and keeps every other field the host stored', () => {
    const root = home()
    put(root, '{"paired":true,"running":true,"crashes":4,"lastStartAt":"2026-11-12T18:00:00Z","team":{"computerId":"pc-1"}}')
    writeStationRunning(root, false)
    const saved = JSON.parse(readFileSync(stationFilePath(root), 'utf8')) as Record<string, unknown>
    expect(saved).toEqual({ paired: true, running: false, crashes: 4, lastStartAt: '2026-11-12T18:00:00Z', team: { computerId: 'pc-1' } })
    // lastStartAt as text and a team without a workspace are not read
    expect(readStationState(root)).toEqual({ paired: true, running: false, crashes: 4 })
  })

  it('patchStationState: sets what it is told, clears what it is told, keeps team and anything it does not know', () => {
    const root = home()
    put(root, '{"paired":true,"running":true,"crashes":4,"lastExit":"clean","team":{"workspaceId":"w1","computerId":"pc1"},"futureField":{"a":1}}')
    patchStationState(root, { running: false, pausedBy: 'queda', crashes: 5, lastStartAt: 1762990000000, clear: ['lastExit'] })
    const saved = JSON.parse(readFileSync(stationFilePath(root), 'utf8')) as Record<string, unknown>
    expect(saved).toEqual({
      paired: true, running: false, crashes: 5, pausedBy: 'queda', lastStartAt: 1762990000000,
      team: { workspaceId: 'w1', computerId: 'pc1' }, futureField: { a: 1 },
    })
    patchStationState(root, { running: true, clear: ['pausedBy', 'crashes'] })
    expect(readStationState(root)).toEqual({ paired: true, running: true, lastStartAt: 1762990000000, team: { workspaceId: 'w1', computerId: 'pc1' } })
  })

  it('creates the file when there is none (and never pairs a machine by itself)', () => {
    const root = home()
    writeStationRunning(root, false)
    expect(readStationState(root)).toEqual({ paired: false, running: false })
    writeStationRunning(root, true)
    expect(readStationState(root)).toEqual({ paired: false, running: true })
  })

  it('a damaged file is replaced by a clean one instead of failing the pause', () => {
    const root = home()
    put(root, '{ not json')
    writeStationRunning(root, false)
    expect(readStationState(root)).toEqual({ paired: false, running: false })
  })

  it('the host reads what the desktop wrote (round trip)', async () => {
    const load = await hostLoader()
    const root = home()
    put(root, '{"paired":true,"running":true}')
    writeStationRunning(root, false)
    expect(load(join(root, 'db'))).toEqual({ paired: true, running: false })
  })
})
