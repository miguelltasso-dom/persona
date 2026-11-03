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
    expect(driver.audit()).toHaveLength(1)
    expect(driver.audit()[0]?.version).toBe(1)
    expect(driver.audit()[0]?.ruleVersion).toBe(1)
  })

  it('records a versioned audit when vigia rules change and never writes tickets', async () => {
    const runner = createFakeRunner()
    const rules = { noProgressMs: 1, loopCount: 1 }
    const driver = createWatchdogDriver({
      runner,
      persona: { id: 'p-watch', name: 'Marina' },
      cwd: 'C:/tmp/project',
      projectId: 'proj-1',
      claimDue: () => [{ id: 'run-1' }],
      snapshot: () => ({ stalledTicketIds: [], failingEffectKeys: [], unavailableEvalIds: [] }),
      rules,
      vigia: () => ({
        now: 10,
        openGoal: true,
        stalledTicketIds: [],
        failingEffectKeys: [],
        unavailableEvalIds: [],
        personas: [{
          personaId: 'nina',
          idle: true,
          queueLength: 1,
          lastProgressAt: 0,
          sameReportCount: 1,
        }],
      }),
      now: () => '2026-11-03T16:00:00.000Z',
    })
    await driver.start()
    const first = await driver.tick('2026-11-03T16:01:00.000Z')
    expect(first.some(item => item.kind === 'idle_with_queue')).toBe(true)
    rules.noProgressMs = 99
    const second = await driver.tick('2026-11-03T16:02:00.000Z')
    expect(second.length).toBeGreaterThan(0)
    const trail = driver.audit()
    expect(trail).toHaveLength(2)
    expect(trail[1]?.ruleVersion).toBe(2)
    expect(trail[1]?.version).toBe(2)
    expect(trail[1]?.adjustment).toMatch(/assign:nina|recover:nina/u)
    expect(JSON.stringify(trail)).not.toMatch(/ticket\.write/u)
  })
})
