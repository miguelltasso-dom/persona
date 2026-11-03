import { describe, expect, it } from 'vitest'
import { createFakeRunner, createWatchdogDriver, WATCHDOG_SESSION_ID } from '../src/index.ts'

describe('Watchdog driver', () => {
  it('does not write tickets and only ticks when a routine is claimed', async () => {
    const runner = createFakeRunner()
    const claims: string[][] = []
    const driver = createWatchdogDriver({
      runner,
      persona: { id: 'p-watch', name: 'Marina' },
      cwd: 'C:/tmp/project',
      projectId: 'proj-1',
      claimDue: (projectId, leaseUntil) => {
        claims.push([projectId, leaseUntil])
        return claims.length === 1 ? [] : [{ id: 'run-1' }]
      },
      snapshot: () => ({
        stalledTicketIds: ['t-stall', 't-stall'],
        failingEffectKeys: ['fx-1'],
        unavailableEvalIds: ['ev-1', 'ev-1'],
      }),
      now: () => '2026-11-03T15:00:00.000Z',
    })
    await driver.start()
    expect(runner.session(WATCHDOG_SESSION_ID)?.role).toBe('watchdog')
    expect(await driver.tick('2026-11-03T15:01:00.000Z')).toEqual([])
    const warnings = await driver.tick('2026-11-03T15:02:00.000Z')
    expect(warnings.map(item => item.id)).toEqual([
      'ticket_stalled:t-stall',
      'effect_failing:fx-1',
      'eval_unavailable:ev-1',
    ])
    expect(runner.delivered.some(item => item.sessionId === WATCHDOG_SESSION_ID)).toBe(true)
    expect(JSON.stringify(warnings)).not.toMatch(/ticket\.write|assignmentStarted/u)
  })
})
