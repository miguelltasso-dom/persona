/**
 * TEAM-15 (D-090): the v1.1 behaviors of the host are ON in the real app and the person (or build) turns them OFF. Order of authority:
 * Config > environment > product default (ON; OFF only under Vitest, in ONE place). See persona-spec/contracts/flags-defaults.md.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import { flagsBootLine, HOST_FLAGS, resolveHostFlag, resolveHostFlags, type HostFlag } from '../src/flags.ts'
import PersonaHost from '../src/index.ts'
import { it } from './host-harness.ts'

const FLAGS = Object.keys(HOST_FLAGS) as HostFlag[]
const REAL_APP = {} as const // what the shell passes: nothing, and no VITEST

describe('resolveHostFlag', () => {
  it('in the real app (no VITEST, nothing configured) every v1.1 flag is ON', () => {
    for (const flag of FLAGS) expect(resolveHostFlag(flag, undefined, REAL_APP)).toBe(true)
  })

  it('the environment opts out per flag: 0, false, off, no (any case, padded) — and only that flag', () => {
    for (const flag of FLAGS) {
      for (const raw of ['0', 'false', 'FALSE', 'off', 'No', ' 0 ']) {
        expect(resolveHostFlag(flag, undefined, { [HOST_FLAGS[flag]]: raw })).toBe(false)
      }
      for (const other of FLAGS.filter(name => name !== flag)) {
        expect(resolveHostFlag(other, undefined, { [HOST_FLAGS[flag]]: '0' })).toBe(true)
      }
    }
  })

  it('"1" still turns a flag on (the old opt-in keeps working) and a junk or empty value keeps the product default', () => {
    for (const flag of FLAGS) {
      const name = HOST_FLAGS[flag]
      expect(resolveHostFlag(flag, undefined, { [name]: '1' })).toBe(true)
      expect(resolveHostFlag(flag, undefined, { [name]: '' })).toBe(true)
      expect(resolveHostFlag(flag, undefined, { [name]: 'maybe' })).toBe(true)
      expect(resolveHostFlag(flag, undefined, { VITEST: 'true', [name]: '1' })).toBe(true)
      expect(resolveHostFlag(flag, undefined, { VITEST: 'true', [name]: 'maybe' })).toBe(false)
    }
  })

  it('Config beats the environment, both ways', () => {
    for (const flag of FLAGS) {
      const name = HOST_FLAGS[flag]
      expect(resolveHostFlag(flag, false, { [name]: '1' })).toBe(false)
      expect(resolveHostFlag(flag, true, { [name]: '0' })).toBe(true)
      expect(resolveHostFlag(flag, false, REAL_APP)).toBe(false)
      expect(resolveHostFlag(flag, true, { VITEST: 'true' })).toBe(true)
    }
  })

  it('the single exception: under Vitest the product default is OFF (suites build a bare host and opt in)', () => {
    for (const flag of FLAGS) expect(resolveHostFlag(flag, undefined, { VITEST: 'true' })).toBe(false)
  })

  it('PERSONA_HOST_FLAGS=production / flagDefaults "production" ignore VITEST for the DEFAULT only; opt-outs and Config still win; other values change nothing', () => {
    for (const flag of FLAGS) {
      const name = HOST_FLAGS[flag]
      expect(resolveHostFlag(flag, undefined, { VITEST: 'true', PERSONA_HOST_FLAGS: 'production' })).toBe(true)
      expect(resolveHostFlag(flag, undefined, { VITEST: 'true', PERSONA_HOST_FLAGS: ' Production ' })).toBe(true)
      expect(resolveHostFlag(flag, undefined, { VITEST: 'true' }, 'production')).toBe(true)
      expect(resolveHostFlag(flag, undefined, { VITEST: 'true', PERSONA_HOST_FLAGS: 'test' })).toBe(false)
      expect(resolveHostFlag(flag, undefined, { VITEST: 'true', PERSONA_HOST_FLAGS: '1' })).toBe(false)
      expect(resolveHostFlag(flag, undefined, { VITEST: 'true', PERSONA_HOST_FLAGS: 'production', [name]: '0' })).toBe(false)
      expect(resolveHostFlag(flag, false, { VITEST: 'true', PERSONA_HOST_FLAGS: 'production' })).toBe(false)
      expect(resolveHostFlag(flag, false, { VITEST: 'true' }, 'production')).toBe(false)
    }
  })

  it('resolveHostFlags tells which default decided, and the boot line prints the four switches as 1/0', () => {
    expect(resolveHostFlags({}, { VITEST: 'true' })).toEqual({ teamwork: false, fanout: false, startOnBoardMove: false, productTools: false, defaults: 'test' })
    expect(resolveHostFlags({}, {})).toEqual({ teamwork: true, fanout: true, startOnBoardMove: true, productTools: true, defaults: 'production' })
    expect(resolveHostFlags({ flagDefaults: 'production', fanout: false }, { VITEST: 'true' })).toEqual({ teamwork: true, fanout: false, startOnBoardMove: true, productTools: true, defaults: 'production' })
    expect(flagsBootLine(resolveHostFlags({}, { PERSONA_FANOUT: '0' }))).toBe('[persona-host] flags teamwork=1 fanout=0 startOnBoardMove=1 productTools=1 defaults=production')
  })

  it('names the variable of each flag the way the contract says', () => {
    expect(HOST_FLAGS).toEqual({
      teamwork: 'PERSONA_TEAMWORK', fanout: 'PERSONA_FANOUT', startOnBoardMove: 'PERSONA_START_ON_BOARD', productTools: 'PERSONA_PRODUCT_TOOLS',
    })
  })
})

describe('the host reads its flags only through resolveHostFlag', () => {
  const contexts: Context[] = []
  beforeEach(() => { vi.stubEnv('PERSONA_HOST_FLAGS', '') }) // a verifier's shell may carry the production override: these cases decide it themselves
  afterEach(async () => {
    await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
    vi.unstubAllEnvs()
  })

  function open(flags: { teamwork?: boolean; fanout?: boolean; startOnBoardMove?: boolean; productTools?: boolean; flagDefaults?: 'production' } = {}): PersonaHost {
    const ctx = new Context()
    contexts.push(ctx)
    return new PersonaHost(ctx, { databasePath: '', ...flags }) // '' = the in-memory database under Vitest
  }

  it('an explicit false in Config wins over a "1" in the environment, for the four flags', () => {
    for (const flag of FLAGS) vi.stubEnv(HOST_FLAGS[flag], '1')
    const h = open({ teamwork: false, fanout: false, startOnBoardMove: false, productTools: false })
    expect(h.teamworkEnabled).toBe(false)
    expect(h.orchestration.fanoutEnabled).toBe(false)
    expect(h.orchestration.startOnBoardMove).toBe(false)
    expect(h.productToolsEnabled).toBe(false)
  })

  it('an explicit true in Config and "0" in the environment: Config wins', () => {
    for (const flag of FLAGS) vi.stubEnv(HOST_FLAGS[flag], '0')
    const h = open({ teamwork: true, fanout: true, startOnBoardMove: true })
    expect(h.teamworkEnabled).toBe(true)
    expect(h.orchestration.fanoutEnabled).toBe(true)
    expect(h.orchestration.startOnBoardMove).toBe(true)
    expect(h.productToolsEnabled).toBe(false) // not named in Config: the environment's "0" turns it off
  })

  it('with only the environment, "1" turns each flag on and nothing else', () => {
    vi.stubEnv('PERSONA_TEAMWORK', '1')
    vi.stubEnv('PERSONA_FANOUT', '0')
    const h = open()
    expect(h.teamworkEnabled).toBe(true)
    expect(h.orchestration.fanoutEnabled).toBe(false)
    expect(h.orchestration.startOnBoardMove).toBe(false) // Vitest default
  })

  it('the source has no other way to read these four flags: no `config.<flag> === true` and no `PERSONA_<FLAG> === \'1\'` in the host', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
    const index = readFileSync(join(src, 'index.ts'), 'utf8')
    const orchestration = readFileSync(join(src, 'orchestration.ts'), 'utf8')
    for (const flag of FLAGS) {
      const raw = new RegExp(String.raw`config\.${flag}\s*===\s*true`)
      expect(index, `raw read of Config.${flag}`).not.toMatch(raw)
      expect(orchestration, `raw read of Config.${flag}`).not.toMatch(raw)
      const env = new RegExp(String.raw`process\.env\.${HOST_FLAGS[flag]}\b`)
      expect(index, `raw read of ${HOST_FLAGS[flag]}`).not.toMatch(env)
      expect(orchestration, `raw read of ${HOST_FLAGS[flag]}`).not.toMatch(env)
    }
    expect(index, 'the four switches resolve in ONE call').toContain('resolveHostFlags(config)')
    expect(index.split('resolveHostFlags(config)')).toHaveLength(2)
    expect(index).toContain('this.orchestration.startOnBoardMove = this.hostFlags.startOnBoardMove')
    expect(index).toContain('this.orchestration.fanoutEnabled = this.hostFlags.fanout')
  })

  it('flagDefaults "production" (or PERSONA_HOST_FLAGS=production) makes a fresh host ON inside Vitest, no Config and no env of the switches', () => {
    for (const flag of FLAGS) vi.stubEnv(HOST_FLAGS[flag], '')
    const viaConfig = open({ flagDefaults: 'production' })
    expect([viaConfig.teamworkEnabled, viaConfig.orchestration.fanoutEnabled, viaConfig.orchestration.startOnBoardMove, viaConfig.productToolsEnabled]).toEqual([true, true, true, true])
    expect(viaConfig.hostFlags).toEqual({ teamwork: true, fanout: true, startOnBoardMove: true, productTools: true, defaults: 'production' })
    vi.stubEnv('PERSONA_HOST_FLAGS', 'production')
    const viaEnv = open()
    expect(viaEnv.hostFlags).toEqual({ teamwork: true, fanout: true, startOnBoardMove: true, productTools: true, defaults: 'production' })
    expect(viaEnv.teamworkEnabled && viaEnv.orchestration.fanoutEnabled && viaEnv.orchestration.startOnBoardMove && viaEnv.productToolsEnabled).toBe(true)
  })

  it('the production override changes only the DEFAULT: an opt-out (PERSONA_<FLAG>=0 or Config false) still wins, so the same suite proves both sides', () => {
    vi.stubEnv('PERSONA_HOST_FLAGS', 'production')
    vi.stubEnv('PERSONA_FANOUT', '0')
    const h = open({ startOnBoardMove: false })
    expect(h.hostFlags).toEqual({ teamwork: true, fanout: false, startOnBoardMove: false, productTools: true, defaults: 'production' })
    expect(h.orchestration.fanoutEnabled).toBe(false)
    expect(h.orchestration.startOnBoardMove).toBe(false)
  })

  it('without the override a Vitest host says defaults "test" and every switch off; exportDiagnostics carries the same view (the smoke the installed app answers)', () => {
    for (const flag of FLAGS) vi.stubEnv(HOST_FLAGS[flag], '')
    vi.stubEnv('PERSONA_HOST_FLAGS', '')
    const off = open()
    expect(off.hostFlags).toEqual({ teamwork: false, fanout: false, startOnBoardMove: false, productTools: false, defaults: 'test' })
    expect((JSON.parse(off.exportDiagnostics().json) as { flags: unknown }).flags).toEqual(off.hostFlags)
    const on = open({ flagDefaults: 'production' })
    const seen = JSON.parse(on.exportDiagnostics().json) as { flags: unknown }
    expect(seen.flags).toEqual({ teamwork: true, fanout: true, startOnBoardMove: true, productTools: true, defaults: 'production' })
  })
})
