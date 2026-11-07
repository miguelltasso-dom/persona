import { expect, onTestFinished } from 'vitest'
import { it, openJourney } from './journeys/journey-host.ts'

/**
 * The shell passes no Config to the host: the environment is what a verifier (or the person) uses. TEAM-15: in the real app the v1.1 switches
 * are ON and `=0` opts out (flags.ts, contracts/flags-defaults.md); UNDER VITEST the default stays OFF, so here only the exact value "1"
 * opts in and unset or anything else keeps the default. The ON-by-default side is proved by host-flags.spec.ts (pure, no VITEST).
 */
function withEnv(name: string, value: string | undefined): void {
  const before = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  onTestFinished(() => {
    if (before === undefined) delete process.env[name]
    else process.env[name] = before
  })
}

it('PERSONA_START_ON_BOARD=1 turns on "move the card to Fazendo → the persona starts"; unset or other values keep it OFF', () => {
  withEnv('PERSONA_HOST_FLAGS', undefined) // the production override (host-flags.spec) is not in play here
  withEnv('PERSONA_START_ON_BOARD', undefined)
  expect(openJourney('2026-11-04T12:00:00.000Z').orchestration.startOnBoardMove).toBe(false)
  withEnv('PERSONA_START_ON_BOARD', 'true')
  expect(openJourney('2026-11-04T12:00:00.000Z').orchestration.startOnBoardMove).toBe(false) // only "1"
  withEnv('PERSONA_START_ON_BOARD', '1')
  expect(openJourney('2026-11-04T12:00:00.000Z').orchestration.startOnBoardMove).toBe(true)
  withEnv('PERSONA_START_ON_BOARD', '0') // the explicit opt-out of TEAM-15 wins over the opt-in that came before it
  expect(openJourney('2026-11-04T12:00:00.000Z').orchestration.startOnBoardMove).toBe(false)
})

it('PERSONA_PRODUCT_TOOLS=1 turns on the persona tools for CLI workers (persona_ask, board, sprints, routines, hiring); OFF by default', () => {
  withEnv('PERSONA_HOST_FLAGS', undefined)
  withEnv('PERSONA_PRODUCT_TOOLS', undefined)
  const off = openJourney('2026-11-04T12:00:00.000Z')
  expect(off.productToolsEnabled).toBe(false)
  expect(off.orchestration.productToolsOf).toBeUndefined()
  withEnv('PERSONA_PRODUCT_TOOLS', '1')
  const on = openJourney('2026-11-04T12:00:00.000Z')
  expect(on.productToolsEnabled).toBe(true)
  expect(on.orchestration.productToolsOf).toBeDefined()
  withEnv('PERSONA_PRODUCT_TOOLS', '0')
  const optedOut = openJourney('2026-11-04T12:00:00.000Z')
  expect(optedOut.productToolsEnabled).toBe(false)
  expect(optedOut.orchestration.productToolsOf).toBeUndefined()
})
