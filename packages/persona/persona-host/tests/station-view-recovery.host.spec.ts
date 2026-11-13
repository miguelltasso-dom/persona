import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, vi } from 'vitest'
import PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { saveStationState } from '../src/station/station-store.ts'
import { FEATURE_OFF_REASON } from '../src/surface-gates.ts'
import { it, openJourneyFile, reopenJourney, SCOPE, seedJourney } from './journeys/journey-host.ts'

const dispose = (h: PersonaHost): Promise<void> => (h as unknown as { ctx: { fiber: { dispose(): Promise<void> } } }).ctx.fiber.dispose()

describe('StationView recovery visibility (M4)', () => {
  const dirs: string[] = []
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  it('exposes pausedBy and crashes on StationView after crash-cap pause and clears them on setStationRunning(true)', async () => {
    const startMs = Date.parse('2026-11-12T04:00:00.000Z')
    const crashBootMs = startMs + 30_000
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(startMs)
    const first = openJourneyFile(new Date(startMs).toISOString())
    seedJourney(first, [])
    const code = first.issueStationCode(SCOPE)
    expect(first.pairStation({ ...SCOPE, code: code.code }).ok).toBe(true)

    const cleanView = await first.stationView(SCOPE)
    expect(cleanView.paired).toBe(true)
    expect(cleanView.running).toBe(true)
    expect(cleanView.crashes).toBeUndefined()
    expect(cleanView.pausedBy).toBeUndefined()

    const dbPath = first.store.path
    const dataRoot = join(dbPath, '..')
    await dispose(first)

    // Simulate Rivet's desktop watchdog pausing the station at the 5-crash cap before relaunch.
    saveStationState(dataRoot, { paired: true, running: false, crashes: 5, pausedBy: 'queda', lastStartAt: startMs })

    vi.setSystemTime(crashBootMs)
    const second = reopenJourney(dbPath, new Date(crashBootMs).toISOString())
    second.sessionMemberId = 'ana'
    const crashedView = await second.stationView(SCOPE)
    expect(crashedView.running).toBe(false)
    expect(crashedView.crashes).toBe(5)
    expect(crashedView.pausedBy).toBe('queda')

    const resumed = await second.setStationRunning({ ...SCOPE, running: true })
    expect(resumed.running).toBe(true)
    expect(resumed.crashes).toBeUndefined()
    expect(resumed.pausedBy).toBeUndefined()
  })

  it('D-113: keeps stationView refused with feature-off when flagDefaults is production', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-station-view-d113-'))
    dirs.push(dir)
    const ctx = new Context()
    const host = new PersonaHost(ctx, { databasePath: join(dir, 'p.db'), flagDefaults: 'production' })
    try {
      host.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
      host.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
      host.sessionMemberId = 'ana'
      let reason: string | undefined
      try {
        await host.stationView(SCOPE)
      } catch (error) {
        reason = error instanceof RemoteFault ? error.details.reason : 'other'
      }
      expect(reason).toBe(FEATURE_OFF_REASON)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
