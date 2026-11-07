/**
 * ISO-1 / ISO-5 condition 1: the verdict over what the dry probe read. If it is not `ok` the runner falls back to the strict
 * launch (fail-closed). Pure; counts only.
 */
import { describe, expect, it } from 'vitest'
import { evaluateIsolationProbe } from '../src/oar/isolation-probe.ts'

const ISOLATED = { loggedIn: true, mcpServers: 0, commands: 0, builtinToolTokens: 0 }

describe('evaluateIsolationProbe', () => {
  it('ok when the login survived and nothing personal is visible', () => {
    expect(evaluateIsolationProbe(ISOLATED, { noBuiltinTools: true })).toEqual({ ok: true, failures: [] })
  })

  it('a task launch keeps the built-in tools (they are the point), everything else still isolated', () => {
    expect(evaluateIsolationProbe({ ...ISOLATED, builtinToolTokens: 29_665 }, { noBuiltinTools: false }).ok).toBe(true)
  })

  it('FAILS the moment the person is logged out: an isolation that breaks the login is not isolation', () => {
    expect(evaluateIsolationProbe({ ...ISOLATED, loggedIn: false }, { noBuiltinTools: true })).toEqual({ ok: false, failures: ['not-logged-in'] })
  })

  it('FAILS on any personal MCP server or command that shows up (the CLI changed behaviour)', () => {
    const verdict = evaluateIsolationProbe({ ...ISOLATED, mcpServers: 7, commands: 49 }, { noBuiltinTools: true })
    expect(verdict.ok).toBe(false)
    expect(verdict.failures).toEqual(['mcp-servers:7!=0', 'commands-visible:49'])
  })

  it('a granted server is meant to be visible: exactly that many, no more, no fewer', () => {
    expect(evaluateIsolationProbe({ ...ISOLATED, mcpServers: 1 }, { noBuiltinTools: true, expectedMcpServers: 1 }).ok).toBe(true)
    expect(evaluateIsolationProbe({ ...ISOLATED, mcpServers: 2 }, { noBuiltinTools: true, expectedMcpServers: 1 }).ok).toBe(false)
    expect(evaluateIsolationProbe({ ...ISOLATED, mcpServers: 0 }, { noBuiltinTools: true, expectedMcpServers: 1 }).ok).toBe(false)
  })

  it('FAILS when --tools "" did not take: built-in tool tokens are present in a no-tools launch', () => {
    const verdict = evaluateIsolationProbe({ ...ISOLATED, builtinToolTokens: 13_000 }, { noBuiltinTools: true })
    expect(verdict.failures).toEqual(['builtin-tools-present:13000'])
  })

  it('carries codes only: no name of a server, a command or an account can appear in a verdict', () => {
    const text = JSON.stringify(evaluateIsolationProbe({ loggedIn: false, mcpServers: 3, commands: 2, builtinToolTokens: 5 }, { noBuiltinTools: true }))
    expect(text).toMatch(/^[\w{}\[\]":,!=.\-\s]*$/u)
  })
})
