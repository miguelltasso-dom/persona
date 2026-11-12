/**
 * Colheita item 3, the switch of the end-of-turn rules. Same order of authority as the other host switches (flags.ts): Config > environment > product default.
 * In the REAL app (no VITEST, nothing configured) the rules are ON; `PERSONA_TURN_CLOSE=0` (also false/off/no) turns them OFF and touches nothing else; under Vitest the in-process
 * suites are OFF unless they ask (`PERSONA_TURN_CLOSE=1` or `flagDefaults: 'production'`), so no other owner's spec sees an extra turn.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect } from 'vitest'
import { resolveHostFlag } from '../src/flags.ts'
import PersonaHost from '../src/index.ts'
import { resolveTurnClose, TURN_CLOSE_ENV } from '../src/turn-close-host.ts'
import { it } from './host-harness.ts'

const REAL_APP = {} as const // what the shell passes: nothing, and no VITEST

describe('resolveTurnClose', () => {
  it('in the real app (no VITEST, nothing configured) the rules are ON', () => {
    expect(resolveTurnClose({}, REAL_APP)).toBe(true)
    expect(resolveTurnClose(undefined, REAL_APP)).toBe(true)
  })

  it('PERSONA_TURN_CLOSE=0 (also false, off, no; any case, padded) turns them OFF, and only them', () => {
    for (const raw of ['0', 'false', 'FALSE', 'off', 'No', ' 0 ']) {
      expect(resolveTurnClose({}, { [TURN_CLOSE_ENV]: raw }), raw).toBe(false)
    }
    // the other v1.1 switches do not move with it
    expect(resolveHostFlag('teamwork', undefined, { [TURN_CLOSE_ENV]: '0' })).toBe(true)
    expect(resolveHostFlag('productTools', undefined, { [TURN_CLOSE_ENV]: '0' })).toBe(true)
  })

  it('"1", an empty or a junk value keep the product default (ON in the app)', () => {
    for (const raw of ['1', '', 'maybe']) expect(resolveTurnClose({}, { [TURN_CLOSE_ENV]: raw }), raw).toBe(true)
  })

  it('under Vitest the default is OFF; "1" or the production defaults turn it on; "0" still wins', () => {
    expect(resolveTurnClose({}, { VITEST: 'true' })).toBe(false)
    expect(resolveTurnClose({}, { VITEST: 'true', [TURN_CLOSE_ENV]: 'maybe' })).toBe(false)
    expect(resolveTurnClose({}, { VITEST: 'true', [TURN_CLOSE_ENV]: '1' })).toBe(true)
    expect(resolveTurnClose({ flagDefaults: 'production' }, { VITEST: 'true' })).toBe(true)
    expect(resolveTurnClose({}, { VITEST: 'true', PERSONA_HOST_FLAGS: 'production' })).toBe(true)
    expect(resolveTurnClose({ flagDefaults: 'production' }, { VITEST: 'true', [TURN_CLOSE_ENV]: '0' })).toBe(false)
  })
})

describe('the host wires it', () => {
  const saved = process.env[TURN_CLOSE_ENV]
  afterEach(() => {
    if (saved === undefined) delete process.env[TURN_CLOSE_ENV]
    else process.env[TURN_CLOSE_ENV] = saved
  })

  const boot = async (config: { flagDefaults?: 'production' }): Promise<boolean> => {
    const ctx = new Context()
    const h = new PersonaHost(ctx, { databasePath: '', ...config })
    try { return h.orchestration.turnClose }
    finally { await ctx.fiber.dispose() }
  }

  it('a host in the production defaults (the installed app) comes up with the rules ON; a bare host under Vitest has them OFF', async () => {
    delete process.env[TURN_CLOSE_ENV]
    expect(await boot({ flagDefaults: 'production' })).toBe(true)
    expect(await boot({})).toBe(false)
  })

  it('PERSONA_TURN_CLOSE=0 turns it off in the production defaults and nothing else moves', async () => {
    process.env[TURN_CLOSE_ENV] = '0'
    expect(await boot({ flagDefaults: 'production' })).toBe(false)
  })
})
