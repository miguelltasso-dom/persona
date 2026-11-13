import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decideRecovery, type RecoveryInput, type RecoveryReason } from '../src/station-recovery.ts'

/** The Host's own rule, imported by path from the repository root (the desktop's `rootDir` cannot reach it, the spec can). */
async function hostDecide(): Promise<(input: RecoveryInput) => unknown> {
  const file = join(process.cwd(), 'packages', 'persona', 'persona-host', 'src', 'station', 'recovery.ts')
  const module = await import(pathToFileURL(file).href) as { decideRecovery: (input: RecoveryInput) => unknown }
  return module.decideRecovery
}

describe('station fall policy (desktop copy)', () => {
  it('answers exactly like the Host rule for every reason, pairing, count of falls and run length', async () => {
    const host = await hostDecide()
    const reasons: RecoveryReason[] = ['crash', 'renderer-gone', 'host-failed', 'update', 'user-quit']
    let compared = 0
    for (const reason of reasons) {
      for (const paired of [true, false]) {
        for (const crashesInWindow of [0, 1, 2, 3, 4, 5, 6, 9]) {
          for (const previousRunMs of [undefined, 1_000, 599_999, 600_000, 3_600_000]) {
            for (const maxCrashes of [undefined, 3]) {
              const input: RecoveryInput = {
                reason, paired, crashesInWindow, now: 1_000_000,
                ...(previousRunMs === undefined ? {} : { previousRunMs }),
                ...(maxCrashes === undefined ? {} : { maxCrashes }),
              }
              expect(decideRecovery(input), JSON.stringify(input)).toEqual(host(input))
              compared += 1
            }
          }
        }
      }
    }
    expect(compared).toBe(5 * 2 * 8 * 5 * 2)
  })

  it('waits 2, 4, 8, 16 s between falls and stops the station at the fifth', () => {
    const wait = (crashesInWindow: number) => decideRecovery({ reason: 'host-failed', crashesInWindow, now: 0, paired: true })
    expect([0, 1, 2, 3].map(count => wait(count).delayMs)).toEqual([2_000, 4_000, 8_000, 16_000])
    expect(wait(4)).toMatchObject({ action: 'relaunch', delayMs: 32_000, pauseStation: false })
    expect(wait(5)).toMatchObject({ action: 'giveup', pauseStation: true })
  })

  it('refills the budget after a stable run, and never relaunches a computer that is not a station or a deliberate quit', () => {
    expect(decideRecovery({ reason: 'host-failed', crashesInWindow: 9, previousRunMs: 600_000, now: 0, paired: true }))
      .toMatchObject({ action: 'relaunch', delayMs: 2_000, pauseStation: false })
    expect(decideRecovery({ reason: 'crash', crashesInWindow: 0, now: 0, paired: false })).toMatchObject({ action: 'giveup', pauseStation: false })
    expect(decideRecovery({ reason: 'user-quit', crashesInWindow: 0, now: 0, paired: true })).toMatchObject({ action: 'giveup', pauseStation: false })
  })
})
