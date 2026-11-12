/**
 * HT-12: what the screen may truthfully say about each CLI. The point of the table is what it refuses to claim: Codex and Cursor have the
 * person's whole environment loaded and no filter, and Codex's permission interception is not confirmed by a run yet.
 */
import { describe, expect, it } from 'vitest'
import { cliCapabilityReport, cliIsolationReport, NOT_ISOLATED } from '../src/oar/isolation.ts'

const NATIVE = { PERSONA_CLI_ENV: 'native' }
const ANSWER_ONLY = { PERSONA_CLI_ENV: 'answer-only' }
const NEEDED = { PERSONA_CLI_ENV: 'needed' }

describe('cliCapabilityReport: one honest row per CLI', () => {
  it('Claude in the end-state mode: connectors chosen per request, skills by option, the preview proven with a hook', () => {
    expect(cliCapabilityReport('claude', NEEDED)).toEqual({ level: 'full', notIsolated: [], connectors: 'selected', skills: 'optional', permissionPreview: 'hook', connectorActions: 'gated' })
  })

  it('Claude today (answer-only default or native): tasks run native, so everything is loaded and the screen says so', () => {
    for (const env of [ANSWER_ONLY, NATIVE]) {
      const report = cliCapabilityReport('claude', env)
      expect(report).toMatchObject({ level: 'none', connectors: 'all-loaded', skills: 'all-loaded', permissionPreview: 'hook' })
      expect(report.notIsolated).toEqual([NOT_ISOLATED.mcp, NOT_ISOLATED.skills, NOT_ISOLATED.settings])
    }
  })

  it('Codex: partial at best, EVERYTHING already loaded and no way to filter it, and the permission preview is NOT promised', () => {
    const needed = cliCapabilityReport('codex', NEEDED)
    expect(needed).toMatchObject({ level: 'partial', connectors: 'all-loaded', skills: 'all-loaded', permissionPreview: 'unconfirmed' })
    expect(needed.notIsolated).toEqual([NOT_ISOLATED.mcp, NOT_ISOLATED.plugins, NOT_ISOLATED.hooks, NOT_ISOLATED.skills, NOT_ISOLATED.instructions])
    // before the end state it is not even partial, and still says what is loaded
    const today = cliCapabilityReport('codex', ANSWER_ONLY)
    expect(today).toMatchObject({ level: 'none', connectors: 'all-loaded', permissionPreview: 'unconfirmed' })
    expect(today.notIsolated).toEqual(needed.notIsolated)
  })

  it('OpenCode: isolated in the end state (empty config, only the product tools); before it, everything is loaded', () => {
    expect(cliCapabilityReport('opencode', NEEDED)).toMatchObject({ level: 'full', connectors: 'none', skills: 'none', permissionPreview: 'unconfirmed' })
    expect(cliCapabilityReport('opencode', ANSWER_ONLY)).toMatchObject({ level: 'none', connectors: 'all-loaded', skills: 'all-loaded' })
  })

  it('Cursor and anything unknown: nothing is isolated, nothing can be previewed', () => {
    for (const cli of ['cursor', 'something-else']) {
      expect(cliCapabilityReport(cli, NEEDED)).toMatchObject({ level: 'none', connectors: 'all-loaded', skills: 'all-loaded', permissionPreview: 'none' })
    }
  })

  it('never claims more than the isolation port: level and notIsolated are exactly those of cliIsolationReport', () => {
    for (const cli of ['claude', 'codex', 'opencode', 'cursor', 'x']) {
      for (const env of [NATIVE, ANSWER_ONLY, NEEDED]) {
        const { level, notIsolated } = cliCapabilityReport(cli, env)
        expect({ level, notIsolated }).toEqual(cliIsolationReport(cli, env))
      }
    }
  })

  it('"selected" connectors and "optional" skills exist ONLY where the runner can really do it (Claude, end-state mode)', () => {
    for (const cli of ['claude', 'codex', 'opencode', 'cursor']) {
      for (const env of [NATIVE, ANSWER_ONLY, NEEDED]) {
        const report = cliCapabilityReport(cli, env)
        const real = cli === 'claude' && env === NEEDED
        expect(report.connectors === 'selected').toBe(real)
        expect(report.skills === 'optional').toBe(real)
      }
    }
  })
})
