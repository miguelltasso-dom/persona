import { expect, it } from 'vitest'
import { CONNECTION_CAPABILITIES, chooseConnection, describeConnection, refuseSilentFallback } from '../src/index.ts'

const claude = { id: 'c-claude', kind: 'claude' as const, healthy: true }
const cursor = { id: 'c-cursor', kind: 'cursor' as const, healthy: true }
const down = { id: 'c-down', kind: 'claude' as const, healthy: false }

it('does not fall back from a failed paid connection to another', () => {
  const persona = { runner: { kind: 'cli' as const, cli: 'claude' as const, model: 'opus' } }
  expect(chooseConnection(persona, { available: [down, cursor] }, [down, cursor], 'c-down')).toEqual({
    kind: 'failed', connectionId: 'c-down', reason: 'unhealthy', askUser: true,
  })
  expect(() => refuseSilentFallback('c-down', cursor)).toThrow('CONNECTION_UNDECIDED')
})

it('asks the user when two healthy paid connections match and none was chosen', () => {
  const persona = { runner: { kind: 'cli' as const, cli: 'claude' as const, model: 'opus' } }
  const second = { id: 'c-claude-2', kind: 'claude' as const, healthy: true }
  expect(chooseConnection(persona, { available: [claude, second] }, [claude, second]).kind).toBe('failed')
  expect(chooseConnection(persona, { available: [claude] }, [claude])).toEqual({ kind: 'ok', connection: claude })
})

it('describes Cursor as having no MCP', () => {
  expect(CONNECTION_CAPABILITIES.cursor.mcp).toBe(false)
  expect(describeConnection('cursor')).toMatch(/sem MCP/)
  expect(describeConnection('claude')).toMatch(/com MCP/)
})
