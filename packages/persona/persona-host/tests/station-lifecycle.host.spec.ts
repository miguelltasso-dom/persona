import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterAll, describe, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'
import { PairingBook } from '../src/station/pairing.ts'
import { PowerKeeper } from '../src/station/power.ts'
import { STABLE_MS } from '../src/station/recovery.ts'
import { Station } from '../src/station/station.ts'
import { loadStationState, saveStationState, type StationState } from '../src/station/station-store.ts'

const dirs: string[] = []

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe('M4 station lifecycle and additive station.json persistence', () => {
  it('Station.redeem and setRunning(false) preserve crashes, lastStartAt, lastExit and team; setRunning(true) clears pausedBy and crashes', () => {
    const team = { workspaceId: 'ws', computerId: 'pc1' } as const
    const savedOnPair: StationState[] = []
    const unpaired = new Station({
      pairing: new PairingBook({ pick: () => 'A' }),
      power: new PowerKeeper({ platform: 'linux' }),
      initial: { paired: false, running: true, crashes: 2, lastStartAt: 1_000, lastExit: 'clean', team },
      persist: (state) => { savedOnPair.push(state) },
    })

    const code = unpaired.issueCode()
    expect(unpaired.redeem(code.code)).toBe('ok')
    expect(savedOnPair.at(-1)).toEqual({
      paired: true,
      running: true,
      crashes: 2,
      lastStartAt: 1_000,
      lastExit: 'clean',
      team,
    })

    const savedOnPause: StationState[] = []
    const pairedRunning = new Station({
      power: new PowerKeeper({ platform: 'linux' }),
      initial: { paired: true, running: true, crashes: 1, lastStartAt: 2_000, lastExit: 'clean', team },
      persist: (state) => { savedOnPause.push(state) },
    })
    pairedRunning.setRunning(false)
    expect(savedOnPause.at(-1)).toEqual({
      paired: true,
      running: false,
      crashes: 1,
      lastStartAt: 2_000,
      lastExit: 'clean',
      team,
    })

    const savedOnResume: StationState[] = []
    const pausedByCrash = new Station({
      power: new PowerKeeper({ platform: 'linux' }),
      initial: { paired: true, running: false, crashes: 3, lastStartAt: 3_000, pausedBy: 'queda', team },
      persist: (state) => { savedOnResume.push(state) },
    })
    pausedByCrash.setRunning(true)
    expect(savedOnResume.at(-1)).toEqual({
      paired: true,
      running: true,
      lastStartAt: 3_000,
      team,
    })
  })

  it('paired host boot records planLaunch, clean dispose marks lastExit clean, and next boot resets crashes', async () => {
    const dir = makeTempDir('persona-station-recovery-')
    const databasePath = join(dir, 'persona.db')
    const team = { workspaceId: 'ws', computerId: 'pc1' } as const
    const previousStart = Date.now() - 60_000

    saveStationState(dir, {
      paired: true,
      running: true,
      crashes: 1,
      lastStartAt: previousStart,
      team,
    })

    const tBeforeBoot1 = Date.now()
    const ctx1 = new Context()
    const host1 = new PersonaHost(ctx1, { databasePath })
    const tAfterBoot1 = Date.now()
    try {
      const afterCrashBoot = loadStationState(dir)
      expect(afterCrashBoot.paired).toBe(true)
      expect(afterCrashBoot.running).toBe(true)
      expect(afterCrashBoot.crashes).toBe(2)
      expect(afterCrashBoot.lastExit).toBeUndefined()
      expect(afterCrashBoot.team).toEqual(team)
      expect(afterCrashBoot.lastStartAt).toBeGreaterThanOrEqual(tBeforeBoot1)
      expect(afterCrashBoot.lastStartAt).toBeLessThanOrEqual(tAfterBoot1)
      expect(host1.station).toBeDefined()
    } finally {
      await ctx1.fiber.dispose()
    }

    const afterCleanDispose = loadStationState(dir)
    expect(afterCleanDispose).toMatchObject({
      paired: true,
      running: true,
      crashes: 2,
      lastExit: 'clean',
      team,
    })

    const tBeforeBoot2 = Date.now()
    const ctx2 = new Context()
    new PersonaHost(ctx2, { databasePath })
    const tAfterBoot2 = Date.now()
    try {
      const afterCleanBoot = loadStationState(dir)
      expect(afterCleanBoot.paired).toBe(true)
      expect(afterCleanBoot.running).toBe(true)
      expect(afterCleanBoot.crashes).toBeUndefined()
      expect(afterCleanBoot.lastExit).toBeUndefined()
      expect(afterCleanBoot.team).toEqual(team)
      expect(afterCleanBoot.lastStartAt).toBeGreaterThanOrEqual(tBeforeBoot2)
      expect(afterCleanBoot.lastStartAt).toBeLessThanOrEqual(tAfterBoot2)
    } finally {
      await ctx2.fiber.dispose()
    }
  })

  it('paused-by-crash host boot preserves pausedBy and crashes until user turns station back on, and preserves disk team added after boot', async () => {
    const dir = makeTempDir('persona-station-paused-')
    const databasePath = join(dir, 'persona.db')
    const team = { workspaceId: 'ws', computerId: 'pc1' } as const
    const previousStart = Date.now() - STABLE_MS + 60_000

    saveStationState(dir, {
      paired: true,
      running: false,
      crashes: 3,
      lastStartAt: previousStart,
      pausedBy: 'queda',
      team,
    })

    const ctx = new Context()
    const host = new PersonaHost(ctx, { databasePath })
    try {
      expect(loadStationState(dir)).toEqual({
        paired: true,
        running: false,
        crashes: 3,
        lastStartAt: previousStart,
        pausedBy: 'queda',
        team,
      })

      host.station.setRunning(true)
      expect(loadStationState(dir)).toEqual({
        paired: true,
        running: true,
        lastStartAt: previousStart,
        team,
      })

      // External team assignment written while the host is running survives a host toggle.
      const updatedTeam = { workspaceId: 'ws', computerId: 'pc2' } as const
      saveStationState(dir, { ...loadStationState(dir), team: updatedTeam })
      host.station.setRunning(false)
      expect(loadStationState(dir).team).toEqual(updatedTeam)
      expect(loadStationState(dir).running).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
