import { describe, expect, it } from 'vitest'
import { brainMcpTools, createMcpGateway, type BrainPorts, type PersonaToolHooks } from '../src/index.ts'

const run = { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }
const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }

describe('brain MCP tools', () => {
  it('binds the run persona and never another identity from args', async () => {
    const seen: string[] = []
    const ports: BrainPorts = {
      search: async (input) => {
        seen.push(`search:${input.personaId}:${input.text}`)
        return 'hits'
      },
      read: async (input) => {
        seen.push(`read:${input.personaId}:${input.pageId}`)
        return 'page'
      },
      propose: async (input) => {
        seen.push(`propose:${input.personaId}:${input.pageId}`)
        return 'proposed'
      },
    }
    const tools = Object.fromEntries(brainMcpTools(run, ports, 'write').map(tool => [tool.name, tool]))
    await tools.brain_search?.handler({ text: 'norma', personaId: 'intruso' })
    await tools.brain_read?.handler({ pageId: 'p1', personaId: 'intruso' })
    await tools.brain_propose?.handler({ pageId: 'p1', personaId: 'intruso' })
    expect(seen).toEqual(['search:nina:norma', 'read:nina:p1', 'propose:nina:p1'])
  })

  it('lists search/read on read and propose only on write', () => {
    const gw = createMcpGateway({
      hooks,
      brain: {
        search: async () => 'ok',
        read: async () => 'ok',
        propose: async () => 'ok',
      },
    })
    const read = gw.openTurn({ run, toolLevel: 'read', worktree: 'C:/tmp' })
    const write = gw.openTurn({ run: { ...run, assignmentId: 'a2' }, toolLevel: 'write', worktree: 'C:/tmp' })
    expect(gw.list(read.token)).toContain('brain_search')
    expect(gw.list(read.token)).toContain('brain_read')
    expect(gw.list(read.token)).not.toContain('brain_propose')
    expect(gw.list(write.token)).toContain('brain_propose')
  })
})
