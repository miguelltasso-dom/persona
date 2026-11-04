import { describe, expect, it } from 'vitest'
import { createMcpGateway, gestorMcpTools, type GestorPorts, type PersonaToolHooks } from '../src/index.ts'

const run = { personaId: 'atlas', ticketId: 't1', assignmentId: 'a1' }
const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }

describe('gestor MCP tools', () => {
  it('binds the run persona and stays write-only', async () => {
    const seen: string[] = []
    const ports: GestorPorts = {
      hire: async (input) => {
        seen.push(`hire:${input.personaId}:${input.summary}`)
        return 'asked'
      },
    }
    const write = Object.fromEntries(gestorMcpTools(run, ports, 'write').map(tool => [tool.name, tool]))
    expect(gestorMcpTools(run, ports, 'read')).toEqual([])
    await write.gestor_hire?.handler({ summary: 'designer no site', personaId: 'intruso' })
    expect(seen).toEqual(['hire:atlas:designer no site'])
  })

  it('lists hire/allocate/reorganize/assemble only on write', () => {
    const gw = createMcpGateway({
      hooks,
      gestor: {
        hire: async () => 'ok',
        allocate: async () => 'ok',
        reorganize: async () => 'ok',
        assemble: async () => 'ok',
      },
    })
    const read = gw.openTurn({ run, toolLevel: 'read', worktree: 'C:/tmp' })
    const write = gw.openTurn({ run: { ...run, assignmentId: 'a2' }, toolLevel: 'write', worktree: 'C:/tmp' })
    expect(gw.list(read.token)).not.toContain('gestor_hire')
    expect(gw.list(write.token)).toEqual(expect.arrayContaining([
      'gestor_hire', 'gestor_allocate', 'gestor_reorganize', 'gestor_assemble',
    ]))
  })
})
