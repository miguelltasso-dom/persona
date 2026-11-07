/**
 * The installed exe must not inherit the test process's fake-mode switches (Forge/Keel, 04/11): `VITEST=true` made `Persona.exe` run its
 * scripted fake runner (forced-ready engine, 0-turn delivery), which turned both the fake and the REAL run into something else.
 */
import { describe, expect, it } from 'vitest'
import { cleanChildEnv, testModeVariablesIn } from '../src/clean-env.ts'

describe('cleanChildEnv', () => {
  it('drops VITEST*, PERSONA_SCRIPTED*, *_SCRIPTED_STREAM and NODE_ENV=test; keeps the rest', () => {
    const clean = cleanChildEnv({
      VITEST: 'true', VITEST_WORKER_ID: '1', VITEST_POOL_ID: '2', NODE_ENV: 'test', PERSONA_SCRIPTED: '1', PERSONA_SCRIPTED_STREAM: '1',
      PATH: 'C:\Windows', PERSONA_HOME: 'C:\h', OAR_CLAUDE_BIN: 'C:\stub\claude.cmd', PERSONA_REAL_TURN_CAP: '1',
    })
    expect(clean).toEqual({ PATH: 'C:\Windows', PERSONA_HOME: 'C:\h', OAR_CLAUDE_BIN: 'C:\stub\claude.cmd', PERSONA_REAL_TURN_CAP: '1' })
    expect(testModeVariablesIn(clean)).toEqual([])
  })

  it('keeps NODE_ENV when it is not "test"; the guard names what is left in a final environment', () => {
    expect(cleanChildEnv({ NODE_ENV: 'production' })).toEqual({ NODE_ENV: 'production' })
    expect(testModeVariablesIn({ VITEST: 'true', NODE_ENV: 'test', PATH: 'x' }).sort()).toEqual(['NODE_ENV', 'VITEST'])
  })
})
